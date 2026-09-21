begin;

alter table public.tasks add column if not exists reminder_repeat text not null default 'none';
alter table public.tasks add column if not exists reminder_repeat_interval integer not null default 1;
alter table public.tasks add column if not exists cost_date date;
alter table public.tasks add column if not exists complete_when_checklist_done boolean not null default false;
alter table public.tasks add column if not exists auto_completed_from_checklist boolean not null default false;

alter table public.tasks drop constraint if exists tasks_reminder_repeat_check;
alter table public.tasks add constraint tasks_reminder_repeat_check check (reminder_repeat in ('none','daily','weekly','monthly'));
alter table public.tasks drop constraint if exists tasks_reminder_repeat_interval_check;
alter table public.tasks add constraint tasks_reminder_repeat_interval_check check (reminder_repeat_interval between 1 and 365);

create or replace function public.next_task_reminder_occurrence(
  p_current timestamptz, p_repeat text, p_interval integer
) returns timestamptz language plpgsql stable set search_path=public as $$
declare v_next timestamptz:=p_current; v_step integer:=greatest(coalesce(p_interval,1),1);
begin
  if p_repeat not in ('daily','weekly','monthly') then return null; end if;
  loop
    v_next:=case p_repeat
      when 'daily' then v_next+make_interval(days=>v_step)
      when 'weekly' then v_next+make_interval(days=>7*v_step)
      else v_next+make_interval(months=>v_step)
    end;
    exit when v_next>now();
  end loop;
  return v_next;
end $$;

create or replace function public.sync_task_reminder_record()
returns trigger language plpgsql security definer set search_path=public as $$
declare recipient_id uuid; reminder_id uuid;
begin
  if tg_op='UPDATE' and new.reminder_at is not distinct from old.reminder_at
    and new.reminder_repeat is not distinct from old.reminder_repeat
    and new.reminder_repeat_interval is not distinct from old.reminder_repeat_interval
    and new.status is not distinct from old.status and new.deleted_at is not distinct from old.deleted_at
    and new.archived is not distinct from old.archived then return new; end if;
  select coalesce(new.updated_by,new.created_by,(select member.user_id from workspace_members member
    where member.workspace_id=new.workspace_id and member.removed_at is null
    order by case member.role when 'owner' then 0 when 'admin' then 1 else 2 end,member.created_at limit 1)) into recipient_id;
  if new.reminder_at is null or new.deleted_at is not null or new.archived or new.status in ('completed','cancelled','archived') then
    update reminders set dismissed=true,claimed_at=null,updated_by=recipient_id
      where task_id=new.id and workspace_id=new.workspace_id and deleted_at is null;
    return new;
  end if;
  if recipient_id is null then return new; end if;
  select id into reminder_id from reminders where task_id=new.id and workspace_id=new.workspace_id and deleted_at is null order by created_at limit 1;
  if reminder_id is null then
    insert into reminders(workspace_id,task_id,user_id,scheduled_at,next_attempt_at,dismissed,created_by,updated_by)
      values(new.workspace_id,new.id,recipient_id,new.reminder_at,new.reminder_at,false,recipient_id,recipient_id);
  else
    update reminders set user_id=recipient_id,scheduled_at=new.reminder_at,next_attempt_at=new.reminder_at,
      snoozed_until=null,dismissed=false,claimed_at=null,attempt_count=0,updated_by=recipient_id where id=reminder_id;
    update reminders set dismissed=true,claimed_at=null,updated_by=recipient_id
      where task_id=new.id and workspace_id=new.workspace_id and deleted_at is null and id<>reminder_id;
  end if;
  return new;
end $$;

drop trigger if exists task_reminder_sync on public.tasks;
create trigger task_reminder_sync after insert or update of reminder_at,reminder_repeat,reminder_repeat_interval,status,deleted_at,archived
on public.tasks for each row execute function public.sync_task_reminder_record();

