# Connected release 16.19.0

## Professional notification content and task deep links

- Replaces the minimal reminder email with a responsive, branded HTML and plain-text template.
- Reminder emails show the task deadline, project, priority, status, responsible person, and configured reminder time.
- Shared-work update emails use the same professional structure and include available task context.
- Push notifications now identify the task and include deadline/overdue, project, priority, and blocked context.
- Notification actions link to the exact task instead of only opening the application dashboard.
- Exact task destinations survive authentication and open the task details dialog after sign-in.
- Adds an installed-PWA launch handler for compatible Android, Chrome, Edge, and desktop environments.
- Keeps a safe pending destination for an installed application handoff.

## Platform behavior

Operating systems decide whether a web link is captured by an installed PWA. Compatible Chromium environments can open the installed application. iOS email clients cannot be forced to open a Home Screen PWA or silently share its authenticated session; the secure web destination is retained through sign-in. Push notifications originating from the installed iOS PWA open the authenticated app directly.

## Database and deployment

Migration `0023_professional_notifications.sql` enriches the scheduler claims with canonical, workspace-scoped task context. It does not expose service-role access to the browser.

Deploy in this order:

1. Supabase migration 0023
2. Data Worker
3. Notifications Worker
4. Reminders Worker
5. API Gateway
6. Cloudflare Pages
