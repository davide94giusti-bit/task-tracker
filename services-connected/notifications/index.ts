import { NotificationPreferences, PushSubscriptionWrite, RecordId } from "../../packages/connected-contracts";
import { reminderEmail } from "../_shared/email";
import { sendWebPush } from "../_shared/webpush";
import { body, call, health, internal, json, withRequest, workspaceContext } from "../_shared/runtime";
import type { AuthContext, BaseEnv, Fetcher, WorkerHandler } from "../_shared/types";

interface Env extends BaseEnv {
  DATA: Fetcher; RESEND_API_KEY: string; RESEND_FROM: string; APP_URL: string;
  VAPID_SUBJECT: string; VAPID_PUBLIC_KEY: string; VAPID_PRIVATE_JWK: string;
  EMAIL_DAILY_CEILING?: string;
}

async function email(env: Env, to: string, input: { title: string; dateLabel: string; url: string; kind: string }, idempotency: string) {
  const template = reminderEmail(input);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": idempotency },
    body: JSON.stringify({ from: env.RESEND_FROM, to: [to], subject: template.subject, text: template.text, html: template.html }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw Object.assign(new Error(`Email delivery failed (${response.status}): ${detail.slice(0, 240)}`), { permanent: response.status >= 400 && response.status < 500 && response.status !== 429 });
  }
  return response.json();
}

async function select(env: Env, context: AuthContext, table: string, filters: Record<string, unknown>, limit = 100) {
  return call(env.DATA, "/select", env, context, { method: "POST", body: JSON.stringify({ table, filters, limit }) }) as Promise<any[]>;
}

export default <WorkerHandler<Env>>{
  async fetch(request, env) {
    return withRequest("connected-notifications", request, env, async requestId => {
      internal(request, env);
      const url = new URL(request.url);
      if (url.pathname === "/health") return json(health("connected-notifications", ["data", "resend", "web-push"]), 200, requestId);
      if (url.pathname === "/deliver") {
        const d = await body(request) as any, link = `${env.APP_URL}/?task=${encodeURIComponent(d.taskId)}`, system = { userId: "scheduler" };
        const subscriptions = d.pushEnabled && !d.pushSent ? await call(env.DATA, "/admin/subscriptions", env, system, { method: "POST", body: JSON.stringify({ workspaceId: d.workspaceId, userId: d.userId }) }) as any[] : [];
        let pushSent = !!d.pushSent, emailSent = !!d.emailSent, errorCode: string | undefined;
        for (const sub of subscriptions) {
          try {
            const response = await sendWebPush({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, { title: "Task Tracker", body: d.title, url: link, tag: d.deliveryId }, { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateJwk: env.VAPID_PRIVATE_JWK });
            if (response.ok) pushSent = true;
            else if (response.status === 404 || response.status === 410) await call(env.DATA, "/admin/disable-subscription", env, system, { method: "POST", body: JSON.stringify({ id: sub.id, workspaceId: d.workspaceId }) });
          } catch { errorCode = "PUSH_FAILED"; }
        }
        if (d.emailEnabled && !emailSent && d.recipientEmail) {
          const count = Number(await call(env.DATA, "/admin/email-count", env, system, { method: "POST", body: "{}" })), ceiling = Number(env.EMAIL_DAILY_CEILING || 75);
          if (count >= ceiling) errorCode = "EMAIL_DAILY_CEILING";
          else try { await email(env, d.recipientEmail, { title: d.title, dateLabel: d.reminderTime || "", url: link, kind: "Reminder" }, d.idempotencyKey); emailSent = true; }
          catch (error) { errorCode = (error as any).permanent ? "EMAIL_PERMANENT" : "EMAIL_TRANSIENT"; }
        }
        const delivered = (!d.pushEnabled || pushSent) && (!d.emailEnabled || emailSent), attempt = Number(d.attemptCount || 1), terminal = attempt >= 5 || errorCode === "EMAIL_PERMANENT", status = delivered ? "delivered" : errorCode === "EMAIL_DAILY_CEILING" ? "quota_reached" : terminal ? "failed" : "retry", nextAttemptAt = status === "retry" ? new Date(Date.now() + Math.min(3600, 30 * 2 ** attempt) * 1000).toISOString() : undefined;
        await call(env.DATA, "/admin/complete-delivery", env, system, { method: "POST", body: JSON.stringify({ deliveryId: d.deliveryId, status, emailSent, pushSent, errorCode, nextAttemptAt }) });
        return json({ status, emailSent, pushSent }, 200, requestId);
      }
      const context = workspaceContext(request);
      if (url.pathname === "/subscribe") {
        const input = PushSubscriptionWrite.parse(await body(request));
        const existing = (await select(env, context, "push_subscriptions", { user_id: context.userId, endpoint: input.endpoint }, 1))[0];
        const row = { user_id: context.userId, endpoint: input.endpoint, expiration_time: input.expirationTime, p256dh: input.keys.p256dh, auth: input.keys.auth, device_label: input.deviceLabel, disabled: false };
        return json(await call(env.DATA, "/write", env, context, { method: "POST", body: JSON.stringify({ table: "push_subscriptions", method: existing ? "patch" : "post", id: existing?.id, row: existing ? row : { id: crypto.randomUUID(), ...row } }) }), 200, requestId);
      }
      if (url.pathname === "/inbox") {
        const items = await select(env, context, "notification_deliveries", { user_id: context.userId }, 100);
        items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
        return json({ items, unread: items.filter(item => !item.readAt).length }, 200, requestId);
      }
      if (url.pathname === "/read") {
        const input = RecordId.parse(await body(request));
        return json(await call(env.DATA, "/write", env, context, { method: "POST", body: JSON.stringify({ table: "notification_deliveries", method: "patch", id: input.id, row: { read_at: new Date().toISOString() } }) }), 200, requestId);
      }
      if (url.pathname === "/preferences") {
        const existing = await select(env, context, "notification_preferences", { user_id: context.userId }, 1);
        if (request.method === "GET") return json(existing[0] || null, 200, requestId);
        const input = NotificationPreferences.parse(await body(request));
        const row = {
          ...(!existing[0] ? { id: crypto.randomUUID() } : {}),
          user_id: context.userId,
          email_enabled: input.emailEnabled,
          push_enabled: input.pushEnabled,
          reminder: input.reminder,
          due_today: input.dueToday,
          overdue: input.overdue,
          daily_summary: input.dailySummary,
          timezone: input.timezone,
          quiet_start: input.quietStart,
          quiet_end: input.quietEnd,
          currency_code: input.currencyCode,
        };
        return json(await call(env.DATA, "/write", env, context, { method: "POST", body: JSON.stringify({ table: "notification_preferences", method: existing[0] ? "patch" : "post", id: existing[0]?.id, row }) }), 200, requestId);
      }
      if (url.pathname === "/test-email") {
        if (!context.email) throw new Error("No account email is available");
        return json(await email(env, context.email, { title: "Your Task Tracker email connection works", dateLabel: new Date().toLocaleString(), url: env.APP_URL, kind: "Test email" }, `test-${context.userId}-${crypto.randomUUID()}`), 200, requestId);
      }
      return json({ code: "NOT_FOUND", message: "Notification route not found", service: "connected-notifications", requestId, retryable: false }, 404, requestId);
    });
  },
};
