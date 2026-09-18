begin;

create extension if not exists pgcrypto;

alter table person_task_shares
  add column if not exists scope_mode text not null default 'assigned'
    check (scope_mode in ('assigned', 'project')),
  add column if not exists project_id uuid references projects(id) on delete cascade,
  add column if not exists allow_checklist_updates boolean not null default false,
  add column if not exists allow_task_completion boolean not null default false,
  add column if not exists allow_comments boolean not null default false,
  add column if not exists allow_view_project_contacts boolean not null default false,
  add column if not exists allow_view_contact_assignments boolean not null default false,
  add column if not exists allow_supervise_contact_checklists boolean not null default false,
  add column if not exists allow_complete_contact_tasks boolean not null default false,
  add column if not exists allow_manage_project_contacts boolean not null default false,
  add column if not exists expires_at timestamptz,
  add column if not exists verification_code_hash text,
  add column if not exists verification_expires_at timestamptz,
  add column if not exists verification_requested_at timestamptz,
  add column if not exists verification_attempts integer not null default 0;

create table if not exists project_people (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  share_phone boolean not null default false,
  share_email boolean not null default false,
  share_address boolean not null default false,
  share_notes boolean not null default false,
  supervisable boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  deleted_at timestamptz,
  version integer not null default 1,
  unique(project_id,person_id)
);
create index if not exists idx_project_people_project on project_people(project_id) where deleted_at is null;
alter table project_people enable row level security;
drop policy if exists project_people_workspace on project_people;
create policy project_people_workspace on project_people for all
  using (workspace_id=current_workspace_id()) with check (workspace_id=current_workspace_id());

create or replace function validate_project_person_workspace()
returns trigger language plpgsql set search_path=public as $$
begin
  if not exists(select 1 from projects where id=new.project_id and workspace_id=new.workspace_id)
    or not exists(select 1 from people where id=new.person_id and workspace_id=new.workspace_id) then
    raise exception 'Project contact references must belong to the same workspace';
  end if;
  return new;
end $$;
drop trigger if exists trg_validate_project_person_workspace on project_people;
create trigger trg_validate_project_person_workspace before insert or update of workspace_id,project_id,person_id on project_people
  for each row execute function validate_project_person_workspace();

create table if not exists person_share_actions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  share_id uuid not null references person_task_shares(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  action_type text not null check (action_type in ('checklist_updated', 'task_completed', 'comment_added')),
  summary text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_person_share_actions_share_created on person_share_actions(share_id, created_at desc);
alter table person_share_actions enable row level security;
drop policy if exists person_share_actions_workspace on person_share_actions;
create policy person_share_actions_workspace on person_share_actions
  for select using (workspace_id = current_workspace_id());

create table if not exists linked_project_collaborators (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  share_id uuid not null unique references person_task_shares(id) on delete cascade,
  invited_email text not null,
  user_id uuid references auth.users(id) on delete cascade,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id,user_id)
);
create index if not exists idx_linked_project_collaborators_user on linked_project_collaborators(user_id) where revoked_at is null;
alter table linked_project_collaborators enable row level security;
drop policy if exists linked_project_collaborators_access on linked_project_collaborators;
create policy linked_project_collaborators_access on linked_project_collaborators for select
  using (workspace_id=current_workspace_id() or user_id=auth.uid());

create or replace function person_share_task_allowed(p_share_id uuid, p_task_id uuid, p_action text default 'view')
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from person_task_shares s
    join tasks t on t.id=p_task_id and t.workspace_id=s.workspace_id
    where s.id=p_share_id and s.revoked_at is null
      and (s.expires_at is null or s.expires_at > now()) and t.deleted_at is null
      and ((s.scope_mode='assigned' and t.responsible_person_id=s.person_id)
        or (s.scope_mode='project' and t.project_id=s.project_id))
      and case p_action
        when 'view' then true
        when 'comment' then t.responsible_person_id=s.person_id
        when 'checklist' then
          (t.responsible_person_id=s.person_id and s.allow_checklist_updates)
          or (s.scope_mode='project' and s.allow_supervise_contact_checklists and exists(
            select 1 from project_people pp where pp.project_id=s.project_id
              and pp.person_id=t.responsible_person_id and pp.workspace_id=s.workspace_id
              and pp.deleted_at is null and pp.supervisable))
        when 'complete' then
          (t.responsible_person_id=s.person_id and s.allow_task_completion)
          or (s.scope_mode='project' and s.allow_complete_contact_tasks and exists(
            select 1 from project_people pp where pp.project_id=s.project_id
              and pp.person_id=t.responsible_person_id and pp.workspace_id=s.workspace_id
              and pp.deleted_at is null and pp.supervisable))
        else false end
  )
