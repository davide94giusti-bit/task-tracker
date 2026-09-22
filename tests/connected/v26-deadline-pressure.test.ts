import { describe, expect, it } from 'vitest';
import { buildChecklistAttention, buildDeadlinePressure, classifyPeriods, type DeadlineWorkItem, type PressurePeriod } from '../../services-connected/tasks/deadlines';

const item = (overrides: Partial<DeadlineWorkItem> = {}): DeadlineWorkItem => ({
  kind: 'task', id: crypto.randomUUID(), dueDate: '2026-09-21', title: 'Task', taskId: crypto.randomUUID(),
  taskTitle: 'Task', taskDueDate: '2026-09-21', taskStatus: 'in_progress', taskPriority: 'medium',
  taskBlocked: false, taskVersion: 1, version: 1, required: null, projectId: null, projectName: 'No project',
  responsiblePersonId: null, responsiblePersonName: 'Unassigned', ...overrides,
});
const build = (items: DeadlineWorkItem[], startDate = '2026-09-21', today = '2026-09-21') => buildDeadlinePressure({ items, startDate, today, days: 28, weeks: 12, weekStartsOn: 1 });

describe('canonical checklist attention and deadline pressure', () => {
  it('keeps task and checklist deadlines independent and counts both entity types', () => {
    const taskId = crypto.randomUUID();
    const task = item({ id: taskId, taskId, dueDate: '2026-09-30', taskDueDate: '2026-09-30' });
    const checklist = item({ kind: 'checklist', taskId, dueDate: '2026-09-21', taskDueDate: '2026-09-30', title: 'Early step', required: false });
    const attention = buildChecklistAttention([task, checklist], '2026-09-21');
    expect(attention.dueToday).toEqual([checklist]);
    expect(build([task, checklist]).daily[0]).toMatchObject({ taskCount: 0, checklistCount: 1 });
  });

  it('scores five normal checklist items below two critical tasks', () => {
    const checklists = Array.from({ length: 5 }, () => item({ kind: 'checklist', required: true }));
    const critical = Array.from({ length: 2 }, () => item({ taskPriority: 'critical' }));
    expect(build(checklists).daily[0].score).toBe(5);
    expect(build(critical).daily[0].score).toBe(10);
  });

  it('applies high and critical weights and checklist inheritance once', () => {
    const result = build([
      item({ taskPriority: 'high' }), item({ taskPriority: 'critical' }),
      item({ kind: 'checklist', taskPriority: 'high' }), item({ kind: 'checklist', taskPriority: 'critical' }),
    ]).daily[0];
    expect(result.score).toBe(3 + 5 + 2 + 3);
  });

  it('carries overdue work into today and the current week only', () => {
    const overdue = item({ dueDate: '2026-09-18' });
    const result = build([overdue]);
    expect(result.daily[0]).toMatchObject({ overdueCount: 1, score: 4 });
    expect(result.daily[1].overdueCount).toBe(0);
    expect(result.weekly[0]).toMatchObject({ overdueCount: 1, score: 4 });
    expect(result.weekly[1].overdueCount).toBe(0);
  });

  it('applies the blocked bonus once per distinct parent task', () => {
    const taskId = crypto.randomUUID();
    const result = build([
      item({ kind: 'checklist', taskId, taskBlocked: true }),
      item({ kind: 'checklist', taskId, taskBlocked: true }),
      item({ kind: 'checklist', taskId, taskBlocked: true }),
    ]).daily[0];
    expect(result.blockedTaskCount).toBe(1);
    expect(result.score).toBe(4);
    expect(result.items.filter(entry => entry.blockedBonus === 1)).toHaveLength(1);
  });

  it('deduplicates canonical rows and aggregates daily work into its week', () => {
    const task = item();
    const result = build([task, task]);
    expect(result.daily[0].taskCount).toBe(1);
    expect(result.weekly[0].taskCount).toBe(1);
  });

  it('keeps date-only deadlines stable and respects configured week boundaries', () => {
    const sunday = item({ dueDate: '2026-09-27' });
    const mondayWeek = buildDeadlinePressure({ items: [sunday], startDate: '2026-09-21', today: '2026-09-21', days: 28, weeks: 12, weekStartsOn: 1 });
    const sundayWeek = buildDeadlinePressure({ items: [sunday], startDate: '2026-09-21', today: '2026-09-21', days: 28, weeks: 12, weekStartsOn: 0 });
    expect(mondayWeek.weekly[0]).toMatchObject({ startDate: '2026-09-21', endDate: '2026-09-27', taskCount: 1, heaviestDate: '2026-09-27' });
    expect(sundayWeek.weekly[0]).toMatchObject({ startDate: '2026-09-20', endDate: '2026-09-26', taskCount: 0 });
    expect(mondayWeek.daily.find(day => day.date === '2026-09-27')?.taskCount).toBe(1);
  });

  it('computes a heaviest day for weeks beyond the 28-day daily horizon', () => {
    const future = item({ dueDate: '2026-11-18', taskPriority: 'critical' });
    const result = build([future]);
    expect(result.weekly.find(week => week.startDate === '2026-11-16')?.heaviestDate).toBe('2026-11-18');
  });

  it('classifies all-zero, tied, small and outlier horizons deterministically', () => {
    const period = (score: number): PressurePeriod => ({ taskCount: 0, checklistCount: 0, overdueCount: 0, criticalCount: 0, highCount: 0, blockedTaskCount: 0, score, level: 'no_deadlines', items: [] });
    const empty = [period(0), period(0)];
    expect(classifyPeriods(empty).method).toBe('all_zero');
    expect(empty.every(value => value.level === 'no_deadlines')).toBe(true);
    const small = [period(4), period(4), period(12)];
    expect(classifyPeriods(small).method).toBe('median_fallback');
    expect(small.map(value => value.level)).toEqual(['moderate', 'moderate', 'very_heavy']);
    const tied = [period(2), period(2), period(2), period(20)];
    expect(classifyPeriods(tied).method).toBe('non_zero_percentiles');
    expect(tied.map(value => value.level)).toEqual(['light', 'light', 'light', 'very_heavy']);
  });
});
