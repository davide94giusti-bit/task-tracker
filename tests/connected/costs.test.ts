import { describe, expect, it } from 'vitest';
import { buildCostSummary } from '../../services-connected/tasks/costs';

const tasks = [
  { id: 'future', title: 'Future task', status: 'in_progress', projectId: 'home', dueDate: '2026-10-10', costAmount: 100 },
  { id: 'past', title: 'Past task', status: 'completed', projectId: 'home', completedAt: '2025-04-10T10:00:00Z', costAmount: null },
  { id: 'na', title: 'No applicable cost', status: 'not_started', projectId: null, dueDate: '2026-11-01', costAmount: null },
];
const checklist = [
  { taskId: 'future', costAmount: 25.5 },
  { taskId: 'past', costAmount: 40 },
  { taskId: 'na', costAmount: null },
];

describe('connected cost summaries', () => {
  it('adds checklist values to task cost while preserving N/A', () => {
    const result = buildCostSummary({ tasks, checklist, projects: [{ id: 'home', name: 'Home' }], currencyCode: 'CHF' });
    expect(result.allTime).toEqual({ past: 40, future: 125.5, total: 165.5 });
    expect(result.entries.map((entry) => entry.taskId)).not.toContain('na');
    expect(result.entries.find((entry) => entry.taskId === 'future')).toMatchObject({ taskCost: 100, checklistCost: 25.5, totalCost: 125.5 });
  });

  it('filters months and only exposes comparisons for years with data', () => {
    const result = buildCostSummary({ tasks, checklist, projects: [{ id: 'home', name: 'Home' }], year: 2026, month: 10, compareYear: 2025 });
    expect(result.totals.total).toBe(125.5);
    expect(result.compareYear).toBe(2025);
    expect(result.availableYears).toEqual([2026, 2025]);
    expect(result.monthly[3].compareTotal).toBe(40);
    expect(result.comparisonEntries.map((entry) => entry.taskId)).toEqual(['past']);
  });

  it('hides a requested comparison year when it contains no costs', () => {
    const result = buildCostSummary({ tasks, checklist, projects: [], year: 2026, compareYear: 2024 });
    expect(result.compareYear).toBeNull();
    expect(result.monthly.every((month) => month.compareTotal === undefined)).toBe(true);
  });
});
