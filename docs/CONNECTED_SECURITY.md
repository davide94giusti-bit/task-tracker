# Connected security and threat model

Primary assets are task content, people/contact details, reminder schedules, session tokens, push subscriptions, and provider credentials. Primary threats are cross-workspace access, stolen tokens, hostile origins, malformed graph/import payloads, duplicate schedules, injection in email, and secrets in logs/builds.

Controls: Supabase validates sessions; Gateway repeats authorization and resolves one active workspace membership; exact CORS origins are required; every application table has RLS; internal Workers use service bindings plus a secret token; only Data has the service-role key; Zod validates public writes; request bodies and timeouts are bounded; SQL transactions and version checks protect consistency; graph recursion records visited nodes; notification and import identifiers are unique; HTML is escaped; CSP and security headers are shipped; diagnostic exports omit tokens, email bodies and push secrets.

CSRF risk is limited because application APIs require an explicit bearer token and do not use ambient cookies. XSS remains important because the access token is browser-held; CSP, React escaping, no `dangerouslySetInnerHTML`, short Supabase sessions, and logout reduce exposure. The PWA should be served only over HTTPS.

Attachments are schema-ready but UI upload remains disabled until MIME allowlists, 25 MB application limits, malware guidance, and signed short-lived download URLs are enabled. Never expose a public storage bucket.
