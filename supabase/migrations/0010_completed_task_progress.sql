begin;

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
    when t.status = 'completed' then 100
    when t.progress_mode = 'manual' then t.manual_progress
    when count(c.id) = 0 then 0
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

create or replace function public.refresh_dependent_tasks()
returns trigger
language plpgsql
set search_path = public
as $$
declare waiting_id uuid;
begin
  perform refresh_task_derived(new.id);
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

update public.tasks
set calculated_progress = 100
where status = 'completed' and calculated_progress <> 100;

commit;
