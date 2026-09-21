begin;

create or replace function public.list_app_users(p_actor_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  r jsonb;
begin
  if not is_platform_admin(p_actor_user_id) then
    raise exception 'Platform administrator required' using errcode='42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', i.id,
        'email', i.email_normalized,
        'displayName', nullif(trim(p.display_name), ''),
        'status', i.status,
        'invitedAt', i.invited_at,
        'expiresAt', i.expires_at,
        'acceptedAt', i.accepted_at,
        'acceptedUserId', i.accepted_user_id,
        'disabledAt', i.disabled_at
      ) order by i.invited_at desc
    ),
    '[]'::jsonb
  ) into r
  from public.app_invites i
  left join public.profiles p on p.id = i.accepted_user_id;

  return r;
end
$$;

create or replace function public.user_task_activity_timeline(
  p_workspace_id uuid,
  p_task_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  r jsonb;
begin
  if not exists (
    select 1
    from public.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = auth.uid()
      and m.removed_at is null
  ) then
    raise exception 'Workspace access required' using errcode='42501';
  end if;

  if not exists (
    select 1
    from public.tasks t
    where t.id = p_task_id
      and t.workspace_id = p_workspace_id
  ) then
    raise exception 'Task not found' using errcode='P0002';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'eventType', a.event_type,
        'summary', a.summary,
        'details', coalesce(a.details, '{}'::jsonb),
        'createdAt', a.created_at,
        'authorDisplayName', coalesce(nullif(trim(a.display_name), ''), nullif(trim(a.person_name), ''))
      ) order by a.created_at desc
    ),
    '[]'::jsonb
  ) into r
  from (
    select activity.*, profile.display_name, person.full_name as person_name
    from public.activities activity
    left join public.profiles profile on profile.id = activity.created_by
    left join public.person_task_shares person_share
      on activity.event_type = 'external_collaboration'
      and person_share.id::text = activity.details->>'shareId'
    left join public.people person on person.id = person_share.person_id
    where activity.workspace_id = p_workspace_id
      and activity.task_id = p_task_id
      and activity.deleted_at is null
    order by activity.created_at desc
    limit 100
  ) a;

  return r;
end
$$;

revoke all on function public.list_app_users(uuid) from public,anon,authenticated;
grant execute on function public.list_app_users(uuid) to service_role;
revoke all on function public.user_task_activity_timeline(uuid,uuid) from public,anon;
grant execute on function public.user_task_activity_timeline(uuid,uuid) to authenticated;

insert into public.schema_versions(version)
values (19)
on conflict do nothing;

commit;
