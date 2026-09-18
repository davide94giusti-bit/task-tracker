# Task Tracker Connected v16.13 — Verified project collaboration

Base commit: `1b0f4fac16edc2e757e97d95b48d61573d59dbba` (functional v16.12 line).

## User-visible changes

- A recap link can expose all tasks assigned to one person or one complete project.
- Owners can independently grant checklist updates, task completion, and comments, and set an expiry date.
- Guests can read the shared scope without an account. Writes require a six-digit email code and a 30-minute verified session.
- Projects now have a **Project people** section. Owners can attach an existing People contact or create one there, choose whether phone, email, address, or notes are shared, and remove the project association without deleting the contact.
- Project-wide recipients can see shared project contacts and contact assignments only when those permissions are granted.
- Owners can mark individual project contacts as supervisable and independently allow a collaborator to update their checklist items or complete their tasks. This never grants access to arbitrary owner tasks.
- The optional advanced **Manage project contacts** permission lets an email-verified collaborator add, edit, or remove only contacts attached to the shared project. It is off by default; removal keeps the underlying People record.
- Existing completion guards still reject completion when required checklist items or mandatory prerequisites remain.
- A recipient who uses Task Tracker can claim the invitation with the matching account email. The project appears in **Projects → Linked projects**, separately from the recipient's private workspace.
- Collaborator actions are recorded in task activity with the actor and responsible contact kept separate (for example, “Marco completed the task on behalf of Anna”) and create an in-app notification for workspace owners/admins.
- Regenerating, revoking, or expiring the share removes both guest and linked-project access.
- Project cards now support rename/edit and delete. Deleting a project preserves its tasks under **No project**, revokes project collaboration, and records an audit event.

## Security model

- The signed recap token identifies only one share record; it does not create workspace membership.
- Authenticated claiming requires an exact case-insensitive match between the app account email and the People contact email.
- Linked projects do not change the recipient's active private workspace.
- All external writes are re-authorized in PostgreSQL against active share, expiry, scope, permission, workspace, assignment, project-contact association, the contact's supervisable flag, and optimistic record version.
- Project contacts are live references, not copies. The `project_people` association is workspace-validated and exposes only fields explicitly enabled by the owner; notes are private by default.
- Verification codes expire after ten minutes, are stored only as SHA-256 digests, allow five attempts, and are rate-limited to one request per 30 seconds.
- Verification sessions expire after 30 minutes and are kept in browser session storage rather than persistent local storage.
- Guest writes are online-only and are never placed in the offline queue.

## Deployment

1. Apply `supabase/migrations/0011_verified_project_collaboration.sql`.
2. Deploy `connected-data`.
3. Deploy `connected-tasks`.
4. Deploy `connected-people`.
5. Deploy `connected-notifications`.
6. Deploy `connected-backup-export`.
7. Deploy `connected-gateway`.
8. Deploy the Connected web build.

No new environment variables are required. Existing Resend configuration is required to send verification codes.

## Recovery

Before deployment, take a database backup. If application rollback is required, roll the frontend and four Workers back together. The migration is additive; its tables and columns can remain in place during application rollback. Do not drop collaboration data until all issued links and linked-project claims have been reviewed.

## Local parity

Connected-only by design in v16.13. Local receives no sharing or synchronization behavior. Add this capability to the formal Local/Connected parity matrix before the later reliability program.
