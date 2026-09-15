# ADR 0003: Supervision and failure policy

Status: Accepted

Electron starts services in dependency order and opens the window only after readiness. A crashed process is restarted at most twice with backoff and its prior loopback port. Reminders and logging are non-critical; Data, gateway, Tasks, People, Progress, and Backup are required. Shutdown first requests graceful termination, then kills stragglers after 2.5 seconds.
