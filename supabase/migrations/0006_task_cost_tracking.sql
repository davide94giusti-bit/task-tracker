begin;

alter table public.tasks
  add column if not exists cost_amount numeric(14,2)
  check (cost_amount is null or cost_amount >= 0);

alter table public.checklist_items
  add column if not exists cost_amount numeric(14,2)
  check (cost_amount is null or cost_amount >= 0);

alter table public.notification_preferences
  add column if not exists currency_code text not null default 'CHF'
  check (currency_code ~ '^[A-Z]{3}$');

comment on column public.tasks.cost_amount is
  'Optional task-level cost. NULL means not applicable; zero is a valid amount.';
comment on column public.checklist_items.cost_amount is
  'Optional checklist-item cost included in the parent task total.';
comment on column public.notification_preferences.currency_code is
  'Single currency used by the private connected workspace.';

commit;
