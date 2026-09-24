begin;

-- Checklist deadlines are date-only unless the user explicitly chooses a time.
-- Relative reminders therefore remain impossible to configure accidentally at midnight.
alter table public.checklist_items add column if not exists due_time time without time zone;
alter table public.checklist_items add column if not exists cost_date date;

create table if not exists public.checklist_reminders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  checklist_item_id uuid not null references public.checklist_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  sequence smallint not null check(sequence in (1,2)),
  offset_minutes integer not null check(offset_minutes in (30,60,120,180,360,720,1440,2880)),
  scheduled_at timestamptz not null,
  dismissed boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique(checklist_item_id,sequence)
);

create index if not exists checklist_reminder_due_queue on public.checklist_reminders(scheduled_at)
  where dismissed=false and deleted_at is null;
create index if not exists checklist_reminder_workspace_item on public.checklist_reminders(workspace_id,checklist_item_id)
  where deleted_at is null;

alter table public.checklist_reminders enable row level security;
drop policy if exists checklist_reminders_read on public.checklist_reminders;
drop policy if exists checklist_reminders_write on public.checklist_reminders;
create policy checklist_reminders_read on public.checklist_reminders for select
  using(public.is_workspace_member(workspace_id));
create policy checklist_reminders_write on public.checklist_reminders for all
  using(public.workspace_role_for(workspace_id) in ('owner','admin','member'))
  with check(public.workspace_role_for(workspace_id) in ('owner','admin','member'));
grant select,insert,update,delete on public.checklist_reminders to authenticated;

drop trigger if exists checklist_reminders_bump on public.checklist_reminders;
create trigger checklist_reminders_bump before update on public.checklist_reminders
  for each row execute function public.bump_version();

alter table public.notification_deliveries
  add column if not exists checklist_reminder_id uuid references public.checklist_reminders(id) on delete set null;
alter table public.person_share_events
  add column if not exists checklist_item_id uuid references public.checklist_items(id) on delete cascade;
create unique index if not exists person_share_checklist_reminder_once
  on public.person_share_events(share_id,kind,checklist_item_id,next_attempt_at)
  where kind='checklist.reminder';

