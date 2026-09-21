import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ChecklistWrite, InvitationAccept, TaskWrite } from '../../packages/connected-contracts';
import { buildCostSummary } from '../../services-connected/tasks/costs';

const migration = readFileSync('supabase/migrations/0017_task_scheduling_finance_profiles.sql', 'utf8');
const editor = readFileSync('apps/connected-web/src/ConnectedEnhancements.tsx', 'utf8');
const manual = readFileSync('apps/connected-web/src/UserManualView.tsx', 'utf8');

describe('scheduling, checklist completion, finance and profile improvements', () => {
  it('validates recurring reminders, cost dates and checklist dates', () => {
    expect(TaskWrite.parse({ title: '16 PT lessons', reminderAt: '2026-09-22T08:00:00.000Z', reminderRepeat: 'weekly', reminderRepeatInterval: 1, costAmount: 550, costDate: '2026-09-21', completeWhenChecklistDone: true })).toMatchObject({ reminderRepeat: 'weekly', costDate: '2026-09-21', completeWhenChecklistDone: true });
    expect(ChecklistWrite.parse({ taskId: crypto.randomUUID(), description: 'Lesson 1', dueDate: '2026-09-24' }).dueDate).toBe('2026-09-24');
    expect(() => TaskWrite.parse({ title: 'Bad interval', reminderRepeat: 'daily', reminderRepeatInterval: 0 })).toThrow();
  });

  it('includes an undated task cost in the year of its creation', () => {
    const result = buildCostSummary({ tasks: [{ id: 'package', title: 'PT package', status: 'in_progress', projectId: 'gym', createdAt: '2026-09-21T10:00:00Z', dueDate: null, completedAt: null, costAmount: 550 }], checklist: [], projects: [{ id: 'gym', name: 'Gym' }], year: 2026 });
    expect(result.totals.total).toBe(550);
    expect(result.entries[0]).toMatchObject({ date: '2026-09-21T10:00:00Z', timing: 'past' });
  });

  it('enforces recurring delivery and checklist-driven completion in the database', () => {
    expect(migration).toContain('next_task_reminder_occurrence');
    expect(migration).toContain("t.reminder_repeat in ('daily','weekly','monthly')");
    expect(migration).toContain('auto_completed_from_checklist=true');
    expect(migration).toContain("status='in_progress'");
    expect(migration).toContain("'dueDate',c.due_date");
  });

  it('collects a display name and uses structured manual annotations', () => {
    expect(InvitationAccept.parse({ displayName: 'Davide Giusti' }).displayName).toBe('Davide Giusti');
    expect(() => InvitationAccept.parse({ displayName: 'D' })).toThrow();
    expect(migration).toContain('p_display_name text');
    expect(editor).toContain('Complete task automatically when every checklist item is done');
    expect(manual).toContain('TouchAppRounded');
    expect(manual).not.toContain('ArrowForwardRounded');
    expect(manual).not.toContain('content: \'"➜"\'');
  });
});
