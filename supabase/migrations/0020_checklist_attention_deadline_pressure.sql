begin;

create index if not exists tasks_active_deadline_workspace
  on public.tasks(workspace_id,due_date,status,priority)
  where deleted_at is null and archived=false and due_date is not null;
create index if not exists checklist_active_deadline_workspace
  on public.checklist_items(workspace_id,due_date,task_id)
  where deleted_at is null and completed=false and due_date is not null;

alter table public.notification_deliveries
  add column if not exists checklist_item_id uuid references public.checklist_items(id) on delete set null;
alter table public.notification_deliveries add column if not exists title text;
alter table public.notification_deliveries add column if not exists detail text;

create or replace function public.user_deadline_work_items(
  p_workspace_id uuid,p_start date,p_end date
) returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  perform public.assert_connected_workspace(p_workspace_id);
  if p_end<p_start or p_end-p_start>120 then raise exception 'Deadline range must be between 1 and 121 days'; end if;
  with active_tasks as(
    select t.*,coalesce(p.name,'No project') project_name,coalesce(pe.full_name,'Unassigned') person_name
    from tasks t left join projects p on p.id=t.project_id and p.deleted_at is null
    left join people pe on pe.id=t.responsible_person_id and pe.deleted_at is null
    where t.workspace_id=p_workspace_id and t.deleted_at is null and not t.archived
      and t.status not in('completed','cancelled','archived')
  ),work as(
    select 'task'::text kind,t.id,t.due_date,t.title,null::integer position,null::boolean completed,t.id task_id,t.title task_title,t.due_date task_due_date,
      t.status::text task_status,t.priority::text task_priority,t.blocked task_blocked,t.version task_version,
      t.version,null::boolean required,t.project_id,t.project_name,t.responsible_person_id,t.person_name
    from active_tasks t where t.due_date is not null and t.due_date<=p_end
    union all
    select 'checklist',c.id,c.due_date,c.description,c.position,c.completed,t.id,t.title,t.due_date,t.status::text,t.priority::text,
      t.blocked,t.version,c.version,c.required,t.project_id,t.project_name,t.responsible_person_id,t.person_name
    from checklist_items c join active_tasks t on t.id=c.task_id
    where c.workspace_id=p_workspace_id and c.deleted_at is null and not c.completed
      and c.due_date is not null and c.due_date<=p_end
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'kind',kind,'id',id,'dueDate',due_date,'title',title,'description',title,'position',position,'completed',completed,
    'taskId',task_id,'taskTitle',task_title,
    'taskDueDate',task_due_date,'taskStatus',task_status,'taskPriority',task_priority,'taskBlocked',task_blocked,
    'taskVersion',task_version,'version',version,'required',required,'projectId',project_id,'projectName',project_name,
    'responsiblePersonId',responsible_person_id,'responsiblePersonName',person_name
  ) order by due_date,kind,title),'[]'::jsonb) into result from work;
  return result;
end $$;

create or replace function public.user_toggle_checklist_item(
  p_workspace_id uuid,p_item_id uuid,p_completed boolean,p_expected_version integer
) returns jsonb language plpgsql security definer set search_path=public as $$
declare item checklist_items; parent tasks;
begin
  perform public.assert_connected_workspace(p_workspace_id);
  select c.* into item from checklist_items c join tasks t on t.id=c.task_id and t.workspace_id=c.workspace_id
    where c.id=p_item_id and c.workspace_id=p_workspace_id and c.deleted_at is null and t.deleted_at is null for update of c;
  if item.id is null then raise exception 'Checklist item not found' using errcode='P0002'; end if;
  if item.version<>p_expected_version then raise exception 'The checklist item changed on another device. Refresh and try again.' using errcode='40001'; end if;
  select * into parent from tasks where id=item.task_id and workspace_id=p_workspace_id for update;
  if parent.status in('cancelled','archived') or parent.archived then raise exception 'Checklist item belongs to an inactive task'; end if;
  update checklist_items set completed=p_completed,updated_by=auth.uid(),updated_at=now()
    where id=item.id returning * into item;
  perform public.refresh_task_derived(item.task_id);
  perform public.reconcile_task_checklist_completion(item.task_id);
  select * into parent from tasks where id=item.task_id;
  return jsonb_build_object('item',to_jsonb(item),'task',to_jsonb(parent));
end $$;

