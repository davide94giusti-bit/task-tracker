begin;

alter table public.imports add column if not exists mode text;
alter table public.imports add column if not exists checksum text;
alter table public.imports add column if not exists report jsonb;
alter table public.imports add column if not exists completed_at timestamptz;

create index if not exists idx_imports_workspace_created on public.imports(workspace_id, created_at desc);
create index if not exists idx_exports_workspace_kind_created on public.exports(workspace_id, kind, created_at desc) where deleted_at is null;

create or replace function public.preview_connected_restore(
  p_workspace_id uuid,
  p_user_id uuid,
  p_restore_id uuid,
  p_data jsonb,
  p_mode text,
  p_checksum text,
  p_source_version text
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_errors jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_counts jsonb := '{}'::jsonb;
  v_existing jsonb;
  v_existing_total integer;
  v_attachments integer;
  v_table text;
  v_count integer;
begin
  if not exists(select 1 from workspace_members where workspace_id=p_workspace_id and user_id=p_user_id and role='owner' and removed_at is null) then
    raise exception 'Only the workspace owner can restore a Connected backup' using errcode='42501';
  end if;
  if p_mode not in ('empty','replace') then v_errors := v_errors || jsonb_build_array('Restore mode must be empty or replace.'); end if;
  if p_checksum !~ '^[a-f0-9]{64}$' then v_errors := v_errors || jsonb_build_array('The checksum is invalid.'); end if;
  foreach v_table in array array['projects','people','project_people','tasks','checklist_items','task_dependencies','task_people','reminders','recurrence_rules','notification_preferences','activities'] loop
    if jsonb_typeof(p_data->v_table) <> 'array' then
      v_errors := v_errors || jsonb_build_array(format('Missing or invalid %s table.',v_table));
      v_count := 0;
    else v_count := jsonb_array_length(p_data->v_table);
    end if;
    v_counts := v_counts || jsonb_build_object(v_table,v_count);
  end loop;
  select jsonb_build_object(
    'projects',(select count(*) from projects where workspace_id=p_workspace_id),
    'people',(select count(*) from people where workspace_id=p_workspace_id),
    'tasks',(select count(*) from tasks where workspace_id=p_workspace_id),
    'checklist_items',(select count(*) from checklist_items where workspace_id=p_workspace_id),
    'dependencies',(select count(*) from task_dependencies where workspace_id=p_workspace_id),
    'reminders',(select count(*) from reminders where workspace_id=p_workspace_id),
    'activities',(select count(*) from activities where workspace_id=p_workspace_id)
  ) into v_existing;
  select coalesce(sum(value::text::integer),0) into v_existing_total from jsonb_each(v_existing);
  select count(*) into v_attachments from attachments where workspace_id=p_workspace_id and deleted_at is null;
  if exists(select 1 from projects r join jsonb_array_elements(p_data->'projects') x on r.id=(x->>'id')::uuid where r.workspace_id<>p_workspace_id)
    or exists(select 1 from people r join jsonb_array_elements(p_data->'people') x on r.id=(x->>'id')::uuid where r.workspace_id<>p_workspace_id)
    or exists(select 1 from tasks r join jsonb_array_elements(p_data->'tasks') x on r.id=(x->>'id')::uuid where r.workspace_id<>p_workspace_id)
    or exists(select 1 from checklist_items r join jsonb_array_elements(p_data->'checklist_items') x on r.id=(x->>'id')::uuid where r.workspace_id<>p_workspace_id)
    or exists(select 1 from task_dependencies r join jsonb_array_elements(p_data->'task_dependencies') x on r.id=(x->>'id')::uuid where r.workspace_id<>p_workspace_id)
    or exists(select 1 from task_people r join jsonb_array_elements(p_data->'task_people') x on r.id=(x->>'id')::uuid where r.workspace_id<>p_workspace_id)
    or exists(select 1 from reminders r join jsonb_array_elements(p_data->'reminders') x on r.id=(x->>'id')::uuid where r.workspace_id<>p_workspace_id)
    or exists(select 1 from recurrence_rules r join jsonb_array_elements(p_data->'recurrence_rules') x on r.id=(x->>'id')::uuid where r.workspace_id<>p_workspace_id)
    or exists(select 1 from activities r join jsonb_array_elements(p_data->'activities') x on r.id=(x->>'id')::uuid where r.workspace_id<>p_workspace_id)
    or exists(select 1 from project_people r join jsonb_array_elements(p_data->'project_people') x on r.id=(x->>'id')::uuid where r.workspace_id<>p_workspace_id) then
    v_errors := v_errors || jsonb_build_array('One or more record IDs already belong to another workspace. Restore is refused rather than remapping identities unsafely.');
  end if;
  if p_mode='empty' and v_existing_total>0 then v_errors := v_errors || jsonb_build_array('Empty-workspace restore is unavailable because this workspace already contains data.'); end if;
  if p_mode='replace' and v_attachments>0 then v_errors := v_errors || jsonb_build_array(format('Replace restore is blocked because this workspace has %s active attachment(s). Download or remove them first; attachment archives are not supported yet.',v_attachments)); end if;
  if p_mode='replace' then v_warnings := v_warnings || jsonb_build_array('Replace mode revokes existing guest links and clears notification delivery history.'); end if;
  v_warnings := v_warnings || jsonb_build_array('Record ownership is rewritten to the current workspace owner. Source workspace and user IDs are not trusted.');
  v_warnings := v_warnings || jsonb_build_array('Push subscriptions, sessions, credentials, guest tokens, and attachment files are never restored.');
  return jsonb_build_object('valid',jsonb_array_length(v_errors)=0,'errors',v_errors,'warnings',v_warnings,'counts',v_counts,'existingRecords',v_existing,'activeAttachmentCount',v_attachments,'mode',p_mode,'restoreId',p_restore_id,'sourceVersion',p_source_version);
end $$;

create or replace function public.user_preview_connected_restore(
  p_workspace_id uuid, p_restore_id uuid, p_data jsonb, p_mode text,
  p_checksum text, p_source_version text, p_confirmation text default null
) returns jsonb language sql security definer set search_path=public as $$
  select public.preview_connected_restore(p_workspace_id,auth.uid(),p_restore_id,p_data,p_mode,p_checksum,p_source_version)
$$;

create or replace function public.apply_connected_restore(
  p_workspace_id uuid,
  p_user_id uuid,
  p_restore_id uuid,
  p_data jsonb,
  p_mode text,
  p_checksum text,
  p_source_version text,
  p_confirmation text
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_preview jsonb;
  v_safety jsonb;
  v_report jsonb;
  v_task record;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 0));
  if exists(select 1 from imports where id=p_restore_id and workspace_id=p_workspace_id and status='applied') then
    return (select report from imports where id=p_restore_id and workspace_id=p_workspace_id);
  end if;
  v_preview := public.preview_connected_restore(p_workspace_id,p_user_id,p_restore_id,p_data,p_mode,p_checksum,p_source_version);
  if not (v_preview->>'valid')::boolean then raise exception 'Restore preview contains blocking errors: %',v_preview->'errors' using errcode='22023'; end if;
  if (p_mode='empty' and p_confirmation<>'RESTORE EMPTY') or (p_mode='replace' and p_confirmation<>'REPLACE MY WORKSPACE') then
    raise exception 'The restore confirmation phrase is incorrect' using errcode='22023';
  end if;

  select jsonb_build_object('format','task-tracker-connected-internal-safety','version',3,'createdAt',now(),'workspaceId',p_workspace_id,'data',jsonb_build_object(
    'projects',coalesce((select jsonb_agg(to_jsonb(x)) from projects x where workspace_id=p_workspace_id),'[]'::jsonb),
    'people',coalesce((select jsonb_agg(to_jsonb(x)) from people x where workspace_id=p_workspace_id),'[]'::jsonb),
    'project_people',coalesce((select jsonb_agg(to_jsonb(x)) from project_people x where workspace_id=p_workspace_id),'[]'::jsonb),
    'tasks',coalesce((select jsonb_agg(to_jsonb(x)) from tasks x where workspace_id=p_workspace_id),'[]'::jsonb),
    'checklist_items',coalesce((select jsonb_agg(to_jsonb(x)) from checklist_items x where workspace_id=p_workspace_id),'[]'::jsonb),
    'task_dependencies',coalesce((select jsonb_agg(to_jsonb(x)) from task_dependencies x where workspace_id=p_workspace_id),'[]'::jsonb),
    'task_people',coalesce((select jsonb_agg(to_jsonb(x)) from task_people x where workspace_id=p_workspace_id),'[]'::jsonb),
    'reminders',coalesce((select jsonb_agg(to_jsonb(x)) from reminders x where workspace_id=p_workspace_id),'[]'::jsonb),
    'recurrence_rules',coalesce((select jsonb_agg(to_jsonb(x)) from recurrence_rules x where workspace_id=p_workspace_id),'[]'::jsonb),
    'notification_preferences',coalesce((select jsonb_agg(to_jsonb(x)) from notification_preferences x where workspace_id=p_workspace_id and user_id=p_user_id),'[]'::jsonb),
    'activities',coalesce((select jsonb_agg(to_jsonb(x)) from activities x where workspace_id=p_workspace_id),'[]'::jsonb)
  )) into v_safety;

  insert into imports(id,workspace_id,status,source_version,counts,warnings,safety_snapshot,created_by,mode,checksum)
  values(p_restore_id,p_workspace_id,'applying',p_source_version,v_preview->'counts',v_preview->'warnings',v_safety,p_user_id,p_mode,p_checksum)
  on conflict(workspace_id,id) do update set status='applying',updated_at=now(),version=imports.version+1;

  if p_mode='replace' then
    delete from person_task_shares where workspace_id=p_workspace_id;
    delete from notification_deliveries where workspace_id=p_workspace_id;
    delete from activities where workspace_id=p_workspace_id;
    delete from reminders where workspace_id=p_workspace_id;
    delete from recurrence_rules where workspace_id=p_workspace_id;
    delete from task_dependencies where workspace_id=p_workspace_id;
    delete from task_people where workspace_id=p_workspace_id;
    delete from checklist_items where workspace_id=p_workspace_id;
    delete from project_people where workspace_id=p_workspace_id;
    delete from tasks where workspace_id=p_workspace_id;
    delete from projects where workspace_id=p_workspace_id;
    delete from people where workspace_id=p_workspace_id;
  end if;

  create temp table restore_projects (like projects) on commit drop;
  insert into restore_projects select * from jsonb_populate_recordset(null::projects,p_data->'projects');
  update restore_projects set workspace_id=p_workspace_id,created_by=p_user_id,updated_by=p_user_id;
  insert into projects select * from restore_projects;

  create temp table restore_people (like people) on commit drop;
  insert into restore_people select * from jsonb_populate_recordset(null::people,p_data->'people');
  update restore_people set workspace_id=p_workspace_id,created_by=p_user_id,updated_by=p_user_id;
  insert into people select * from restore_people;

  create temp table restore_project_people (like project_people) on commit drop;
  insert into restore_project_people select * from jsonb_populate_recordset(null::project_people,p_data->'project_people');
  update restore_project_people set workspace_id=p_workspace_id,created_by=p_user_id,updated_by=p_user_id;
  insert into project_people select * from restore_project_people;

  create temp table restore_tasks (like tasks) on commit drop;
  insert into restore_tasks select * from jsonb_populate_recordset(null::tasks,p_data->'tasks');
  update restore_tasks set workspace_id=p_workspace_id,created_by=p_user_id,updated_by=p_user_id;
  insert into tasks select * from restore_tasks;
  delete from reminders where workspace_id=p_workspace_id;
  delete from activities where workspace_id=p_workspace_id;

  create temp table restore_checklist (like checklist_items) on commit drop;
  insert into restore_checklist select * from jsonb_populate_recordset(null::checklist_items,p_data->'checklist_items');
  update restore_checklist set workspace_id=p_workspace_id,created_by=p_user_id,updated_by=p_user_id;
  insert into checklist_items select * from restore_checklist;

  create temp table restore_dependencies (like task_dependencies) on commit drop;
  insert into restore_dependencies select * from jsonb_populate_recordset(null::task_dependencies,p_data->'task_dependencies');
  update restore_dependencies set workspace_id=p_workspace_id,created_by=p_user_id,updated_by=p_user_id;
  insert into task_dependencies select * from restore_dependencies;

  create temp table restore_task_people (like task_people) on commit drop;
  insert into restore_task_people select * from jsonb_populate_recordset(null::task_people,p_data->'task_people');
  update restore_task_people set workspace_id=p_workspace_id,created_by=p_user_id,updated_by=p_user_id;
  insert into task_people select * from restore_task_people;

  create temp table restore_recurrence (like recurrence_rules) on commit drop;
  insert into restore_recurrence select * from jsonb_populate_recordset(null::recurrence_rules,p_data->'recurrence_rules');
  update restore_recurrence set workspace_id=p_workspace_id,created_by=p_user_id,updated_by=p_user_id;
  insert into recurrence_rules select * from restore_recurrence;

  create temp table restore_reminders (like reminders) on commit drop;
  insert into restore_reminders select * from jsonb_populate_recordset(null::reminders,p_data->'reminders');
  update restore_reminders set workspace_id=p_workspace_id,user_id=p_user_id,created_by=p_user_id,updated_by=p_user_id,claimed_at=null,attempt_count=0,next_attempt_at=case when dismissed then next_attempt_at else greatest(next_attempt_at,now()+interval '5 minutes') end;
  insert into reminders select * from restore_reminders;

  if jsonb_array_length(p_data->'notification_preferences')>0 then
    create temp table restore_preferences (like notification_preferences) on commit drop;
    insert into restore_preferences select * from jsonb_populate_recordset(null::notification_preferences,jsonb_build_array((p_data->'notification_preferences')->0));
    update restore_preferences set id=gen_random_uuid(),workspace_id=p_workspace_id,user_id=p_user_id;
    delete from notification_preferences where workspace_id=p_workspace_id and user_id=p_user_id;
    insert into notification_preferences select * from restore_preferences;
  end if;

  create temp table restore_activities (like activities) on commit drop;
  insert into restore_activities select * from jsonb_populate_recordset(null::activities,p_data->'activities');
  update restore_activities set workspace_id=p_workspace_id,created_by=p_user_id,updated_by=p_user_id;
  insert into activities select * from restore_activities;

  for v_task in select id from tasks where workspace_id=p_workspace_id loop
    perform refresh_task_derived(v_task.id);
  end loop;

  v_report := jsonb_build_object('restoreId',p_restore_id,'status','applied','mode',p_mode,'completedAt',now(),'counts',v_preview->'counts','warnings',v_preview->'warnings','checksum',p_checksum,'safetySnapshotStored',true,'remindersDelayed',true);
  update imports set status='applied',report=v_report,completed_at=now(),updated_at=now(),version=version+1 where id=p_restore_id and workspace_id=p_workspace_id;
  insert into audit_events(id,workspace_id,level,service,event_type,summary,details)
  values(gen_random_uuid(),p_workspace_id,'warn','connected-backup-export','workspace_restore_applied','Workspace owner applied a Connected restore.',jsonb_build_object('restoreId',p_restore_id,'mode',p_mode,'checksum',p_checksum,'counts',v_preview->'counts'));
  return v_report;
end $$;

create or replace function public.user_apply_connected_restore(
  p_workspace_id uuid, p_restore_id uuid, p_data jsonb, p_mode text,
  p_checksum text, p_source_version text, p_confirmation text default null
) returns jsonb language sql security definer set search_path=public as $$
  select public.apply_connected_restore(p_workspace_id,auth.uid(),p_restore_id,p_data,p_mode,p_checksum,p_source_version,p_confirmation)
$$;

revoke all on function public.preview_connected_restore(uuid,uuid,uuid,jsonb,text,text,text) from public,anon,authenticated;
revoke all on function public.apply_connected_restore(uuid,uuid,uuid,jsonb,text,text,text,text) from public,anon,authenticated;
revoke all on function public.user_preview_connected_restore(uuid,uuid,jsonb,text,text,text,text) from public,anon;
revoke all on function public.user_apply_connected_restore(uuid,uuid,jsonb,text,text,text,text) from public,anon;
grant execute on function public.user_preview_connected_restore(uuid,uuid,jsonb,text,text,text,text) to authenticated;
grant execute on function public.user_apply_connected_restore(uuid,uuid,jsonb,text,text,text,text) to authenticated;

insert into public.schema_versions(version) values(21) on conflict do nothing;
commit;
