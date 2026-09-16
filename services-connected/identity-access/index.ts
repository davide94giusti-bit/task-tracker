import {
  AccountDeletionRequest,
  InvitationAccept,
  InvitationAction,
  InvitationCreate,
  UserAccessAction,
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
import type {
  AuthContext,
  BaseEnv,
  Fetcher,
  WorkerHandler,
} from "../_shared/types";
interface Env extends BaseEnv {
  DATA: Fetcher;
  SUPABASE_URL: string;
  SUPABASE_SECRET_KEY: string;
  APP_URL: string;
  BOOTSTRAP_OWNER_EMAILS: string;
  CONNECTED_USER_LIMIT: string;
}
async function data(
  env: Env,
  path: string,
  context: AuthContext,
  input: unknown = {},
) {
  return call(env.DATA, path, env, context, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
async function state(env: Env, context: AuthContext) {
  return data(env, "/identity/state", context, {
    email: context.email,
  }) as Promise<any>;
}
async function requireAdmin(env: Env, context: AuthContext) {
  const current = await state(env, context);
  if (!current.platformAdmin)
    throw Object.assign(
      new Error("Platform administrator permission required"),
      { status: 403 },
    );
  return current;
}
async function authAdmin(env: Env, path: string, init: RequestInit = {}) {
  const headers: Record<string, string> = {
    apikey: env.SUPABASE_SECRET_KEY,
    "Content-Type": "application/json",
  };
  if (env.SUPABASE_SECRET_KEY.split(".").length === 3)
    headers.Authorization = `Bearer ${env.SUPABASE_SECRET_KEY}`;
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/admin${path}`, {
    ...init,
    headers: { ...headers, ...init.headers },
  });
  if (!response.ok)
    throw Object.assign(
      new Error(`Identity provider operation failed (${response.status})`),
      { status: response.status },
    );
  return response.json();
}
async function audit(
  env: Env,
  context: AuthContext,
  eventType: string,
  subjectId?: string,
) {
  try {
    await data(env, "/identity/audit", context, { eventType, subjectId });
  } catch {}
}
export default <WorkerHandler<Env>>{
  async fetch(request, env) {
    return withRequest(
      "connected-identity-access",
      request,
      env,
      async (requestId) => {
        internal(request, env);
        const url = new URL(request.url);
        if (url.pathname === "/health")
          return json(
            health("connected-identity-access", ["data", "supabase-auth"]),
            200,
            requestId,
          );
        const context = authContext(request);
        if (url.pathname === "/authorize" || url.pathname === "/state")
          return json(await state(env, context), 200, requestId);
        if (url.pathname === "/accept") {
          InvitationAccept.parse(await body(request));
          const result = await data(env, "/identity/accept", context, {
            email: context.email,
            bootstrapEmails: env.BOOTSTRAP_OWNER_EMAILS.split(",")
              .map((x) => x.trim().toLowerCase())
              .filter(Boolean),
          });
          await audit(env, context, "invitation.accepted", result.workspaceId);
          return json(result, 200, requestId);
        }
        if (url.pathname === "/invitations") {
          await requireAdmin(env, context);
          return json(
            await data(env, "/identity/list", context),
            200,
            requestId,
          );
        }
        if (url.pathname === "/usage") {
          await requireAdmin(env, context);
          return json(
            await data(env, "/identity/usage", context, {
              userLimit: Number(env.CONNECTED_USER_LIMIT || 20),
            }),
            200,
            requestId,
          );
        }
        if (url.pathname === "/invite") {
          await requireAdmin(env, context);
          const input = InvitationCreate.parse(await body(request));
          const invitation = await data(env, "/identity/invite", context, {
            ...input,
            userLimit: Number(env.CONNECTED_USER_LIMIT || 20),
          });
          try {
            await authAdmin(env, "/invite", {
              method: "POST",
              body: JSON.stringify({
                email: input.email,
                data: { invitation_id: invitation.id },
                redirect_to: `${env.APP_URL}/?auth=invite`,
              }),
            });
            await audit(env, context, "invitation.sent", invitation.id);
          } catch (error) {
            await data(env, "/identity/invitation-action", context, {
              invitationId: invitation.id,
              action: "revoke",
            });
            throw error;
          }
          return json(invitation, 200, requestId);
        }
        if (url.pathname === "/resend") {
          await requireAdmin(env, context);
          const input = InvitationAction.parse(await body(request));
          const invitation = await data(
            env,
            "/identity/invitation-action",
            context,
            { ...input, action: "resend" },
          );
          await authAdmin(env, "/invite", {
            method: "POST",
            body: JSON.stringify({
              email: invitation.email,
              data: { invitation_id: invitation.id },
              redirect_to: `${env.APP_URL}/?auth=invite`,
            }),
          });
          return json(invitation, 200, requestId);
        }
        if (url.pathname === "/revoke") {
          await requireAdmin(env, context);
          const input = InvitationAction.parse(await body(request));
          return json(
            await data(env, "/identity/invitation-action", context, {
              ...input,
              action: "revoke",
            }),
            200,
            requestId,
          );
        }
        if (
          url.pathname === "/disable-user" ||
          url.pathname === "/enable-user"
        ) {
          await requireAdmin(env, context);
          const input = UserAccessAction.parse(await body(request)),
            disable = url.pathname === "/disable-user";
          const result = await data(env, "/identity/user-access", context, {
            ...input,
            action: disable ? "disable" : "enable",
          });
          await authAdmin(env, `/users/${input.userId}`, {
            method: "PUT",
            body: JSON.stringify({
              ban_duration: disable ? "876000h" : "none",
            }),
          });
          await audit(
            env,
            context,
            disable ? "user.disabled" : "user.reenabled",
            input.userId,
          );
          return json(result, 200, requestId);
        }
        if (url.pathname === "/delete-account") {
          const input = AccountDeletionRequest.parse(await body(request));
          return json(
            await data(env, "/identity/delete", context, input),
            202,
            requestId,
          );
        }
        return json(
          {
            code: "NOT_FOUND",
            message: "Identity route not found",
            service: "connected-identity-access",
            requestId,
            retryable: false,
          },
          404,
          requestId,
        );
      },
    );
  },
};
