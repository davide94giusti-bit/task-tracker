# Connected release 16.18.1

## Dashboard metric parity

- Tasks and Checklist items now use the same card component, dimensions, typography, spacing and order.
- Both groups show Open, Overdue, Due today, Next 7 days and Completed.
- The sixth card remains specific to the entity: Needs attention for distinct critical-or-blocked tasks, and Required for incomplete required checklist items.
- Every card opens the corresponding filtered Work view.

## Deployment

Apply `supabase/migrations/0022_dashboard_metric_parity.sql`, then deploy Data Worker, Tasks Worker, API Gateway and Cloudflare Pages. The application-shell cache advances to 16.18.1.

The migration preserves the existing dashboard response fields and adds `counts.completed` and `counts.needsAttention`, so an older frontend continues to work while services are rolled out.
