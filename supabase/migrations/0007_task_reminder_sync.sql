begin;

create or replace function public.sync_task_reminder_record()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient_id uuid;
  reminder_id uuid;
begin
  select coalesce(
    new.updated_by,
    new.created_by,
    (
      select member.user_id
      from public.workspace_members member
      where member.workspace_id = new.workspace_id
        and member.removed_at is null
      order by case member.role when 'owner' then 0 when 'admin' then 1 else 2 end, member.created_at
      limit 1
    )
  ) into recipient_id;

  if new.reminder_at is null
     or new.deleted_at is not null
     or new.archived
     or new.status in ('completed', 'cancelled', 'archived') then
    update public.reminders
       set dismissed = true,
           claimed_at = null,
           updated_by = recipient_id
     where task_id = new.id
       and workspace_id = new.workspace_id
       and deleted_at is null;
    return new;
  end if;

  if recipient_id is null then
    return new;
  end if;

  select id into reminder_id
  from public.reminders
  where task_id = new.id
    and workspace_id = new.workspace_id
    and deleted_at is null
  order by created_at
  limit 1;

  if reminder_id is null then
    insert into public.reminders(
      workspace_id, task_id, user_id, scheduled_at, next_attempt_at,
      dismissed, created_by, updated_by
    ) values (
      new.workspace_id, new.id, recipient_id, new.reminder_at, new.reminder_at,
      false, recipient_id, recipient_id
    );
  else
    update public.reminders
       set user_id = recipient_id,
           scheduled_at = new.reminder_at,
           next_attempt_at = new.reminder_at,
           snoozed_until = null,
           dismissed = false,
           claimed_at = null,
           attempt_count = 0,
           updated_by = recipient_id
     where id = reminder_id;

    update public.reminders
       set dismissed = true,
           claimed_at = null,
           updated_by = recipient_id
     where task_id = new.id
       and workspace_id = new.workspace_id
       and deleted_at is null
       and id <> reminder_id;
  end if;

  return new;
end;
$$;

drop trigger if exists task_reminder_sync on public.tasks;
create trigger task_reminder_sync
after insert or update of reminder_at, status, deleted_at, archived
on public.tasks
for each row execute function public.sync_task_reminder_record();

insert into public.reminders(
  workspace_id, task_id, user_id, scheduled_at, next_attempt_at,
  dismissed, created_by, updated_by
)
select
  task.workspace_id,
  task.id,
  recipient.user_id,
  task.reminder_at,
  task.reminder_at,
  false,
  recipient.user_id,
  recipient.user_id
from public.tasks task
cross join lateral (
  select coalesce(
    task.updated_by,
    task.created_by,
    (
      select member.user_id
      from public.workspace_members member
      where member.workspace_id = task.workspace_id
        and member.removed_at is null
      order by case member.role when 'owner' then 0 when 'admin' then 1 else 2 end, member.created_at
      limit 1
    )
  ) as user_id
) recipient
where task.reminder_at is not null
  and task.deleted_at is null
  and not task.archived
  and task.status not in ('completed', 'cancelled', 'archived')
  and recipient.user_id is not null
  and not exists (
    select 1 from public.reminders reminder
    where reminder.task_id = task.id
      and reminder.workspace_id = task.workspace_id
      and reminder.deleted_at is null
  );

insert into public.schema_versions(version)
values (7)
on conflict (version) do nothing;

commit;
