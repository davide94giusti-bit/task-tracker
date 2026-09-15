# Invite-only connected edition

This edition keeps the local Windows application independent and offline. The connected PWA uses ten independently deployed Cloudflare Workers, Supabase Auth/PostgreSQL, Row Level Security, and optional Resend/Web Push delivery.

## Tenancy and onboarding

- Public signup is disabled. A platform administrator creates an invitation from **Users & access**.
- Invitation acceptance calls `accept_app_invitation`, which provisions one private workspace, owner membership, profile, notification preferences, and free entitlement in an idempotent transaction.
- `one_personal_workspace_per_user` prevents duplicate personal workspaces during retries or concurrent tabs.
- Application users and People contacts are separate concepts. Matching email addresses never grant access.
- A configurable application safety limit defaults to 20 accepted or pending users.

## Authorization

The gateway validates the Supabase bearer token, then resolves workspace and role server-side through `identity-access`; browser-supplied workspace or role values are ignored. Normal Data Worker CRUD uses the user's access token plus the publishable key, so PostgreSQL RLS remains active. The secret key is limited to invitation administration, provisioning, scheduler claims, access changes, and deletion preparation.

Migration `0002_invite_only_multitenancy.sql` adds invitation and administrator records, account states, cross-workspace relationship guards, private-workspace uniqueness, scheduler claims, usage reporting, and forward-only schema version 2. Apply it to a backed-up staging project before production.

## Reminders and free-tier safeguards

The cron Worker no longer uses a static workspace or owner. It claims due deliveries across active workspaces in bounded batches using `FOR UPDATE SKIP LOCKED`. Each claim contains the recipient user and workspace, and notification subscriptions are queried with both identifiers. Delivery IDs are idempotency keys; retries use bounded backoff. Email is opt-in and stopped by the configurable `EMAIL_DAILY_CEILING` while push and in-app behavior remain available.

## Required owner configuration

1. Disable public signup in Supabase and configure the connected HTTPS URL for invitation and recovery redirects.
2. Back up the database, then apply `0002_invite_only_multitenancy.sql` once.
3. Configure `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` for the gateway/data Workers.
4. Store `SUPABASE_SECRET_KEY`, `INTERNAL_SERVICE_TOKEN`, `RESEND_API_KEY`, and the VAPID private key as Worker secrets.
5. Set `BOOTSTRAP_OWNER_EMAILS` only for the initial administrator, sign in and accept/bootstrap once, then clear it.
6. Deploy Data, Identity Access, capability Workers, Gateway, and finally Pages.
7. Configure GitHub secrets `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_BASE_URL`, `VITE_VAPID_PUBLIC_KEY`, and `VITE_APP_URL`.

Free-tier availability and limits can change. Provider outages degrade notification or connected access without affecting the separate local Windows edition.
