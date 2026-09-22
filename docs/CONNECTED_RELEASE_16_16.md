# Connected release 16.16.0

## Checklist Attention and Deadline Pressure

This release keeps parent-task deadlines and checklist-item deadlines independent while making both visible. Today gains overdue and due-today checklist sections with version-checked direct completion. Dashboard gains separate checklist metrics and a drillable 28-day/12-week Deadline Pressure timeline. Calendar excludes completed checklist items and adds a secondary pressure indicator without changing its unique parent-task count.

The canonical deadline dataset is produced by `user_deadline_work_items`; React and the API Gateway do not reinterpret active-work rules. Tasks and incomplete checklist items are scored in the Tasks Worker from the same snapshot. Empty periods are `No deadlines`. Four or more non-empty periods use interpolated non-zero percentiles (50/75/90); smaller samples use the documented non-zero-median fallback.

The existing Reminders scheduler creates an idempotent in-app notification for each incomplete checklist item due today in the recipient’s configured timezone. Checklist push and email delivery remain a follow-up; existing task-reminder push/email is unchanged.

## Database migration

Back up Supabase, then run `supabase/migrations/0020_checklist_attention_deadline_pressure.sql` once in the Supabase SQL Editor. Confirm `public.schema_versions` contains `20` before deploying the new frontend.

The migration is additive and includes:

- Permission-checked canonical deadline and checklist-toggle functions.
- Active task/checklist deadline indexes.
- Checklist notification metadata.
- Corrected Calendar filtering and checklist detail payloads.
- Idempotent checklist-due notification enqueueing.

## Coordinated deployment order

1. Supabase migration `0020_checklist_attention_deadline_pressure.sql`.
2. Data Worker.
3. Tasks Worker.
4. Notifications Worker and Reminders Worker.
5. API Gateway.
6. Cloudflare Pages.

The migration and Workers are backward compatible with the older frontend. During the opposite partial-deployment state, the new panels show an actionable “finish the v16.16.0 database and Workers deployment” error while existing task details, task lists, costs, and Calendar remain usable.

## Rollback

Roll back Pages and Workers together if necessary. The migration is forward-only and additive; leave it installed during application rollback so notification records and new metadata are preserved.
