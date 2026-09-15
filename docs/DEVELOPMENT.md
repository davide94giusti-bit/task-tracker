# Developer guide

## Commands

- `npm run dev` — build all process entry points and launch the complete environment.
- `npm run typecheck` — strict TypeScript validation.
- `npm run lint` — static checks.
- `npm test` — service rules, contracts, and Data repository tests.
- `npm run build` — renderer plus all local runtime processes.
- `node scripts/smoke-services.mjs` — launches the eight-process backend and verifies health, task persistence, progress, and backup.
- `npm run dist:win` — unsigned Windows x64 NSIS installer and portable executable.
- `powershell -ExecutionPolicy Bypass -File scripts/generate-windows-icon.ps1` — reproducibly rebuild the multi-resolution icon from `build/icon-source.png` (ImageMagick 7 required).

No environment configuration is required in the packaged product. During startup, the supervisor injects only ephemeral local addresses/token plus the application data/schema locations.

## Adding a migration

Add an ordered migration, create a pre-migration safety backup, execute it inside Data, record its number in `schema_migrations`, and add forward-compatibility and rollback-safety tests. Never let another service import the SQLite driver.

## Testing failure boundaries

Tests use temporary directories only. Failure scenarios should start the compiled services, terminate or delay the selected child, assert the named health state/error envelope, and verify the database or last valid backup remains readable. Never point tests at the production `userData` directory.
