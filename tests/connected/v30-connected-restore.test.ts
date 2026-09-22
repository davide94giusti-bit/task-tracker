import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { snakeKeys, snakeRestoreData, validateConnectedData } from "../../services-connected/backup-export/restore";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const blank = () => ({ projects: [] as any[], people: [] as any[], project_people: [] as any[], tasks: [] as any[], checklist_items: [] as any[], task_dependencies: [] as any[], task_people: [] as any[], reminders: [] as any[], recurrence_rules: [] as any[], notification_preferences: [] as any[], activities: [] as any[] });

describe("Connected restore", () => {
  it("accepts an internally consistent 11-table snapshot", () => {
    const data = blank();
    data.projects.push({ id: uuid(1) });
    data.people.push({ id: uuid(2) });
    data.tasks.push({ id: uuid(3), projectId: uuid(1), responsiblePersonId: uuid(2) });
    data.checklist_items.push({ id: uuid(4), taskId: uuid(3), responsiblePersonId: null });
    const result = validateConnectedData(data);
    expect(result.valid).toBe(true);
    expect(result.totalRecords).toBe(4);
  });

  it("rejects orphaned records, duplicate IDs, and dependency cycles", () => {
    const data = blank();
    data.tasks.push({ id: uuid(1) }, { id: uuid(1) });
    data.checklist_items.push({ id: uuid(2), taskId: uuid(99) });
    data.task_dependencies.push({ id: uuid(3), waitingTaskId: uuid(1), prerequisiteTaskId: uuid(1) });
    const result = validateConnectedData(data);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/duplicate|missing|depend on itself|cycle/i);
  });

  it("converts transport keys without changing scalar data", () => {
    expect(snakeKeys({ taskId: uuid(1), nestedValue: [{ dueDate: "2026-09-22" }] })).toEqual({ task_id: uuid(1), nested_value: [{ due_date: "2026-09-22" }] });
    expect(snakeRestoreData({ activities: [{ taskId: uuid(1), details: { dueDate: "preserved" } }] })).toEqual({ activities: [{ task_id: uuid(1), details: { dueDate: "preserved" } }] });
  });

  it("wires owner-only transactional restore and attachment protection", () => {
    const migration = fs.readFileSync("supabase/migrations/0021_connected_restore.sql", "utf8");
    const gateway = fs.readFileSync("services-connected/api-gateway/index.ts", "utf8");
    expect(migration).toContain("role='owner'");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("active attachment(s)");
    expect(migration).toContain("safety_snapshot");
    expect(migration).toContain("REPLACE MY WORKSPACE");
    expect(gateway).toContain("restore-apply");
  });
});
