# Connected release 16.18.2

## Overall progress

- Renames Overall workload to Overall progress.
- Shows active-task progress and active-parent checklist completion as two separate progress bars.
- Shows remaining active-task and open-checklist counts.
- Opens the corresponding task or checklist Work list when a progress row is selected.
- Keeps checklist progress independent instead of blending it into the task percentage and double-counting child work.

## Deployment

This release changes the Tasks Worker response and Connected frontend. It requires no database migration. Deploy the Tasks Worker, API Gateway and Cloudflare Pages together. The service-worker cache advances to 16.18.2.

During a staged rollout, the frontend falls back to existing checklist metrics until the updated Tasks Worker is available.
