# Connected release 16.19.1

## Calendar notification separation

- Reminder and notification timestamps no longer create Calendar cards, day counts, or day-dialog entries.
- Calendar remains focused on task due dates, incomplete checklist due dates, and task completion dates.
- Existing task-reminder delivery through in-app notifications, push, and email is unchanged.
- The Calendar subtitle and User Manual now state the separation explicitly.

## Database and deployment

Migration `0024_calendar_deadlines_only.sql` replaces the canonical workspace-scoped Calendar function and removes `reminder_at` from its inclusion criteria. It preserves RLS and service-only execution.

Deploy in this order:

1. Supabase migration 0024
2. Data Worker
3. Tasks Worker
4. API Gateway
5. Cloudflare Pages

Notifications and Reminders Workers do not change in this release.
