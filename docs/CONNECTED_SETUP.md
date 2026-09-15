# Connected owner setup

No secret value should be pasted into chat or committed to Git.

1. **GitHub:** open `github.com/new`, create a private or public repository, then run `git remote add origin <repository-url>` and `git push -u origin main`. Success: the complete source tree is visible.
2. **Supabase:** open the Supabase dashboard, select **New project**, choose the Free plan, and wait for green project health. Under **Project Settings → API**, copy the project URL and public anon key into `apps/connected-web/.env.local`. Store the service-role key only as Worker secrets.
3. **Database:** open **SQL Editor → New query**, paste `supabase/migrations/0001_connected_core.sql`, and run it once. Success: `schema_versions` contains version `1` and all application tables show RLS enabled.
4. **Owner:** under **Authentication → Users**, create/confirm your account. Set `OWNER_EMAIL_ALLOWLIST` to that email in every applicable Worker; do not commit the email. The first successful login atomically creates the owner workspace and entitlement.
5. **Cloudflare:** open **Workers & Pages**, connect the GitHub repository, create a Pages project named `task-tracker-connected`, use `npm run build:connected` and output `dist-connected`.
6. **Workers:** install Wrangler (`npm install --save-dev wrangler`) or use `npx wrangler`. Run `npm run build:connected`. Deploy in the order used by `npm run deploy:connected`: data, tasks, people, dependencies-progress, notifications, reminders, backup-export, logging-diagnostics, gateway.
7. **Secrets:** for each Worker that needs it, run `npx wrangler secret put INTERNAL_SERVICE_TOKEN --config cloudflare/<service>.wrangler.toml` using the same strong random value. Add `SUPABASE_SERVICE_ROLE_KEY` only to Data; `SUPABASE_URL` to Data/Gateway; `SUPABASE_ANON_KEY` to Gateway. Configure non-secret values from `cloudflare/.dev.vars.example` in Worker settings.
8. **Bindings:** open each Worker’s **Settings → Bindings** and verify it matches the checked-in TOML. Success: internal Workers have no public route and gateway `/v1/health` reports its dependencies.
9. **Resend:** create a free Resend account, open **Domains → Add domain** and add the shown DNS records, or use the permitted test sender during development. Create an API key and store it only in Notifications as `RESEND_API_KEY`; set `RESEND_FROM`. Use **Settings → Send test email**.
10. **VAPID:** generate a P-256 key pair locally using the documented `scripts/generate-vapid-keys.mjs` command, store the public URL-safe key as `VAPID_PUBLIC_KEY` and the private JWK as the Notifications secret `VAPID_PRIVATE_JWK`; set `VAPID_SUBJECT=mailto:<your-address>`.
11. **Cron:** the Reminder TOML contains `*/5 * * * *`. In **Worker → Triggers**, verify one Cron Trigger. Set `CRON_WORKSPACE_ID` and `CRON_OWNER_USER_ID` to the UUIDs shown in Supabase tables/Auth.
12. **Frontend:** set the Pages variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_API_BASE_URL`; redeploy. Success: the login page loads and application requests go only to the gateway.
13. **Domain:** optionally open Pages **Custom domains → Set up a custom domain**. Add its exact origin to `ALLOWED_ORIGINS` and redeploy Gateway.
14. **iPhone:** open the HTTPS site in Safari, tap **Share → Add to Home Screen**, launch the installed icon, sign in, then tap **Enable notifications**. iOS Web Push requires iOS/iPadOS 16.4+ and a Home Screen web app.
15. **Migration:** in Local, create a full backup. In Connected **Backup & import**, select it, inspect the dry-run counts/warnings, then explicitly apply. Local data is never removed.

Rollback: use Cloudflare **Deployments → Roll back** for each Worker/Pages; restore application data from a Connected JSON export. Supabase Free does not include automatic backups, so download periodic application exports.
