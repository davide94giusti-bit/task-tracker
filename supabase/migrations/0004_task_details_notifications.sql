begin;

alter table public.notification_deliveries
  add column if not exists read_at timestamptz;

drop policy if exists notification_deliveries_self_update on public.notification_deliveries;
create policy notification_deliveries_self_update
  on public.notification_deliveries
  for update
  using (user_id = auth.uid() and public.is_workspace_member(workspace_id))
  with check (user_id = auth.uid() and public.is_workspace_member(workspace_id));

grant update on public.notification_deliveries to authenticated;

create or replace function public.refresh_task_derived(p_task_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  next_progress int;
  next_blocked boolean;
begin
  select case
    when t.progress_mode = 'manual' then t.manual_progress
    when count(c.id) = 0 then case when t.status = 'completed' then 100 else 0 end
    else coalesce(round(100.0 * sum(case when c.completed then c.weight else 0 end) / nullif(sum(c.weight), 0))::int, 0)
  end
  into next_progress
  from tasks t
  left join checklist_items c on c.task_id = t.id and c.deleted_at is null
  where t.id = p_task_id
  group by t.id;

  select exists(
    select 1
    from task_dependencies d
    join tasks prerequisite on prerequisite.id = d.prerequisite_task_id
    where d.waiting_task_id = p_task_id
      and d.deleted_at is null
      and d.mandatory
      and prerequisite.deleted_at is null
      and not prerequisite.archived
      and prerequisite.status not in ('completed', 'cancelled', 'archived')
  ) into next_blocked;

  update tasks
  set calculated_progress = coalesce(next_progress, calculated_progress),
      blocked = coalesce(next_blocked, false)
  where id = p_task_id
    and (calculated_progress is distinct from coalesce(next_progress, calculated_progress)
      or blocked is distinct from coalesce(next_blocked, false));
end;
$$;

create or replace function public.refresh_checklist_task()
returns trigger
language plpgsql
set search_path = public
as $$
declare target_id uuid;
begin
  target_id := case when tg_op = 'DELETE' then old.task_id else new.task_id end;
  perform refresh_task_derived(target_id);
  if tg_op = 'UPDATE' and new.task_id is distinct from old.task_id then
    perform refresh_task_derived(old.task_id);
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists checklist_refresh_task on public.checklist_items;
create trigger checklist_refresh_task
after insert or update or delete on public.checklist_items
for each row execute function public.refresh_checklist_task();

create or replace function public.refresh_dependency_task()
returns trigger
language plpgsql
set search_path = public
as $$
declare target_id uuid;
begin
  target_id := case when tg_op = 'DELETE' then old.waiting_task_id else new.waiting_task_id end;
  perform refresh_task_derived(target_id);
  if tg_op = 'UPDATE' and new.waiting_task_id is distinct from old.waiting_task_id then
    perform refresh_task_derived(old.waiting_task_id);
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists dependency_refresh_task on public.task_dependencies;
create trigger dependency_refresh_task
after insert or update or delete on public.task_dependencies
for each row execute function public.refresh_dependency_task();

create or replace function public.refresh_dependent_tasks()
returns trigger
language plpgsql
set search_path = public
as $$
declare waiting_id uuid;
begin
  for waiting_id in
    select waiting_task_id
    from task_dependencies
    where prerequisite_task_id = new.id and deleted_at is null
  loop
    perform refresh_task_derived(waiting_id);
  end loop;
  return new;
end;
$$;

drop trigger if exists task_status_refresh_dependents on public.tasks;
create trigger task_status_refresh_dependents
after update of status, archived, deleted_at on public.tasks
for each row execute function public.refresh_dependent_tasks();

create or replace function public.link_dependency_atomic(
  p_workspace_id uuid,
  p_user_id uuid,
  p_waiting_task_id uuid,
  p_prerequisite_task_id uuid,
  p_mandatory boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare cycle_found boolean;
begin
  if not exists(select 1 from tasks where id = p_waiting_task_id and workspace_id = p_workspace_id and deleted_at is null)
     or not exists(select 1 from tasks where id = p_prerequisite_task_id and workspace_id = p_workspace_id and deleted_at is null) then
    raise exception 'Task not found';
  end if;

  with recursive downstream(id, path) as (
    select waiting_task_id, array[prerequisite_task_id, waiting_task_id]
    from task_dependencies
    where prerequisite_task_id = p_waiting_task_id and deleted_at is null
    union all
    select d.waiting_task_id, x.path || d.waiting_task_id
    from downstream x
    join task_dependencies d on d.prerequisite_task_id = x.id
    where d.deleted_at is null and not d.waiting_task_id = any(x.path)
  )
  select exists(select 1 from downstream where id = p_prerequisite_task_id)
  into cycle_found;

  if cycle_found or p_waiting_task_id = p_prerequisite_task_id then
    raise exception 'This dependency would create a circular relationship';
  end if;

  insert into task_dependencies(
    workspace_id, waiting_task_id, prerequisite_task_id, mandatory,
    created_by, updated_by
  ) values (
    p_workspace_id, p_waiting_task_id, p_prerequisite_task_id, p_mandatory,
    p_user_id, p_user_id
  )
  on conflict(waiting_task_id, prerequisite_task_id) do update
  set mandatory = excluded.mandatory,
      deleted_at = null,
      updated_by = p_user_id,
      updated_at = now();

  return jsonb_build_object('linked', true);
end;
$$;

do $$
declare task_id uuid;
begin
  for task_id in select id from public.tasks loop
    perform public.refresh_task_derived(task_id);
  end loop;
end $$;

commit;
