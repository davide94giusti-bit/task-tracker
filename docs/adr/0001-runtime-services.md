# ADR 0001: Runtime-separated local services

Status: Accepted

Task Tracker uses separate child processes because failures, health checks, resource use, and contracts need enforceable boundaries. A layered single-process Electron backend was rejected. Loopback HTTP was selected because it is observable, testable from any service, supports timeouts and health endpoints, and requires no broker. It is secured by loopback binding, a per-launch token, strict origin behavior, payload limits, and correlation IDs.
