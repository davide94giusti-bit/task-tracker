type CostInput = {
  tasks: any[];
  checklist: any[];
  projects: any[];
  currencyCode?: string;
  year?: number;
  month?: number;
  compareYear?: number;
  projectId?: string;
};

const cents = (value: unknown) =>
  value === null || value === undefined || value === ''
    ? 0
    : Math.round(Number(value) * 100);
const amount = (value: number) => value / 100;
const totals = (entries: any[]) => {
  const past = entries
      .filter((entry) => entry.timing === 'past')
      .reduce((sum, entry) => sum + entry.totalCents, 0),
    future = entries
      .filter((entry) => entry.timing === 'future')
      .reduce((sum, entry) => sum + entry.totalCents, 0);
  return { past: amount(past), future: amount(future), total: amount(past + future) };
};
const entryYear = (entry: any) =>
  entry.date ? Number(String(entry.date).slice(0, 4)) : null;
const entryMonth = (entry: any) =>
  entry.date ? Number(String(entry.date).slice(5, 7)) : null;

export function buildCostSummary(input: CostInput) {
  const projectNames = new Map(
      input.projects.map((project) => [project.id, project.name]),
    ),
    checklistCosts = new Map<string, number>();
  for (const item of input.checklist) {
    checklistCosts.set(
      item.taskId,
      (checklistCosts.get(item.taskId) || 0) + cents(item.costAmount),
    );
  }
  const allEntries = input.tasks
    .filter((task) => !['cancelled', 'archived'].includes(task.status))
    .filter((task) => !input.projectId || task.projectId === input.projectId)
    .filter(
      (task) =>
        task.costAmount !== null && task.costAmount !== undefined ||
        input.checklist.some(
          (item) =>
            item.taskId === task.id &&
            item.costAmount !== null &&
            item.costAmount !== undefined,
        ),
    )
    .map((task) => {
      const taskCents = cents(task.costAmount),
        checklistCents = checklistCosts.get(task.id) || 0,
        timing = task.status === 'completed' ? 'past' : 'future',
        date = timing === 'past' ? task.completedAt || null : task.dueDate || null;
      return {
        taskId: task.id,
        title: task.title,
        projectId: task.projectId || null,
        projectName: projectNames.get(task.projectId) || 'No project',
        taskCost: amount(taskCents),
        checklistCost: amount(checklistCents),
        totalCost: amount(taskCents + checklistCents),
        totalCents: taskCents + checklistCents,
        timing,
        date,
        completedAt: task.completedAt || null,
        dueDate: task.dueDate || null,
      };
    });
  const availableYears = Array.from(
    new Set(allEntries.map(entryYear).filter((value): value is number => !!value)),
  ).sort((a, b) => b - a);
  const selectedEntries = allEntries.filter((entry) => {
    if (input.year && entryYear(entry) !== input.year) return false;
    if (input.month && entryMonth(entry) !== input.month) return false;
    return true;
  });
  const projectMap = new Map<string, any>();
  for (const entry of selectedEntries) {
    const key = entry.projectId || 'none',
      current = projectMap.get(key) || {
        projectId: entry.projectId,
        projectName: entry.projectName,
        past: 0,
        future: 0,
        total: 0,
      };
    current[entry.timing] += entry.totalCents;
    current.total += entry.totalCents;
    projectMap.set(key, current);
  }
  const projects = Array.from(projectMap.values())
    .map((project) => ({
      ...project,
      past: amount(project.past),
      future: amount(project.future),
      total: amount(project.total),
    }))
    .sort((a, b) => b.total - a.total);
  const compareHasData =
    !!input.compareYear && availableYears.includes(input.compareYear);
  const comparisonEntries = compareHasData
    ? allEntries.filter((entry) => entryYear(entry) === input.compareYear)
    : [];
  const monthly = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1,
      selectedMonth = allEntries.filter(
        (entry) => entryYear(entry) === input.year && entryMonth(entry) === month,
      ),
      comparison = compareHasData
        ? allEntries.filter(
            (entry) =>
              entryYear(entry) === input.compareYear && entryMonth(entry) === month,
          )
        : [];
    return {
      month,
      ...totals(selectedMonth),
      ...(compareHasData ? { compareTotal: totals(comparison).total } : {}),
    };
  });
  return {
    currencyCode: input.currencyCode || 'CHF',
    selectedYear: input.year || null,
    compareYear: compareHasData ? input.compareYear! : null,
    availableYears,
    totals: totals(selectedEntries),
    allTime: totals(allEntries),
    monthly,
    projects,
    entries: selectedEntries
      .map(({ totalCents: _totalCents, ...entry }) => entry)
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))),
    comparisonEntries: comparisonEntries
      .map(({ totalCents: _totalCents, ...entry }) => entry)
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))),
  };
}
