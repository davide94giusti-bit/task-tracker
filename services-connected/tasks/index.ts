import {
  CalendarQuery,
  ProjectWrite,
  TaskQuery,
  TaskWrite,
} from "../../packages/connected-contracts";
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
          });
        return json(
          await call(env.DATA, "/tasks/list", env, context, {
            method: "POST",
            body: JSON.stringify(query),
          }),
          200,
          requestId,
        );
      }
      if (url.pathname === "/save") {
        const input = TaskWrite.parse(await body(request));
        return json(
          await call(env.DATA, "/tasks/save", env, context, {
            method: "POST",
            body: JSON.stringify(input),
          }),
          200,
          requestId,
        );
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
        const project = ProjectWrite.parse(await body(request)),
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
