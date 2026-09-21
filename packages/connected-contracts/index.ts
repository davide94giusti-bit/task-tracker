import { z } from "zod";

export const CONNECTED_API_VERSION = "v1" as const;
export const Role = z.enum(["owner", "admin", "member", "viewer"]);
export const TaskStatus = z.enum([
  "not_started",
  "in_progress",
  "waiting",
  "blocked",
  "completed",
  "cancelled",
  "archived",
]);
export const Priority = z.enum(["critical", "high", "medium", "low", "none"]);
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const Uuid = z.string().uuid();
export const MoneyAmount = z
  .number()
  .finite()
  .nonnegative()
  .max(999_999_999_999.99)
  .nullable();
export const ReminderRepeat = z.enum(["none", "daily", "weekly", "monthly"]);

export const ApiError = z.object({
  code: z.string(),
  message: z.string(),
  service: z.string(),
  requestId: z.string(),
  retryable: z.boolean(),
  details: z.unknown().optional(),
});
export const Envelope = z.object({
  ok: z.boolean(),
  requestId: z.string(),
  data: z.unknown().optional(),
  error: ApiError.optional(),
});

export const WorkspaceContext = z.object({
  workspaceId: Uuid,
  userId: Uuid,
  role: Role,
});
export const TaskWrite = z.object({
  id: Uuid.optional(),
  title: z.string().trim().min(1).max(500),
  description: z.string().max(50_000).default(""),
  status: TaskStatus.default("not_started"),
  priority: Priority.default("medium"),
  projectId: Uuid.nullable().optional(),
  responsiblePersonId: Uuid.nullable().optional(),
  dueDate: IsoDate.nullable().optional(),
  dueTime: z.string().nullable().optional(),
  reminderAt: z.string().datetime({ offset: true }).nullable().optional(),
  reminderRepeat: ReminderRepeat.default("none"),
  reminderRepeatInterval: z.number().int().min(1).max(365).default(1),
  recurrence: z.record(z.string(), z.unknown()).nullable().optional(),
  costAmount: MoneyAmount.optional(),
  costDate: IsoDate.nullable().optional(),
  completeWhenChecklistDone: z.boolean().default(false),
  expectedVersion: z.number().int().positive().optional(),
  idempotencyKey: z.string().uuid().optional(),
});
export const ProjectWrite = z.object({
  id: Uuid.optional(),
  name: z.string().trim().min(1).max(300),
  description: z.string().max(10_000).default(""),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#2563eb"),
  expectedVersion: z.number().int().positive().optional(),
});
export const ProjectDelete = z.object({ id: Uuid, expectedVersion: z.number().int().positive() }).strict();
export const TaskQuery = z
  .object({
    view: z
      .enum(["all", "today", "upcoming", "completed", "trash"])
      .default("all"),
    search: z.string().max(500).optional(),
    projectId: Uuid.optional(),
    responsiblePersonId: Uuid.optional(),
    due: z.enum(["overdue", "today", "next7"]).optional(),
    priority: Priority.optional(),
    status: TaskStatus.optional(),
    blocked: z.boolean().optional(),
    dependencyRole: z.enum(["prerequisite"]).optional(),
    page: z.number().int().positive().default(1),
    pageSize: z.number().int().min(1).max(100).default(50),
  })
  .strict();
export const CalendarQuery = z
  .object({ start: IsoDate, end: IsoDate })
  .refine((v) => v.end >= v.start)
  .refine((v) => (Date.parse(v.end) - Date.parse(v.start)) / 86_400_000 <= 62);
export const CreatePrerequisite = z.object({
  waitingTaskId: Uuid,
  task: TaskWrite.omit({ id: true }),
  mandatory: z.boolean().default(true),
});
export const DependencyWrite = z.object({
  waitingTaskId: Uuid,
  prerequisiteTaskId: Uuid,
  mandatory: z.boolean().default(true),
});
export const ChecklistWrite = z.object({
  id: Uuid.optional(),
  taskId: Uuid,
  description: z.string().trim().min(1).max(1000),
  completed: z.boolean().default(false),
  required: z.boolean().default(true),
  position: z.number().int().nonnegative().default(0),
  costAmount: MoneyAmount.optional(),
  dueDate: IsoDate.nullable().optional(),
});
export const CostQuery = z
  .object({
    year: z.number().int().min(2000).max(2200).optional(),
    month: z.number().int().min(1).max(12).optional(),
    compareYear: z.number().int().min(2000).max(2200).optional(),
    projectId: Uuid.optional(),
  })
  .strict();
