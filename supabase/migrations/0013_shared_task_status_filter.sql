begin;

do $migration$
declare
  function_oid oid;
  current_definition text;
  corrected_definition text;
begin
  select procedure.oid, pg_get_functiondef(procedure.oid)
    into function_oid, current_definition
  from pg_proc procedure
  join pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname = 'public_person_task_share'
    and pg_get_function_identity_arguments(procedure.oid) = 'p_share_id uuid';

  if function_oid is null then
    raise exception 'public_person_task_share(uuid) was not found';
  end if;

  if current_definition not like '%t.status not in (''completed'',''cancelled'',''archived'')%' then
    raise exception 'The expected shared-task status filter was not found';
  end if;

  corrected_definition := replace(
    current_definition,
    't.status not in (''completed'',''cancelled'',''archived'')',
    't.status not in (''cancelled'',''archived'')'
  );
  execute corrected_definition;
end
$migration$;

insert into public.schema_versions(version)
values (13)
on conflict do nothing;

commit;
