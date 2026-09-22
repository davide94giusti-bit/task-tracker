begin;

create or replace function public.connected_dashboard(p_workspace_id uuid,p_user_id uuid)
returns jsonb
language sql
security definer
set search_path=public
as $$
  with active as (
    select *
    from tasks
    where workspace_id=p_workspace_id
      and deleted_at is null
      and not archived
      and status not in ('completed','cancelled','archived')
  ),
  done as (
    select *
    from tasks
    where workspace_id=p_workspace_id
      and status='completed'
      and deleted_at is null
  ),
  counts as (
    select
      count(*) filter (where due_date<current_date) overdue,
      count(*) filter (where due_date=current_date) today,
      count(*) filter (where due_date>current_date and due_date<=current_date+7) next7,
      count(*) filter (where priority='critical') critical,
      count(*) filter (where priority='high') high,
      count(*) filter (where blocked) blocked,
      count(*) filter (where status='waiting') waiting,
      count(*) filter (where priority='critical' or blocked) needs_attention,
      count(*) active
    from active
  ),
  completed_count as (
    select count(*) completed from done
  ),
  progress as (
    select coalesce(round(avg(calculated_progress)),0) overall from active
  )
  select jsonb_build_object(
    'counts',jsonb_build_object(
      'overdue',coalesce(c.overdue,0),
      'today',coalesce(c.today,0),
      'next7',coalesce(c.next7,0),
      'critical',coalesce(c.critical,0),
      'high',coalesce(c.high,0),
      'blocked',coalesce(c.blocked,0),
      'waiting',coalesce(c.waiting,0),
      'needsAttention',coalesce(c.needs_attention,0),
      'active',coalesce(c.active,0),
      'completed',coalesce(d.completed,0)
    ),
    'overallProgress',p.overall,
    'projectProgress','[]'::jsonb,
    'peopleProgress','[]'::jsonb,
    'workload','[]'::jsonb
  )
  from counts c
  cross join completed_count d
  full join progress p on true
$$;

revoke execute on function public.connected_dashboard(uuid,uuid) from public,anon,authenticated;

commit;
