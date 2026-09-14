# ADR 0002: One SQLite owner

Status: Accepted

Only Data imports the SQLite driver. Multiple direct writers would create hidden coupling, increase lock contention, and make cross-record rollback unreliable. Data exposes controlled v1 repository contracts, enables foreign keys and WAL, owns migrations, and performs transactions and integrity checks.
