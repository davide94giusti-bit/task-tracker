# Connected release 16.17.0

## Connected JSON disaster recovery

Workspace owners can now validate and restore a Connected JSON backup. Supported modes are **restore into an empty workspace** and **replace current workspace**. Merge is intentionally not supported because duplicate resolution is not deterministic enough for a safe first release.

Exports use format v3 with SHA-256 data checksum, per-table counts, release/schema metadata, and an explicit exclusions list. Restore also accepts legacy format-v2 Connected exports and calculates their checksum during selection.

Before applying a restore, Task Tracker validates the file and database state, downloads a portable pre-restore safety export, requires an exact confirmation phrase, applies all 11 supported tables in one transaction, rewrites authority fields from the authenticated owner, recalculates task state, and records an internal safety snapshot, report, and audit event.

Push subscriptions, sessions, credentials, guest links/tokens, and notification delivery history are never restored. Reminder ownership is rewritten to the restoring owner and pending delivery is delayed by at least five minutes.

## Attachment and verification boundary

Connected JSON does not yet contain attachment metadata or file bytes. Replace mode is blocked when active attachments exist, preventing task deletion from orphaning files. Attachment ZIP archives, resumable file transfer, scheduled retention, and isolated temporary-workspace restore tests remain future phases and are not presented as active features.

## Migration and deployment

Apply `supabase/migrations/0021_connected_restore.sql`, then deploy in this order:

1. Data Worker
2. Backup Worker
3. API Gateway
4. Cloudflare Pages

The new frontend displays an actionable API error until the migration and Workers are deployed. Existing export and Local import routes remain compatible during rolling deployment.
