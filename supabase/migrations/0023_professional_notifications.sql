begin;

-- Return one canonical, workspace-scoped task context to the Notifications Worker so
-- email, push and the in-app inbox describe the same reminder without extra queries.
create or replace function public.claim_due_notification_deliveries(
  p_limit integer default 25,
  p_request_id text default null
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare result jsonb; run_id uuid; batch_size integer:=least(greatest(p_limit,1),50);
begin
  insert into scheduler_runs(request_id) values(p_request_id) returning id into run_id;

  insert into notification_deliveries(
    workspace_id,user_id,task_id,reminder_id,kind,idempotency_key,next_attempt_at,title,detail
  )
  select reminder.workspace_id,reminder.user_id,reminder.task_id,reminder.id,'reminder',
    reminder.id::text||':'||reminder.scheduled_at::text,now(),'Task reminder',
    concat_ws(' · ',task.title,
      case when task.due_date is not null then 'Due '||task.due_date::text end,
      case when project.name is not null then project.name end)
  from reminders reminder
  join tasks task on task.id=reminder.task_id and task.workspace_id=reminder.workspace_id
  join profiles profile on profile.id=reminder.user_id and profile.account_status='active'
  join workspace_members member on member.workspace_id=reminder.workspace_id and member.user_id=reminder.user_id and member.removed_at is null
  left join projects project on project.id=task.project_id and project.deleted_at is null
  where reminder.dismissed=false and reminder.deleted_at is null and reminder.next_attempt_at<=now()
    and task.deleted_at is null and not task.archived and task.status not in('completed','cancelled','archived')
  on conflict(workspace_id,idempotency_key) do nothing;

  with due as(
    select id from notification_deliveries
    where status in('pending','retry') and next_attempt_at<=now()
      and(claimed_at is null or claimed_at<now()-interval '10 minutes')
    order by next_attempt_at for update skip locked limit batch_size
  ),claimed as(
    update notification_deliveries delivery set claimed_at=now(),attempt_count=attempt_count+1
    from due where delivery.id=due.id returning delivery.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'deliveryId',delivery.id,'workspaceId',delivery.workspace_id,'userId',delivery.user_id,
    'recipientEmail',profile.email,'taskId',delivery.task_id,'title',task.title,
    'taskDescription',task.description,'dueDate',task.due_date,'dueTime',task.due_time,
    'priority',task.priority,'taskStatus',task.status,'taskBlocked',task.blocked,
    'projectName',coalesce(project.name,'No project'),'responsiblePersonName',person.full_name,
    'reminderTime',reminder.scheduled_at,'timezone',coalesce(preference.timezone,'UTC'),
    'emailEnabled',coalesce(preference.email_enabled,false),'pushEnabled',coalesce(preference.push_enabled,true),
    'emailSent',delivery.email_sent,'pushSent',delivery.push_sent,
    'idempotencyKey',delivery.idempotency_key,'attemptCount',delivery.attempt_count
  )),'[]'::jsonb) into result
  from claimed delivery
  join profiles profile on profile.id=delivery.user_id
  join tasks task on task.id=delivery.task_id
  join reminders reminder on reminder.id=delivery.reminder_id
  left join projects project on project.id=task.project_id and project.deleted_at is null
  left join people person on person.id=task.responsible_person_id and person.deleted_at is null
  left join notification_preferences preference on preference.workspace_id=delivery.workspace_id and preference.user_id=delivery.user_id;

  update scheduler_runs set claimed_count=jsonb_array_length(result),completed_at=now(),status='completed' where id=run_id;
  return result;
end $$;

-- Shared-work recipients receive the same useful task context while the signed
-- share token remains the only authority used by the public portal.
create or replace function public.claim_person_share_events(p_limit integer default 25)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare result jsonb;
begin
  with due as(
    select id from person_share_events
    where status in('pending','retry') and next_attempt_at<=now()
      and(claimed_at is null or claimed_at<now()-interval '10 minutes')
    order by next_attempt_at for update skip locked limit least(greatest(p_limit,1),50)
  ),claimed as(
    update person_share_events event set claimed_at=now(),attempt_count=attempt_count+1
    from due where event.id=due.id returning event.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'deliveryId',event.id,'shareId',event.share_id,'workspaceId',event.workspace_id,
    'recipientEmail',person.email,'taskId',event.task_id,'title',event.title,'detail',event.detail,'kind',event.kind,
    'dueDate',task.due_date,'dueTime',task.due_time,'priority',task.priority,'taskStatus',task.status,
    'taskBlocked',task.blocked,'projectName',coalesce(project.name,'No project'),
    'responsiblePersonName',responsible.full_name,'timezone','UTC',
    'emailEnabled',share.email_enabled,'pushEnabled',share.push_enabled,
    'emailSent',event.email_sent,'pushSent',event.push_sent,'attemptCount',event.attempt_count
  )),'[]'::jsonb) into result
  from claimed event
  join person_task_shares share on share.id=event.share_id and share.revoked_at is null
  join people person on person.id=event.person_id
  left join tasks task on task.id=event.task_id and task.workspace_id=event.workspace_id
  left join projects project on project.id=task.project_id and project.deleted_at is null
  left join people responsible on responsible.id=task.responsible_person_id and responsible.deleted_at is null;
  return result;
end $$;

revoke all on function public.claim_due_notification_deliveries(integer,text) from public,anon,authenticated;
revoke all on function public.claim_person_share_events(integer) from public,anon,authenticated;
grant execute on function public.claim_due_notification_deliveries(integer,text) to service_role;
grant execute on function public.claim_person_share_events(integer) to service_role;

commit;
