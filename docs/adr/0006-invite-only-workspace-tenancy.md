# ADR 0006: Invite-only workspace tenancy

Status: accepted.

Each accepted identity receives a private workspace by default. Membership is resolved by the backend, and normal PostgreSQL access uses the user's JWT so RLS is the primary enforcement layer with explicit workspace filters as defense in depth. Platform administration is stored in the database; a bootstrap email setting exists only for the first administrator. Contacts in People are not identities. Scheduled reminders are claimed globally through a narrow privileged RPC and delivered using recipient-specific preferences and subscriptions.

This preserves future explicit collaboration while preventing implicit sharing and avoiding a permanent email allowlist or static cron workspace.
