import { PersonInput } from "../../packages/contracts";
import { PersonShareConfigure, ProjectInvitationWrite, ProjectPersonCreate, ProjectPersonRemove, ProjectPersonSave, Uuid } from "../../packages/connected-contracts";
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
const decode = (value: string) => Uint8Array.from(atob(value.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(value.length/4)*4,"=")), character => character.charCodeAt(0));
async function verifyShareToken(token: string, secret: string) {
  const [id, signature, extra] = token.split(".");
  if (!id || !signature || extra || !/^[0-9a-f-]{36}$/i.test(id)) throw Object.assign(new Error("Invalid project invitation"), { status: 400 });
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  if (!await crypto.subtle.verify("HMAC", key, decode(signature), new TextEncoder().encode(id))) throw Object.assign(new Error("Invalid project invitation"), { status: 400 });
  return id;
}
async function verificationToken(id: string, secret: string) {
  const expires = Math.floor(Date.now()/1000)+30*60, value=`${id}.${expires}`;
  const key = await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return `${value}.${encode(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(`${value}:verified`)))}`;
}
const normalizeInvitationCode = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "");
async function projectInvitationCode(id: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}:project-invitation`))).slice(0, 8);
  const raw = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
  return raw.match(/.{1,4}/g)?.join("-") || raw;
}
async function projectInvitationHash(code: string) {
  return encode(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalizeInvitationCode(code))));
}
async function invitationClientHash(value: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return encode(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`invitation-client:${value}`)));
}
export default <WorkerHandler<Env>>{
  async fetch(request, env) {
    return withRequest("connected-people", request, env, async (requestId) => {
      internal(request, env);
      const url = new URL(request.url);
      if (url.pathname === "/health")
        return json(health("connected-people", ["data"]), 200, requestId);
      if (url.pathname === "/public-project-invitation") {
        const input = await body(request) as { code?: string };
        const code = normalizeInvitationCode(String(input.code || ""));
        if (code.length < 12 || code.length > 20) throw Object.assign(new Error("This invitation code is invalid"), { status: 404 });
        const clientHash = await invitationClientHash(request.headers.get("x-client-ip") || "unknown", env.INTERNAL_SERVICE_TOKEN);
        let invitation: unknown;
        try {
          invitation = await call(env.DATA, "/public/project-invitation", env, undefined, { method: "POST", body: JSON.stringify({ codeHash: await projectInvitationHash(code), clientHash }) });
        } catch (error) {
          if ((error as Error).message.includes("Too many invitation attempts"))
            throw Object.assign(new Error("Too many invitation attempts. Try again in 10 minutes."), { status: 429 });
          throw error;
        }
        if (!invitation) throw Object.assign(new Error("This project invitation is unavailable, expired, or revoked"), { status: 404 });
        return json({ ...(invitation as object), token: await shareToken((invitation as any).shareId, env.INTERNAL_SERVICE_TOKEN) }, 200, requestId);
      }
      const context = authContext(request);
      if (url.pathname === "/accept-project-invitation") {
        const input = await body(request) as { code?: string };
        const clientHash = await invitationClientHash(`user:${context.userId}`, env.INTERNAL_SERVICE_TOKEN);
        const invitation = await call(env.DATA, "/public/project-invitation", env, undefined, { method: "POST", body: JSON.stringify({ codeHash: await projectInvitationHash(String(input.code || "")), clientHash }) }) as any;
        if (!invitation?.shareId) throw Object.assign(new Error("This project invitation is unavailable, expired, or revoked"), { status: 404 });
        return json(await call(env.DATA, "/rpc", env, context, { method: "POST", body: JSON.stringify({ name: "claim_linked_project", args: { p_share_id: invitation.shareId } }) }), 200, requestId);
      }
      if (url.pathname === "/claim-linked-project") {
        const input = await body(request) as { token?: string };
        const shareId = await verifyShareToken(String(input.token || ""), env.INTERNAL_SERVICE_TOKEN);
        return json(await call(env.DATA, "/rpc", env, context, { method: "POST", body: JSON.stringify({ name: "claim_linked_project", args: { p_share_id: shareId } }) }), 200, requestId);
      }
      if (url.pathname === "/linked-projects") {
        const rows = await call(env.DATA, "/rpc", env, context, { method: "POST", body: JSON.stringify({ name: "linked_projects", args: {} }) }) as any[];
        return json(await Promise.all((Array.isArray(rows) ? rows : []).map(async row => ({ ...row, token: await shareToken(row.shareId, env.INTERNAL_SERVICE_TOKEN), verificationToken: await verificationToken(row.shareId, env.INTERNAL_SERVICE_TOKEN) }))), 200, requestId);
      }
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
      if (url.pathname === "/project-people" && request.method === "GET") {
        const projectId = Uuid.parse(url.searchParams.get("projectId"));
        return json(await call(env.DATA, "/rpc", env, context, { method: "POST", body: JSON.stringify({ name: "project_people", args: { p_project_id: projectId } }) }), 200, requestId);
      }
      if (url.pathname === "/project-people/save") {
        const input = ProjectPersonSave.parse(await body(request));
        return json(await call(env.DATA, "/rpc", env, context, { method: "POST", body: JSON.stringify({ name: "save_project_person", args: {
          p_project_id: input.projectId, p_person_id: input.personId, p_share_phone: input.sharePhone,
          p_share_email: input.shareEmail, p_share_address: input.shareAddress, p_share_notes: input.shareNotes,
          p_supervisable: input.supervisable,
        } }) }), 200, requestId);
      }
      if (url.pathname === "/project-people/create") {
        const input = ProjectPersonCreate.parse(await body(request));
        return json(await call(env.DATA, "/rpc", env, context, { method: "POST", body: JSON.stringify({ name: "create_project_person", args: {
          p_project_id: input.projectId, p_full_name: input.fullName, p_role: input.role, p_company: input.company,
          p_phone: input.phone, p_email: input.email, p_address: input.address, p_notes: input.notes,
          p_share_phone: input.sharePhone, p_share_email: input.shareEmail, p_share_address: input.shareAddress,
          p_share_notes: input.shareNotes, p_supervisable: input.supervisable,
        } }) }), 200, requestId);
      }
      if (url.pathname === "/project-people/remove") {
        const input = ProjectPersonRemove.parse(await body(request));
        return json(await call(env.DATA, "/rpc", env, context, { method: "POST", body: JSON.stringify({ name: "remove_project_person", args: { p_project_id: input.projectId, p_person_id: input.personId } }) }), 200, requestId);
      }
      if (url.pathname === "/project-invitation") {
        const input = ProjectInvitationWrite.parse(await body(request));
        const [personRows, projectRows, linkRows] = await Promise.all([
          call(env.DATA, "/select", env, context, { method: "POST", body: JSON.stringify({ table: "people", filters: { id: input.personId, deleted_at: null }, limit: 1 }) }) as Promise<any[]>,
          call(env.DATA, "/select", env, context, { method: "POST", body: JSON.stringify({ table: "projects", filters: { id: input.projectId, deleted_at: null }, limit: 1 }) }) as Promise<any[]>,
          call(env.DATA, "/select", env, context, { method: "POST", body: JSON.stringify({ table: "project_people", filters: { project_id: input.projectId, person_id: input.personId, deleted_at: null }, limit: 1 }) }) as Promise<any[]>,
        ]);
        if (!personRows.length || !projectRows.length || !linkRows.length) throw Object.assign(new Error("Add this person to the project before inviting them"), { status: 409 });
        if (!String(personRows[0].email || "").trim()) throw Object.assign(new Error("Add a verified recipient email before creating an invitation"), { status: 409 });
        let shares = await call(env.DATA, "/select", env, context, { method: "POST", body: JSON.stringify({ table: "person_task_shares", filters: { person_id: input.personId, revoked_at: null }, limit: 1 }) }) as any[];
        if (!shares.length) shares = await call(env.DATA, "/write", env, context, { method: "POST", body: JSON.stringify({ table: "person_task_shares", method: "post", row: { id: crypto.randomUUID(), person_id: input.personId, created_by: context.userId } }) }) as any[];
        let share = shares[0];
        await call(env.DATA, "/rpc", env, context, { method: "POST", body: JSON.stringify({ name: "configure_person_share", args: {
          p_share_id: share.id, p_scope_mode: "project", p_project_id: input.projectId,
          p_allow_checklist_updates: input.access !== "read_only", p_allow_task_completion: input.access !== "read_only" && (input.access === "tasks" || input.allowTaskCompletion),
          p_allow_comments: input.allowComments, p_allow_view_project_contacts: true, p_allow_view_contact_assignments: true,
          p_allow_supervise_contact_checklists: input.access !== "read_only", p_allow_complete_contact_tasks: input.access !== "read_only" && (input.access === "tasks" || input.allowTaskCompletion),
          p_allow_manage_project_contacts: false, p_allow_create_edit_tasks: input.access !== "read_only" && input.allowCreateTasks,
          p_allow_manage_checklist_items: input.access !== "read_only" && input.allowManageChecklistItems, p_expires_at: input.expiresAt,
        } }) });
        const code = await projectInvitationCode(share.id, env.INTERNAL_SERVICE_TOKEN), codeHash = await projectInvitationHash(code);
        const updated = await call(env.DATA, "/write", env, context, { method: "POST", body: JSON.stringify({ table: "person_task_shares", method: "patch", id: share.id, row: { invitation_code_hash: codeHash, invitation_notifications_offered: input.offerNotifications } }) }) as any[];
        share = updated[0] || share;
        return json({ active: true, code, path: `/join/${code}`, projectName: projectRows[0].name, personName: personRows[0].fullName, recipientEmail: personRows[0].email, expiresAt: share.expiresAt || null }, 200, requestId);
      }
      if (url.pathname === "/save") {
        const person = PersonInput.parse(await body(request)),
          row = {
            id: person.id || crypto.randomUUID(),
            full_name: person.fullName,
            email: (person.email || "").trim().toLowerCase(),
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
        const saved = await call(env.DATA, "/write", env, context, {
            method: "POST",
            body: JSON.stringify({
              table: "people",
              method: person.id ? "patch" : "post",
              id: person.id,
              expectedVersion: person.expectedVersion,
              row,
            }),
          }) as any[];
        if (person.id && person.expectedVersion && !saved.length)
          throw Object.assign(new Error("Contact changed on another device. Refresh before saving."), { status: 409 });
        return json(saved, 200, requestId);
      }
      if (url.pathname === "/share-link") {
        const input = (await body(request)) as { personId?: string; action?: string; channel?: string };
        const personId = Uuid.parse(input.personId);
        const action = input.action || "ensure";
        if (!["ensure", "regenerate", "revoke", "mark-shared", "configure"].includes(action))
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
        if (action === "configure") {
          const configured = PersonShareConfigure.parse(input);
          await call(env.DATA, "/rpc", env, context, {
            method: "POST",
            body: JSON.stringify({ name: "configure_person_share", args: {
              p_share_id: share.id, p_scope_mode: configured.scopeMode,
              p_project_id: configured.projectId || null,
              p_allow_checklist_updates: configured.allowChecklistUpdates,
              p_allow_task_completion: configured.allowTaskCompletion,
              p_allow_comments: configured.allowComments,
              p_allow_view_project_contacts: configured.allowViewProjectContacts,
              p_allow_view_contact_assignments: configured.allowViewContactAssignments,
              p_allow_supervise_contact_checklists: configured.allowSuperviseContactChecklists,
              p_allow_complete_contact_tasks: configured.allowCompleteContactTasks,
              p_allow_manage_project_contacts: configured.allowManageProjectContacts,
              p_allow_create_edit_tasks: configured.allowCreateEditTasks,
              p_allow_manage_checklist_items: configured.allowManageChecklistItems,
              p_expires_at: configured.expiresAt,
            } }),
          });
          const refreshed = (await call(env.DATA, "/select", env, context, {
            method: "POST", body: JSON.stringify({ table: "person_task_shares", filters: { id: share.id }, limit: 1 }),
          })) as any[];
          share = refreshed[0] || share;
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
          scopeMode: share.scopeMode || "assigned",
          projectId: share.projectId || null,
          allowChecklistUpdates: Boolean(share.allowChecklistUpdates),
          allowTaskCompletion: Boolean(share.allowTaskCompletion),
          allowComments: Boolean(share.allowComments),
          allowViewProjectContacts: Boolean(share.allowViewProjectContacts),
          allowViewContactAssignments: Boolean(share.allowViewContactAssignments),
          allowSuperviseContactChecklists: Boolean(share.allowSuperviseContactChecklists),
          allowCompleteContactTasks: Boolean(share.allowCompleteContactTasks),
          allowManageProjectContacts: Boolean(share.allowManageProjectContacts),
          allowCreateEditTasks: Boolean(share.allowCreateEditTasks),
          allowManageChecklistItems: Boolean(share.allowManageChecklistItems),
          expiresAt: share.expiresAt || null,
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