create or replace function public.complete_notification_delivery(
  p_delivery_id uuid,p_status text,p_error_code text default null,p_next_attempt_at timestamptz default null,
  p_email_sent boolean default false,p_push_sent boolean default false
) returns jsonb language plpgsql security definer set search_path=public as $$
declare d notification_deliveries; r reminders; t tasks; v_next timestamptz;
begin
  if p_status not in('delivered','retry','failed','quota_reached') then raise exception 'Invalid delivery status'; end if;
  update notification_deliveries set status=p_status,last_error_code=left(p_error_code,100),
    next_attempt_at=coalesce(p_next_attempt_at,next_attempt_at),email_sent=email_sent or p_email_sent,
    push_sent=push_sent or p_push_sent,delivered_at=case when p_status='delivered' then now() else delivered_at end,claimed_at=null
    where id=p_delivery_id returning * into d;
  if d.id is null then raise exception 'Delivery not found'; end if;
  if p_status='delivered' then
    select * into r from reminders where id=d.reminder_id for update;
    select * into t from tasks where id=d.task_id;
    if r.id is not null and t.id is not null and t.reminder_repeat in ('daily','weekly','monthly')
       and t.deleted_at is null and not t.archived and t.status not in ('completed','cancelled','archived') then
      v_next:=next_task_reminder_occurrence(r.scheduled_at,t.reminder_repeat,t.reminder_repeat_interval);
      update reminders set scheduled_at=v_next,next_attempt_at=v_next,snoozed_until=null,dismissed=false,
        claimed_at=null,attempt_count=0 where id=r.id;
    else
      update reminders set dismissed=true where id=d.reminder_id;
    end if;
  end if;
  return jsonb_build_object('deliveryId',d.id,'status',d.status,'nextReminderAt',v_next);
end $$;

