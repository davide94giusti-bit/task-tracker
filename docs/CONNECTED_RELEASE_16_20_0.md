# Connected 16.20.0 — checklist scheduling and project invitations

## Included

- Full-screen checklist create/edit flow with project and parent-task context.
- Independent checklist due date and optional due time.
- Optional checklist amount and cost date in the dedicated editor.
- Two validated relative reminder slots from 48 hours to 30 minutes before.
- Atomic, version-checked checklist and reminder persistence.
- Checklist push, email, and in-app delivery through the existing scheduler.
- Automatic cancellation when an item or parent task becomes inactive.
- Full-screen Project people workflow for existing or new contacts.
- Optional project invitation permissions and expiry.
- Short non-sequential invitation codes backed by hashed lookup and signed shares.
- Hashed-client rate limiting and attempt logging for public invitation lookup.
- Explicit guest/account onboarding and acceptance; accepted projects remain live under Shared with me.
- PWA installation return-path preservation for invitation links.

## Database and deployment

Apply `supabase/migrations/0025_checklist_editor_project_invitations.sql`, then deploy in this order:

1. Data Worker
2. Tasks Worker
3. Notifications Worker
4. Reminders Worker
5. People Worker
6. API Gateway
7. Cloudflare Pages

Older clients continue to save checklist items with no due time and no relative reminders.

## Deliberate limitations

- New Task Tracker accounts remain invite-only. The onboarding flow offers guest access or sign-in for an existing invited account; it does not open public self-registration.
- Invitation creation produces Copy link and Email invitation actions. It does not send transactional invitation email automatically.
- Connected JSON backup includes checklist dates, times, and cost fields through the checklist record, but the derived relative-reminder schedule table is not yet included. After a restore, review and re-save reminder-enabled checklist items before relying on delivery.
- iPhone and iPad decide whether an HTTPS invitation opens Safari or an installed Home Screen app. Task Tracker preserves the destination through sign-in and supported installation flows but cannot override Apple’s link-routing decision.
