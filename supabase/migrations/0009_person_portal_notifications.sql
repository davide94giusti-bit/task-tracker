begin;

alter table public.person_task_shares
  add column if not exists email_enabled boolean not null default false,
  add column if not exists push_enabled boolean not null default false,
  add column if not exists last_shared_at timestamptz,
  add column if not exists last_shared_channel text,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.person_share_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null references public.person_task_shares(id) on delete cascade,
  endpoint text not null,
  expiration_time bigint,
  p256dh text not null,
  auth text not null,
  device_label text not null default '',
  disabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists person_share_subscription_endpoint
  on public.person_share_push_subscriptions(share_id, endpoint);

create table if not exists public.person_share_events (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null references public.person_task_shares(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  kind text not null,
  title text not null,
  detail text not null default '',
  status text not null default 'pending' check (status in ('pending','retry','delivered','failed','quota_reached')),
  attempt_count int not null default 0,
  claimed_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  email_sent boolean not null default false,
  push_sent boolean not null default false,
  last_error_code text,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists person_share_events_due
  on public.person_share_events(status, next_attempt_at)
  where status in ('pending','retry');
create index if not exists person_share_subscriptions_active
  on public.person_share_push_subscriptions(share_id)
  where disabled = false;

alter table public.person_share_push_subscriptions enable row level security;
alter table public.person_share_events enable row level security;

create or replace function public.public_person_task_share(p_share_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not exists (select 1 from person_task_shares where id = p_share_id and revoked_at is null) then
    return null;
  end if;
  update person_task_shares set last_accessed_at = now() where id = p_share_id;
  select jsonb_build_object(
    'personName', person.full_name,
    'generatedAt', now(),
    'preferences', jsonb_build_object(
      'emailAvailable', length(trim(coalesce(person.email, ''))) > 0,
      'emailEnabled', share.email_enabled,
      'pushEnabled', share.push_enabled,
      'activePushSubscriptions', (select count(*) from person_share_push_subscriptions subscription where subscription.share_id = share.id and not subscription.disabled)
    ),
    'projects', coalesce((
      select jsonb_agg(jsonb_build_object(
        'projectId', grouped.project_id,
        'projectName', grouped.project_name,
        'progress', grouped.progress,
        'tasks', grouped.tasks
      ) order by grouped.project_name)
      from (
        select task.project_id,
          coalesce(project.name, 'No project') project_name,
          coalesce(round(avg(task.calculated_progress)), 0) progress,
          jsonb_agg(jsonb_build_object(
            'id', task.id,
            'title', task.title,
            'description', task.description,
            'status', task.status,
            'priority', task.priority,
            'dueDate', task.due_date,
            'calculatedProgress', task.calculated_progress,
            'blocked', task.blocked,
            'updatedAt', task.updated_at,
            'checklist', coalesce((
              select jsonb_agg(jsonb_build_object(
                'id', item.id,
                'description', item.description,
                'completed', item.completed,
                'required', item.required,
                'position', item.position
              ) order by item.position, item.created_at)
              from checklist_items item
              where item.task_id = task.id and item.deleted_at is null
            ), '[]'::jsonb)
          ) order by task.blocked desc, task.due_date asc nulls last, task.title) tasks
        from tasks task
        left join projects project on project.id = task.project_id
        where task.workspace_id = share.workspace_id
          and task.responsible_person_id = share.person_id
          and task.deleted_at is null
          and not task.archived
          and task.status not in ('completed', 'cancelled', 'archived')
        group by task.project_id, project.name
      ) grouped
    ), '[]'::jsonb)
  ) into result
  from person_task_shares share
  join people person on person.id = share.person_id and person.deleted_at is null
  where share.id = p_share_id and share.revoked_at is null;
  return result;
end;
$$;

create or replace function public.update_person_share_preferences(
  p_share_id uuid,
  p_email_enabled boolean default null,
  p_push_enabled boolean default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare result jsonb;
begin
  update person_task_shares share
  set email_enabled = coalesce(p_email_enabled, share.email_enabled),
      push_enabled = coalesce(p_push_enabled, share.push_enabled),
      updated_at = now()
  where share.id = p_share_id and share.revoked_at is null;
  if not found then raise exception 'Shared-task link is unavailable'; end if;
  select jsonb_build_object('emailEnabled', email_enabled, 'pushEnabled', push_enabled)
  into result from person_task_shares where id = p_share_id;
  return result;
end;
$$;

create or replace function public.queue_person_share_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  task_row tasks;
  event_kind text;
  event_title text;
  event_detail text;
begin
  if tg_table_name = 'tasks' then
    task_row := new;
    if tg_op = 'UPDATE' and not (
      old.title is distinct from new.title or old.description is distinct from new.description or
      old.status is distinct from new.status or old.priority is distinct from new.priority or
      old.due_date is distinct from new.due_date or old.project_id is distinct from new.project_id or
      old.responsible_person_id is distinct from new.responsible_person_id or
      old.blocked is distinct from new.blocked or old.deleted_at is distinct from new.deleted_at
    ) then return new; end if;
    event_kind := case when tg_op = 'INSERT' then 'task.created' else 'task.modified' end;
    event_title := new.title;
    event_detail := case when tg_op = 'INSERT' then 'A new task was assigned.' else 'Task details were updated.' end;
  else
    select * into task_row from tasks where id = new.task_id;
    if task_row.id is null then return new; end if;
    event_kind := case
      when tg_op = 'INSERT' then 'checklist.created'
      when old.completed is distinct from new.completed then 'checklist.checked'
      else 'checklist.modified'
    end;
    event_title := task_row.title;
    event_detail := case
      when tg_op = 'INSERT' then 'Checklist item added: '
      when old.completed is distinct from new.completed and new.completed then 'Checklist item completed: '
      when old.completed is distinct from new.completed then 'Checklist item reopened: '
      else 'Checklist item updated: '
    end || new.description;
  end if;
  if tg_table_name = 'tasks' and tg_op = 'UPDATE'
    and old.responsible_person_id is distinct from new.responsible_person_id
    and old.responsible_person_id is not null then
    insert into person_share_events(share_id, workspace_id, person_id, task_id, kind, title, detail)
    select share.id, old.workspace_id, old.responsible_person_id, new.id,
      'task.unassigned', new.title, 'This task is no longer assigned to you.'
    from person_task_shares share
    where share.workspace_id = old.workspace_id
      and share.person_id = old.responsible_person_id
      and share.revoked_at is null
      and (share.email_enabled or share.push_enabled);
  end if;
  if task_row.responsible_person_id is null then return new; end if;
  if tg_table_name <> 'tasks' and (task_row.deleted_at is not null or task_row.archived or task_row.status in ('completed','cancelled','archived')) then return new; end if;
  insert into person_share_events(share_id, workspace_id, person_id, task_id, kind, title, detail)
  select share.id, task_row.workspace_id, task_row.responsible_person_id, task_row.id, event_kind, event_title, event_detail
  from person_task_shares share
  where share.workspace_id = task_row.workspace_id
    and share.person_id = task_row.responsible_person_id
    and share.revoked_at is null
    and (share.email_enabled or share.push_enabled);
  return new;
end;
$$;

drop trigger if exists task_person_share_change on public.tasks;
create trigger task_person_share_change after insert or update on public.tasks
for each row execute function public.queue_person_share_change();
drop trigger if exists checklist_person_share_change on public.checklist_items;
create trigger checklist_person_share_change after insert or update on public.checklist_items
for each row execute function public.queue_person_share_change();

create or replace function public.claim_person_share_events(p_limit int default 25)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare result jsonb;
begin
  with due as (
    select id from person_share_events
    where status in ('pending','retry') and next_attempt_at <= now()
      and (claimed_at is null or claimed_at < now() - interval '10 minutes')
    order by next_attempt_at for update skip locked limit least(greatest(p_limit, 1), 50)
  ), claimed as (
    update person_share_events event set claimed_at = now(), attempt_count = attempt_count + 1
    from due where event.id = due.id returning event.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'deliveryId', event.id,
    'shareId', event.share_id,
    'workspaceId', event.workspace_id,
    'recipientEmail', person.email,
    'title', event.title,
    'detail', event.detail,
    'kind', event.kind,
    'emailEnabled', share.email_enabled,
    'pushEnabled', share.push_enabled,
    'emailSent', event.email_sent,
    'pushSent', event.push_sent,
    'attemptCount', event.attempt_count
  )), '[]'::jsonb) into result
  from claimed event
  join person_task_shares share on share.id = event.share_id and share.revoked_at is null
  join people person on person.id = event.person_id;
  return result;
end;
$$;

create or replace function public.complete_person_share_event(
  p_delivery_id uuid, p_status text, p_email_sent boolean, p_push_sent boolean,
  p_error_code text default null, p_next_attempt_at timestamptz default null
) returns void
language sql
security definer
set search_path = public
as $$
  update person_share_events set
    status = p_status,
    email_sent = p_email_sent,
    push_sent = p_push_sent,
    last_error_code = p_error_code,
    next_attempt_at = coalesce(p_next_attempt_at, next_attempt_at),
    claimed_at = null,
    delivered_at = case when p_status = 'delivered' then now() else delivered_at end
  where id = p_delivery_id;
$$;

create or replace function public.person_share_email_count_today()
returns bigint
language sql
security definer
set search_path = public
as $$
  select
    (select count(*) from notification_deliveries where email_sent and created_at >= date_trunc('day', now())) +
    (select count(*) from person_share_events where email_sent and created_at >= date_trunc('day', now()));
$$;

revoke execute on function public.update_person_share_preferences(uuid,boolean,boolean), public.claim_person_share_events(int), public.complete_person_share_event(uuid,text,boolean,boolean,text,timestamptz), public.person_share_email_count_today() from public, anon, authenticated;
grant execute on function public.update_person_share_preferences(uuid,boolean,boolean), public.claim_person_share_events(int), public.complete_person_share_event(uuid,text,boolean,boolean,text,timestamptz), public.person_share_email_count_today() to service_role;

insert into public.schema_versions(version) values (9) on conflict (version) do nothing;
commit;