export const RecordId = z.object({ id: Uuid }).strict();
export const TaskAttachmentUpload = z.object({
  taskId: Uuid,
  fileName: z.string().trim().min(1).max(240),
  mimeType: z.string().trim().min(1).max(150),
  sizeBytes: z.number().int().positive().max(6 * 1024 * 1024),
  base64Data: z.string().min(1).max(8_500_000),
}).strict();
export const TaskAttachmentLink = z.object({
  taskId: Uuid,
  label: z.string().trim().min(1).max(240),
  url: z.string().url().max(4096).refine(value => value.startsWith('https://'), 'Links must use HTTPS'),
}).strict();
export const DependencyUpdate = z.object({ id: Uuid, mandatory: z.boolean() }).strict();
export const ImportRequest = z.object({
  importId: Uuid,
  dryRun: z.boolean().default(true),
  snapshot: z.record(z.string(), z.unknown()),
});
export const PushSubscriptionWrite = z.object({
  endpoint: z
    .string()
    .url()
    .max(4096)
    .refine((v) => v.startsWith("https://"), "Push endpoint must use HTTPS"),
  expirationTime: z.number().nullable(),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(512),
  }),
  deviceLabel: z.string().max(100).optional(),
});
export const NotificationPreferences = z.object({
  emailEnabled: z.boolean(),
  pushEnabled: z.boolean(),
  reminder: z.boolean(),
  dueToday: z.boolean(),
  overdue: z.boolean(),
  dailySummary: z.boolean(),
  timezone: z.string().min(1).max(100),
  quietStart: z.string(),
  quietEnd: z.string(),
  currencyCode: z.string().regex(/^[A-Z]{3}$/).default("CHF"),
});

export const InviteStatus = z.enum([
  "pending",
  "accepted",
  "expired",
  "revoked",
  "disabled",
]);
export const EmailAddress = z
  .string()
  .trim()
  .email()
  .max(320)
  .transform((value) => value.toLowerCase());
export const InvitationCreate = z.object({ email: EmailAddress }).strict();
export const InvitationAction = z.object({ invitationId: Uuid }).strict();
export const InvitationAccept = z.object({
  displayName: z.string().trim().min(2).max(80),
}).strict();
export const UserAccessAction = z.object({ userId: Uuid }).strict();
export const PersonShareConfigure = z.object({
  personId: Uuid,
  action: z.literal("configure"),
  scopeMode: z.enum(["assigned", "project"]),
  projectId: Uuid.nullable().optional(),
  allowChecklistUpdates: z.boolean(),
  allowTaskCompletion: z.boolean(),
  allowComments: z.boolean(),
  allowViewProjectContacts: z.boolean().default(false),
  allowViewContactAssignments: z.boolean().default(false),
  allowSuperviseContactChecklists: z.boolean().default(false),
  allowCompleteContactTasks: z.boolean().default(false),
  allowManageProjectContacts: z.boolean().default(false),
  allowCreateEditTasks: z.boolean().default(false),
  allowManageChecklistItems: z.boolean().default(false),
  expiresAt: z.string().datetime({ offset: true }).nullable(),
}).strict().refine(value => value.scopeMode !== "project" || Boolean(value.projectId), {
  message: "A project is required for project collaboration",
  path: ["projectId"],
});
export const ProjectPersonSave = z.object({
  projectId: Uuid,
  personId: Uuid,
  sharePhone: z.boolean().default(false),
  shareEmail: z.boolean().default(false),
  shareAddress: z.boolean().default(false),
  shareNotes: z.boolean().default(false),
  supervisable: z.boolean().default(false),
}).strict();
export const ProjectPersonRemove = z.object({ projectId: Uuid, personId: Uuid }).strict();
export const ProjectPersonCreate = ProjectPersonSave.omit({ personId: true }).extend({
  fullName: z.string().trim().min(1).max(300),
  role: z.string().trim().max(300).default(""),
  company: z.string().trim().max(300).default(""),
  phone: z.string().trim().max(100).default(""),
  email: EmailAddress.or(z.literal("")).default(""),
  address: z.string().trim().max(1000).default(""),
  notes: z.string().max(10000).default(""),
}).strict();
export const PersonShareVerification = z.object({ code: z.string().regex(/^\d{6}$/) }).strict();
export const PersonShareChecklistUpdate = z.object({
  itemId: Uuid, completed: z.boolean(), expectedVersion: z.number().int().positive().optional(),
}).strict();
export const PersonShareTaskComplete = z.object({
  taskId: Uuid, expectedVersion: z.number().int().positive().optional(),
}).strict();
export const PersonShareComment = z.object({ taskId: Uuid, comment: z.string().trim().min(1).max(2000) }).strict();
const SharedTaskEditableFields = z.object({
  title: z.string().trim().min(1).max(500),
  description: z.string().max(50_000).default(""),
  status: z.enum(["not_started", "in_progress", "waiting", "blocked"]).default("not_started"),
  priority: Priority.default("medium"),
  dueDate: IsoDate.nullable().optional(),
});
export const PersonShareTaskMutation = z.discriminatedUnion("action", [
  SharedTaskEditableFields.extend({ action: z.literal("create") }).strict(),
  SharedTaskEditableFields.extend({
    action: z.literal("update"),
    taskId: Uuid,
    expectedVersion: z.number().int().positive(),
  }).strict(),
]);
export const PersonShareChecklistMutation = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"), taskId: Uuid,
    description: z.string().trim().min(1).max(1000), required: z.boolean().default(true),
    dueDate: IsoDate.nullable().optional(),
  }).strict(),
  z.object({
    action: z.literal("update"), taskId: Uuid, itemId: Uuid,
    description: z.string().trim().min(1).max(1000), required: z.boolean(),
    dueDate: IsoDate.nullable().optional(),
    expectedVersion: z.number().int().positive(),
  }).strict(),
  z.object({
    action: z.literal("remove"), taskId: Uuid, itemId: Uuid,
    expectedVersion: z.number().int().positive(),
  }).strict(),
  z.object({
    action: z.literal("reorder"), taskId: Uuid,
    orderedItemIds: z.array(Uuid).min(1).max(500),
  }).strict(),
]);
const SharedProjectPersonFields = z.object({
  fullName: z.string().trim().min(1).max(300), role: z.string().trim().max(300).default(""),
  company: z.string().trim().max(300).default(""), phone: z.string().trim().max(100).default(""),
  email: EmailAddress.or(z.literal("")).default(""), address: z.string().trim().max(1000).default(""),
  notes: z.string().max(10000).default(""), sharePhone: z.boolean().default(false),
  shareEmail: z.boolean().default(false), shareAddress: z.boolean().default(false),
  shareNotes: z.boolean().default(false), supervisable: z.boolean().default(false),
});
export const PersonShareProjectPersonMutation = z.discriminatedUnion("action", [
  SharedProjectPersonFields.extend({ action: z.literal("create") }).strict(),
  SharedProjectPersonFields.extend({ action: z.literal("update"), personId: Uuid }).strict(),
  z.object({ action: z.literal("remove"), personId: Uuid }).strict(),
]);
export const AccountDeletionRequest = z
  .object({
    confirmation: z.literal("DELETE MY ACCOUNT"),
    exportFirst: z.boolean().default(true),
  })
  .strict();
