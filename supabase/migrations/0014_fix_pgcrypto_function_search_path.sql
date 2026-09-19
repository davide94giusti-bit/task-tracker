begin;

do $migration$
declare
  extension_schema text;
begin
  select namespace.nspname
    into extension_schema
  from pg_extension extension
  join pg_namespace namespace
    on namespace.oid = extension.extnamespace
  where extension.extname = 'pgcrypto';

  if extension_schema is null then
    raise exception 'The pgcrypto extension is required for collaboration verification';
  end if;

  execute format(
    'alter function public.set_person_share_verification_code(uuid,text) set search_path = public, %I',
    extension_schema
  );
  execute format(
    'alter function public.verify_person_share_code(uuid,text) set search_path = public, %I',
    extension_schema
  );
  execute format(
    'alter function public.prepare_connected_account_deletion(uuid,uuid) set search_path = public, %I',
    extension_schema
  );
end
$migration$;

insert into public.schema_versions(version)
values (14)
on conflict do nothing;

commit;
