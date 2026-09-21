begin;

do $migration$
declare
  function_record record;
  corrected_definition text;
  patched_count integer := 0;
begin
  for function_record in
    select
      procedure.oid,
      pg_get_functiondef(procedure.oid) as definition
    from pg_proc procedure
    join pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.prokind = 'f'
      and procedure.proname in ('user_configure_person_share', 'user_linked_projects')
      and pg_get_functiondef(procedure.oid) ~
        'v_user[[:space:]]*:=[[:space:]]*assert_connected_workspace[(]p_workspace_id[)];'
  loop
    corrected_definition := regexp_replace(
      function_record.definition,
      'v_user[[:space:]]*:=[[:space:]]*assert_connected_workspace[(]p_workspace_id[)];',
      'perform assert_connected_workspace(p_workspace_id); v_user:=auth.uid();',
      'g'
    );

    execute corrected_definition;
    patched_count := patched_count + 1;
  end loop;

  if patched_count <> 2 then
    raise exception
      'Expected to correct 2 collaboration functions recreated by migration 0015, corrected %',
      patched_count;
  end if;

  if exists (
    select 1
    from pg_proc procedure
    join pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.prokind = 'f'
      and procedure.proname in ('user_configure_person_share', 'user_linked_projects')
      and pg_get_functiondef(procedure.oid) ~
        'v_user[[:space:]]*:=[[:space:]]*assert_connected_workspace[(]p_workspace_id[)];'
  ) then
    raise exception 'A recreated collaboration workspace assignment remains broken';
  end if;
end
$migration$;

insert into public.schema_versions(version)
values (16)
on conflict do nothing;

commit;