export const PasswordChange = z
  .object({
    password: z
      .string()
      .min(12)
      .max(128)
      .regex(/[a-z]/)
      .regex(/[A-Z]/)
      .regex(/[0-9]/),
  })
  .strict();
export const IdentityState = z.object({
  status: z.enum(["active", "invited", "uninvited", "disabled"]),
  userId: Uuid,
  email: EmailAddress,
  workspaceId: Uuid.optional(),
  role: Role.optional(),
  platformAdmin: z.boolean(),
  displayName: z.string().default(""),
  requiresPasswordSetup: z.boolean().default(false),
});
export const InviteRecord = z.object({
  id: Uuid,
  email: EmailAddress,
  status: InviteStatus,
  invitedAt: z.string(),
  expiresAt: z.string(),
  acceptedAt: z.string().nullable().optional(),
  acceptedUserId: Uuid.nullable().optional(),
  disabledAt: z.string().nullable().optional(),
});
export const UsageSummary = z.object({
  acceptedUsers: z.number().int().nonnegative(),
  pendingInvitations: z.number().int().nonnegative(),
  userLimit: z.number().int().positive(),
  records: z.record(z.string(), z.number().int().nonnegative()),
  approximateStorageBytes: z.number().int().nonnegative(),
  emailsSentToday: z.number().int().nonnegative(),
  emailsSentThisMonth: z.number().int().nonnegative(),
  failedNotifications: z.number().int().nonnegative(),
  pendingDeliveries: z.number().int().nonnegative(),
  oldestPendingDelivery: z.string().nullable(),
  lastCronAt: z.string().nullable(),
  lastExportAt: z.string().nullable(),
});
export const DeliveryCompletion = z
  .object({
    deliveryId: Uuid,
    status: z.enum(["delivered", "retry", "failed", "quota_reached"]),
    errorCode: z.string().max(100).optional(),
    nextAttemptAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict();
export const ReminderClaim = z
  .object({ limit: z.number().int().min(1).max(50).default(25) })
  .strict();

export type ConnectedTaskWrite = z.infer<typeof TaskWrite>;
export type ConnectedTaskQuery = z.infer<typeof TaskQuery>;
export type ConnectedIdentityState = z.infer<typeof IdentityState>;
export type ConnectedInviteRecord = z.infer<typeof InviteRecord>;
export type ConnectedUsageSummary = z.infer<typeof UsageSummary>;
