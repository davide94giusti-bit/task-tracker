begin;

alter table public.person_task_shares
  add column if not exists allow_create_edit_tasks boolean not null default false,
  add column if not exists allow_manage_checklist_items boolean not null default false;

alter table public.person_share_actions
  drop constraint if exists person_share_actions_action_type_check;
alter table public.person_share_actions
  add constraint person_share_actions_action_type_check check (action_type in (
    'checklist_updated', 'task_completed', 'comment_added',
    'task_created', 'task_updated',
    'checklist_item_created', 'checklist_item_updated',
    'checklist_items_reordered', 'checklist_item_removed'
  ));

create or replace function public.user_configure_person_share(
  p_workspace_id uuid, p_share_id uuid, p_scope_mode text, p_project_id uuid,
  p_allow_checklist_updates boolean, p_allow_task_completion boolean,
  p_allow_comments boolean, p_allow_view_project_contacts boolean,
  p_allow_view_contact_assignments boolean, p_allow_supervise_contact_checklists boolean,
  p_allow_complete_contact_tasks boolean, p_allow_manage_project_contacts boolean,
  p_allow_create_edit_tasks boolean, p_allow_manage_checklist_items boolean,
  p_expires_at timestamptz
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_user uuid; v_role text; v_row person_task_shares;
begin
  v_user := assert_connected_workspace(p_workspace_id);
  select role into v_role from workspace_members
    where workspace_id=p_workspace_id and user_id=v_user and removed_at is null;
  if v_role not in ('owner','admin','member') then raise exception 'Insufficient permission'; end if;
  if p_scope_mode not in ('assigned','project') then raise exception 'Invalid collaboration scope'; end if;
  if p_scope_mode='project' and not exists(
    select 1 from projects where id=p_project_id and workspace_id=p_workspace_id and deleted_at is null
  ) then raise exception 'Project not found'; end if;

  update person_task_shares set
    scope_mode=p_scope_mode,
    project_id=case when p_scope_mode='project' then p_project_id else null end,
    allow_checklist_updates=p_allow_checklist_updates,
    allow_task_completion=p_allow_task_completion,
    allow_comments=p_allow_comments,
    allow_view_project_contacts=case when p_scope_mode='project' then p_allow_view_project_contacts or p_allow_manage_project_contacts else false end,
    allow_view_contact_assignments=case when p_scope_mode='project' then p_allow_view_contact_assignments or p_allow_supervise_contact_checklists or p_allow_complete_contact_tasks else false end,
    allow_supervise_contact_checklists=case when p_scope_mode='project' then p_allow_supervise_contact_checklists else false end,
    allow_complete_contact_tasks=case when p_scope_mode='project' then p_allow_complete_contact_tasks else false end,
    allow_manage_project_contacts=case when p_scope_mode='project' then p_allow_manage_project_contacts else false end,
    allow_create_edit_tasks=case when p_scope_mode='project' then p_allow_create_edit_tasks else false end,
    allow_manage_checklist_items=case when p_scope_mode='project' then p_allow_manage_checklist_items else false end,
    expires_at=p_expires_at,
    updated_at=now()
  where id=p_share_id and workspace_id=p_workspace_id and revoked_at is null
  returning * into v_row;

  if v_row.id is null then raise exception 'Shared-task link is unavailable'; end if;
  return jsonb_build_object(
    'id',v_row.id,'scopeMode',v_row.scope_mode,'projectId',v_row.project_id,
    'allowChecklistUpdates',v_row.allow_checklist_updates,
    'allowTaskCompletion',v_row.allow_task_completion,
    'allowComments',v_row.allow_comments,
    'allowViewProjectContacts',v_row.allow_view_project_contacts,
    'allowViewContactAssignments',v_row.allow_view_contact_assignments,
    'allowSuperviseContactChecklists',v_row.allow_supervise_contact_checklists,
    'allowCompleteContactTasks',v_row.allow_complete_contact_tasks,
    'allowManageProjectContacts',v_row.allow_manage_project_contacts,
    'allowCreateEditTasks',v_row.allow_create_edit_tasks,
    'allowManageChecklistItems',v_row.allow_manage_checklist_items,
    'expiresAt',v_row.expires_at
  );
end $$;

create or replace function public.public_manage_project_task(
  p_share_id uuid, p_action text, p_task_id uuid,
  p_title text, p_description text, p_status text, p_priority text,
  p_due_date date, p_expected_version integer default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_share person_task_shares; v_task tasks; v_actor text;
begin
  select * into v_share from person_task_shares
    where id=p_share_id and revoked_at is null and scope_mode='project'
      and project_id is not null and allow_create_edit_tasks
      and (expires_at is null or expires_at>now());
  if v_share.id is null then raise exception 'Creating and editing project tasks is not permitted'; end if;
  select full_name into v_actor from people where id=v_share.person_id and workspace_id=v_share.workspace_id;
  if nullif(trim(p_title),'') is null or length(p_title)>500 then raise exception 'Task title is required and must be 500 characters or fewer'; end if;
  if length(coalesce(p_description,''))>50000 then raise exception 'Task description is too long'; end if;
  if p_status not in ('not_started','in_progress','waiting','blocked') then
    raise exception 'This permission cannot complete, cancel, or archive tasks';
  end if;
  if p_priority not in ('critical','high','medium','low','none') then raise exception 'Invalid task priority'; end if;

  if p_action='create' then
    insert into tasks(workspace_id,title,description,status,priority,due_date,project_id,responsible_person_id)
    values(v_share.workspace_id,trim(p_title),coalesce(p_description,''),p_status::task_status,
      p_priority::task_priority,p_due_date,v_share.project_id,v_share.person_id)
    returning * into v_task;
    perform record_person_share_action(v_share.id,v_task.id,'task_created',
      coalesce(v_actor,'Collaborator')||' created task “'||v_task.title||'”',
      jsonb_build_object('actorPersonId',v_share.person_id,'projectId',v_share.project_id));
  elsif p_action='update' then
    update tasks set title=trim(p_title),description=coalesce(p_description,''),status=p_status::task_status,
      priority=p_priority::task_priority,due_date=p_due_date
    where id=p_task_id and workspace_id=v_share.workspace_id and project_id=v_share.project_id
      and deleted_at is null and status not in ('completed','cancelled','archived')
      and version=p_expected_version
    returning * into v_task;
    if v_task.id is null then raise exception 'Task changed or is no longer available. Refresh before saving.' using errcode='40001'; end if;
    perform record_person_share_action(v_share.id,v_task.id,'task_updated',
      coalesce(v_actor,'Collaborator')||' updated task “'||v_task.title||'”',
      jsonb_build_object('actorPersonId',v_share.person_id,'projectId',v_share.project_id));
  else
    raise exception 'Unsupported task action';
  end if;

  return jsonb_build_object('id',v_task.id,'version',v_task.version,'action',p_action);
end $$;

create or replace function public.public_manage_project_checklist(
  p_share_id uuid, p_action text, p_task_id uuid, p_item_id uuid,
  p_description text, p_required boolean, p_ordered_item_ids uuid[],
  p_expected_version integer default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_share person_task_shares; v_task tasks; v_item checklist_items; v_actor text;
  v_active_count integer; v_position integer;
begin
  select * into v_share from person_task_shares
    where id=p_share_id and revoked_at is null and scope_mode='project'
      and project_id is not null and allow_manage_checklist_items
      and (expires_at is null or expires_at>now());
  if v_share.id is null then raise exception 'Managing project checklist items is not permitted'; end if;
  select * into v_task from tasks
    where id=p_task_id and workspace_id=v_share.workspace_id and project_id=v_share.project_id
      and deleted_at is null and status not in ('completed','cancelled','archived');
  if v_task.id is null then raise exception 'Task is unavailable outside the shared project'; end if;
  select full_name into v_actor from people where id=v_share.person_id and workspace_id=v_share.workspace_id;

  if p_action='create' then
    if nullif(trim(p_description),'') is null or length(p_description)>1000 then
      raise exception 'Checklist description is required and must be 1000 characters or fewer';
    end if;
    select coalesce(max(position)+1,0) into v_position from checklist_items
      where task_id=v_task.id and workspace_id=v_share.workspace_id and deleted_at is null;
    insert into checklist_items(workspace_id,task_id,description,required,position)
    values(v_share.workspace_id,v_task.id,trim(p_description),coalesce(p_required,true),v_position)
    returning * into v_item;
  elsif p_action='update' then
    if nullif(trim(p_description),'') is null or length(p_description)>1000 then
      raise exception 'Checklist description is required and must be 1000 characters or fewer';
    end if;
    update checklist_items set description=trim(p_description),required=coalesce(p_required,true)
    where id=p_item_id and task_id=v_task.id and workspace_id=v_share.workspace_id
      and deleted_at is null and version=p_expected_version returning * into v_item;
    if v_item.id is null then raise exception 'Checklist item changed or is unavailable. Refresh before saving.' using errcode='40001'; end if;
  elsif p_action='remove' then
    update checklist_items set deleted_at=now()
    where id=p_item_id and task_id=v_task.id and workspace_id=v_share.workspace_id
      and deleted_at is null and version=p_expected_version returning * into v_item;
    if v_item.id is null then raise exception 'Checklist item changed or is unavailable. Refresh before removing it.' using errcode='40001'; end if;
  elsif p_action='reorder' then
    select count(*) into v_active_count from checklist_items
      where task_id=v_task.id and workspace_id=v_share.workspace_id and deleted_at is null;
    if p_ordered_item_ids is null or cardinality(p_ordered_item_ids)<>v_active_count
      or (select count(distinct item_id) from unnest(p_ordered_item_ids) as ordered_id(item_id))<>v_active_count
      or (select count(*) from checklist_items where id=any(p_ordered_item_ids)
        and task_id=v_task.id and workspace_id=v_share.workspace_id and deleted_at is null)<>v_active_count then
      raise exception 'Checklist order is incomplete or contains invalid items';
    end if;
    update checklist_items item set position=ordered.ordinality-1
      from unnest(p_ordered_item_ids) with ordinality ordered(item_id,ordinality)
      where item.id=ordered.item_id and item.task_id=v_task.id and item.workspace_id=v_share.workspace_id;
  else
    raise exception 'Unsupported checklist action';
  end if;

  perform record_person_share_action(v_share.id,v_task.id,
    case p_action when 'create' then 'checklist_item_created' when 'update' then 'checklist_item_updated'
      when 'remove' then 'checklist_item_removed' else 'checklist_items_reordered' end,
    coalesce(v_actor,'Collaborator')||' '||case p_action when 'create' then 'added a checklist item to '
      when 'update' then 'updated a checklist item in ' when 'remove' then 'removed a checklist item from '
      else 'reordered checklist items in ' end||'“'||v_task.title||'”',
    jsonb_build_object('actorPersonId',v_share.person_id,'projectId',v_share.project_id,'itemId',v_item.id));

  return jsonb_build_object('taskId',v_task.id,'itemId',v_item.id,'action',p_action);
end $$;

create or replace function public.user_linked_projects(p_workspace_id uuid)
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
    'allowCreateEditTasks',s.allow_create_edit_tasks,'allowManageChecklistItems',s.allow_manage_checklist_items,
    'activeTasks',(select count(*) from tasks t where t.project_id=p.id and t.deleted_at is null and t.status not in('completed','cancelled','archived')),
    'progress',coalesce((select round(avg(t.calculated_progress)) from tasks t where t.project_id=p.id and t.deleted_at is null),0)
  ) order by p.name) from linked_project_collaborators l
    join person_task_shares s on s.id=l.share_id and s.revoked_at is null and (s.expires_at is null or s.expires_at>now())
    join projects p on p.id=l.project_id and p.workspace_id=l.workspace_id and p.deleted_at is null
    where l.user_id=v_user and l.revoked_at is null),'[]'::jsonb);