$$;
revoke all on function person_share_task_allowed(uuid,uuid,text) from public;

create or replace function user_configure_person_share(
  p_workspace_id uuid, p_share_id uuid, p_scope_mode text, p_project_id uuid,
  p_allow_checklist_updates boolean, p_allow_task_completion boolean,
  p_allow_comments boolean, p_allow_view_project_contacts boolean,
  p_allow_view_contact_assignments boolean, p_allow_supervise_contact_checklists boolean,
  p_allow_complete_contact_tasks boolean, p_allow_manage_project_contacts boolean,
  p_expires_at timestamptz
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_user uuid; v_role text; v_row person_task_shares;
begin
  v_user := assert_connected_workspace(p_workspace_id);
  select role into v_role from workspace_members where workspace_id=p_workspace_id and user_id=v_user and removed_at is null;
  if v_role not in ('owner','admin','member') then raise exception 'Insufficient permission'; end if;
  if p_scope_mode not in ('assigned','project') then raise exception 'Invalid collaboration scope'; end if;
  if p_scope_mode='project' and not exists(select 1 from projects where id=p_project_id and workspace_id=p_workspace_id and deleted_at is null) then
    raise exception 'Project not found';
  end if;
  update person_task_shares set scope_mode=p_scope_mode,
    project_id=case when p_scope_mode='project' then p_project_id else null end,
    allow_checklist_updates=p_allow_checklist_updates,
    allow_task_completion=p_allow_task_completion,
    allow_comments=p_allow_comments,
    allow_view_project_contacts=case when p_scope_mode='project' then p_allow_view_project_contacts or p_allow_manage_project_contacts else false end,
    allow_view_contact_assignments=case when p_scope_mode='project' then p_allow_view_contact_assignments or p_allow_supervise_contact_checklists or p_allow_complete_contact_tasks else false end,
    allow_supervise_contact_checklists=case when p_scope_mode='project' then p_allow_supervise_contact_checklists else false end,
    allow_complete_contact_tasks=case when p_scope_mode='project' then p_allow_complete_contact_tasks else false end,
    allow_manage_project_contacts=case when p_scope_mode='project' then p_allow_manage_project_contacts else false end,
    expires_at=p_expires_at, updated_at=now()
  where id=p_share_id and workspace_id=p_workspace_id and revoked_at is null returning * into v_row;
  if v_row.id is null then raise exception 'Shared-task link is unavailable'; end if;
  return jsonb_build_object('id',v_row.id,'scopeMode',v_row.scope_mode,'projectId',v_row.project_id,
    'allowChecklistUpdates',v_row.allow_checklist_updates,'allowTaskCompletion',v_row.allow_task_completion,
    'allowComments',v_row.allow_comments,'allowViewProjectContacts',v_row.allow_view_project_contacts,
    'allowViewContactAssignments',v_row.allow_view_contact_assignments,
    'allowSuperviseContactChecklists',v_row.allow_supervise_contact_checklists,
    'allowCompleteContactTasks',v_row.allow_complete_contact_tasks,
    'allowManageProjectContacts',v_row.allow_manage_project_contacts,'expiresAt',v_row.expires_at);
end $$;

create or replace function user_project_people(p_workspace_id uuid,p_project_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  perform assert_connected_workspace(p_workspace_id);
  if not exists(select 1 from projects where id=p_project_id and workspace_id=p_workspace_id and deleted_at is null) then raise exception 'Project not found'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',pp.id,'projectId',pp.project_id,'personId',p.id,
    'fullName',p.full_name,'company',p.company,'role',p.role,'phone',p.phone,'email',p.email,'address',p.address,'notes',p.notes,
    'sharePhone',pp.share_phone,'shareEmail',pp.share_email,'shareAddress',pp.share_address,'shareNotes',pp.share_notes,
    'supervisable',pp.supervisable,'version',pp.version) order by p.full_name)
    from project_people pp join people p on p.id=pp.person_id and p.workspace_id=pp.workspace_id and p.deleted_at is null
    where pp.workspace_id=p_workspace_id and pp.project_id=p_project_id and pp.deleted_at is null),'[]'::jsonb);
end $$;

