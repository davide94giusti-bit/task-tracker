import {
  CalendarQuery,
  ChecklistAttentionQuery,
  ChecklistListQuery,
  ChecklistToggle,
  ChecklistWrite,
  CostQuery,
  DeadlinePressureQuery,
  ProjectWrite,
  ProjectDelete,
  RecordId,
  TaskAttachmentLink,
  TaskAttachmentUpload,
  TaskQuery,
  TaskWrite,
  Uuid,
} from "../../packages/connected-contracts";
import { buildCostSummary } from "./costs";
import { buildChecklistAttention, buildDeadlinePressure, PRESSURE_WEIGHTS, type DeadlineWorkItem } from "./deadlines";
import {
  authContext,
  body,
  call,
  health,
  internal,
  json,
  withRequest,
} from "../_shared/runtime";
import type { BaseEnv, Fetcher, WorkerHandler } from "../_shared/types";
interface Env extends BaseEnv {
  DATA: Fetcher;
}
async function allRows(
  env: Env,
  context: ReturnType<typeof authContext>,
  table: string,
  filters: Record<string, unknown>,
) {
  const result: any[] = [];
  for (let offset = 0; ; offset += 500) {
    const rows = (await call(env.DATA, "/select", env, context, {
      method: "POST",
      body: JSON.stringify({ table, filters, limit: 500, offset }),
    })) as any[];
    result.push(...rows);
    if (rows.length < 500) return result;
  }
}
export default <WorkerHandler<Env>>{
  async fetch(request, env) {
    return withRequest("connected-tasks", request, env, async (requestId) => {
      internal(request, env);
      const url = new URL(request.url);
      if (url.pathname === "/health")
        return json(health("connected-tasks", ["data"]), 200, requestId);
      const context = authContext(request);
      if (url.pathname === "/list") {
        const raw = Object.fromEntries(url.searchParams),
          query = TaskQuery.parse({
            ...raw,
            page: raw.page ? Number(raw.page) : undefined,
            pageSize: raw.pageSize ? Number(raw.pageSize) : undefined,
            blocked: raw.blocked === "true" ? true : undefined,
            attention: raw.attention === "true" ? true : undefined,
          });
        const result = (await call(env.DATA, "/tasks/list", env, context, {
            method: "POST",
            body: JSON.stringify(query),
          })) as { items: any[]; total: number; page: number; pageSize: number };
        if (query.dependencyRole === "prerequisite") {
          const [tasks, dependencies] = await Promise.all([
            allRows(env, context, "tasks", { deleted_at: null }),
            allRows(env, context, "task_dependencies", { deleted_at: null, mandatory: true }),
          ]);
          const active = new Map(tasks.filter((task) => !task.archived && !["completed", "cancelled", "archived"].includes(task.status)).map((task) => [task.id, task]));
          const prerequisiteIds = new Set(dependencies.filter((dependency) => active.has(dependency.waitingTaskId) && active.has(dependency.prerequisiteTaskId)).map((dependency) => dependency.prerequisiteTaskId));
          result.items = result.items.filter((task) => prerequisiteIds.has(task.id));
          result.total = result.items.length;
        }
        return json(result, 200, requestId);
      }
      if (url.pathname === "/save") {
        const input = TaskWrite.parse(await body(request));
        const saved = (await call(env.DATA, "/tasks/save", env, context, {
          method: "POST",
          body: JSON.stringify(input),
        })) as any;
        if ((input.costDate ?? null) !== (saved?.costDate ?? null))
          throw Object.assign(
            new Error(
              "The cost date was not persisted. Deploy the current Tasks and Data Workers together, then retry.",
            ),
            { status: 503 },
          );
        return json(
          saved,
          200,
          requestId,
        );
      }
      if (url.pathname === "/costs") {
        const raw = Object.fromEntries(url.searchParams),
          query = CostQuery.parse({
            year: raw.year ? Number(raw.year) : undefined,
            month: raw.month ? Number(raw.month) : undefined,
            compareYear: raw.compareYear
              ? Number(raw.compareYear)
              : undefined,
            projectId: raw.projectId || undefined,
          });
        const [tasks, checklist, projects, preferences] = await Promise.all([
          allRows(env, context, "tasks", { deleted_at: null }),
          allRows(env, context, "checklist_items", { deleted_at: null }),
          allRows(env, context, "projects", { deleted_at: null }),
          allRows(env, context, "notification_preferences", {
            user_id: context.userId,
          }),
        ]);
        return json(
          buildCostSummary({
            tasks,
            checklist,
            projects,
            currencyCode: preferences[0]?.currencyCode || "CHF",
            ...query,
          }),
          200,
          requestId,
        );
      }
      if (url.pathname === "/checklist-attention") {
        const query = ChecklistAttentionQuery.parse(Object.fromEntries(url.searchParams));
        const items = await call(env.DATA, "/rpc", env, context, {
          method: "POST",
          body: JSON.stringify({ name: "deadline_work_items", args: { p_start: query.date, p_end: query.date } }),
        }) as DeadlineWorkItem[];
        return json(buildChecklistAttention(items, query.date), 200, requestId);
      }
      if (url.pathname === "/checklists") {
        const raw = Object.fromEntries(url.searchParams), query = ChecklistListQuery.parse({ ...raw, page: raw.page ? Number(raw.page) : undefined, pageSize: raw.pageSize ? Number(raw.pageSize) : undefined });
        const [checklist, tasks, projects, people] = await Promise.all([
          allRows(env, context, "checklist_items", { deleted_at: null }),
          allRows(env, context, "tasks", { deleted_at: null }),
          allRows(env, context, "projects", { deleted_at: null }),
          allRows(env, context, "people", { deleted_at: null }),
        ]);
        const taskMap = new Map(tasks.map(task => [task.id, task])), projectMap = new Map(projects.map(project => [project.id, project.name])), peopleMap = new Map(people.map(person => [person.id, person.fullName]));
        const today = query.today || new Date().toISOString().slice(0, 10), next7 = new Date(new Date(`${today}T12:00:00Z`).getTime() + 7 * 86_400_000).toISOString().slice(0, 10);
        const eligible = checklist.flatMap(item => {
          const task = taskMap.get(item.taskId); if (!task || task.deletedAt || ["cancelled", "archived"].includes(task.status)) return [];
          return [{ ...item, taskTitle: task.title, taskDueDate: task.dueDate || null, taskStatus: task.status, taskPriority: task.priority, taskBlocked: !!task.blocked, taskVersion: task.version, projectId: task.projectId || null, projectName: projectMap.get(task.projectId) || "No project", responsiblePersonId: task.responsiblePersonId || null, responsiblePersonName: peopleMap.get(task.responsiblePersonId) || "Unassigned" }];
        });
        const activeParent = (item: any) => !["completed", "cancelled", "archived"].includes(item.taskStatus);
        const active = (item: any) => !item.completed && activeParent(item);
        const metrics = {
          open: eligible.filter(active).length,
          overdue: eligible.filter(item => active(item) && item.dueDate && item.dueDate < today).length,
          today: eligible.filter(item => active(item) && item.dueDate === today).length,
          next7: eligible.filter(item => active(item) && item.dueDate && item.dueDate > today && item.dueDate <= next7).length,
          required: eligible.filter(item => active(item) && item.required).length,
          completed: eligible.filter(item => item.completed).length,
          activeCompleted: eligible.filter(item => activeParent(item) && item.completed).length,
          activeTotal: eligible.filter(activeParent).length,
        };
        const matchesScope = (item: any) => query.scope === "all" ? true : query.scope === "open" ? active(item) : query.scope === "completed" ? item.completed : query.scope === "required" ? active(item) && item.required : query.scope === "overdue" ? active(item) && item.dueDate && item.dueDate < today : query.scope === "today" ? active(item) && item.dueDate === today : active(item) && item.dueDate && item.dueDate > today && item.dueDate <= next7;
        const filtered = eligible.filter((item: any) => matchesScope(item) && (!query.search || `${item.description} ${item.taskTitle} ${item.projectName}`.toLowerCase().includes(query.search.toLowerCase())) && (!query.projectId || item.projectId === query.projectId) && (!query.responsiblePersonId || item.responsiblePersonId === query.responsiblePersonId)).sort((a: any, b: any) => Number(a.completed) - Number(b.completed) || (a.dueDate || "9999-12-31").localeCompare(b.dueDate || "9999-12-31") || a.position - b.position || a.description.localeCompare(b.description));
        const offset = (query.page - 1) * query.pageSize;
        return json({ items: filtered.slice(offset, offset + query.pageSize), total: filtered.length, metrics, page: query.page, pageSize: query.pageSize }, 200, requestId);
      }
      if (url.pathname === "/deadline-pressure") {
        const raw = Object.fromEntries(url.searchParams);
        const query = DeadlinePressureQuery.parse({
          ...raw,
          days: raw.days ? Number(raw.days) : undefined,
          weeks: raw.weeks ? Number(raw.weeks) : undefined,
          weekStartsOn: raw.weekStartsOn ? Number(raw.weekStartsOn) : undefined,
        });
        const today = query.today || query.start;
        const start = new Date(`${query.start}T00:00:00Z`);
        const horizonDays = Math.max(query.days, query.weeks * 7 + 7);
        const end = new Date(start.getTime() + (horizonDays - 1) * 86_400_000).toISOString().slice(0, 10);
        const items = await call(env.DATA, "/rpc", env, context, {
          method: "POST",
          body: JSON.stringify({ name: "deadline_work_items", args: { p_start: query.start, p_end: end } }),
        }) as DeadlineWorkItem[];
        const pressure = buildDeadlinePressure({ items, startDate: query.start, today, days: query.days, weeks: query.weeks, weekStartsOn: query.weekStartsOn });
        return json({ generatedAt: new Date().toISOString(), timezone: query.timezone, startDate: query.start, scoring: PRESSURE_WEIGHTS, ...pressure }, 200, requestId);
      }
      if (url.pathname === "/checklist-toggle") {
        const input = ChecklistToggle.parse(await body(request));
        try {
          return json(await call(env.DATA, "/rpc", env, context, {
            method: "POST",
            body: JSON.stringify({ name: "toggle_checklist_item", args: { p_item_id: input.itemId, p_completed: input.completed, p_expected_version: input.expectedVersion } }),
          }), 200, requestId);
        } catch (error) {
          if ((error as Error).message.includes("changed on another device")) Object.assign(error as Error, { status: 409, code: "VERSION_CONFLICT" });
          throw error;
        }
      }
      if (url.pathname === "/details") {
        const taskId = Uuid.parse(url.searchParams.get("taskId"));
        const [taskRows, checklist, activities, dependencies] = await Promise.all([
          call(env.DATA, "/select", env, context, {
            method: "POST",
            body: JSON.stringify({
              table: "tasks",
              filters: { id: taskId },
              limit: 1,
            }),
          }),
          call(env.DATA, "/select", env, context, {
            method: "POST",
            body: JSON.stringify({
              table: "checklist_items",
              filters: { task_id: taskId, deleted_at: null },
              limit: 500,
            }),
          }),
          call(env.DATA, "/rpc", env, context, {
            method: "POST",
            body: JSON.stringify({
              name: "task_activity_timeline",
              args: { p_task_id: taskId },
            }),
          }).catch(() => []),
          call(env.DATA, "/select", env, context, {
            method: "POST",
            body: JSON.stringify({
              table: "task_dependencies",
              filters: { waiting_task_id: taskId, deleted_at: null },
              limit: 500,
            }),
          }),
        ]);
        const task = (taskRows as any[])[0];
        if (!task)
          throw Object.assign(new Error("Task not found"), { status: 404 });
        const prerequisiteRows = await Promise.all(
          (dependencies as any[]).map((dependency) =>
            call(env.DATA, "/select", env, context, {
              method: "POST",
              body: JSON.stringify({
                table: "tasks",
                filters: {
                  id: dependency.prerequisiteTaskId,
                  deleted_at: null,
                },
                limit: 1,
              }),
            }),
          ),
        );
        const enrichedDependencies = (dependencies as any[]).map(
          (dependency, index) => {
            const prerequisiteTask = (prerequisiteRows[index] as any[])[0];
            return {
              ...dependency,
              prerequisiteTitle:
                prerequisiteTask?.title || "Unavailable prerequisite task",
              prerequisiteStatus: prerequisiteTask?.status || "unavailable",
              prerequisiteTask,
            };
          },
        );
        return json(
          { task, checklist, dependencies: enrichedDependencies, activities },
          200,
          requestId,
        );
      }
      if (url.pathname === "/checklist-save") {
        const input = ChecklistWrite.parse(await body(request));
        return json(
          await call(env.DATA, "/write", env, context, {
            method: "POST",
            body: JSON.stringify({
              table: "checklist_items",
              method: input.id ? "patch" : "post",
              id: input.id,
              row: {
                ...(!input.id ? { id: crypto.randomUUID() } : {}),
                task_id: input.taskId,
                description: input.description,
                completed: input.completed,
                required: input.required,
                position: input.position,
                cost_amount: input.costAmount,
                due_date: input.dueDate,
                updated_by: context.userId,
                ...(!input.id ? { created_by: context.userId } : {}),
              },
            }),
          }),
          200,
          requestId,
        );
      }
      if (url.pathname === "/checklist-delete") {
        const input = RecordId.parse(await body(request));
        return json(
          await call(env.DATA, "/write", env, context, {
            method: "POST",
            body: JSON.stringify({
              table: "checklist_items",
              method: "patch",
              id: input.id,
              row: { deleted_at: new Date().toISOString(), updated_by: context.userId },
            }),
          }),
          200,
          requestId,
        );
      }
      if (url.pathname === "/delete") {
        const input = RecordId.parse(await body(request));
        return json(await call(env.DATA, "/write", env, context, { method: "POST", body: JSON.stringify({ table: "tasks", method: "patch", id: input.id, row: { deleted_at: new Date().toISOString(), updated_by: context.userId } }) }), 200, requestId);
      }
      if (url.pathname === "/attachments") {
        const taskId = Uuid.parse(url.searchParams.get("taskId"));
        return json(await call(env.DATA, "/attachments/list", env, context, { method: "POST", body: JSON.stringify({ taskId }) }), 200, requestId);
      }
      if (url.pathname === "/attachment-upload") {
        const input = TaskAttachmentUpload.parse(await body(request, 8_500_000));
        return json(await call(env.DATA, "/attachments/upload", env, context, { method: "POST", body: JSON.stringify(input) }), 200, requestId);
      }
      if (url.pathname === "/attachment-link") {
        const input = TaskAttachmentLink.parse(await body(request));
        return json(await call(env.DATA, "/attachments/link", env, context, { method: "POST", body: JSON.stringify(input) }), 200, requestId);
      }
      if (url.pathname === "/attachment-open") {
        const input = RecordId.parse(await body(request));
        return json(await call(env.DATA, "/attachments/open", env, context, { method: "POST", body: JSON.stringify(input) }), 200, requestId);
      }
      if (url.pathname === "/attachment-delete") {
        const input = RecordId.parse(await body(request));
        return json(await call(env.DATA, "/attachments/delete", env, context, { method: "POST", body: JSON.stringify(input) }), 200, requestId);
      }
      if (url.pathname === "/dashboard")
        return json(
          await call(env.DATA, "/rpc", env, context, {
            method: "POST",
            body: JSON.stringify({ name: "connected_dashboard", args: {} }),
          }),
          200,
          requestId,
        );
      if (url.pathname === "/calendar") {
        const query = CalendarQuery.parse(Object.fromEntries(url.searchParams));
        return json(
          await call(env.DATA, "/rpc", env, context, {
            method: "POST",
            body: JSON.stringify({
              name: "connected_calendar",
              args: { p_start: query.start, p_end: query.end },
            }),
          }),
          200,
          requestId,
        );
      }
      if (url.pathname === "/projects")
        return json(
          await call(env.DATA, "/rpc", env, context, {
            method: "POST",
            body: JSON.stringify({
              name: "connected_projects_workload",
              args: {},
            }),
          }),
          200,
          requestId,
        );
      if (url.pathname === "/project-save") {
        const project = ProjectWrite.parse(await body(request));
        if (project.id) return json(await call(env.DATA, "/rpc", env, context, {
          method: "POST",
          body: JSON.stringify({ name: "update_project", args: {
            p_project_id: project.id, p_name: project.name, p_description: project.description,
            p_color: project.color, p_expected_version: project.expectedVersion,
          } }),
        }), 200, requestId);
        const
          row = {
            name: project.name,
            description: project.description,
            color: project.color,
            updated_by: context.userId,
            ...(!project.id
              ? { id: crypto.randomUUID(), created_by: context.userId }
              : {}),
          };
        return json(
          await call(env.DATA, "/write", env, context, {
            method: "POST",
            body: JSON.stringify({
              table: "projects",
              method: project.id ? "patch" : "post",
              id: project.id,
              row,
            }),
          }),
          200,
          requestId,
        );
      }
      if (url.pathname === "/project-delete") {
        const input = ProjectDelete.parse(await body(request));
        return json(await call(env.DATA, "/rpc", env, context, {
          method: "POST",
          body: JSON.stringify({ name: "delete_project", args: { p_project_id: input.id, p_expected_version: input.expectedVersion } }),
        }), 200, requestId);
      }
      return json(
        {
          code: "NOT_FOUND",
          message: "Task route not found",
          service: "connected-tasks",
          requestId,
          retryable: false,
        },
        404,
        requestId,
      );
    });
  },
};