end $$;

create or replace function public.public_person_task_share(p_share_id uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'personName',p.full_name,'generatedAt',now(),
    'access',jsonb_build_object('scopeMode',s.scope_mode,'projectId',s.project_id,'expiresAt',s.expires_at,
      'allowChecklistUpdates',s.allow_checklist_updates,'allowTaskCompletion',s.allow_task_completion,'allowComments',s.allow_comments,
      'allowViewProjectContacts',s.allow_view_project_contacts,'allowViewContactAssignments',s.allow_view_contact_assignments,
      'allowSuperviseContactChecklists',s.allow_supervise_contact_checklists,'allowCompleteContactTasks',s.allow_complete_contact_tasks,
      'allowManageProjectContacts',s.allow_manage_project_contacts,
      'allowCreateEditTasks',s.allow_create_edit_tasks,'allowManageChecklistItems',s.allow_manage_checklist_items),
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
          'canEditTask',s.scope_mode='project' and s.allow_create_edit_tasks,
          'canManageChecklist',s.scope_mode='project' and s.allow_manage_checklist_items,
          'checklist',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'description',c.description,'completed',c.completed,
            'required',c.required,'position',c.position,'version',c.version) order by c.position,c.created_at)
            from checklist_items c where c.task_id=t.id and c.deleted_at is null),'[]'::jsonb))
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

revoke all on function public.public_manage_project_task(uuid,text,uuid,text,text,text,text,date,integer) from public;
revoke all on function public.public_manage_project_checklist(uuid,text,uuid,uuid,text,boolean,uuid[],integer) from public;
grant execute on function public.public_manage_project_task(uuid,text,uuid,text,text,text,text,date,integer) to service_role;
grant execute on function public.public_manage_project_checklist(uuid,text,uuid,uuid,text,boolean,uuid[],integer) to service_role;

revoke execute on function public.user_configure_person_share(uuid,uuid,text,uuid,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,timestamptz) from public,anon;
grant execute on function public.user_configure_person_share(uuid,uuid,text,uuid,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,timestamptz) to authenticated;

insert into public.schema_versions(version) values (15) on conflict do nothing;

commit;
