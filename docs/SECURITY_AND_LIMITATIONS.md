# Security, privacy, and known limitations

Renderer Node integration is disabled, context isolation and sandboxing are enabled, and native operations use a narrow preload API. Services bind only to `127.0.0.1`; requests require an unlogged random launch token and correlation ID. External URLs are opened by the OS only for safe HTTP(S) schemes. User data is never transmitted or tracked.

Known limitations:

- The database is not encrypted. Windows account/disk encryption should protect data at rest. Task Tracker does not claim encryption.
- The free installer is unsigned and may trigger SmartScreen.
- Notifications require PriorityDesk processes to be running; Start with Windows is the local workaround.
- Attachment files are referenced, not embedded; moved files require path repair.
- Custom statuses are not enabled in v1 because fixed semantic statuses keep urgency/reporting deterministic.
- Recurring tasks generate their next occurrence when the current occurrence is completed; missed-occurrence catch-up while the application was closed is deliberately conservative.