create or replace function user_save_project_person(p_workspace_id uuid,p_project_id uuid,p_person_id uuid,
  p_share_phone boolean,p_share_email boolean,p_share_address boolean,p_share_notes boolean,p_supervisable boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_user uuid; v_row project_people;
begin
  v_user:=assert_connected_workspace(p_workspace_id);
  if not exists(select 1 from projects where id=p_project_id and workspace_id=p_workspace_id and deleted_at is null) then raise exception 'Project not found'; end if;
  if not exists(select 1 from people where id=p_person_id and workspace_id=p_workspace_id and deleted_at is null) then raise exception 'Contact not found'; end if;
  insert into project_people(workspace_id,project_id,person_id,share_phone,share_email,share_address,share_notes,supervisable,created_by,updated_by)
    values(p_workspace_id,p_project_id,p_person_id,p_share_phone,p_share_email,p_share_address,p_share_notes,p_supervisable,v_user,v_user)
    on conflict(project_id,person_id) do update set share_phone=excluded.share_phone,share_email=excluded.share_email,
      share_address=excluded.share_address,share_notes=excluded.share_notes,supervisable=excluded.supervisable,
      deleted_at=null,updated_at=now(),updated_by=v_user returning * into v_row;
  return to_jsonb(v_row);
end $$;

create or replace function user_remove_project_person(p_workspace_id uuid,p_project_id uuid,p_person_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_user uuid; v_row project_people;
begin
  v_user:=assert_connected_workspace(p_workspace_id);
  update project_people set deleted_at=now(),updated_at=now(),updated_by=v_user
    where workspace_id=p_workspace_id and project_id=p_project_id and person_id=p_person_id and deleted_at is null returning * into v_row;
  if v_row.id is null then raise exception 'Project contact not found'; end if;
  return jsonb_build_object('removed',true,'personId',p_person_id,'projectId',p_project_id);
end $$;

create or replace function user_create_project_person(p_workspace_id uuid,p_project_id uuid,p_full_name text,p_role text,p_company text,
  p_phone text,p_email text,p_address text,p_notes text,p_share_phone boolean,p_share_email boolean,p_share_address boolean,
  p_share_notes boolean,p_supervisable boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_user uuid; v_person people; v_link project_people;
begin
  v_user:=assert_connected_workspace(p_workspace_id);
  if not exists(select 1 from projects where id=p_project_id and workspace_id=p_workspace_id and deleted_at is null) then raise exception 'Project not found'; end if;
  if length(trim(p_full_name))<1 or length(trim(p_full_name))>300 then raise exception 'Contact name must contain 1 to 300 characters'; end if;
  insert into people(workspace_id,full_name,role,company,phone,email,address,notes,created_by,updated_by)
    values(p_workspace_id,trim(p_full_name),trim(coalesce(p_role,'')),trim(coalesce(p_company,'')),trim(coalesce(p_phone,'')),
      lower(trim(coalesce(p_email,''))),trim(coalesce(p_address,'')),coalesce(p_notes,''),v_user,v_user) returning * into v_person;
  insert into project_people(workspace_id,project_id,person_id,share_phone,share_email,share_address,share_notes,supervisable,created_by,updated_by)
    values(p_workspace_id,p_project_id,v_person.id,p_share_phone,p_share_email,p_share_address,p_share_notes,p_supervisable,v_user,v_user) returning * into v_link;
  return jsonb_build_object('personId',v_person.id,'projectPersonId',v_link.id,'fullName',v_person.full_name);
end $$;

create or replace function user_claim_linked_project(p_workspace_id uuid,p_share_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_user uuid; v_email text; v_share person_task_shares; v_person people; v_link linked_project_collaborators;
begin
  v_user:=assert_connected_workspace(p_workspace_id);
  select lower(email) into v_email from profiles where id=v_user;
  select * into v_share from person_task_shares where id=p_share_id and revoked_at is null
    and scope_mode='project' and project_id is not null and (expires_at is null or expires_at>now());
  if v_share.id is null then raise exception 'This project invitation is unavailable'; end if;
  select * into v_person from people where id=v_share.person_id and workspace_id=v_share.workspace_id;
  if v_email is null or v_email<>lower(trim(v_person.email)) then raise exception 'Sign in with the email address that received this project invitation'; end if;
  insert into linked_project_collaborators(workspace_id,project_id,share_id,invited_email,user_id,accepted_at)
    values(v_share.workspace_id,v_share.project_id,v_share.id,v_email,v_user,now())
    on conflict(share_id) do update set user_id=excluded.user_id,accepted_at=coalesce(linked_project_collaborators.accepted_at,now()),revoked_at=null,updated_at=now()
    returning * into v_link;
  return jsonb_build_object('id',v_link.id,'shareId',v_link.share_id,'projectId',v_link.project_id,'acceptedAt',v_link.accepted_at);
end $$;

create or replace function user_linked_projects(p_workspace_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_user uuid;
begin
  v_user:=assert_connected_workspace(p_workspace_id);
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',l.id,'shareId',l.share_id,'projectId',p.id,'name',p.name,'description',p.description,'color',p.color,'version',p.version,
    'acceptedAt',l.accepted_at,'ownerWorkspaceId',l.workspace_id,'expiresAt',s.expires_at,
    'allowChecklistUpdates',s.allow_checklist_updates,'allowTaskCompletion',s.allow_task_completion,'allowComments',s.allow_comments,
    'allowViewProjectContacts',s.allow_view_project_contacts,'allowViewContactAssignments',s.allow_view_contact_assignments,
    'allowSuperviseContactChecklists',s.allow_supervise_contact_checklists,'allowCompleteContactTasks',s.allow_complete_contact_tasks,
    'activeTasks',(select count(*) from tasks t where t.project_id=p.id and t.deleted_at is null and t.status not in('completed','cancelled','archived')),
    'progress',coalesce((select round(avg(t.calculated_progress)) from tasks t where t.project_id=p.id and t.deleted_at is null),0)
  ) order by p.name) from linked_project_collaborators l
    join person_task_shares s on s.id=l.share_id and s.revoked_at is null and (s.expires_at is null or s.expires_at>now())
    join projects p on p.id=l.project_id and p.workspace_id=l.workspace_id and p.deleted_at is null
    where l.user_id=v_user and l.revoked_at is null),'[]'::jsonb);
end $$;

revoke all on function user_claim_linked_project(uuid,uuid),user_linked_projects(uuid) from public;

create or replace function connected_projects_workload(p_workspace_id uuid,p_user_id uuid)
returns jsonb language sql security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'name',p.name,'color',p.color,'description',p.description,'version',p.version,
    'activeTasks',coalesce(s.active,0),'progress',coalesce(s.progress,0)) order by p.name),'[]'::jsonb)
  from projects p left join lateral(
    select count(*) filter(where t.status not in('completed','cancelled','archived') and t.deleted_at is null) active,
      round(avg(t.calculated_progress)) progress from tasks t where t.project_id=p.id and t.deleted_at is null
  )s on true where p.workspace_id=p_workspace_id and p.deleted_at is null and not p.archived
