begin;

create or replace function public.update_connected_profile(
  p_user_id uuid,
  p_display_name text
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_display_name text := trim(p_display_name);
begin
  if length(v_display_name) < 2 or length(v_display_name) > 80 then
    raise exception 'Display name must contain 2 to 80 characters';
  end if;

  update public.profiles
  set display_name = v_display_name,
      updated_at = now()
  where id = p_user_id
    and account_status = 'active';

  if not found then
    raise exception 'An active profile was not found' using errcode='42501';
  end if;

  return jsonb_build_object('displayName', v_display_name);
end
$$;

revoke all on function public.update_connected_profile(uuid,text) from public,anon,authenticated;
grant execute on function public.update_connected_profile(uuid,text) to service_role;

create index if not exists tasks_workspace_cost_date_idx
  on public.tasks(workspace_id,cost_date)
  where deleted_at is null and cost_amount is not null;

insert into public.schema_versions(version)
values (18)
on conflict do nothing;

commit;
