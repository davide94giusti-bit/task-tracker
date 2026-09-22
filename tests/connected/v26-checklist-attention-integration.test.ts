import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('v16.16.0 checklist attention integration', () => {
  it('routes typed attention, pressure and atomic checklist completion through Tasks', () => {
    const gateway = read('services-connected/api-gateway/index.ts');
    const tasks = read('services-connected/tasks/index.ts');
    const data = read('services-connected/data/index.ts');
    expect(gateway).toContain('/v1\\/tasks\\/checklist\\/attention');
    expect(gateway).toContain('/v1\\/tasks\\/deadline-pressure');
    expect(gateway).toContain('/v1\\/tasks\\/checklist\\/toggle');
    expect(tasks).toContain('buildChecklistAttention(items, query.date)');
    expect(tasks).toContain('buildDeadlinePressure');
    expect(data).toContain("deadline_work_items:'user_deadline_work_items'");
    expect(data).toContain("toggle_checklist_item:'user_toggle_checklist_item'");
  });

  it('enforces active-work and workspace rules in the migration', () => {
    const migration = read('supabase/migrations/0020_checklist_attention_deadline_pressure.sql');
    expect(migration).toContain('perform public.assert_connected_workspace(p_workspace_id)');
    expect(migration).toContain("t.status not in('completed','cancelled','archived')");
    expect(migration).toContain('c.deleted_at is null and not c.completed');
    expect(migration).toContain('item.version<>p_expected_version');
    expect(migration).toContain('revoke all on function public.user_toggle_checklist_item');
    expect(migration).toContain('checklist_active_deadline_workspace');
  });

  it('filters completed checklist items from Calendar while preserving unique task-card counts', () => {
    const migration = read('supabase/migrations/0020_checklist_attention_deadline_pressure.sql');
    expect(migration.match(/c\.deleted_at is null and not c\.completed/g)?.length).toBeGreaterThanOrEqual(3);
    expect(migration).toContain("'checklistDueDetails',checklist_due_details");
    expect(migration).toContain('count(*) count');
  });

  it('exposes separate checklist metrics, pressure drill-downs and accessible completion controls', () => {
    const ui = read('apps/connected-web/src/DeadlineAttention.tsx');
    expect(ui).toContain('Checklist due today');
    expect(ui).toContain('Checklist overdue');
    expect(ui).toContain('Deadline pressure');
    expect(ui).toContain("Complete checklist item ${item.title}");
    expect(ui).toContain("minHeight: 44");
    expect(ui).toContain('Carried-over overdue');
  });

  it('creates idempotent timezone-aware in-app notifications but does not claim push/email support', () => {
    const migration = read('supabase/migrations/0020_checklist_attention_deadline_pressure.sql');
    const notifications = read('services-connected/notifications/index.ts');
    const manual = read('apps/connected-web/src/UserManualView.tsx');
    expect(migration).toContain("'checklist-due:'||c.workspace_id::text||':'||m.user_id::text");
    expect(migration).toContain('pg_timezone_names');
    expect(notifications).toContain('checklistDueTodayInApp: true');
    expect(notifications).toContain('checklistPushEmail: false');
    expect(manual).toContain('Checklist push and email delivery are not active');
  });

  it('documents scoring, classification, overdue carry-forward and date independence', () => {
    const manual = read('apps/connected-web/src/UserManualView.tsx');
    expect(manual).toContain('a checklist date never changes the parent task date');
    expect(manual).toContain('Carried-over overdue work adds 2');
    expect(manual).toContain('Percentiles are used with four or more non-empty periods');
    expect(manual).toContain('Empty periods are No deadlines');
  });
});
