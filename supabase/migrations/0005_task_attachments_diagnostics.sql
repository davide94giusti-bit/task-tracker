-- Private task files and richer diagnostics metadata.
alter table public.attachments add column if not exists display_name text not null default '';

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('task-attachments','task-attachments',false,6291456,array[
  'image/jpeg','image/png','image/gif','image/webp','application/pdf','text/plain','text/csv',
  'application/zip','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation'
])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create index if not exists attachments_task_active on public.attachments(workspace_id,task_id,created_at desc) where deleted_at is null;
create index if not exists audit_events_workspace_level_recent on public.audit_events(workspace_id,level,created_at desc);
