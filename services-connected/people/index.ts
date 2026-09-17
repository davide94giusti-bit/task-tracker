import { PersonInput } from "../../packages/contracts";
import { Uuid } from "../../packages/connected-contracts";
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
const encode = (bytes: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
async function shareToken(id: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return `${id}.${encode(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(id)))}`;
}
export default <WorkerHandler<Env>>{
  async fetch(request, env) {
    return withRequest("connected-people", request, env, async (requestId) => {
      internal(request, env);
      const url = new URL(request.url);
      if (url.pathname === "/health")
        return json(health("connected-people", ["data"]), 200, requestId);
      const context = authContext(request);
      if (url.pathname === "/list") {
        const role = url.searchParams.get("role") || undefined;
        return json(
          await call(env.DATA, "/rpc", env, context, {
            method: "POST",
            body: JSON.stringify({
              name: "connected_people_workload",
              args: { p_role: role },
            }),
          }),
          200,
          requestId,
        );
      }
      if (url.pathname === "/details") {
        const personId = Uuid.parse(url.searchParams.get("personId"));
        const rows = (await call(env.DATA, "/select", env, context, {
          method: "POST",
          body: JSON.stringify({
            table: "people",
            filters: { id: personId, deleted_at: null },
            limit: 1,
          }),
        })) as any[];
        if (!rows.length)
          throw Object.assign(new Error("Contact not found"), { status: 404 });
        return json(rows[0], 200, requestId);
      }
      if (url.pathname === "/save") {
        const person = PersonInput.parse(await body(request)),
          row = {
            id: person.id || crypto.randomUUID(),
            full_name: person.fullName,
            email: person.email || "",
            company: person.company || "",
            role: person.role || "",
            phone: person.phone || "",
            address: person.address || "",
            website: person.website || "",
            preferred_contact: person.preferredContact || "",
            notes: person.notes || "",
            tags: person.tags || [],
            updated_by: context.userId,
            ...(!person.id ? { created_by: context.userId } : {}),
          };
        return json(
          await call(env.DATA, "/write", env, context, {
            method: "POST",
            body: JSON.stringify({
              table: "people",
              method: person.id ? "patch" : "post",
              id: person.id,
              row,
            }),
          }),
          200,
          requestId,
        );
      }
      if (url.pathname === "/share-link") {
        const input = (await body(request)) as { personId?: string; action?: string; channel?: string };
        const personId = Uuid.parse(input.personId);
        const action = input.action || "ensure";
        if (!["ensure", "regenerate", "revoke", "mark-shared"].includes(action))
          throw Object.assign(new Error("Invalid share-link action"), { status: 400 });
        if (action === "mark-shared" && !["email", "whatsapp", "copy"].includes(input.channel || ""))
          throw Object.assign(new Error("Invalid share channel"), { status: 400 });
        const people = (await call(env.DATA, "/select", env, context, {
          method: "POST",
          body: JSON.stringify({ table: "people", filters: { id: personId, deleted_at: null }, limit: 1 }),
        })) as any[];
        if (!people.length)
          throw Object.assign(new Error("Contact not found"), { status: 404 });
        let active = (await call(env.DATA, "/select", env, context, {
          method: "POST",
          body: JSON.stringify({ table: "person_task_shares", filters: { person_id: personId, revoked_at: null }, limit: 20 }),
        })) as any[];
        if (action === "revoke" || action === "regenerate") {
          await Promise.all(active.map((row) => call(env.DATA, "/write", env, context, {
            method: "POST",
            body: JSON.stringify({ table: "person_task_shares", method: "patch", id: row.id, row: { revoked_at: new Date().toISOString() } }),
          })));
          active = [];
        }
        if (action === "revoke") return json({ active: false }, 200, requestId);
        let share = active[0];
        if (!share) {
          try {
            const created = (await call(env.DATA, "/write", env, context, {
              method: "POST",
              body: JSON.stringify({ table: "person_task_shares", method: "post", row: { id: crypto.randomUUID(), person_id: personId, created_by: context.userId } }),
            })) as any[];
            share = created[0];
          } catch {
            const concurrent = (await call(env.DATA, "/select", env, context, {
              method: "POST",
              body: JSON.stringify({ table: "person_task_shares", filters: { person_id: personId, revoked_at: null }, limit: 1 }),
            })) as any[];
            share = concurrent[0];
            if (!share) throw new Error("Unable to create the shared-task link");
          }
        }
        if (action === "mark-shared") {
          const sharedAt = new Date().toISOString();
          const updated = (await call(env.DATA, "/write", env, context, {
            method: "POST",
            body: JSON.stringify({ table: "person_task_shares", method: "patch", id: share.id, row: { last_shared_at: sharedAt, last_shared_channel: input.channel } }),
          })) as any[];
          share = updated[0] || { ...share, lastSharedAt: sharedAt, lastSharedChannel: input.channel };
        }
        return json({
          active: true,
          token: await shareToken(share.id, env.INTERNAL_SERVICE_TOKEN),
          createdAt: share.createdAt,
          lastSharedAt: share.lastSharedAt || null,
          lastSharedChannel: share.lastSharedChannel || null,
          emailEnabled: Boolean(share.emailEnabled),
          pushEnabled: Boolean(share.pushEnabled),
        }, 200, requestId);
      }
      return json(
        {
          code: "NOT_FOUND",
          message: "People route not found",
          service: "connected-people",
          requestId,
          retryable: false,
        },
        404,
        requestId,
      );
    });
  },
};
