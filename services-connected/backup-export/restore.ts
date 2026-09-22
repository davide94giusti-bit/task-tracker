export const CONNECTED_TABLES = [
  "projects", "people", "project_people", "tasks", "checklist_items",
  "task_dependencies", "task_people", "reminders", "recurrence_rules",
  "notification_preferences", "activities",
] as const;

export type RestoreMode = "empty" | "replace";
export type RestoreValidation = {
  valid: boolean;
  counts: Record<string, number>;
  errors: string[];
  warnings: string[];
  totalRecords: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const id = (value: unknown) => typeof value === "string" && UUID.test(value);
const rows = (data: Record<string, unknown>, table: string) =>
  Array.isArray(data[table]) ? data[table] as Record<string, unknown>[] : [];
const field = (row: Record<string, unknown>, camel: string, snake: string) => row[camel] ?? row[snake];

export function validateConnectedData(data: Record<string, unknown>): RestoreValidation {
  const errors: string[] = [], warnings: string[] = [];
  const counts: Record<string, number> = {};
  for (const table of CONNECTED_TABLES) {
    if (!Array.isArray(data[table])) errors.push(`Missing or invalid ${table} table.`);
    counts[table] = rows(data, table).length;
  }
  const totalRecords = Object.values(counts).reduce((sum, count) => sum + count, 0);
  if (totalRecords > 100_000) errors.push("The backup exceeds the 100,000-record restore limit.");

  const ids = new Map<string, Set<string>>();
  for (const table of CONNECTED_TABLES) {
    const seen = new Set<string>();
    for (const row of rows(data, table)) {
      if (!id(row.id)) { errors.push(`${table} contains a record with an invalid id.`); continue; }
      const value = String(row.id);
      if (seen.has(value)) errors.push(`${table} contains duplicate id ${value}.`);
      seen.add(value);
    }
    ids.set(table, seen);
  }
  const check = (table: string, key: string, snake: string, target: string, optional = false) => {
    for (const row of rows(data, table)) {
      const value = field(row, key, snake);
      if ((value === null || value === undefined || value === "") && optional) continue;
      if (!id(value) || !ids.get(target)?.has(String(value)))
        errors.push(`${table}.${key} references a missing ${target} record.`);
    }
  };
  check("tasks", "projectId", "project_id", "projects", true);
  check("tasks", "responsiblePersonId", "responsible_person_id", "people", true);
  check("project_people", "projectId", "project_id", "projects");
  check("project_people", "personId", "person_id", "people");
  check("checklist_items", "taskId", "task_id", "tasks");
  check("checklist_items", "responsiblePersonId", "responsible_person_id", "people", true);
  check("task_dependencies", "waitingTaskId", "waiting_task_id", "tasks");
  check("task_dependencies", "prerequisiteTaskId", "prerequisite_task_id", "tasks");
  check("task_people", "taskId", "task_id", "tasks");
  check("task_people", "personId", "person_id", "people");
  check("reminders", "taskId", "task_id", "tasks");
  check("recurrence_rules", "taskId", "task_id", "tasks");
  check("activities", "taskId", "task_id", "tasks", true);

  const graph = new Map<string, string[]>();
  for (const edge of rows(data, "task_dependencies")) {
    const from = String(field(edge, "waitingTaskId", "waiting_task_id") || "");
    const to = String(field(edge, "prerequisiteTaskId", "prerequisite_task_id") || "");
    if (from === to && from) errors.push("A task cannot depend on itself.");
    graph.set(from, [...(graph.get(from) || []), to]);
  }
  const visiting = new Set<string>(), visited = new Set<string>();
  const cyclic = (node: string): boolean => {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    if ((graph.get(node) || []).some(cyclic)) return true;
    visiting.delete(node); visited.add(node); return false;
  };
  if ([...graph.keys()].some(cyclic)) errors.push("Task dependencies contain a cycle.");

  warnings.push("Push subscriptions, authentication sessions, guest links, delivery history, and credentials are never restored.");
  warnings.push("Attachment files and attachment metadata are not included in Connected JSON backups yet.");
  if (counts.reminders) warnings.push("Open reminders are delayed after restore to prevent an immediate notification flood.");
  return { valid: errors.length === 0, counts, errors: [...new Set(errors)], warnings, totalRecords };
}

export function snakeKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(snakeKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, child]) => [
    key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`), snakeKeys(child),
  ]));
}

export function snakeRestoreData(data: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(data).map(([table, value]) => [
    table,
    Array.isArray(value) ? value.map(row => row && typeof row === "object"
      ? Object.fromEntries(Object.entries(row as Record<string, unknown>).map(([key, child]) => [key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`), child]))
      : row) : value,
  ]));
}