create or replace function public.reconcile_task_checklist_completion(p_task_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_task tasks; v_total integer; v_open integer; v_dependencies integer;
begin
  select * into v_task from tasks where id=p_task_id and deleted_at is null for update;
  if v_task.id is null or not v_task.complete_when_checklist_done then return; end if;
  select count(*),count(*) filter(where not completed) into v_total,v_open from checklist_items
    where task_id=p_task_id and deleted_at is null;
  select count(*) into v_dependencies from task_dependencies d join tasks prerequisite on prerequisite.id=d.prerequisite_task_id
    where d.waiting_task_id=p_task_id and d.mandatory and d.deleted_at is null and prerequisite.deleted_at is null
      and prerequisite.status not in ('completed','cancelled','archived');
  if v_total>0 and v_open=0 and v_dependencies=0 and v_task.status not in ('completed','cancelled','archived') then
    update tasks set status='completed',completed_at=coalesce(completed_at,now()),auto_completed_from_checklist=true where id=p_task_id;
  elsif v_task.auto_completed_from_checklist and(v_total=0 or v_open>0 or v_dependencies>0) and v_task.status='completed' then
    update tasks set status='in_progress',completed_at=null,auto_completed_from_checklist=false where id=p_task_id;
  end if;
end $$;

create or replace function public.reconcile_checklist_task_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
begin perform reconcile_task_checklist_completion(coalesce(new.task_id,old.task_id)); return coalesce(new,old); end $$;
drop trigger if exists checklist_task_auto_completion on public.checklist_items;
create trigger checklist_task_auto_completion after insert or update of completed,deleted_at or delete on public.checklist_items
for each row execute function public.reconcile_checklist_task_trigger();

create or replace function public.reconcile_task_option_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
begin perform reconcile_task_checklist_completion(new.id); return new; end $$;
drop trigger if exists task_option_auto_completion on public.tasks;
create trigger task_option_auto_completion after insert or update of complete_when_checklist_done on public.tasks
for each row execute function public.reconcile_task_option_trigger();

create or replace function public.reconcile_dependency_task_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
begin perform reconcile_task_checklist_completion(coalesce(new.waiting_task_id,old.waiting_task_id)); return coalesce(new,old); end $$;
drop trigger if exists dependency_task_auto_completion on public.task_dependencies;
create trigger dependency_task_auto_completion after insert or update of mandatory,deleted_at or delete on public.task_dependencies
for each row execute function public.reconcile_dependency_task_trigger();

create or replace function public.reconcile_waiting_tasks_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_waiting uuid;
begin
  for v_waiting in select waiting_task_id from task_dependencies where prerequisite_task_id=new.id and mandatory and deleted_at is null
  loop perform reconcile_task_checklist_completion(v_waiting); end loop;
  return new;
end $$;
drop trigger if exists prerequisite_task_auto_completion on public.tasks;
create trigger prerequisite_task_auto_completion after update of status on public.tasks
for each row when(old.status is distinct from new.status) execute function public.reconcile_waiting_tasks_trigger();

create or replace function public.connected_identity_state(p_user_id uuid,p_email text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare m record;s text;i app_invites;n text:=normalize_email(p_email);d text;
begin
  select account_status,display_name into s,d from profiles where id=p_user_id;
  select wm.workspace_id,wm.role into m from workspace_members wm join workspaces w on w.id=wm.workspace_id
    where wm.user_id=p_user_id and wm.removed_at is null and w.product_edition='connected' order by wm.created_at limit 1;
  select * into i from app_invites where email_normalized=n and status='pending' order by invited_at desc limit 1;
  if i.id is not null and i.expires_at<=now() then update app_invites set status='expired' where id=i.id;i:=null; end if;
  return jsonb_build_object('status',case when s='disabled' then 'disabled' when m.workspace_id is not null then 'active'
    when i.id is not null then 'invited' else 'uninvited' end,'userId',p_user_id,'email',n,'displayName',d,
    'workspaceId',m.workspace_id,'role',m.role,'platformAdmin',is_platform_admin(p_user_id),
    'requiresPasswordSetup',coalesce((select must_change_password from profiles where id=p_user_id),i.id is not null));
end $$;

create function public.accept_app_invitation(p_user_id uuid,p_email text,p_display_name text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare i app_invites;p jsonb;n text:=normalize_email(p_email);d text:=trim(p_display_name);
begin
  if length(d)<2 or length(d)>80 then raise exception 'Display name must contain 2 to 80 characters'; end if;
  select * into i from app_invites where email_normalized=n and status='pending' order by invited_at desc limit 1 for update;
  if i.id is null then
    if exists(select 1 from workspaces where personal_owner_user_id=p_user_id) then
      p:=provision_private_workspace(p_user_id,n); update profiles set display_name=d,must_change_password=false where id=p_user_id; return p;
    end if;
    raise exception 'No valid invitation is available' using errcode='42501';
  end if;
  if i.expires_at<=now() then update app_invites set status='expired' where id=i.id; raise exception 'Invitation has expired'; end if;
  if i.accepted_user_id is not null and i.accepted_user_id<>p_user_id then raise exception 'Invitation belongs to another account' using errcode='42501'; end if;
  p:=provision_private_workspace(p_user_id,n);
  update profiles set display_name=d,must_change_password=false where id=p_user_id;
  update app_invites set status='accepted',accepted_at=coalesce(accepted_at,now()),accepted_user_id=p_user_id where id=i.id;
  return p||jsonb_build_object('invitationId',i.id,'accepted',true,'displayName',d);
end $$;

create or replace function public.public_manage_project_checklist(
  p_share_id uuid,p_action text,p_task_id uuid,p_item_id uuid,p_description text,p_required boolean,
  p_due_date date,p_ordered_item_ids uuid[],p_expected_version integer default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_share person_task_shares;v_task tasks;v_item checklist_items;v_actor text;v_active_count integer;v_position integer;
begin
  select * into v_share from person_task_shares where id=p_share_id and revoked_at is null and scope_mode='project'
    and project_id is not null and allow_manage_checklist_items and(expires_at is null or expires_at>now());
  if v_share.id is null then raise exception 'Managing project checklist items is not permitted'; end if;
  select * into v_task from tasks where id=p_task_id and workspace_id=v_share.workspace_id and project_id=v_share.project_id
    and deleted_at is null and status not in('completed','cancelled','archived');
  if v_task.id is null then raise exception 'Task is unavailable outside the shared project'; end if;
  select full_name into v_actor from people where id=v_share.person_id and workspace_id=v_share.workspace_id;
  if p_action='create' then
    if nullif(trim(p_description),'') is null or length(p_description)>1000 then raise exception 'Checklist description is required and must be 1000 characters or fewer'; end if;
    select coalesce(max(position)+1,0) into v_position from checklist_items where task_id=v_task.id and workspace_id=v_share.workspace_id and deleted_at is null;
    insert into checklist_items(workspace_id,task_id,description,required,due_date,position)
      values(v_share.workspace_id,v_task.id,trim(p_description),coalesce(p_required,true),p_due_date,v_position) returning * into v_item;
  elsif p_action='update' then
    if nullif(trim(p_description),'') is null or length(p_description)>1000 then raise exception 'Checklist description is required and must be 1000 characters or fewer'; end if;
    update checklist_items set description=trim(p_description),required=coalesce(p_required,true),due_date=p_due_date
      where id=p_item_id and task_id=v_task.id and workspace_id=v_share.workspace_id and deleted_at is null and version=p_expected_version returning * into v_item;
    if v_item.id is null then raise exception 'Checklist item changed or is unavailable. Refresh before saving.' using errcode='40001'; end if;
  elsif p_action='remove' then
    update checklist_items set deleted_at=now() where id=p_item_id and task_id=v_task.id and workspace_id=v_share.workspace_id
      and deleted_at is null and version=p_expected_version returning * into v_item;
    if v_item.id is null then raise exception 'Checklist item changed or is unavailable. Refresh before removing it.' using errcode='40001'; end if;
  elsif p_action='reorder' then
    select count(*) into v_active_count from checklist_items where task_id=v_task.id and workspace_id=v_share.workspace_id and deleted_at is null;
    if p_ordered_item_ids is null or cardinality(p_ordered_item_ids)<>v_active_count
      or(select count(distinct item_id) from unnest(p_ordered_item_ids) ordered_id(item_id))<>v_active_count
      or(select count(*) from checklist_items where id=any(p_ordered_item_ids) and task_id=v_task.id and workspace_id=v_share.workspace_id and deleted_at is null)<>v_active_count
      then raise exception 'Checklist order is incomplete or contains invalid items'; end if;
    update checklist_items item set position=ordered.ordinality-1 from unnest(p_ordered_item_ids) with ordinality ordered(item_id,ordinality)
      where item.id=ordered.item_id and item.task_id=v_task.id and item.workspace_id=v_share.workspace_id;
  else raise exception 'Unsupported checklist action'; end if;
  perform record_person_share_action(v_share.id,v_task.id,case p_action when 'create' then 'checklist_item_created' when 'update' then 'checklist_item_updated'
    when 'remove' then 'checklist_item_removed' else 'checklist_items_reordered' end,coalesce(v_actor,'Collaborator')||' '||case p_action when 'create' then 'added a checklist item to '
    when 'update' then 'updated a checklist item in ' when 'remove' then 'removed a checklist item from ' else 'reordered checklist items in ' end||'“'||v_task.title||'”',
    jsonb_build_object('actorPersonId',v_share.person_id,'projectId',v_share.project_id,'itemId',v_item.id));
  return jsonb_build_object('taskId',v_task.id,'itemId',v_item.id,'action',p_action);
end $$;

create or replace function public.public_person_task_share(p_share_id uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'personName',p.full_name,'generatedAt',now(),
    'access',jsonb_build_object('scopeMode',s.scope_mode,'projectId',s.project_id,'expiresAt',s.expires_at,
      'allowChecklistUpdates',s.allow_checklist_updates,'allowTaskCompletion',s.allow_task_completion,'allowComments',s.allow_comments,
      'allowViewProjectContacts',s.allow_view_project_contacts,'allowViewContactAssignments',s.allow_view_contact_assignments,
      'allowSuperviseContactChecklists',s.allow_supervise_contact_checklists,'allowCompleteContactTasks',s.allow_complete_contact_tasks,
      'allowManageProjectContacts',s.allow_manage_project_contacts,'allowCreateEditTasks',s.allow_create_edit_tasks,
      'allowManageChecklistItems',s.allow_manage_checklist_items),
    'preferences',jsonb_build_object('emailAvailable',nullif(trim(p.email),'') is not null,'emailEnabled',s.email_enabled,
      'pushEnabled',s.push_enabled,'activePushSubscriptions',(select count(*) from person_share_push_subscriptions ps where ps.share_id=s.id and not ps.disabled)),
    'projects',coalesce((select jsonb_agg(project_row order by project_row->>'projectName') from(
      select jsonb_build_object('projectId',t.project_id,'projectName',coalesce(pr.name,'No project'),'progress',round(avg(t.calculated_progress)),
        'tasks',jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'description',t.description,'status',t.status,
          'priority',t.priority,'dueDate',t.due_date,'calculatedProgress',t.calculated_progress,'blocked',t.blocked,'version',t.version,
          'responsiblePersonId',case when s.allow_view_contact_assignments then t.responsible_person_id else null end,
          'responsiblePersonName',case when s.allow_view_contact_assignments then rp.full_name else null end,
          'canUpdateChecklist',person_share_task_allowed(s.id,t.id,'checklist'),'canComplete',person_share_task_allowed(s.id,t.id,'complete'),
          'canComment',s.allow_comments and person_share_task_allowed(s.id,t.id,'comment'),
          'canEditTask',s.scope_mode='project' and s.allow_create_edit_tasks,
          'canManageChecklist',s.scope_mode='project' and s.allow_manage_checklist_items,
          'checklist',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'description',c.description,'completed',c.completed,
            'required',c.required,'dueDate',c.due_date,'position',c.position,'version',c.version) order by c.position,c.created_at)
            from checklist_items c where c.task_id=t.id and c.deleted_at is null),'[]'::jsonb)) order by t.due_date nulls last,t.created_at)) project_row
      from tasks t left join projects pr on pr.id=t.project_id left join people rp on rp.id=t.responsible_person_id
      where person_share_task_allowed(s.id,t.id,'view') and t.status not in('completed','cancelled','archived') group by t.project_id,pr.name
    ) grouped),'[]'::jsonb),
    'projectPeople',case when s.scope_mode='project' and s.allow_view_project_contacts then coalesce((select jsonb_agg(
      jsonb_build_object('personId',p2.id,'fullName',p2.full_name,'company',p2.company,'role',p2.role,
        'phone',case when pp.share_phone or s.allow_manage_project_contacts then p2.phone else null end,
        'email',case when pp.share_email or s.allow_manage_project_contacts then p2.email else null end,
        'address',case when pp.share_address or s.allow_manage_project_contacts then p2.address else null end,
        'notes',case when pp.share_notes or s.allow_manage_project_contacts then p2.notes else null end,
        'sharePhone',pp.share_phone,'shareEmail',pp.share_email,'shareAddress',pp.share_address,'shareNotes',pp.share_notes,
        'supervisable',pp.supervisable) order by p2.full_name)
      from project_people pp join people p2 on p2.id=pp.person_id and p2.workspace_id=pp.workspace_id and p2.deleted_at is null
      where pp.project_id=s.project_id and pp.workspace_id=s.workspace_id and pp.deleted_at is null),'[]'::jsonb) else '[]'::jsonb end
  ) from person_task_shares s join people p on p.id=s.person_id and p.workspace_id=s.workspace_id
  where s.id=p_share_id and s.revoked_at is null and(s.expires_at is null or s.expires_at>now())