create or replace function public.enqueue_checklist_due_notifications()
returns integer language plpgsql security definer set search_path=public as $$
declare inserted_count integer;
begin
  insert into notification_deliveries(
    workspace_id,user_id,task_id,checklist_item_id,kind,status,idempotency_key,title,detail,delivered_at,created_at,updated_at
  )
  select c.workspace_id,m.user_id,t.id,c.id,'checklist_due','delivered',
    'checklist-due:'||c.workspace_id::text||':'||m.user_id::text||':'||c.id::text||':'||c.due_date::text,
    'Checklist due: '||c.description,t.title||' · '||coalesce(p.name,'No project')||' · '||c.due_date::text,
    now(),now(),now()
  from checklist_items c join tasks t on t.id=c.task_id and t.workspace_id=c.workspace_id
  left join projects p on p.id=t.project_id and p.deleted_at is null
  join workspace_members m on m.workspace_id=c.workspace_id and m.removed_at is null
  join profiles profile on profile.id=m.user_id and profile.account_status='active'
  left join notification_preferences preference on preference.workspace_id=c.workspace_id and preference.user_id=m.user_id
  where c.deleted_at is null and not c.completed and c.due_date is not null
    and t.deleted_at is null and not t.archived and t.status not in('completed','cancelled','archived')
    and coalesce(preference.due_today,true)
    and c.due_date=(now() at time zone case when exists(select 1 from pg_timezone_names zone where zone.name=preference.timezone)
      then preference.timezone else 'UTC' end)::date
  on conflict(workspace_id,idempotency_key) do nothing;
  get diagnostics inserted_count=row_count;
  return inserted_count;
end $$;

create or replace function public.connected_calendar(p_workspace_id uuid,p_user_id uuid,p_start date,p_end date)
returns jsonb language sql security definer set search_path=public as $$
with dates as(select generate_series(p_start,p_end,'1 day')::date d),
matches as(
  select d.d,t.*,p.name project_name,pe.full_name person_name,
    coalesce((select jsonb_agg(c.description order by c.position,c.created_at) from checklist_items c
      where c.task_id=t.id and c.deleted_at is null and not c.completed and c.due_date=d.d),'[]'::jsonb) checklist_due_items,
    coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'description',c.description,'required',c.required,
      'dueDate',c.due_date,'version',c.version) order by c.position,c.created_at) from checklist_items c
      where c.task_id=t.id and c.deleted_at is null and not c.completed and c.due_date=d.d),'[]'::jsonb) checklist_due_details,
    case when t.status='completed' then 'green'
      when(t.due_date<current_date and t.status not in('completed','cancelled','archived'))or t.priority='critical' then 'red'
      when t.priority='high' then 'orange' else 'blue' end severity
  from dates d join tasks t on t.workspace_id=p_workspace_id and t.deleted_at is null and(
    t.due_date=d.d or t.reminder_at::date=d.d or t.completed_at::date=d.d or(
      not t.archived and t.status not in('completed','cancelled','archived') and exists(
        select 1 from checklist_items c where c.task_id=t.id and c.deleted_at is null and not c.completed and c.due_date=d.d)))
  left join projects p on p.id=t.project_id left join people pe on pe.id=t.responsible_person_id
),per_day as(
  select d,jsonb_agg(jsonb_build_object('id',id,'title',title,'description',description,'status',status,'priority',priority,
    'dueDate',due_date,'dueTime',due_time,'projectId',project_id,'projectName',project_name,
    'responsiblePersonId',responsible_person_id,'responsiblePersonName',person_name,'calculatedProgress',calculated_progress,
    'blocked',blocked,'version',version,'updatedAt',updated_at,'checklistDueItems',checklist_due_items,
    'checklistDueDetails',checklist_due_details)) tasks,count(*) count,
    case when bool_or(severity='red') then 'red' when bool_or(severity='orange') then 'orange'
      when bool_or(severity='blue') then 'blue' else 'green' end severity from matches group by d
)
select coalesce(jsonb_agg(jsonb_build_object('date',dates.d,'severity',coalesce(per_day.severity,'neutral'),
  'count',coalesce(per_day.count,0),'tasks',coalesce(per_day.tasks,'[]'::jsonb)) order by dates.d),'[]'::jsonb)
from dates left join per_day using(d)
$$;

revoke all on function public.user_deadline_work_items(uuid,date,date) from public,anon;
revoke all on function public.user_toggle_checklist_item(uuid,uuid,boolean,integer) from public,anon;
grant execute on function public.user_deadline_work_items(uuid,date,date),public.user_toggle_checklist_item(uuid,uuid,boolean,integer) to authenticated;
revoke all on function public.enqueue_checklist_due_notifications() from public,anon,authenticated;
grant execute on function public.enqueue_checklist_due_notifications() to service_role;

insert into public.schema_versions(version) values(20) on conflict do nothing;
commit;
