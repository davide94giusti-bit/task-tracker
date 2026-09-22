import { ConnectedRestoreRequest, ImportRequest } from "../../packages/connected-contracts";
import { CONNECTED_RELEASE } from "../../packages/connected-contracts/release";
import { body, call, health, internal, json, withRequest, workspaceContext } from "../_shared/runtime";
import type { BaseEnv, Fetcher, WorkerHandler } from "../_shared/types";
import { CONNECTED_TABLES, snakeRestoreData, validateConnectedData } from "./restore";

interface Env extends BaseEnv { DATA: Fetcher }
const MAX_BODY = 20_000_000;

async function allRows(env: Env, context: any, table: string, filters: Record<string, unknown> = {}) {
  const output: unknown[] = [];
  for (let offset = 0; ; offset += 500) {
    const page = await call(env.DATA, "/select", env, context, { method: "POST", body: JSON.stringify({ table, limit: 500, offset, filters }) }) as unknown[];
    output.push(...page);
    if (page.length < 500) return output;
  }
}

async function digest(data: unknown) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(data)));
  return Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, "0")).join("");
}

async function createExport(env: Env, context: any) {
  const entries = await Promise.all(CONNECTED_TABLES.map(async table => [table, await allRows(env, context, table, table === "notification_preferences" ? { user_id: context.userId } : {})] as const));
  const data = Object.fromEntries(entries);
  const counts = Object.fromEntries(entries.map(([table, records]) => [table, records.length]));
  const dataChecksum = await digest(data);
  const createdAt = new Date().toISOString();
  const envelope = { format: "task-tracker-connected", version: 3, createdAt, workspaceId: context.workspaceId, manifest: { schemaVersion: 21, release: CONNECTED_RELEASE, checksumAlgorithm: "SHA-256", dataChecksum, counts, excluded: ["attachment_files", "attachment_metadata", "push_subscriptions", "authentication_sessions", "guest_links", "notification_delivery_history"] }, data };
  await call(env.DATA, "/write", env, context, { method: "POST", body: JSON.stringify({ table: "exports", row: { id: crypto.randomUUID(), kind: "connected-json", status: "verified", created_by: context.userId, updated_by: context.userId, payload: { dataChecksum, counts, release: CONNECTED_RELEASE, verifiedAt: createdAt } } }) });
  return envelope;
}

export default <WorkerHandler<Env>>{
  async fetch(request, env) {
    return withRequest("connected-backup-export", request, env, async requestId => {
      internal(request, env);
      const url = new URL(request.url);
      if (url.pathname === "/health") return json(health("connected-backup-export", ["data"]), 200, requestId);
      const context = workspaceContext(request);
      if (!["owner", "admin"].includes(context.role)) throw Object.assign(new Error("Owner or admin role required"), { status: 403 });
      if (url.pathname === "/export") return json(await createExport(env, context), 200, requestId);
      if (url.pathname === "/status") {
        const [exports, restores] = await Promise.all([
          call(env.DATA, "/select", env, context, { method: "POST", body: JSON.stringify({ table: "exports", select: "id,kind,status,created_at,payload", limit: 50 }) }),
          call(env.DATA, "/select", env, context, { method: "POST", body: JSON.stringify({ table: "imports", select: "id,status,source_version,counts,warnings,created_at,updated_at,mode,checksum,report", limit: 50 }) }),
        ]);
        const sorted = (value: any[]) => [...value].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
        return json({ lastVerifiedExport: sorted(exports as any[]).find(item => item.kind === "connected-json" && item.status === "verified") || null, lastRestore: sorted(restores as any[])[0] || null, attachmentArchiveSupported: false, scheduledVerificationSupported: false }, 200, requestId);
      }
      if (url.pathname === "/import-preview" || url.pathname === "/import-apply") {
        const input = ImportRequest.parse(await body(request, 8_500_000));
        const name = url.pathname.endsWith("preview") ? "preview_local_import" : "apply_local_import";
        return json(await call(env.DATA, "/rpc", env, context, { method: "POST", body: JSON.stringify({ name, args: { p_import_id: input.importId, p_snapshot: input.snapshot, p_dry_run: url.pathname.endsWith("preview") } }) }), 200, requestId);
      }
      if (url.pathname === "/restore-preview" || url.pathname === "/restore-apply") {
        if (context.role !== "owner") throw Object.assign(new Error("Only the workspace owner can restore a Connected backup."), { status: 403 });
        const input = ConnectedRestoreRequest.parse(await body(request, MAX_BODY));
        const checksum = await digest(input.backup.data);
        if (checksum !== input.checksum || (input.backup.manifest && input.backup.manifest.dataChecksum !== checksum)) throw Object.assign(new Error("Backup checksum validation failed. The file may be damaged or altered."), { status: 400 });
        const validation = validateConnectedData(input.backup.data);
        if (!validation.valid && url.pathname === "/restore-apply") throw Object.assign(new Error(`Restore validation failed: ${validation.errors.join(" ")}`), { status: 400 });
        const name = url.pathname.endsWith("preview") ? "preview_connected_restore" : "apply_connected_restore";
        const database = await call(env.DATA, "/rpc", env, context, { method: "POST", body: JSON.stringify({ name, args: { p_restore_id: input.restoreId, p_data: snakeRestoreData(input.backup.data), p_mode: input.mode, p_checksum: checksum, p_source_version: String(input.backup.version), p_confirmation: input.confirmation || null } }) });
        return json({ ...validation, database, checksum, sourceVersion: input.backup.version }, 200, requestId);
      }
      return json({ code: "NOT_FOUND", message: "Backup route not found", service: "connected-backup-export", requestId, retryable: false }, 404, requestId);
    });
  },
};