$$;

create or replace function public.connected_calendar(p_workspace_id uuid,p_user_id uuid,p_start date,p_end date)
returns jsonb language sql security definer set search_path=public as $$
with dates as(select generate_series(p_start,p_end,'1 day')::date d),
matches as(
  select d.d,t.*,p.name project_name,pe.full_name person_name,
    coalesce((select jsonb_agg(c.description order by c.position,c.created_at) from checklist_items c
      where c.task_id=t.id and c.deleted_at is null and c.due_date=d.d),'[]'::jsonb) checklist_due_items,
    case when t.status='completed' then 'green'
      when(t.due_date<current_date and t.status not in('completed','cancelled','archived'))or t.priority='critical' then 'red'
      when t.priority='high' then 'orange' else 'blue' end severity
  from dates d join tasks t on t.workspace_id=p_workspace_id and t.deleted_at is null and(
    t.due_date=d.d or t.reminder_at::date=d.d or t.completed_at::date=d.d or exists(
      select 1 from checklist_items c where c.task_id=t.id and c.deleted_at is null and c.due_date=d.d))
  left join projects p on p.id=t.project_id left join people pe on pe.id=t.responsible_person_id
),per_day as(
  select d,jsonb_agg(jsonb_build_object('id',id,'title',title,'description',description,'status',status,'priority',priority,
    'dueDate',due_date,'dueTime',due_time,'projectId',project_id,'projectName',project_name,
    'responsiblePersonId',responsible_person_id,'responsiblePersonName',person_name,'calculatedProgress',calculated_progress,
    'blocked',blocked,'version',version,'updatedAt',updated_at,'checklistDueItems',checklist_due_items)) tasks,count(*) count,
    case when bool_or(severity='red') then 'red' when bool_or(severity='orange') then 'orange'
      when bool_or(severity='blue') then 'blue' else 'green' end severity from matches group by d
)
select coalesce(jsonb_agg(jsonb_build_object('date',dates.d,'severity',coalesce(per_day.severity,'neutral'),
  'count',coalesce(per_day.count,0),'tasks',coalesce(per_day.tasks,'[]'::jsonb)) order by dates.d),'[]'::jsonb)
from dates left join per_day using(d)
$$;

revoke all on function public.accept_app_invitation(uuid,text,text) from public,anon;
grant execute on function public.accept_app_invitation(uuid,text,text) to service_role;
revoke all on function public.public_manage_project_checklist(uuid,text,uuid,uuid,text,boolean,date,uuid[],integer) from public;
grant execute on function public.public_manage_project_checklist(uuid,text,uuid,uuid,text,boolean,date,uuid[],integer) to service_role;

insert into public.schema_versions(version) values(17) on conflict do nothing;
commit;
