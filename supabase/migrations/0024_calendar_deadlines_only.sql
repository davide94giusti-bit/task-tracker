begin;

-- Calendar is a work-date view. Reminder timestamps are delivery instructions and
-- must never create calendar cards, counts, or day-dialog entries.
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
    t.due_date=d.d or t.completed_at::date=d.d or(
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

revoke all on function public.connected_calendar(uuid,uuid,date,date) from public,anon,authenticated;
grant execute on function public.connected_calendar(uuid,uuid,date,date) to service_role;

insert into public.schema_versions(version) values(24) on conflict do nothing;
commit;
