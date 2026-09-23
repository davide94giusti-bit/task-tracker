import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');

describe('v16.19.1 calendar notification separation', () => {
  it('overrides the canonical calendar query without reminder timestamps', () => {
    const migration = read('supabase/migrations/0024_calendar_deadlines_only.sql');
    expect(migration).toContain('create or replace function public.connected_calendar');
    expect(migration).toContain('t.due_date=d.d or t.completed_at::date=d.d');
    expect(migration).toContain('not c.completed and c.due_date=d.d');
    expect(migration).not.toContain('t.reminder_at::date=d.d');
  });

  it('keeps reminder delivery intact while describing Calendar as deadline-only', () => {
    const app = read('apps/connected-web/src/App.tsx');
    const reminders = read('services-connected/reminders/index.ts');
    expect(app).toContain('Notifications and project start dates are excluded.');
    expect(reminders).toContain('claim-deliveries');
  });

  it('documents that notification timestamps never affect calendar cards or counts', () => {
    const manual = read('apps/connected-web/src/UserManualView.tsx');
    expect(manual).toContain('they never create Calendar numbers, cards, or day-dialog entries');
    expect(read('packages/connected-contracts/release.ts')).toContain("'16.19.1'");
  });
});
