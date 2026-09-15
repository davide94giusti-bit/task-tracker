# Build and verification report

Version: 1.3.1
Build date: 2026-09-14

Automated verification completed successfully:

- Strict TypeScript project check.
- ESLint with zero errors and three warnings for retained, unused 1.0.1 compatibility view functions.
- Vitest: 5 files, 29 tests passed, including regression coverage for Today eligibility, typed drill-down filters, malformed dates, and explicit reminder/recurrence clearing.
- Production React/Vite and all Electron/service entry-point builds passed.
- Eight-process integration smoke test: all services healthy; authenticated Gateway routing, task creation, progress calculation, SQLite persistence, and backup generation passed.
- Headless Electron UI journey passed and produced screenshots for dashboard filtering, dark-theme contrast, project/person progress, dependency analysis/drill-down, calendar/day popup, and exact task navigation.
- Windows x64 unpacked payload generated and identified as `PE32+ x86-64`.
- Portable launcher identified as a valid NSIS PE executable containing the x64 payload.
- Packaged ASAR inspected for the frontend, secure bridge, schema, Gateway, and every local service.
- Executable metadata contains `Task Tracker` and version `1.3.1`; the ICO contains nine required resolutions.

Portable artifact: `release/Task Tracker-1.3.1-x64-Portable.exe`
SHA-256: `ef4333d9415ab01277703a1912821e8e617f3ae995eb303af56beaf6f4dca331`

The NSIS installer target could not be completed in this Linux environment because Electron Builder requires Wine to generate its uninstaller. The portable `.exe` completed successfully. The source retains the installer configuration for building on Windows or Linux CI with Wine.

Manual Windows-only checks still required on an actual Windows 10/11 x64 machine: launching the final portable file, native notification appearance, Start-with-Windows registration, taskbar/Explorer icon caching, display scaling, and update-over-existing-data. These cannot be truthfully certified from the Linux build container. The unsigned build may show SmartScreen.

The Vite build reports one non-fatal bundle-size advisory for the renderer. Task data remains paginated at service boundaries, and this warning does not affect correctness.
