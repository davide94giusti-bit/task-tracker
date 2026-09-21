export type DeadlineKind = "task" | "checklist";
export type PressureLevel = "no_deadlines" | "light" | "moderate" | "heavy" | "very_heavy";

export interface DeadlineWorkItem {
  kind: DeadlineKind;
  id: string;
  dueDate: string;
  title: string;
  description?: string;
  position?: number | null;
  completed?: boolean | null;
  taskId: string;
  taskTitle: string;
  taskDueDate: string | null;
  taskStatus: string;
  taskPriority: string;
  taskBlocked: boolean;
  taskVersion: number;
  version: number;
  required: boolean | null;
  projectId: string | null;
  projectName: string;
  responsiblePersonId: string | null;
  responsiblePersonName: string;
}

export interface PressureContribution extends DeadlineWorkItem {
  overdue: boolean;
  contribution: number;
  blockedBonus: number;
}

export interface PressurePeriod {
  date?: string;
  startDate?: string;
  endDate?: string;
  taskCount: number;
  checklistCount: number;
  overdueCount: number;
  criticalCount: number;
  highCount: number;
  blockedTaskCount: number;
  score: number;
  level: PressureLevel;
  heaviestDate?: string | null;
  items: PressureContribution[];
}

export const PRESSURE_WEIGHTS = {
  checklist: 1,
  normalTask: 2,
  highTask: 3,
  criticalTask: 5,
  overdueBonus: 2,
  blockedBonus: 1,
  highChecklistBonus: 1,
  criticalChecklistBonus: 2,
} as const;

const DAY = 86_400_000;
const parseDate = (value: string) => new Date(`${value}T00:00:00Z`);
const dateKey = (value: Date) => value.toISOString().slice(0, 10);
const plusDays = (value: string, days: number) => dateKey(new Date(parseDate(value).getTime() + days * DAY));

function weekStart(value: string, startsOn: number) {
  const date = parseDate(value);
  const offset = (date.getUTCDay() - startsOn + 7) % 7;
  return plusDays(value, -offset);
}

function baseScore(item: DeadlineWorkItem) {
  if (item.kind === "checklist")
    return PRESSURE_WEIGHTS.checklist + (item.taskPriority === "critical" ? PRESSURE_WEIGHTS.criticalChecklistBonus : item.taskPriority === "high" ? PRESSURE_WEIGHTS.highChecklistBonus : 0);
  return item.taskPriority === "critical" ? PRESSURE_WEIGHTS.criticalTask : item.taskPriority === "high" ? PRESSURE_WEIGHTS.highTask : PRESSURE_WEIGHTS.normalTask;
}

function fillPeriod(items: DeadlineWorkItem[], overdueIds: Set<string>) {
  const blockedParents = new Set(items.filter(item => item.taskBlocked).map(item => item.taskId));
  const blockedAwarded = new Set<string>();
  const contributions = items.map(item => {
    const overdue = overdueIds.has(`${item.kind}:${item.id}`);
    const blockedBonus = item.taskBlocked && !blockedAwarded.has(item.taskId) ? PRESSURE_WEIGHTS.blockedBonus : 0;
    if (blockedBonus) blockedAwarded.add(item.taskId);
    return { ...item, overdue, blockedBonus, contribution: baseScore(item) + (overdue ? PRESSURE_WEIGHTS.overdueBonus : 0) + blockedBonus };
  });
  return {
    taskCount: items.filter(item => item.kind === "task").length,
    checklistCount: items.filter(item => item.kind === "checklist").length,
    overdueCount: contributions.filter(item => item.overdue).length,
    criticalCount: items.filter(item => item.taskPriority === "critical").length,
    highCount: items.filter(item => item.taskPriority === "high").length,
    blockedTaskCount: blockedParents.size,
    score: contributions.reduce((sum, item) => sum + item.contribution, 0),
    level: "no_deadlines" as PressureLevel,
    items: contributions,
  };
}

