begin;

alter table public.checklist_items add column if not exists notes text not null default '';

create or replace function public.import_jsonb_value(document jsonb,key_name text,fallback jsonb)
returns jsonb language sql immutable as $$
  select case
    when document->key_name is null or document->key_name = 'null'::jsonb then fallback
    when jsonb_typeof(document->key_name)='string' then coalesce(nullif(document->>key_name,''),'null')::jsonb
    else document->key_name
  end
$$;

create or replace function public.preview_local_import(
  p_workspace_id uuid,
  p_user_id uuid,
  p_import_id uuid,
  p_snapshot jsonb,
  p_dry_run boolean default true
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  counts jsonb;
  warnings jsonb := '[]'::jsonb;
  existing_counts jsonb;
  invalid_ids int;
  broken_refs int;
  total_records int;
begin
  if p_snapshot is null or jsonb_typeof(p_snapshot)<>'object' then
    raise exception 'Invalid backup payload';
  end if;
  if jsonb_typeof(coalesce(p_snapshot->'tasks','[]'::jsonb))<>'array'
     or jsonb_typeof(coalesce(p_snapshot->'projects','[]'::jsonb))<>'array'
     or jsonb_typeof(coalesce(p_snapshot->'people','[]'::jsonb))<>'array' then
    raise exception 'Backup tables must be arrays';
  end if;

  counts := jsonb_build_object(
    'projects',jsonb_array_length(coalesce(p_snapshot->'projects','[]'::jsonb)),
    'people',jsonb_array_length(coalesce(p_snapshot->'people','[]'::jsonb)),
    'tasks',jsonb_array_length(coalesce(p_snapshot->'tasks','[]'::jsonb)),
    'checklistItems',jsonb_array_length(coalesce(p_snapshot->'checklist','[]'::jsonb)),
    'dependencies',jsonb_array_length(coalesce(p_snapshot->'task_links','[]'::jsonb)),
    'taskContacts',jsonb_array_length(coalesce(p_snapshot->'task_contacts','[]'::jsonb)),
    'activities',jsonb_array_length(coalesce(p_snapshot->'activities','[]'::jsonb))
  );
  total_records := (counts->>'projects')::int+(counts->>'people')::int+(counts->>'tasks')::int+
    (counts->>'checklistItems')::int+(counts->>'dependencies')::int+(counts->>'taskContacts')::int+(counts->>'activities')::int;
  if total_records>50000 or (counts->>'tasks')::int>10000 then
    raise exception 'Backup exceeds the Connected import safety limit';
  end if;

  select count(*) into invalid_ids from (
    select x->>'id' id from jsonb_array_elements(coalesce(p_snapshot->'projects','[]'::jsonb)) x
    union all select x->>'id' from jsonb_array_elements(coalesce(p_snapshot->'people','[]'::jsonb)) x
    union all select x->>'id' from jsonb_array_elements(coalesce(p_snapshot->'tasks','[]'::jsonb)) x
    union all select x->>'id' from jsonb_array_elements(coalesce(p_snapshot->'checklist','[]'::jsonb)) x
  ) ids where id is null or id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
  if invalid_ids>0 then raise exception 'Backup contains % invalid record identifiers',invalid_ids; end if;

  select count(*) into broken_refs from jsonb_array_elements(coalesce(p_snapshot->'tasks','[]'::jsonb)) task
  where nullif(task->>'project_id','') is not null and not exists(
    select 1 from jsonb_array_elements(coalesce(p_snapshot->'projects','[]'::jsonb)) project where project->>'id'=task->>'project_id'
  );
  if broken_refs>0 then warnings := warnings||jsonb_build_array(format('%s task project references were not present and will be left unassigned.',broken_refs)); end if;

  if jsonb_array_length(coalesce(p_snapshot->'categories','[]'::jsonb))>0 then
    warnings := warnings||jsonb_build_array('Local categories are not a Connected record type and will not be imported.');
  end if;
  if jsonb_array_length(coalesce(p_snapshot->'settings','[]'::jsonb))>0 then
    warnings := warnings||jsonb_build_array('Device-only Local settings are not imported; Connected preferences remain unchanged.');
  end if;
  if exists(select 1 from jsonb_array_elements(coalesce(p_snapshot->'tasks','[]'::jsonb)) task where coalesce(task->>'attachments','[]') not in ('','[]','null')) then
    warnings := warnings||jsonb_build_array('Attachment metadata was found. Local file paths and attachment contents are not uploaded.');
  end if;
  if exists(select 1 from jsonb_array_elements(coalesce(p_snapshot->'task_links','[]'::jsonb)) link where coalesce(link->>'type','blocked_by')<>'blocked_by') then
    warnings := warnings||jsonb_build_array('Only blocking prerequisite links are supported in Connected; related and parent links are skipped.');
  end if;

  existing_counts := jsonb_build_object(
    'projects',(select count(*) from projects where workspace_id=p_workspace_id),
    'people',(select count(*) from people where workspace_id=p_workspace_id),
    'tasks',(select count(*) from tasks where workspace_id=p_workspace_id)
  );
  return jsonb_build_object('valid',true,'dryRun',p_dry_run,'importId',p_import_id,'counts',counts,'existingRecords',existing_counts,'warnings',warnings);
end$$;

create or replace function public.apply_local_import(
  p_workspace_id uuid,
  p_user_id uuid,
  p_import_id uuid,
  p_snapshot jsonb,
  p_dry_run boolean default false
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  preview jsonb;
  task_data jsonb;
  reminder_data jsonb;
  recurrence_data jsonb;
begin
  preview := preview_local_import(p_workspace_id,p_user_id,p_import_id,p_snapshot,true);
  if p_dry_run then return preview; end if;
  if exists(select 1 from imports where id=p_import_id and workspace_id=p_workspace_id and status='applied') then
    return preview||jsonb_build_object('applied',true,'alreadyApplied',true,'dryRun',false);
  end if;

  if exists(select 1 from projects target join jsonb_array_elements(coalesce(p_snapshot->'projects','[]'::jsonb)) source on target.id=(source->>'id')::uuid where target.workspace_id<>p_workspace_id)
     or exists(select 1 from people target join jsonb_array_elements(coalesce(p_snapshot->'people','[]'::jsonb)) source on target.id=(source->>'id')::uuid where target.workspace_id<>p_workspace_id)
     or exists(select 1 from tasks target join jsonb_array_elements(coalesce(p_snapshot->'tasks','[]'::jsonb)) source on target.id=(source->>'id')::uuid where target.workspace_id<>p_workspace_id) then
    raise exception 'A backup identifier is already used by another workspace';
  end if;
  if exists(select 1 from imports where id=p_import_id and workspace_id<>p_workspace_id) then
    raise exception 'Import identifier is already used by another workspace';
  end if;

  insert into imports(id,workspace_id,status,source_version,counts,warnings,safety_snapshot,created_by)
  values(p_import_id,p_workspace_id,'applying','local-v1',preview->'counts',preview->'warnings',
    jsonb_build_object('projects',(select count(*) from projects where workspace_id=p_workspace_id),'people',(select count(*) from people where workspace_id=p_workspace_id),'tasks',(select count(*) from tasks where workspace_id=p_workspace_id)),p_user_id)
  on conflict(id)do update set status='applying',counts=excluded.counts,warnings=excluded.warnings,updated_at=now();

  insert into projects(id,workspace_id,name,color,description,archived,created_by,updated_by)
  select (x->>'id')::uuid,p_workspace_id,x->>'name',coalesce(nullif(x->>'color',''),'#2563eb'),coalesce(x->>'description',''),coalesce(x->>'archived','0') in ('1','true'),p_user_id,p_user_id
  from jsonb_array_elements(coalesce(p_snapshot->'projects','[]'::jsonb)) x
  on conflict(id)do nothing;

  insert into people(id,workspace_id,full_name,company,role,phone,email,address,website,preferred_contact,notes,tags,created_at,updated_at,created_by,updated_by)
  select (x->>'id')::uuid,p_workspace_id,coalesce(nullif(x->>'full_name',''),nullif(x->>'fullName','')),coalesce(x->>'company',''),coalesce(x->>'role',''),coalesce(x->>'phone',''),coalesce(x->>'email',''),coalesce(x->>'address',''),coalesce(x->>'website',''),coalesce(x->>'preferred_contact',x->>'preferredContact',''),coalesce(x->>'notes',''),import_jsonb_value(x,'tags','[]'::jsonb),coalesce(nullif(x->>'created_at','')::timestamptz,now()),coalesce(nullif(x->>'updated_at','')::timestamptz,now()),p_user_id,p_user_id
  from jsonb_array_elements(coalesce(p_snapshot->'people','[]'::jsonb)) x
  on conflict(id)do nothing;

  insert into tasks(id,workspace_id,title,description,status,priority,start_date,due_date,due_time,completed_at,project_id,responsible_person_id,tags,notes,progress_mode,manual_progress,calculated_progress,blocked,archived,deleted_at,reminder_at,recurrence,created_at,updated_at,created_by,updated_by)
  select (x->>'id')::uuid,p_workspace_id,x->>'title',coalesce(x->>'description',''),coalesce(nullif(x->>'status',''),'not_started')::task_status,coalesce(nullif(x->>'priority',''),'medium')::task_priority,nullif(x->>'start_date','')::date,nullif(x->>'due_date','')::date,nullif(x->>'due_time','')::time,nullif(x->>'completed_at','')::timestamptz,
    case when exists(select 1 from projects p where p.id=nullif(x->>'project_id','')::uuid and p.workspace_id=p_workspace_id)then nullif(x->>'project_id','')::uuid else null end,
    case when exists(select 1 from people p where p.id=nullif(x->>'responsible_person_id','')::uuid and p.workspace_id=p_workspace_id)then nullif(x->>'responsible_person_id','')::uuid else null end,
    import_jsonb_value(x,'tags','[]'::jsonb),coalesce(x->>'notes',''),coalesce(nullif(x->>'progress_mode',''),'automatic'),least(100,greatest(0,coalesce(nullif(x->>'manual_progress','')::int,0))),least(100,greatest(0,coalesce(nullif(x->>'manual_progress','')::int,0))),false,coalesce(x->>'archived','0') in ('1','true'),nullif(x->>'deleted_at','')::timestamptz,
    nullif(import_jsonb_value(x,'reminder','null'::jsonb)->>'at','')::timestamptz,import_jsonb_value(x,'recurrence','null'::jsonb),coalesce(nullif(x->>'created_at','')::timestamptz,now()),coalesce(nullif(x->>'updated_at','')::timestamptz,now()),p_user_id,p_user_id
  from jsonb_array_elements(coalesce(p_snapshot->'tasks','[]'::jsonb)) x
  on conflict(id)do nothing;

  insert into checklist_items(id,workspace_id,task_id,description,completed,required,responsible_person_id,due_date,weight,position,notes,created_by,updated_by)
  select (x->>'id')::uuid,p_workspace_id,(x->>'task_id')::uuid,x->>'description',coalesce(x->>'completed','0') in ('1','true'),coalesce(x->>'required','1') in ('1','true'),nullif(x->>'responsible_person_id','')::uuid,nullif(x->>'due_date','')::date,coalesce(nullif(x->>'weight','')::numeric,1),coalesce(nullif(x->>'position','')::int,0),coalesce(x->>'notes',''),p_user_id,p_user_id
  from jsonb_array_elements(coalesce(p_snapshot->'checklist','[]'::jsonb)) x
  where exists(select 1 from tasks t where t.id=(x->>'task_id')::uuid and t.workspace_id=p_workspace_id)
  on conflict(id)do nothing;

  insert into task_dependencies(id,workspace_id,waiting_task_id,prerequisite_task_id,mandatory,created_by,updated_by)
  select (x->>'id')::uuid,p_workspace_id,(x->>'from_task_id')::uuid,(x->>'to_task_id')::uuid,coalesce(x->>'mandatory','1') in ('1','true'),p_user_id,p_user_id
  from jsonb_array_elements(coalesce(p_snapshot->'task_links','[]'::jsonb)) x
  where coalesce(x->>'type','blocked_by')='blocked_by'
    and exists(select 1 from tasks t where t.id=(x->>'from_task_id')::uuid and t.workspace_id=p_workspace_id)
    and exists(select 1 from tasks t where t.id=(x->>'to_task_id')::uuid and t.workspace_id=p_workspace_id)
  on conflict(waiting_task_id,prerequisite_task_id)do nothing;

  insert into task_people(id,workspace_id,task_id,person_id,relationship,created_by,updated_by)
  select gen_random_uuid(),p_workspace_id,(x->>'task_id')::uuid,(x->>'person_id')::uuid,coalesce(nullif(x->>'role',''),'contact'),p_user_id,p_user_id
  from jsonb_array_elements(coalesce(p_snapshot->'task_contacts','[]'::jsonb)) x
  where exists(select 1 from tasks t where t.id=(x->>'task_id')::uuid and t.workspace_id=p_workspace_id)
    and exists(select 1 from people p where p.id=(x->>'person_id')::uuid and p.workspace_id=p_workspace_id)
  on conflict(task_id,person_id,relationship)do nothing;

  insert into activities(id,workspace_id,task_id,event_type,summary,details,created_at,created_by,updated_by)
  select (x->>'id')::uuid,p_workspace_id,(x->>'task_id')::uuid,coalesce(nullif(x->>'action',''),'imported'),coalesce(x->>'summary','Imported Local activity'),import_jsonb_value(x,'details','{}'::jsonb),coalesce(nullif(x->>'created_at','')::timestamptz,now()),p_user_id,p_user_id
  from jsonb_array_elements(coalesce(p_snapshot->'activities','[]'::jsonb)) x
  where exists(select 1 from tasks t where t.id=(x->>'task_id')::uuid and t.workspace_id=p_workspace_id)
  on conflict(id)do nothing;

  for task_data in select x from jsonb_array_elements(coalesce(p_snapshot->'tasks','[]'::jsonb)) x loop
    reminder_data := import_jsonb_value(task_data,'reminder','null'::jsonb);
    if reminder_data is not null and reminder_data<>'null'::jsonb and nullif(reminder_data->>'at','') is not null then
      insert into reminders(id,workspace_id,task_id,user_id,scheduled_at,next_attempt_at,snoozed_until,dismissed,created_by,updated_by)
      values(coalesce(nullif(reminder_data->>'id','')::uuid,gen_random_uuid()),p_workspace_id,(task_data->>'id')::uuid,p_user_id,(reminder_data->>'at')::timestamptz,coalesce(nullif(reminder_data->>'snoozedUntil','')::timestamptz,(reminder_data->>'at')::timestamptz),nullif(reminder_data->>'snoozedUntil','')::timestamptz,(coalesce(reminder_data->>'dismissed','false')='true')or((coalesce(reminder_data->>'fired','false')='true')and(coalesce(reminder_data->>'repeatOverdue','false')<>'true')),p_user_id,p_user_id)
      on conflict(id)do nothing;
    end if;
  end loop;

  for recurrence_data in select x from jsonb_array_elements(coalesce(p_snapshot->'tasks','[]'::jsonb)) x loop
    if import_jsonb_value(recurrence_data,'recurrence','null'::jsonb) is not null and import_jsonb_value(recurrence_data,'recurrence','null'::jsonb)<>'null'::jsonb then
      insert into recurrence_rules(id,workspace_id,task_id,frequency,interval_count,weekdays,generation,created_by,updated_by)
      select gen_random_uuid(),p_workspace_id,(recurrence_data->>'id')::uuid,r->>'frequency',coalesce((r->>'interval')::int,1),array(select jsonb_array_elements_text(coalesce(r->'weekdays','[]'::jsonb))::int),coalesce(nullif(r->>'generation',''),'completion'),p_user_id,p_user_id
      from (select import_jsonb_value(recurrence_data,'recurrence','null'::jsonb) r) parsed
      where not exists(select 1 from recurrence_rules current where current.workspace_id=p_workspace_id and current.task_id=(recurrence_data->>'id')::uuid);
    end if;
  end loop;

  update tasks target set blocked=exists(select 1 from task_dependencies dependency join tasks prerequisite on prerequisite.id=dependency.prerequisite_task_id where dependency.waiting_task_id=target.id and dependency.workspace_id=p_workspace_id and dependency.deleted_at is null and prerequisite.deleted_at is null and not prerequisite.archived and prerequisite.status not in('completed','cancelled','archived')) where target.workspace_id=p_workspace_id;
  update imports set status='applied',updated_at=now() where id=p_import_id and workspace_id=p_workspace_id;
  insert into audit_events(id,workspace_id,level,service,event_type,summary,details)
  values(gen_random_uuid(),p_workspace_id,'info','backup-export','local_import.completed','Local backup imported',jsonb_build_object('importId',p_import_id,'counts',preview->'counts'));
  return preview||jsonb_build_object('applied',true,'alreadyApplied',false,'dryRun',false);
end$$;

create or replace function public.user_preview_local_import(p_workspace_id uuid,p_import_id uuid,p_snapshot jsonb,p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path=public as $$begin perform assert_connected_workspace(p_workspace_id);return preview_local_import(p_workspace_id,auth.uid(),p_import_id,p_snapshot,p_dry_run);end$$;
create or replace function public.user_apply_local_import(p_workspace_id uuid,p_import_id uuid,p_snapshot jsonb,p_dry_run boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$begin perform assert_connected_workspace(p_workspace_id);return apply_local_import(p_workspace_id,auth.uid(),p_import_id,p_snapshot,p_dry_run);end$$;

revoke execute on function public.import_jsonb_value(jsonb,text,jsonb),public.preview_local_import(uuid,uuid,uuid,jsonb,boolean),public.apply_local_import(uuid,uuid,uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.user_preview_local_import(uuid,uuid,jsonb,boolean),public.user_apply_local_import(uuid,uuid,jsonb,boolean) to authenticated;
grant execute on all functions in schema public to service_role;
insert into public.schema_versions(version)values(3)on conflict(version)do nothing;
commit;
