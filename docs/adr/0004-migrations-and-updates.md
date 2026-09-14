# ADR 0004: Migrations and updates

Status: Accepted

Numbered, forward-only schema migrations are recorded in `schema_migrations`. A safety backup is required before future schema-changing migrations. Application binaries and user data are separate, so normal installer updates do not replace the database. Backup metadata carries application, schema, and format versions; newer unsupported formats are rejected before mutation.
