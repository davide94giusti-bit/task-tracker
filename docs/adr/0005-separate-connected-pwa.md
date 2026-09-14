# ADR 0005: separate Connected PWA and cloud services

Status: accepted.

The accountless Local edition remains unchanged. Connected is a PWA because it gives iPhone/Android/desktop access and standards-based push without App Store fees. Cloudflare Workers provide separately deployable capability processes and private service bindings; Supabase supplies Auth and PostgreSQL; Resend supplies optional email. The Data Worker alone has application write credentials. Automatic bidirectional Local/Connected synchronization is deferred because offline graph edits, reminders and deletion need a more mature conflict protocol. Neutral entitlements prepare future licensing without billing or disabling features.
