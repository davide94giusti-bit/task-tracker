# Backup and migration format

A `.zip` backup contains `metadata.json`, `data.json`, and a plain-text readme. Metadata includes `format`, `formatVersion`, `schemaVersion`, `appVersion`, creation time, description, table counts, and a SHA-256 checksum of `data.json`.

Validation parses both required files, verifies the format/version and checksum, and confirms task data exists. Replace mode uses the backup as the complete state; Merge mode inserts stable IDs without unnecessary duplication. Both modes validate before mutation and create a safety backup first. Data replacement is transactional.

Attachments are path references, not silently embedded. After computer migration, missing paths remain recorded so they can be repaired.
