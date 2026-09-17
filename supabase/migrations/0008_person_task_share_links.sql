begin;

create table if not exists public.person_task_shares (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_accessed_at timestamptz,
  revoked_at timestamptz
);

create unique index if not exists one_active_person_task_share
  on public.person_task_shares(workspace_id, person_id)
  where revoked_at is null;

alter table public.person_task_shares enable row level security;
drop policy if exists person_task_shares_read on public.person_task_shares;
drop policy if exists person_task_shares_write on public.person_task_shares;
create policy person_task_shares_read on public.person_task_shares
  for select using (public.is_workspace_member(workspace_id));
create policy person_task_shares_write on public.person_task_shares
  for all using (public.workspace_role_for(workspace_id) in ('owner', 'admin', 'member'))
  with check (public.workspace_role_for(workspace_id) in ('owner', 'admin', 'member'));

grant select, insert, update on public.person_task_shares to authenticated;

create or replace function public.public_person_task_share(p_share_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not exists (
    select 1 from person_task_shares share
    where share.id = p_share_id and share.revoked_at is null
  ) then
    return null;
  end if;

  update person_task_shares set last_accessed_at = now() where id = p_share_id;

  select jsonb_build_object(
    'personName', person.full_name,
    'generatedAt', now(),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', task.id,
        'title', task.title,
        'projectName', project.name,
        'status', task.status,
        'priority', task.priority,
        'dueDate', task.due_date,
        'calculatedProgress', task.calculated_progress,
        'blocked', task.blocked,
        'updatedAt', task.updated_at
      ) order by task.blocked desc, task.due_date asc nulls last, task.title)
      from tasks task
      left join projects project on project.id = task.project_id
      where task.workspace_id = share.workspace_id
        and task.responsible_person_id = share.person_id
        and task.deleted_at is null
        and not task.archived
        and task.status not in ('completed', 'cancelled', 'archived')
    ), '[]'::jsonb)
  ) into result
  from person_task_shares share
  join people person on person.id = share.person_id and person.deleted_at is null
  where share.id = p_share_id and share.revoked_at is null;

  return result;
end;
$$;

revoke execute on function public.public_person_task_share(uuid) from public, anon, authenticated;
grant execute on function public.public_person_task_share(uuid) to service_role;

insert into public.schema_versions(version)
values (8)
on conflict (version) do nothing;

commit;
