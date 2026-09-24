import {
  body,
  call,
  failure,
  health,
  json,
  withRequest,
} from "../_shared/runtime";
import type {
  AuthContext,
  BaseEnv,
  Fetcher,
  WorkerHandler,
} from "../_shared/types";
import { PersonShareChecklistMutation, PersonShareChecklistUpdate, PersonShareComment, PersonShareProjectPersonMutation, PersonShareTaskComplete, PersonShareTaskMutation, PersonShareVerification } from "../../packages/connected-contracts";
interface Env extends BaseEnv {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_ANON_KEY?: string;
  ALLOWED_ORIGINS: string;
  IDENTITY: Fetcher;
  DATA: Fetcher;
  TASKS: Fetcher;
  PEOPLE: Fetcher;
  DEPENDENCIES: Fetcher;
  REMINDERS: Fetcher;
  NOTIFICATIONS: Fetcher;
  BACKUP: Fetcher;
  DIAGNOSTICS: Fetcher;
}
const routes: Array<[string, RegExp, keyof Env, string]> = [
  ["GET", /^\/v1\/tasks$/, "TASKS", "/list"],
  ["POST", /^\/v1\/tasks\/save$/, "TASKS", "/save"],
  ["GET", /^\/v1\/tasks\/details$/, "TASKS", "/details"],
  ["GET", /^\/v1\/costs$/, "TASKS", "/costs"],
  ["POST", /^\/v1\/tasks\/checklist\/save$/, "TASKS", "/checklist-save"],
  ["GET", /^\/v1\/tasks\/checklist\/attention$/, "TASKS", "/checklist-attention"],
  ["GET", /^\/v1\/tasks\/checklists$/, "TASKS", "/checklists"],
  ["POST", /^\/v1\/tasks\/checklist\/toggle$/, "TASKS", "/checklist-toggle"],
  ["GET", /^\/v1\/tasks\/deadline-pressure$/, "TASKS", "/deadline-pressure"],
  ["POST", /^\/v1\/tasks\/checklist\/delete$/, "TASKS", "/checklist-delete"],
  ["POST", /^\/v1\/tasks\/delete$/, "TASKS", "/delete"],
  ["GET", /^\/v1\/tasks\/attachments$/, "TASKS", "/attachments"],
  ["POST", /^\/v1\/tasks\/attachments\/upload$/, "TASKS", "/attachment-upload"],
  ["POST", /^\/v1\/tasks\/attachments\/link$/, "TASKS", "/attachment-link"],
  ["POST", /^\/v1\/tasks\/attachments\/open$/, "TASKS", "/attachment-open"],
  ["POST", /^\/v1\/tasks\/attachments\/delete$/, "TASKS", "/attachment-delete"],
  ["GET", /^\/v1\/dashboard$/, "TASKS", "/dashboard"],
  ["GET", /^\/v1\/calendar$/, "TASKS", "/calendar"],
  ["GET", /^\/v1\/projects$/, "TASKS", "/projects"],
  ["POST", /^\/v1\/projects\/save$/, "TASKS", "/project-save"],
  ["POST", /^\/v1\/projects\/delete$/, "TASKS", "/project-delete"],
  ["GET", /^\/v1\/people$/, "PEOPLE", "/list"],
  ["GET", /^\/v1\/people\/details$/, "PEOPLE", "/details"],
  ["POST", /^\/v1\/people\/save$/, "PEOPLE", "/save"],
  ["GET", /^\/v1\/people\/project-people$/, "PEOPLE", "/project-people"],
  ["POST", /^\/v1\/people\/project-people\/save$/, "PEOPLE", "/project-people/save"],
  ["POST", /^\/v1\/people\/project-people\/create$/, "PEOPLE", "/project-people/create"],
  ["POST", /^\/v1\/people\/project-people\/remove$/, "PEOPLE", "/project-people/remove"],
  ["POST", /^\/v1\/people\/project-invitation$/, "PEOPLE", "/project-invitation"],
  ["POST", /^\/v1\/people\/accept-project-invitation$/, "PEOPLE", "/accept-project-invitation"],
  ["POST", /^\/v1\/people\/share-link$/, "PEOPLE", "/share-link"],
  ["POST", /^\/v1\/people\/claim-linked-project$/, "PEOPLE", "/claim-linked-project"],
  ["GET", /^\/v1\/people\/linked-projects$/, "PEOPLE", "/linked-projects"],
  ["GET", /^\/v1\/dependencies\/people-load$/, "DEPENDENCIES", "/people-load"],
  ["POST", /^\/v1\/dependencies\/link$/, "DEPENDENCIES", "/link"],
  ["POST", /^\/v1\/dependencies\/unlink$/, "DEPENDENCIES", "/unlink"],
  ["POST", /^\/v1\/dependencies\/update$/, "DEPENDENCIES", "/update"],
  [
    "POST",
    /^\/v1\/dependencies\/create-prerequisite$/,
    "DEPENDENCIES",
    "/create-prerequisite",
  ],
  ["GET", /^\/v1\/reminders$/, "REMINDERS", "/list"],
  ["POST", /^\/v1\/reminders\/snooze$/, "REMINDERS", "/snooze"],
  ["POST", /^\/v1\/push\/subscribe$/, "NOTIFICATIONS", "/subscribe"],
  ["POST", /^\/v1\/notifications\/test-email$/, "NOTIFICATIONS", "/test-email"],
  ["POST", /^\/v1\/notifications\/test-push$/, "NOTIFICATIONS", "/test-push"],
  ["GET", /^\/v1\/notifications\/readiness$/, "NOTIFICATIONS", "/readiness"],
  ["GET", /^\/v1\/notifications\/inbox$/, "NOTIFICATIONS", "/inbox"],
  ["POST", /^\/v1\/notifications\/read$/, "NOTIFICATIONS", "/read"],
  ["GET", /^\/v1\/preferences$/, "NOTIFICATIONS", "/preferences"],
  ["POST", /^\/v1\/preferences$/, "NOTIFICATIONS", "/preferences"],
  ["POST", /^\/v1\/backup\/export$/, "BACKUP", "/export"],
  ["POST", /^\/v1\/backup\/import-preview$/, "BACKUP", "/import-preview"],
  ["POST", /^\/v1\/backup\/import-apply$/, "BACKUP", "/import-apply"],
  ["GET", /^\/v1\/backup\/status$/, "BACKUP", "/status"],
  ["POST", /^\/v1\/backup\/restore-preview$/, "BACKUP", "/restore-preview"],
  ["POST", /^\/v1\/backup\/restore-apply$/, "BACKUP", "/restore-apply"],
  ["GET", /^\/v1\/diagnostics$/, "DIAGNOSTICS", "/list"],
];
const accessRoutes: Array<[string, RegExp, string]> = [
  ["GET", /^\/v1\/access\/state$/, "/state"],
  ["POST", /^\/v1\/access\/accept$/, "/accept"],
  ["POST", /^\/v1\/access\/profile$/, "/profile"],
  ["GET", /^\/v1\/access\/users$/, "/invitations"],
  ["GET", /^\/v1\/access\/usage$/, "/usage"],
  ["POST", /^\/v1\/access\/invite$/, "/invite"],
  ["POST", /^\/v1\/access\/resend$/, "/resend"],
  ["POST", /^\/v1\/access\/revoke$/, "/revoke"],
  ["POST", /^\/v1\/access\/disable$/, "/disable-user"],
  ["POST", /^\/v1\/access\/enable$/, "/enable-user"],
  ["POST", /^\/v1\/access\/delete-account$/, "/delete-account"],
];
async function authenticate(request: Request, env: Env): Promise<AuthContext> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer "))
    throw Object.assign(new Error("Authentication required"), { status: 401 });
  const key = env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY;
  if (!key) throw new Error("Supabase publishable key is not configured");
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: key },
  });
  if (!response.ok)
    throw Object.assign(new Error("Invalid or expired session"), {
      status: 401,
    });
  const user = (await response.json()) as { id: string; email?: string };
  return {
    userId: user.id,
    email: user.email,
    accessToken: authorization.slice(7),
  };
}
const cors = (origin: string, env: Env) => {
  const allowed = env.ALLOWED_ORIGINS.split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  if (!allowed.includes(origin)) return null;
  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, X-Idempotency-Key, X-Request-ID, X-Share-Verification",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  };
};
const decodeSignature = (value: string) => {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
};
async function verifyShareToken(token: string, secret: string) {
  const [id, signature, extra] = token.split(".");
  if (!id || !signature || extra || !/^[0-9a-f-]{36}$/i.test(id))
    throw Object.assign(new Error("This shared-task link is invalid"), { status: 404 });
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("HMAC", key, decodeSignature(signature), new TextEncoder().encode(id));
  if (!valid) throw Object.assign(new Error("This shared-task link is invalid"), { status: 404 });
  return id;
}
async function signVerification(shareId: string, secret: string) {
  const expires = Math.floor(Date.now() / 1000) + 30 * 60;
  const value = `${shareId}.${expires}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${value}:verified`));
  return `${value}.${btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")}`;
}
async function verifyVerification(token: string, shareId: string, secret: string) {
  const [id, expires, signature, extra] = token.split(".");
  if (id !== shareId || !expires || !signature || extra || Number(expires) <= Math.floor(Date.now() / 1000))
    throw Object.assign(new Error("Email verification is required to update shared work"), { status: 401 });
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("HMAC", key, decodeSignature(signature), new TextEncoder().encode(`${id}.${expires}:verified`));
  if (!valid) throw Object.assign(new Error("Email verification has expired or is invalid"), { status: 401 });
}
export default <WorkerHandler<Env>>{
  async fetch(request, env) {
    return withRequest("connected-gateway", request, env, async (requestId) => {
      const url = new URL(request.url),
        origin = request.headers.get("origin") || "",
        headers = cors(origin, env);
      if (request.method === "OPTIONS")
        return headers
          ? new Response(null, { status: 204, headers })
          : failure(
              "connected-gateway",
              requestId,
              new Error("Origin not allowed"),
              403,
            );
      if (url.pathname === "/v1/health")
        return json(
          health("connected-gateway", [
            "identity-access",
            "data",
            "tasks",
            "people",
            "dependencies",
            "reminders",
            "notifications",
            "backup",
            "diagnostics",
          ]),
          200,
          requestId,
          headers || {},
        );
      if (origin && !headers)
        return failure(
          "connected-gateway",
          requestId,
          new Error("Origin not allowed"),
          403,
        );
      const publicRoutes: Record<string, string> = {
        "/v1/public/person-tasks": "/public/person-tasks",
        "/v1/public/person-preferences": "/public/person-preferences",
        "/v1/public/person-push-subscribe": "/public/person-push-subscribe",
        "/v1/public/person-checklist": "/public/person-checklist",
        "/v1/public/person-complete": "/public/person-complete",
        "/v1/public/person-comment": "/public/person-comment",
        "/v1/public/person-task-mutation": "/public/person-task-mutation",
        "/v1/public/person-checklist-mutation": "/public/person-checklist-mutation",
        "/v1/public/person-project-person": "/public/person-project-person",
      };
      if (url.pathname === "/v1/public/project-invitation" && request.method === "GET") {
        const code = url.searchParams.get("code") || "";
        const clientIp = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
        const result = await call(env.PEOPLE, "/public-project-invitation", env, undefined, { method: "POST", body: JSON.stringify({ code }), headers: { "x-request-id": requestId, "x-client-ip": clientIp } });
        return json(result, 200, requestId, headers || {});
      }
      if (["/v1/public/person-verification/request", "/v1/public/person-verification/verify"].includes(url.pathname) && request.method === "POST") {
        const payload = await body(request) as Record<string, unknown>;
        const shareId = await verifyShareToken(String(payload.token || ""), env.INTERNAL_SERVICE_TOKEN);
        if (url.pathname.endsWith("/request")) {
          const result = await call(env.NOTIFICATIONS, "/person-verification", env, undefined, { method: "POST", body: JSON.stringify({ shareId }), headers: { "x-request-id": requestId } });
          return json(result, 200, requestId, headers || {});
        }
        const verification = PersonShareVerification.parse({ code: payload.code });
        const result = await call(env.DATA, "/public/person-verification-verify", env, undefined, { method: "POST", body: JSON.stringify({ shareId, code: verification.code }), headers: { "x-request-id": requestId } }) as { verified: boolean };
        if (!result.verified) throw Object.assign(new Error("The verification code is invalid or expired"), { status: 401 });
        return json({ verificationToken: await signVerification(shareId, env.INTERNAL_SERVICE_TOKEN), expiresInMinutes: 30 }, 200, requestId, headers || {});
      }
      if (publicRoutes[url.pathname] && (request.method === "GET" || request.method === "POST")) {
        const payload = request.method === "POST" ? await body(request) as Record<string, unknown> : {};
        const token = request.method === "GET" ? url.searchParams.get("token") || "" : String(payload.token || "");
        const shareId = await verifyShareToken(token, env.INTERNAL_SERVICE_TOKEN);
        const publicPayload = { ...payload };
        delete publicPayload.token;
        if (["/v1/public/person-checklist", "/v1/public/person-complete", "/v1/public/person-comment", "/v1/public/person-task-mutation", "/v1/public/person-checklist-mutation", "/v1/public/person-project-person"].includes(url.pathname))
          await verifyVerification(request.headers.get("x-share-verification") || "", shareId, env.INTERNAL_SERVICE_TOKEN);
        const mutation = url.pathname === "/v1/public/person-checklist" ? PersonShareChecklistUpdate.parse({ itemId: payload.itemId, completed: payload.completed, expectedVersion: payload.expectedVersion })
          : url.pathname === "/v1/public/person-complete" ? PersonShareTaskComplete.parse({ taskId: payload.taskId, expectedVersion: payload.expectedVersion })
          : url.pathname === "/v1/public/person-comment" ? PersonShareComment.parse({ taskId: payload.taskId, comment: payload.comment })
          : url.pathname === "/v1/public/person-task-mutation" ? PersonShareTaskMutation.parse(publicPayload)
          : url.pathname === "/v1/public/person-checklist-mutation" ? PersonShareChecklistMutation.parse(publicPayload)
          : url.pathname === "/v1/public/person-project-person" ? PersonShareProjectPersonMutation.parse(publicPayload) : payload;
        const result = await call(env.DATA, publicRoutes[url.pathname], env, undefined, {
          method: "POST",
          body: JSON.stringify({ ...mutation, token: undefined, shareId }),
          headers: { "x-request-id": requestId },
        });
        if (!result && url.pathname === "/v1/public/person-tasks") throw Object.assign(new Error("This shared-task link is unavailable or has been revoked"), { status: 404 });
        return json(result, 200, requestId, headers || {});
      }
      const base = await authenticate(request, env),
        access = accessRoutes.find(
          ([method, re]) => method === request.method && re.test(url.pathname),
        );
      if (access) {
        const payload =
          request.method === "GET" ? undefined : await body(request);
        const result = await call(env.IDENTITY, access[2], env, base, {
          method: request.method,
          body: payload === undefined ? undefined : JSON.stringify(payload),
          headers: { "x-request-id": requestId },
        });
        return json(result, 200, requestId, headers || {});
      }
      const resolved = (await call(env.IDENTITY, "/authorize", env, base, {
        method: "POST",
        body: "{}",
      })) as any;
      if (resolved.status !== "active" || !resolved.workspaceId)
        throw Object.assign(
          new Error(
            resolved.status === "disabled"
              ? "This account is disabled"
              : "Invitation acceptance is required",
          ),
          { status: 403 },
        );
      const context: AuthContext = {
        ...base,
        workspaceId: resolved.workspaceId,
        role: resolved.role,
        platformAdmin: resolved.platformAdmin,
      };
      const route = routes.find(
        ([method, re]) => method === request.method && re.test(url.pathname),
      );
      if (!route)
        return failure(
          "connected-gateway",
          requestId,
          new Error("Route not found"),
          404,
          headers || {},
        );
      const binding = env[route[2]] as unknown as Fetcher,
        limit = url.pathname.startsWith("/v1/backup/restore-")
          ? 20_000_000
          : url.pathname.startsWith("/v1/backup/import-") || url.pathname === "/v1/tasks/attachments/upload"
            ? 8_500_000
          : 1_000_000,
        payload =
          request.method === "GET" ? undefined : await body(request, limit);
      const result = await call(
        binding,
        `${route[3]}${url.search}`,
        env,
        context,
        {
          method: request.method,
          body: payload === undefined ? undefined : JSON.stringify(payload),
          headers: {
            "x-request-id": requestId,
            "x-idempotency-key":
              request.headers.get("x-idempotency-key") || crypto.randomUUID(),
          },
        },
      );
      return json(result, 200, requestId, headers || {});
    });
  },
};