create or replace function public.user_save_checklist_item_schedule(
  p_workspace_id uuid,p_item_id uuid,p_task_id uuid,p_description text,p_completed boolean,p_required boolean,
  p_position integer,p_cost_amount numeric,p_cost_date date,p_due_date date,p_due_time time,p_notification_offsets integer[],
  p_expected_version integer default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_actor uuid; v_item checklist_items; v_task tasks; v_recipient uuid; v_recipient_name text; v_guest_share uuid;
  v_timezone text:='UTC'; v_deadline timestamptz; v_offset integer; v_sequence integer:=0;
begin
  v_actor:=assert_connected_workspace(p_workspace_id);
  if trim(coalesce(p_description,''))='' or length(trim(p_description))>1000 then raise exception 'Checklist description must contain 1 to 1000 characters'; end if;
  if p_due_time is not null and p_due_date is null then raise exception 'A due date is required when a due time is set'; end if;
  if coalesce(array_length(p_notification_offsets,1),0)>2 then raise exception 'A maximum of two checklist notifications is allowed'; end if;
  if coalesce(array_length(p_notification_offsets,1),0)>0 and (p_due_date is null or p_due_time is null) then raise exception 'Select a due date and time to configure notifications'; end if;
  if coalesce(array_length(p_notification_offsets,1),0)=2 and p_notification_offsets[1]<=p_notification_offsets[2] then raise exception 'The first notification must occur before the second notification'; end if;
  if exists(select 1 from unnest(coalesce(p_notification_offsets,array[]::integer[])) x where x not in(30,60,120,180,360,720,1440,2880)) then raise exception 'Invalid checklist notification time'; end if;
  if (select count(distinct x) from unnest(coalesce(p_notification_offsets,array[]::integer[])) x)<>coalesce(array_length(p_notification_offsets,1),0) then raise exception 'Checklist notifications must use different times'; end if;

  select * into v_task from tasks where id=p_task_id and workspace_id=p_workspace_id and deleted_at is null for update;
  if v_task.id is null then raise exception 'Parent task not found'; end if;

  select * into v_item from checklist_items where id=p_item_id and workspace_id=p_workspace_id for update;
  if v_item.id is null then
    insert into checklist_items(id,workspace_id,task_id,description,completed,required,position,cost_amount,cost_date,due_date,due_time,created_by,updated_by)
      values(p_item_id,p_workspace_id,p_task_id,trim(p_description),p_completed,p_required,greatest(p_position,0),p_cost_amount,p_cost_date,p_due_date,p_due_time,v_actor,v_actor)
      returning * into v_item;
  else
    if v_item.task_id<>p_task_id then raise exception 'Checklist item belongs to another task'; end if;
    if p_expected_version is not null and v_item.version<>p_expected_version then raise exception 'Checklist item changed on another device. Refresh before saving.' using errcode='40001'; end if;
    update checklist_items set description=trim(p_description),completed=p_completed,required=p_required,
      position=greatest(p_position,0),cost_amount=p_cost_amount,cost_date=p_cost_date,due_date=p_due_date,due_time=p_due_time,
      updated_by=v_actor,updated_at=now() where id=p_item_id returning * into v_item;
  end if;

  update notification_deliveries delivery set status='failed',last_error_code='RESCHEDULED',claimed_at=null
    from checklist_reminders reminder where delivery.checklist_reminder_id=reminder.id
      and reminder.checklist_item_id=v_item.id and delivery.status in('pending','retry');
  update checklist_reminders set deleted_at=now(),dismissed=true,updated_at=now()
    where checklist_item_id=v_item.id and deleted_at is null;
  update person_share_events set status='failed',last_error_code='RESCHEDULED'
    where checklist_item_id=v_item.id and kind='checklist.reminder' and status in('pending','retry');

  if not p_completed and v_task.status not in('completed','cancelled','archived') and not v_task.archived
     and v_task.deleted_at is null and p_due_date is not null and p_due_time is not null
     and coalesce(array_length(p_notification_offsets,1),0)>0 then
    select profile.id,coalesce(nullif(profile.display_name,''),profile.email) into v_recipient,v_recipient_name
      from people person join profiles profile on lower(profile.email)=lower(nullif(trim(person.email),''))
      join workspace_members member on member.workspace_id=p_workspace_id and member.user_id=profile.id and member.removed_at is null
      where person.id=v_task.responsible_person_id and person.workspace_id=p_workspace_id and person.deleted_at is null
        and profile.account_status='active' limit 1;
    if v_recipient is null then
      select share.id,person.full_name into v_guest_share,v_recipient_name from person_task_shares share
        join people person on person.id=share.person_id and person.deleted_at is null
        where share.workspace_id=p_workspace_id and share.person_id=v_task.responsible_person_id and share.revoked_at is null
          and (share.expires_at is null or share.expires_at>now()) and (share.email_enabled or share.push_enabled)
          and ((share.scope_mode='assigned') or (share.scope_mode='project' and share.project_id=v_task.project_id)) limit 1;
    end if;
    if v_recipient is null and v_guest_share is null then
      select profile.id,coalesce(nullif(profile.display_name,''),profile.email) into v_recipient,v_recipient_name
        from workspace_members member join profiles profile on profile.id=member.user_id and profile.account_status='active'
        where member.workspace_id=p_workspace_id and member.removed_at is null and member.role='owner' order by member.created_at limit 1;
    end if;
    select coalesce(nullif(preference.timezone,''),nullif(profile.timezone,''),'UTC') into v_timezone
      from profiles profile left join notification_preferences preference
        on preference.workspace_id=p_workspace_id and preference.user_id=profile.id
      where profile.id=v_actor limit 1;
    v_timezone:=coalesce(v_timezone,'UTC');
    v_deadline:=(p_due_date::text||' '||p_due_time::text)::timestamp at time zone v_timezone;
    foreach v_offset in array p_notification_offsets loop
      v_sequence:=v_sequence+1;
      if v_deadline-make_interval(mins=>v_offset)<=now() then raise exception 'A checklist notification cannot be scheduled in the past'; end if;
      if v_recipient is not null then
        insert into checklist_reminders(workspace_id,checklist_item_id,user_id,sequence,offset_minutes,scheduled_at)
          values(p_workspace_id,v_item.id,v_recipient,v_sequence,v_offset,v_deadline-make_interval(mins=>v_offset));
      elsif v_guest_share is not null then
        insert into person_share_events(share_id,workspace_id,person_id,task_id,checklist_item_id,kind,title,detail,next_attempt_at)
          select share.id,p_workspace_id,share.person_id,v_task.id,v_item.id,'checklist.reminder',v_item.description,
            'Checklist reminder · Parent task: '||v_task.title,v_deadline-make_interval(mins=>v_offset)
          from person_task_shares share where share.id=v_guest_share;
      end if;
    end loop;
  end if;
  perform public.reconcile_task_checklist_completion(p_task_id);
  return to_jsonb(v_item)||jsonb_build_object('notificationOffsets',coalesce(p_notification_offsets,array[]::integer[]),'notificationRecipientName',v_recipient_name);
end $$;

create or replace function public.cancel_inactive_checklist_reminders() returns trigger language plpgsql set search_path=public as $$
begin
  if tg_table_name='checklist_items' then
    if new.completed or new.deleted_at is not null then
      update notification_deliveries delivery set status='failed',last_error_code='WORK_INACTIVE',claimed_at=null
        from checklist_reminders reminder where delivery.checklist_reminder_id=reminder.id
          and reminder.checklist_item_id=new.id and delivery.status in('pending','retry');
      update checklist_reminders set dismissed=true,deleted_at=coalesce(deleted_at,now()),updated_at=now() where checklist_item_id=new.id and deleted_at is null;
      update person_share_events set status='failed',last_error_code='WORK_INACTIVE' where checklist_item_id=new.id and kind='checklist.reminder' and status in('pending','retry');
    end if;
  else
    if new.deleted_at is not null or new.archived or new.status in('completed','cancelled','archived') then
      update notification_deliveries delivery set status='failed',last_error_code='WORK_INACTIVE',claimed_at=null
        from checklist_reminders reminder join checklist_items item on item.id=reminder.checklist_item_id
        where delivery.checklist_reminder_id=reminder.id and item.task_id=new.id and delivery.status in('pending','retry');
      update checklist_reminders reminder set dismissed=true,deleted_at=coalesce(reminder.deleted_at,now()),updated_at=now()
        from checklist_items item where item.task_id=new.id and reminder.checklist_item_id=item.id and reminder.deleted_at is null;
      update person_share_events set status='failed',last_error_code='WORK_INACTIVE' where task_id=new.id and kind='checklist.reminder' and status in('pending','retry');
    end if;
  end if;
  return new;
end $$;
drop trigger if exists checklist_reminder_cancel_item on public.checklist_items;
create trigger checklist_reminder_cancel_item after update of completed,deleted_at on public.checklist_items for each row execute function public.cancel_inactive_checklist_reminders();
drop trigger if exists checklist_reminder_cancel_task on public.tasks;
create trigger checklist_reminder_cancel_task after update of status,archived,deleted_at on public.tasks for each row execute function public.cancel_inactive_checklist_reminders();

-- Friendly invitation aliases retain the existing signed share as the actual authority.
alter table public.person_task_shares add column if not exists invitation_code_hash text;
alter table public.person_task_shares add column if not exists invitation_notifications_offered boolean not null default false;
create unique index if not exists person_share_invitation_code_hash on public.person_task_shares(invitation_code_hash) where invitation_code_hash is not null and revoked_at is null;

create table if not exists public.project_invitation_attempts(
  id bigint generated always as identity primary key,
  code_hash text not null,
  client_hash text not null,
  succeeded boolean not null,
  attempted_at timestamptz not null default now()
);
create index if not exists project_invitation_attempts_client_recent on public.project_invitation_attempts(client_hash,attempted_at desc);
create index if not exists project_invitation_attempts_cleanup on public.project_invitation_attempts(attempted_at);
alter table public.project_invitation_attempts enable row level security;
revoke all on public.project_invitation_attempts from public,anon,authenticated;

create or replace function public.public_project_invitation_by_hash(p_code_hash text,p_client_hash text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  delete from project_invitation_attempts where attempted_at<now()-interval '7 days';
  if (select count(*) from project_invitation_attempts where client_hash=p_client_hash and attempted_at>now()-interval '10 minutes')>=20 then
    raise exception 'Too many invitation attempts. Try again later.' using errcode='P0001';
  end if;
  select jsonb_build_object('shareId',share.id,'inviterName',coalesce(profile.display_name,profile.email,'Task Tracker user'),
    'personName',person.full_name,'projectId',project.id,'projectName',project.name,
    'projectDescription',project.description,'expiresAt',share.expires_at,
    'offerNotifications',share.invitation_notifications_offered,
    'permissions',jsonb_build_object('readOnly',not(share.allow_checklist_updates or share.allow_task_completion or share.allow_comments or share.allow_create_edit_tasks or share.allow_manage_checklist_items),
      'allowChecklistUpdates',share.allow_checklist_updates,'allowTaskCompletion',share.allow_task_completion,
      'allowComments',share.allow_comments,'allowCreateEditTasks',share.allow_create_edit_tasks,'allowManageChecklistItems',share.allow_manage_checklist_items),
    'activeTasks',(select count(*) from tasks task where task.project_id=project.id and task.deleted_at is null and task.status not in('completed','cancelled','archived')),
    'openChecklistItems',(select count(*) from checklist_items item join tasks task on task.id=item.task_id where task.project_id=project.id and item.deleted_at is null and not item.completed and task.deleted_at is null and task.status not in('completed','cancelled','archived'))) into result
  from person_task_shares share join people person on person.id=share.person_id and person.deleted_at is null
  join projects project on project.id=share.project_id and project.deleted_at is null
  left join profiles profile on profile.id=share.created_by
  where share.invitation_code_hash=p_code_hash and share.scope_mode='project' and share.revoked_at is null and (share.expires_at is null or share.expires_at>now()) limit 1;
  insert into project_invitation_attempts(code_hash,client_hash,succeeded) values(p_code_hash,p_client_hash,result is not null);
  return result;
end
$$;

create or replace function public.claim_due_notification_deliveries(
  p_limit integer default 25,p_request_id text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; run_id uuid; batch_size integer:=least(greatest(p_limit,1),50);
begin
  insert into scheduler_runs(request_id) values(p_request_id) returning id into run_id;
  insert into notification_deliveries(workspace_id,user_id,task_id,checklist_item_id,checklist_reminder_id,kind,idempotency_key,next_attempt_at,title,detail)
  select reminder.workspace_id,reminder.user_id,task.id,item.id,reminder.id,'checklist_reminder',
    'checklist-reminder:'||reminder.id::text||':'||reminder.scheduled_at::text,now(),'Checklist reminder',
    concat_ws(' · ',item.description,task.title,case when item.due_date is not null then 'Due '||item.due_date::text||coalesce(' '||item.due_time::text,'') end)
  from checklist_reminders reminder join checklist_items item on item.id=reminder.checklist_item_id and item.workspace_id=reminder.workspace_id
  join tasks task on task.id=item.task_id and task.workspace_id=item.workspace_id
  join profiles profile on profile.id=reminder.user_id and profile.account_status='active'
  where reminder.dismissed=false and reminder.deleted_at is null and reminder.scheduled_at<=now()
    and item.deleted_at is null and not item.completed and task.deleted_at is null and not task.archived and task.status not in('completed','cancelled','archived')
  on conflict(workspace_id,idempotency_key) do nothing;

  insert into notification_deliveries(workspace_id,user_id,task_id,reminder_id,kind,idempotency_key,next_attempt_at,title,detail)
  select reminder.workspace_id,reminder.user_id,reminder.task_id,reminder.id,'reminder',reminder.id::text||':'||reminder.scheduled_at::text,now(),'Task reminder',
    concat_ws(' · ',task.title,case when task.due_date is not null then 'Due '||task.due_date::text end,case when project.name is not null then project.name end)
  from reminders reminder join tasks task on task.id=reminder.task_id and task.workspace_id=reminder.workspace_id
  join profiles profile on profile.id=reminder.user_id and profile.account_status='active'
  join workspace_members member on member.workspace_id=reminder.workspace_id and member.user_id=reminder.user_id and member.removed_at is null
  left join projects project on project.id=task.project_id and project.deleted_at is null
  where reminder.dismissed=false and reminder.deleted_at is null and reminder.next_attempt_at<=now()
    and task.deleted_at is null and not task.archived and task.status not in('completed','cancelled','archived')
  on conflict(workspace_id,idempotency_key) do nothing;

  with due as(
    select id from notification_deliveries where status in('pending','retry') and next_attempt_at<=now()
      and(claimed_at is null or claimed_at<now()-interval '10 minutes') order by next_attempt_at for update skip locked limit batch_size
  ),claimed as(
    update notification_deliveries delivery set claimed_at=now(),attempt_count=attempt_count+1 from due where delivery.id=due.id returning delivery.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'deliveryId',delivery.id,'workspaceId',delivery.workspace_id,'userId',delivery.user_id,'recipientEmail',profile.email,
    'taskId',delivery.task_id,'title',case when delivery.kind='checklist_reminder' then item.description else task.title end,
    'parentTaskTitle',task.title,'checklistItemId',delivery.checklist_item_id,'kind',delivery.kind,
    'taskDescription',task.description,'dueDate',case when delivery.kind='checklist_reminder' then item.due_date else task.due_date end,
    'dueTime',case when delivery.kind='checklist_reminder' then item.due_time else task.due_time end,
    'priority',task.priority,'taskStatus',task.status,'taskBlocked',task.blocked,'projectName',coalesce(project.name,'No project'),
    'responsiblePersonName',person.full_name,'reminderTime',coalesce(checklist_reminder.scheduled_at,task_reminder.scheduled_at),
    'timezone',coalesce(preference.timezone,'UTC'),'emailEnabled',coalesce(preference.email_enabled,false),
    'pushEnabled',coalesce(preference.push_enabled,true),'emailSent',delivery.email_sent,'pushSent',delivery.push_sent,
    'idempotencyKey',delivery.idempotency_key,'attemptCount',delivery.attempt_count
  )),'[]'::jsonb) into result
  from claimed delivery join profiles profile on profile.id=delivery.user_id join tasks task on task.id=delivery.task_id
  left join checklist_items item on item.id=delivery.checklist_item_id
  left join checklist_reminders checklist_reminder on checklist_reminder.id=delivery.checklist_reminder_id
  left join reminders task_reminder on task_reminder.id=delivery.reminder_id
  left join projects project on project.id=task.project_id and project.deleted_at is null
  left join people person on person.id=task.responsible_person_id and person.deleted_at is null
  left join notification_preferences preference on preference.workspace_id=delivery.workspace_id and preference.user_id=delivery.user_id;
  update scheduler_runs set claimed_count=jsonb_array_length(result),completed_at=now(),status='completed' where id=run_id;
  return result;
end $$;

create or replace function public.complete_notification_delivery(
  p_delivery_id uuid,p_status text,p_error_code text default null,p_next_attempt_at timestamptz default null,
  p_email_sent boolean default false,p_push_sent boolean default false
) returns jsonb language plpgsql security definer set search_path=public as $$
declare d notification_deliveries; r reminders; t tasks; v_next timestamptz;
begin
  if p_status not in('delivered','retry','failed','quota_reached') then raise exception 'Invalid delivery status'; end if;
  update notification_deliveries set status=p_status,last_error_code=left(p_error_code,100),next_attempt_at=coalesce(p_next_attempt_at,next_attempt_at),
    email_sent=email_sent or p_email_sent,push_sent=push_sent or p_push_sent,delivered_at=case when p_status='delivered' then now() else delivered_at end,claimed_at=null
    where id=p_delivery_id returning * into d;
  if d.id is null then raise exception 'Delivery not found'; end if;
  if p_status='delivered' and d.checklist_reminder_id is not null then
    update checklist_reminders set dismissed=true where id=d.checklist_reminder_id;
  elsif p_status='delivered' then
    select * into r from reminders where id=d.reminder_id for update; select * into t from tasks where id=d.task_id;
    if r.id is not null and t.id is not null and t.reminder_repeat in('daily','weekly','monthly') and t.deleted_at is null and not t.archived and t.status not in('completed','cancelled','archived') then
      v_next:=next_task_reminder_occurrence(r.scheduled_at,t.reminder_repeat,t.reminder_repeat_interval);
      update reminders set scheduled_at=v_next,next_attempt_at=v_next,snoozed_until=null,dismissed=false,claimed_at=null,attempt_count=0 where id=r.id;
    else update reminders set dismissed=true where id=d.reminder_id; end if;
  end if;
  return jsonb_build_object('deliveryId',d.id,'status',d.status,'nextReminderAt',v_next);
end $$;

create or replace function public.claim_person_share_events(p_limit integer default 25)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  with due as(
    select id from person_share_events where status in('pending','retry') and next_attempt_at<=now()
      and(claimed_at is null or claimed_at<now()-interval '10 minutes') order by next_attempt_at for update skip locked limit least(greatest(p_limit,1),50)
  ),claimed as(
    update person_share_events event set claimed_at=now(),attempt_count=attempt_count+1 from due where event.id=due.id returning event.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'deliveryId',event.id,'shareId',event.share_id,'workspaceId',event.workspace_id,'recipientEmail',person.email,
    'taskId',event.task_id,'checklistItemId',event.checklist_item_id,'title',event.title,'detail',event.detail,'kind',event.kind,
    'parentTaskTitle',task.title,'dueDate',case when event.kind='checklist.reminder' then item.due_date else task.due_date end,
    'dueTime',case when event.kind='checklist.reminder' then item.due_time else task.due_time end,
    'priority',task.priority,'taskStatus',task.status,'taskBlocked',task.blocked,'projectName',coalesce(project.name,'No project'),
    'responsiblePersonName',responsible.full_name,'timezone',coalesce(owner_preference.timezone,'UTC'),'emailEnabled',share.email_enabled,'pushEnabled',share.push_enabled,
    'emailSent',event.email_sent,'pushSent',event.push_sent,'attemptCount',event.attempt_count
  )),'[]'::jsonb) into result from claimed event
  join person_task_shares share on share.id=event.share_id and share.revoked_at is null and (share.expires_at is null or share.expires_at>now())
  join people person on person.id=event.person_id left join tasks task on task.id=event.task_id and task.workspace_id=event.workspace_id
  left join checklist_items item on item.id=event.checklist_item_id and item.workspace_id=event.workspace_id
  left join projects project on project.id=task.project_id and project.deleted_at is null
  left join people responsible on responsible.id=task.responsible_person_id and responsible.deleted_at is null
  left join lateral(select preference.timezone from workspace_members member left join notification_preferences preference
    on preference.workspace_id=member.workspace_id and preference.user_id=member.user_id
    where member.workspace_id=event.workspace_id and member.role='owner' and member.removed_at is null order by member.created_at limit 1) owner_preference on true;
  return result;
end $$;

revoke all on function public.user_save_checklist_item_schedule(uuid,uuid,uuid,text,boolean,boolean,integer,numeric,date,date,time,integer[],integer) from public,anon;
grant execute on function public.user_save_checklist_item_schedule(uuid,uuid,uuid,text,boolean,boolean,integer,numeric,date,date,time,integer[],integer) to authenticated,service_role;
revoke all on function public.public_project_invitation_by_hash(text,text) from public,anon,authenticated;
grant execute on function public.public_project_invitation_by_hash(text,text) to service_role;
revoke all on function public.claim_due_notification_deliveries(integer,text) from public,anon,authenticated;
revoke all on function public.complete_notification_delivery(uuid,text,text,timestamptz,boolean,boolean) from public,anon,authenticated;
grant execute on function public.claim_due_notification_deliveries(integer,text) to service_role;
grant execute on function public.complete_notification_delivery(uuid,text,text,timestamptz,boolean,boolean) to service_role;
revoke all on function public.claim_person_share_events(integer) from public,anon,authenticated;
grant execute on function public.claim_person_share_events(integer) to service_role;

insert into public.schema_versions(version) values(25) on conflict(version) do nothing;
commit;
