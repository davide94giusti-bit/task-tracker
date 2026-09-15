# Free-tier operating envelope (verified 2026-09-14)

Provider limits can change; check the linked official pages before deployment.

| Provider | Current free allowance relevant here | Design consequence |
| --- | --- | --- |
| Cloudflare Workers | 100,000 requests/day, 10 ms CPU per HTTP/Cron invocation, 128 MB memory, 50 subrequests/request, 100 Workers, 5 Cron Triggers | One five-minute bounded reminder cron; short gateway/capability calls; no paid queue. |
| Supabase | 500 MB database, 1 GB file storage, 5 GB egress + 5 GB cached egress, 50,000 MAU, two active projects | Suitable for one personal workspace; export regularly and monitor size. |
| Supabase inactivity | Free projects may pause after one week of inactivity; automatic backups/PITR are not included | First request after a pause may fail or be delayed; app-level exports are required. |
| Resend | 3,000 emails/month, 100/day, three domains | Summaries are opt-in; delivery is bounded and idempotent. Domain verification may be required. |
| iOS Web Push | iOS/iPadOS 16.4+, installed Home Screen web app, user gesture and permission | Browser tab alone is insufficient on iPhone; email remains fallback. No Apple Developer membership is required. |

Official references: Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits/ ; Supabase pricing: https://supabase.com/pricing ; Resend pricing: https://resend.com/pricing ; WebKit iOS Web Push: https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/ .

The initial deployment requires no paid subscription, but availability and quotas are provider-controlled and not guaranteed permanently. Exceeding a quota can delay notifications or return service errors; it never changes or deletes Local-edition data.