$$;

create or replace function user_update_project(
  p_workspace_id uuid,p_project_id uuid,p_name text,p_description text,p_color text,p_expected_version integer
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_user uuid; v_role text; v_row projects;
begin
  v_user:=assert_connected_workspace(p_workspace_id);
  select role into v_role from workspace_members where workspace_id=p_workspace_id and user_id=v_user and removed_at is null;
  if v_role='viewer' then raise exception 'View-only users cannot edit projects'; end if;
  if trim(p_name)='' or length(trim(p_name))>300 then raise exception 'Project name must contain 1 to 300 characters'; end if;
  if length(coalesce(p_description,''))>10000 or p_color !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Invalid project details'; end if;
  update projects set name=trim(p_name),description=coalesce(p_description,''),color=p_color,updated_by=v_user
    where id=p_project_id and workspace_id=p_workspace_id and deleted_at is null and version=p_expected_version returning * into v_row;
  if v_row.id is null then raise exception 'Project changed on another device. Refresh before saving.' using errcode='40001'; end if;
  return to_jsonb(v_row);
exception when unique_violation then raise exception 'A project with this name already exists';
end $$;

create or replace function user_delete_project(p_workspace_id uuid,p_project_id uuid,p_expected_version integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_user uuid; v_role text; v_project projects; v_tasks integer;
begin
  v_user:=assert_connected_workspace(p_workspace_id);
  select role into v_role from workspace_members where workspace_id=p_workspace_id and user_id=v_user and removed_at is null;
  if v_role='viewer' then raise exception 'View-only users cannot delete projects'; end if;
  select * into v_project from projects where id=p_project_id and workspace_id=p_workspace_id and deleted_at is null for update;
  if v_project.id is null then raise exception 'Project not found'; end if;
  if v_project.version<>p_expected_version then raise exception 'Project changed on another device. Refresh before deleting.' using errcode='40001'; end if;
  select count(*) into v_tasks from tasks where workspace_id=p_workspace_id and project_id=p_project_id and deleted_at is null;
  update tasks set project_id=null,updated_by=v_user where workspace_id=p_workspace_id and project_id=p_project_id;
  update person_task_shares set revoked_at=coalesce(revoked_at,now()),updated_at=now()
    where workspace_id=p_workspace_id and project_id=p_project_id and revoked_at is null;
  update project_people set deleted_at=coalesce(deleted_at,now()),updated_at=now(),updated_by=v_user
    where workspace_id=p_workspace_id and project_id=p_project_id;
  update projects set name=left(v_project.name,260)||' [deleted '||left(p_project_id::text,8)||']',deleted_at=now(),updated_by=v_user
    where id=p_project_id;
  insert into audit_events(id,workspace_id,level,service,event_type,summary,details)
    values(gen_random_uuid(),p_workspace_id,'info','connected-tasks','project.deleted','Project deleted',
      jsonb_build_object('projectId',p_project_id,'projectName',v_project.name,'tasksPreserved',v_tasks,'collaborationRevoked',true));
  return jsonb_build_object('deleted',true,'projectId',p_project_id,'tasksPreserved',v_tasks,'collaborationRevoked',true);
end $$;

revoke all on function user_update_project(uuid,uuid,text,text,text,integer),user_delete_project(uuid,uuid,integer) from public,anon;
grant execute on function user_update_project(uuid,uuid,text,text,text,integer),user_delete_project(uuid,uuid,integer) to authenticated;

create or replace function set_person_share_verification_code(p_share_id uuid, p_code text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_email text; v_name text; v_last timestamptz;
begin
  select lower(nullif(trim(p.email),'')), p.full_name, s.verification_requested_at into v_email,v_name,v_last
    from person_task_shares s join people p on p.id=s.person_id and p.workspace_id=s.workspace_id
    where s.id=p_share_id and s.revoked_at is null and (s.expires_at is null or s.expires_at>now());
  if v_email is null then raise exception 'A valid recipient email is required'; end if;
  if v_last is not null and v_last > now()-interval '30 seconds' then raise exception 'Please wait before requesting another code'; end if;
  update person_task_shares set verification_code_hash=encode(digest(p_share_id::text||':'||p_code,'sha256'),'hex'),
    verification_expires_at=now()+interval '10 minutes', verification_requested_at=now(), verification_attempts=0
    where id=p_share_id;
  return jsonb_build_object('email',v_email,'personName',v_name,'expiresInMinutes',10);
end $$;
revoke all on function set_person_share_verification_code(uuid,text) from public;

create or replace function verify_person_share_code(p_share_id uuid, p_code text)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_ok boolean;
begin
  update person_task_shares set verification_attempts=verification_attempts+1
    where id=p_share_id and revoked_at is null and verification_attempts<5;
  select verification_code_hash=encode(digest(p_share_id::text||':'||p_code,'sha256'),'hex')
    and verification_expires_at>now() and verification_attempts<=5 into v_ok
    from person_task_shares where id=p_share_id and revoked_at is null and (expires_at is null or expires_at>now());
  if coalesce(v_ok,false) then
    update person_task_shares set verification_code_hash=null, verification_expires_at=null, verification_attempts=0 where id=p_share_id;
    return true;
  end if;
  return false;
end $$;
revoke all on function verify_person_share_code(uuid,text) from public;

create or replace function record_person_share_action(p_share_id uuid,p_task_id uuid,p_type text,p_summary text,p_details jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_action uuid:=gen_random_uuid(); v_workspace uuid;
begin
  select workspace_id into v_workspace from person_task_shares where id=p_share_id;
  insert into person_share_actions(id,workspace_id,share_id,task_id,action_type,summary,details)
    values(v_action,v_workspace,p_share_id,p_task_id,p_type,p_summary,p_details);
  insert into activities(id,workspace_id,task_id,event_type,summary,details,created_at)
    values(gen_random_uuid(),v_workspace,p_task_id,'external_collaboration',p_summary,p_details||jsonb_build_object('shareId',p_share_id),now());
  insert into notification_deliveries(id,workspace_id,user_id,task_id,kind,status,idempotency_key,delivered_at,created_at,updated_at)
    select gen_random_uuid(),v_workspace,m.user_id,p_task_id,'external_update','delivered',
      'external:'||v_action::text||':'||m.user_id::text,now(),now(),now()
    from workspace_members m where m.workspace_id=v_workspace and m.removed_at is null and m.role in ('owner','admin');
  return v_action;
end $$;
revoke all on function record_person_share_action(uuid,uuid,text,text,jsonb) from public;

create or replace function public_person_checklist_update(p_share_id uuid,p_item_id uuid,p_completed boolean,p_expected_version integer default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_task uuid; v_name text; v_row checklist_items;
begin
  select c.task_id,p.full_name into v_task,v_name from checklist_items c
    join tasks t on t.id=c.task_id join person_task_shares s on s.id=p_share_id
    join people p on p.id=s.person_id where c.id=p_item_id and c.workspace_id=s.workspace_id
      and person_share_task_allowed(p_share_id,c.task_id,'checklist');
  if v_task is null then raise exception 'Checklist update is not permitted'; end if;
  update checklist_items set completed=p_completed,updated_at=now()
    where id=p_item_id and (p_expected_version is null or version=p_expected_version) returning * into v_row;
  if v_row.id is null then raise exception 'The checklist item changed; refresh and try again'; end if;
  perform refresh_task_derived(v_task);
  perform record_person_share_action(p_share_id,v_task,'checklist_updated',
    case when exists(select 1 from tasks t join person_task_shares s on s.id=p_share_id where t.id=v_task and t.responsible_person_id<>s.person_id)
      then v_name||' updated a checklist item on behalf of '||(select p.full_name from tasks t join people p on p.id=t.responsible_person_id where t.id=v_task)
      else v_name||' updated a checklist item' end,
    jsonb_build_object('itemId',p_item_id,'completed',p_completed,'actorPersonId',(select person_id from person_task_shares where id=p_share_id),
      'responsiblePersonId',(select responsible_person_id from tasks where id=v_task)));
  return to_jsonb(v_row);
end $$;

create or replace function public_person_complete_task(p_share_id uuid,p_task_id uuid,p_expected_version integer default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_name text; v_row tasks;
begin
  select p.full_name into v_name from person_task_shares s join people p on p.id=s.person_id
    where s.id=p_share_id and person_share_task_allowed(p_share_id,p_task_id,'complete');
  if v_name is null then raise exception 'Task completion is not permitted'; end if;
  update tasks set status='completed',updated_at=now() where id=p_task_id
    and (p_expected_version is null or version=p_expected_version) returning * into v_row;
  if v_row.id is null then raise exception 'The task changed; refresh and try again'; end if;
  perform refresh_task_derived(p_task_id);
  perform record_person_share_action(p_share_id,p_task_id,'task_completed',
    case when exists(select 1 from tasks t join person_task_shares s on s.id=p_share_id where t.id=p_task_id and t.responsible_person_id<>s.person_id)
      then v_name||' completed the task on behalf of '||(select p.full_name from tasks t join people p on p.id=t.responsible_person_id where t.id=p_task_id)
      else v_name||' completed the task' end,
    jsonb_build_object('actorPersonId',(select person_id from person_task_shares where id=p_share_id),
      'responsiblePersonId',(select responsible_person_id from tasks where id=p_task_id)));
  return to_jsonb(v_row);
end $$;

create or replace function public_person_add_comment(p_share_id uuid,p_task_id uuid,p_comment text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_name text; v_action uuid; v_comment text:=trim(p_comment);
begin
  if length(v_comment)<1 or length(v_comment)>2000 then raise exception 'Comment must contain 1 to 2000 characters'; end if;
  select p.full_name into v_name from person_task_shares s join people p on p.id=s.person_id
    where s.id=p_share_id and s.allow_comments and person_share_task_allowed(p_share_id,p_task_id,'comment');
  if v_name is null then raise exception 'Commenting is not permitted'; end if;
  v_action:=record_person_share_action(p_share_id,p_task_id,'comment_added',v_name||' added a comment',jsonb_build_object('comment',v_comment));
  return jsonb_build_object('id',v_action,'comment',v_comment,'createdAt',now());
end $$;

create or replace function public_manage_project_person(p_share_id uuid,p_action text,p_person_id uuid,p_full_name text,p_role text,
  p_company text,p_phone text,p_email text,p_address text,p_notes text,p_share_phone boolean,p_share_email boolean,
  p_share_address boolean,p_share_notes boolean,p_supervisable boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_share person_task_shares; v_actor text; v_person people; v_link project_people;
begin
  select s,p.full_name into v_share,v_actor from person_task_shares s join people p on p.id=s.person_id
    where s.id=p_share_id and s.revoked_at is null and s.scope_mode='project' and s.allow_manage_project_contacts
      and (s.expires_at is null or s.expires_at>now());
  if v_share.id is null then raise exception 'Managing project contacts is not permitted'; end if;
  if p_action='remove' then
    update project_people set deleted_at=now(),updated_at=now()
      where workspace_id=v_share.workspace_id and project_id=v_share.project_id and person_id=p_person_id and deleted_at is null returning * into v_link;
    if v_link.id is null then raise exception 'Project contact not found'; end if;
  elsif p_action in ('create','update') then
    if length(trim(coalesce(p_full_name,'')))<1 or length(trim(p_full_name))>300 then raise exception 'Contact name must contain 1 to 300 characters'; end if;
    if p_action='create' then
      insert into people(workspace_id,full_name,role,company,phone,email,address,notes)
        values(v_share.workspace_id,trim(p_full_name),trim(coalesce(p_role,'')),trim(coalesce(p_company,'')),trim(coalesce(p_phone,'')),
          lower(trim(coalesce(p_email,''))),trim(coalesce(p_address,'')),coalesce(p_notes,'')) returning * into v_person;
      insert into project_people(workspace_id,project_id,person_id,share_phone,share_email,share_address,share_notes,supervisable)
        values(v_share.workspace_id,v_share.project_id,v_person.id,p_share_phone,p_share_email,p_share_address,p_share_notes,p_supervisable) returning * into v_link;
      p_person_id:=v_person.id;
    else
      select p.* into v_person from people p join project_people pp on pp.person_id=p.id and pp.workspace_id=p.workspace_id
        where p.id=p_person_id and pp.workspace_id=v_share.workspace_id and pp.project_id=v_share.project_id and pp.deleted_at is null;
      if v_person.id is null then raise exception 'Project contact not found'; end if;
      update people set full_name=trim(p_full_name),role=trim(coalesce(p_role,'')),company=trim(coalesce(p_company,'')),
        phone=trim(coalesce(p_phone,'')),email=lower(trim(coalesce(p_email,''))),address=trim(coalesce(p_address,'')),notes=coalesce(p_notes,'')
        where id=p_person_id and workspace_id=v_share.workspace_id returning * into v_person;
      update project_people set share_phone=p_share_phone,share_email=p_share_email,share_address=p_share_address,
        share_notes=p_share_notes,supervisable=p_supervisable,updated_at=now()
        where workspace_id=v_share.workspace_id and project_id=v_share.project_id and person_id=p_person_id and deleted_at is null returning * into v_link;
    end if;
  else raise exception 'Invalid project contact action'; end if;
  insert into audit_events(id,workspace_id,level,service,event_type,summary,details)
    values(gen_random_uuid(),v_share.workspace_id,'info','connected-people','project_contact.'||p_action,
      v_actor||' '||case when p_action='remove' then 'removed a project contact' else p_action||'d a project contact' end,
      jsonb_build_object('shareId',p_share_id,'projectId',v_share.project_id,'personId',p_person_id,'actorPersonId',v_share.person_id));
  return jsonb_build_object('action',p_action,'personId',p_person_id,'projectId',v_share.project_id);
end $$;

revoke all on function public_person_checklist_update(uuid,uuid,boolean,integer) from public;
revoke all on function public_person_complete_task(uuid,uuid,integer) from public;
revoke all on function public_person_add_comment(uuid,uuid,text) from public;
revoke all on function public_manage_project_person(uuid,text,uuid,text,text,text,text,text,text,text,boolean,boolean,boolean,boolean,boolean) from public;

create or replace function public_person_task_share(p_share_id uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'personName',p.full_name,'generatedAt',now(),
    'access',jsonb_build_object('scopeMode',s.scope_mode,'projectId',s.project_id,'expiresAt',s.expires_at,
      'allowChecklistUpdates',s.allow_checklist_updates,'allowTaskCompletion',s.allow_task_completion,'allowComments',s.allow_comments,
      'allowViewProjectContacts',s.allow_view_project_contacts,'allowViewContactAssignments',s.allow_view_contact_assignments,
      'allowSuperviseContactChecklists',s.allow_supervise_contact_checklists,'allowCompleteContactTasks',s.allow_complete_contact_tasks,
      'allowManageProjectContacts',s.allow_manage_project_contacts),
    'preferences',jsonb_build_object('emailAvailable',nullif(trim(p.email),'') is not null,'emailEnabled',s.email_enabled,
      'pushEnabled',s.push_enabled,'activePushSubscriptions',(select count(*) from person_share_push_subscriptions ps where ps.share_id=s.id and not ps.disabled)),
    'projects',coalesce((select jsonb_agg(project_row order by project_row->>'projectName') from (
      select jsonb_build_object('projectId',t.project_id,'projectName',coalesce(pr.name,'No project'),
        'progress',round(avg(t.calculated_progress)),
        'tasks',jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'description',t.description,'status',t.status,
          'priority',t.priority,'dueDate',t.due_date,'calculatedProgress',t.calculated_progress,'blocked',t.blocked,'version',t.version,
          'responsiblePersonId',case when s.allow_view_contact_assignments then t.responsible_person_id else null end,
          'responsiblePersonName',case when s.allow_view_contact_assignments then rp.full_name else null end,
          'canUpdateChecklist',person_share_task_allowed(s.id,t.id,'checklist'),
          'canComplete',person_share_task_allowed(s.id,t.id,'complete'),
          'canComment',s.allow_comments and person_share_task_allowed(s.id,t.id,'comment'),
          'checklist',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'description',c.description,'completed',c.completed,
            'required',c.required,'position',c.position,'version',c.version) order by c.position,c.created_at) from checklist_items c where c.task_id=t.id),'[]'::jsonb))
          order by t.due_date nulls last,t.created_at)) project_row
      from tasks t left join projects pr on pr.id=t.project_id left join people rp on rp.id=t.responsible_person_id
      where person_share_task_allowed(s.id,t.id,'view') and t.status not in ('completed','cancelled','archived')
      group by t.project_id,pr.name
    ) grouped),'[]'::jsonb),
    'projectPeople',case when s.scope_mode='project' and s.allow_view_project_contacts then coalesce((select jsonb_agg(
      jsonb_build_object('personId',p2.id,'fullName',p2.full_name,'company',p2.company,'role',p2.role,
        'phone',case when pp.share_phone or s.allow_manage_project_contacts then p2.phone else null end,
        'email',case when pp.share_email or s.allow_manage_project_contacts then p2.email else null end,
        'address',case when pp.share_address or s.allow_manage_project_contacts then p2.address else null end,
        'notes',case when pp.share_notes or s.allow_manage_project_contacts then p2.notes else null end,
        'sharePhone',pp.share_phone,'shareEmail',pp.share_email,'shareAddress',pp.share_address,'shareNotes',pp.share_notes,
        'supervisable',pp.supervisable) order by p2.full_name)
      from project_people pp join people p2 on p2.id=pp.person_id and p2.workspace_id=pp.workspace_id and p2.deleted_at is null
      where pp.project_id=s.project_id and pp.workspace_id=s.workspace_id and pp.deleted_at is null),'[]'::jsonb) else '[]'::jsonb end
  ) from person_task_shares s join people p on p.id=s.person_id and p.workspace_id=s.workspace_id
  where s.id=p_share_id and s.revoked_at is null and (s.expires_at is null or s.expires_at>now())
$$;
revoke all on function public_person_task_share(uuid) from public;

revoke execute on function user_configure_person_share(uuid,uuid,text,uuid,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,timestamptz),
  user_claim_linked_project(uuid,uuid),user_linked_projects(uuid) from public,anon;
grant execute on function user_configure_person_share(uuid,uuid,text,uuid,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,timestamptz),
  user_claim_linked_project(uuid,uuid),user_linked_projects(uuid),user_update_project(uuid,uuid,text,text,text,integer),
  user_delete_project(uuid,uuid,integer),user_project_people(uuid,uuid),
  user_save_project_person(uuid,uuid,uuid,boolean,boolean,boolean,boolean,boolean),
  user_remove_project_person(uuid,uuid,uuid),
  user_create_project_person(uuid,uuid,text,text,text,text,text,text,text,boolean,boolean,boolean,boolean,boolean) to authenticated;
grant execute on function public_person_task_share(uuid),set_person_share_verification_code(uuid,text),
  verify_person_share_code(uuid,text),public_person_checklist_update(uuid,uuid,boolean,integer),
  public_person_complete_task(uuid,uuid,integer),public_person_add_comment(uuid,uuid,text),
  public_manage_project_person(uuid,text,uuid,text,text,text,text,text,text,text,boolean,boolean,boolean,boolean,boolean) to service_role;

insert into schema_versions(version) values(11) on conflict do nothing;

commit;