function nearestRank(sorted: number[], fraction: number) {
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] || 0;
}

function percentile(sorted: number[], fraction: number) {
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position), upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

export function classifyPeriods(periods: PressurePeriod[]) {
  const nonZero = periods.map(period => period.score).filter(Boolean).sort((a, b) => a - b);
  if (!nonZero.length) return { method: "all_zero", sampleSize: 0, p50: 0, p75: 0, p90: 0, median: 0 };
  const median = nearestRank(nonZero, 0.5);
  const metadata = nonZero.length < 4
    ? { method: "median_fallback", sampleSize: nonZero.length, p50: median, p75: 0, p90: 0, median }
    : { method: "non_zero_percentiles", sampleSize: nonZero.length, p50: percentile(nonZero, 0.5), p75: percentile(nonZero, 0.75), p90: percentile(nonZero, 0.9), median };
  for (const period of periods) {
    if (!period.score) period.level = "no_deadlines";
    else if (metadata.method === "median_fallback") {
      period.level = period.score <= .75 * median ? "light" : period.score <= 1.25 * median ? "moderate" : period.score <= 2 * median ? "heavy" : "very_heavy";
    } else {
      period.level = period.score <= metadata.p50 ? "light" : period.score <= metadata.p75 ? "moderate" : period.score <= metadata.p90 ? "heavy" : "very_heavy";
    }
  }
  return metadata;
}

export function buildDeadlinePressure(input: { items: DeadlineWorkItem[]; startDate: string; today: string; days: number; weeks: number; weekStartsOn: number }) {
  const unique = new Map(input.items.map(item => [`${item.kind}:${item.id}`, item]));
  const items = [...unique.values()];
  const daily: PressurePeriod[] = Array.from({ length: input.days }, (_, index) => {
    const date = plusDays(input.startDate, index);
    const due = items.filter(item => item.dueDate === date);
    const overdue = date === input.today ? items.filter(item => item.dueDate < input.today && !due.some(other => other.kind === item.kind && other.id === item.id)) : [];
    const overdueIds = new Set(overdue.map(item => `${item.kind}:${item.id}`));
    return { date, ...fillPeriod([...due, ...overdue], overdueIds) };
  });
  const firstWeek = weekStart(input.startDate, input.weekStartsOn);
  const weekly: PressurePeriod[] = Array.from({ length: input.weeks }, (_, index) => {
    const startDate = plusDays(firstWeek, index * 7), endDate = plusDays(startDate, 6);
    const due = items.filter(item => item.dueDate >= startDate && item.dueDate <= endDate);
    const isCurrent = input.today >= startDate && input.today <= endDate;
    const overdue = isCurrent ? items.filter(item => item.dueDate < input.today) : [];
    const overdueIds = new Set(overdue.map(item => `${item.kind}:${item.id}`));
    const combined = new Map([...due, ...overdue].map(item => [`${item.kind}:${item.id}`, item]));
    return { startDate, endDate, ...fillPeriod([...combined.values()], overdueIds), heaviestDate: null };
  });
  const dailyClassification = classifyPeriods(daily);
  const weeklyClassification = classifyPeriods(weekly);
  for (const week of weekly) {
    const scores = new Map<string, number>();
    for (const item of week.items) {
      const date = item.overdue && input.today >= week.startDate! && input.today <= week.endDate! ? input.today : item.dueDate;
      scores.set(date, (scores.get(date) || 0) + item.contribution);
    }
    week.heaviestDate = [...scores].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || null;
  }
  return { daily, weekly, classification: { daily: dailyClassification, weekly: weeklyClassification } };
}

export function buildChecklistAttention(items: DeadlineWorkItem[], date: string) {
  const checklist = items.filter(item => item.kind === "checklist");
  return { date, overdue: checklist.filter(item => item.dueDate < date), dueToday: checklist.filter(item => item.dueDate === date) };
}
