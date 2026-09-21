import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DisplayNameUpdate } from '../../packages/connected-contracts';
import { buildCostSummary } from '../../services-connected/tasks/costs';

const editor = readFileSync('apps/connected-web/src/ConnectedEnhancements.tsx', 'utf8');
const manual = readFileSync('apps/connected-web/src/UserManualView.tsx', 'utf8');
const security = readFileSync('apps/connected-web/src/AccessViews.tsx', 'utf8');
const accessibleField = readFileSync('apps/connected-web/src/AccessibleTextField.tsx', 'utf8');
const migration = readFileSync('supabase/migrations/0018_profile_and_cost_date_reliability.sql', 'utf8');

describe('animated guides, reliable cost dates and editable profiles', () => {
  it('places a task cost in the selected cost-date month without a due date', () => {
    const result = buildCostSummary({
      tasks: [{ id: 'package', title: 'PT lessons', status: 'in_progress', projectId: 'gym', createdAt: '2025-01-01T10:00:00Z', dueDate: null, costAmount: 550, costDate: '2026-09-21' }],
      checklist: [],
      projects: [{ id: 'gym', name: 'Gym' }],
      year: 2026
    });
    expect(result.totals.total).toBe(550);
    expect(result.monthly.find((month: { month: number }) => month.month === 9)?.total).toBe(550);
    expect(result.entries[0]).toMatchObject({ costDate: '2026-09-21', date: '2026-09-21' });
  });

  it('reopens the editor from canonical task details and preserves cost fields on completion', () => {
    expect(editor).toContain('applyTask(details.task)');
    expect(editor).toContain("costDate: shownTask.costDate || null");
    expect(editor).toContain('Used immediately in the financial graph');
  });

  it('provides a controllable animated walkthrough with reduced-motion support', () => {
    expect(manual).toContain('Animated walkthrough');
    expect(manual).toContain("prefers-reduced-motion: reduce");
    expect(manual).toContain('Pause walkthrough');
    expect(manual).toContain('Replay walkthrough');
  });

  it('validates and persists editable display names', () => {
    expect(DisplayNameUpdate.parse({ displayName: 'Davide' })).toEqual({ displayName: 'Davide' });
    expect(() => DisplayNameUpdate.parse({ displayName: 'D' })).toThrow();
    expect(security).toContain("'/access/profile'");
    expect(migration).toContain('update_connected_profile');
  });

  it('assigns a stable id and name to every shared text field', () => {
    expect(accessibleField).toContain('id={fieldId}');
    expect(accessibleField).toContain('name={fieldName}');
  });
});
