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
  ["POST", /^\/v1\/tasks\/checklist\/save$/, "TASKS", "/checklist-save"],
  ["POST", /^\/v1\/tasks\/checklist\/delete$/, "TASKS", "/checklist-delete"],
  ["GET", /^\/v1\/dashboard$/, "TASKS", "/dashboard"],
  ["GET", /^\/v1\/calendar$/, "TASKS", "/calendar"],
  ["GET", /^\/v1\/projects$/, "TASKS", "/projects"],
  ["POST", /^\/v1\/projects\/save$/, "TASKS", "/project-save"],
  ["GET", /^\/v1\/people$/, "PEOPLE", "/list"],
  ["POST", /^\/v1\/people\/save$/, "PEOPLE", "/save"],
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
  ["GET", /^\/v1\/notifications\/inbox$/, "NOTIFICATIONS", "/inbox"],
  ["POST", /^\/v1\/notifications\/read$/, "NOTIFICATIONS", "/read"],
  ["GET", /^\/v1\/preferences$/, "NOTIFICATIONS", "/preferences"],
  ["POST", /^\/v1\/preferences$/, "NOTIFICATIONS", "/preferences"],
  ["POST", /^\/v1\/backup\/export$/, "BACKUP", "/export"],
  ["POST", /^\/v1\/backup\/import-preview$/, "BACKUP", "/import-preview"],
  ["POST", /^\/v1\/backup\/import-apply$/, "BACKUP", "/import-apply"],
  ["GET", /^\/v1\/diagnostics$/, "DIAGNOSTICS", "/list"],
];
const accessRoutes: Array<[string, RegExp, string]> = [
  ["GET", /^\/v1\/access\/state$/, "/state"],
  ["POST", /^\/v1\/access\/accept$/, "/accept"],
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
      "Authorization, Content-Type, X-Idempotency-Key, X-Request-ID",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  };
};
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
        );
      const binding = env[route[2]] as unknown as Fetcher,
        limit = url.pathname.startsWith("/v1/backup/import-")
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
