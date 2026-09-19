# Task Tracker Connected v16.13.1 — collaboration and mobile reliability

This hotfix keeps the existing Connected architecture and security boundaries while repairing the v16.13 collaboration release.

## Reliability fixes

- Corrects all eight collaboration database functions that previously assigned the result of a `void` workspace assertion to a UUID.
- Preserves downstream service HTTP status codes through the API gateway and lets Projects render owned or linked projects when only one source fails.
- Keeps mobile sign-in in the React session without a forced reload, uses a safe in-memory fallback when browser storage is unavailable, and serializes token refreshes.
- Updates the PWA cache namespace and requests service-worker updates without using the HTTP cache.
- Uses the linked-project token consistently when restoring its short-lived verification session, so explicitly permitted checklist changes work after opening a linked project.
- Classifies shared tasks by task status. A task with no checklist is no longer treated as completed.

## Interface changes

- Highlights today in Calendar with a green outline.
- Removes project initial avatars and uses the project colour as a restrained card accent.
- Gives Settings and Security distinct icons and standardizes action-button typography and sizing.
- Reorganizes notification and reminder controls, adds state-aware labels, and compacts readiness information.
- Adds confirmed disable/re-enable controls for accepted users; user groups and recap collaboration settings start collapsed.
- Standardizes refresh actions and presents Connected services as compact status cards.
- Adds annotated visual guides to every in-app manual chapter using real Task Tracker screenshots.

## Validation

The release includes regression coverage for authentication, linked-project verification, task-status filtering, gateway status preservation, the corrected migration, Calendar highlighting, and account lifecycle controls.
