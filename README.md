# Task Tracker

Task Tracker contains two intentionally separate editions:

- **Task Tracker Local** is the existing Windows Electron application with eight runtime-separated local services and SQLite. It requires no account, cloud server, subscription, telemetry, or internet connection.
- **Task Tracker Connected** is an authenticated, mobile-first PWA with nine separately deployed Cloudflare Workers, a single PostgreSQL-owning Data Worker, Supabase Auth/PostgreSQL, Web Push, and optional Resend email.

Local never depends on Connected and installations never silently share data.

## Quick start

Requirements for development: Node.js 22 or newer and npm.

```powershell
npm install
npm run dev
```

Quality checks and production build:

```powershell
npm run verify
npm run build
npm run dist:win
```

Connected development and production build:

```powershell
copy apps\connected-web\.env.example apps\connected-web\.env.local
npm run dev:connected
npm run typecheck:connected
npm run test:connected
npm run build:connected
```

See [Connected architecture](docs/CONNECTED_ARCHITECTURE.md), [owner setup](docs/CONNECTED_SETUP.md), [security](docs/CONNECTED_SECURITY.md), and [current free-tier limits](docs/CONNECTED_FREE_TIERS.md).

Windows outputs are created in `release`. The portable executable is unsigned; Windows SmartScreen may therefore show a warning. No paid code-signing certificate is required. The checked-in build targets Windows x64 (Windows 10/11); Windows on ARM is not certified.

## Project map

- `apps` are represented by `src/main` (desktop shell) and `src/renderer` (frontend).
- `services/*` contains independently running local services.
- `packages/contracts` contains versioned schemas and envelopes.
- `src/main/database.ts` uses the Electron/Node built-in SQLite runtime and is imported only by the Data service.
- `src/shared` contains UI-safe data types and deterministic calculation functions used by the dependency/progress service.
- `tests` contains business, contract, repository, integration, and failure-boundary tests.
- `docs` contains architecture, ADRs, backup format, user and developer manuals, security notes, and licensing.

## Local data

On Windows, application data is stored below `%APPDATA%\PriorityDesk` (the exact Electron `userData` path):

- `prioritydesk.db` — authoritative SQLite database.
- `backups\` — dated portable backup packages.
- `logs\structured.jsonl` — structured local service logs.

Normal updates preserve this directory. Uninstall does not delete it by default.

See [docs/USER_MANUAL.md](docs/USER_MANUAL.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), and [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).
