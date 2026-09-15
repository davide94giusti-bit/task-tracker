# Connected deployment bundle

This bundle contains the built Cloudflare Pages application, ten built Worker modules, Worker configuration, the forward-only Supabase migrations, deployment script, contracts, and setup documentation.

Before deployment, back up Supabase and validate migration `0002_invite_only_multitenancy.sql` in staging. Configure secrets outside source control. Deploy with the repository workflow or from the complete source package; the bundle itself intentionally contains no credentials.

The first platform administrator is bootstrapped through `BOOTSTRAP_OWNER_EMAILS` once. Clear that value afterward and use **Users & access** for database-backed invitations. Do not enable public Supabase signup.
