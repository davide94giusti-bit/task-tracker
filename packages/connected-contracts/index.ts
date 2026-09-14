import { z } from 'zod';

export const CONNECTED_API_VERSION = 'v1' as const;
export const Role = z.enum(['owner', 'admin', 'member', 'viewer']);
export const TaskStatus = z.enum(['not_started', 'in_progress', 'waiting', 'blocked', 'completed', 'cancelled', 'archived']);
export const Priority = z.enum(['critical', 'high', 'medium', 'low', 'none']);
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const Uuid = z.string().uuid();

export const ApiError = z.object({
  code: z.string(), message: z.string(), service: z.string(), requestId: z.string(), retryable: z.boolean(), details: z.unknown().optional()
});
export const Envelope = z.object({ ok: z.boolean(), requestId: z.string(), data: z.unknown().optional(), error: ApiError.optional() });

export const WorkspaceContext = z.object({ workspaceId: Uuid, userId: Uuid, role: Role });
export const TaskWrite = z.object({
  id: Uuid.optional(), title: z.string().trim().min(1).max(500), description: z.string().max(50_000).default(''),
  status: TaskStatus.default('not_started'), priority: Priority.default('medium'), projectId: Uuid.nullable().optional(),
  responsiblePersonId: Uuid.nullable().optional(), dueDate: IsoDate.nullable().optional(), dueTime: z.string().nullable().optional(),
  reminderAt: z.string().datetime({ offset: true }).nullable().optional(), recurrence: z.record(z.string(), z.unknown()).nullable().optional(),
  expectedVersion: z.number().int().positive().optional(), idempotencyKey: z.string().uuid().optional()
});
export const TaskQuery = z.object({
  view: z.enum(['all','today','upcoming','completed','trash']).default('all'), search: z.string().max(500).optional(),
  projectId: Uuid.optional(), responsiblePersonId: Uuid.optional(), due: z.enum(['overdue','today','next7']).optional(),
  priority: Priority.optional(), status: TaskStatus.optional(), blocked: z.boolean().optional(), page: z.number().int().positive().default(1), pageSize: z.number().int().min(1).max(100).default(50)
}).strict();
export const CalendarQuery = z.object({ start: IsoDate, end: IsoDate }).refine(v => v.end >= v.start).refine(v => (Date.parse(v.end)-Date.parse(v.start))/86_400_000 <= 62);
export const CreatePrerequisite = z.object({ waitingTaskId: Uuid, task: TaskWrite.omit({ id: true }), mandatory: z.boolean().default(true) });
export const DependencyWrite = z.object({ waitingTaskId: Uuid, prerequisiteTaskId: Uuid, mandatory: z.boolean().default(true) });
export const ImportRequest = z.object({ importId: Uuid, dryRun: z.boolean().default(true), snapshot: z.record(z.string(), z.unknown()) });
export const PushSubscriptionWrite = z.object({ endpoint: z.string().url().max(4096).refine(v=>v.startsWith('https://'),'Push endpoint must use HTTPS'), expirationTime: z.number().nullable(), keys: z.object({ p256dh:z.string().min(1).max(512), auth:z.string().min(1).max(512) }), deviceLabel:z.string().max(100).optional() });
export const NotificationPreferences = z.object({ emailEnabled:z.boolean(), pushEnabled:z.boolean(), reminder:z.boolean(), dueToday:z.boolean(), overdue:z.boolean(), dailySummary:z.boolean(), timezone:z.string().min(1).max(100), quietStart:z.string(), quietEnd:z.string() });

export type ConnectedTaskWrite = z.infer<typeof TaskWrite>;
export type ConnectedTaskQuery = z.infer<typeof TaskQuery>;
