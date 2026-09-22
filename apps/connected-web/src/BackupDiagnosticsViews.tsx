import { useCallback, useEffect, useState } from "react";
import JSZip from "jszip";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  LinearProgress,
  MenuItem,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { Refresh } from "@mui/icons-material";
import { api } from "./api";
import { AccessibleTextField as TextField } from "./AccessibleTextField";

type BackupMetadata = {
  format: string;
  formatVersion: number;
  schemaVersion?: number;
  appVersion?: string;
  createdAt?: string;
  checksum: string;
  counts?: Record<string, number>;
};

type LocalSnapshot = Record<string, unknown> & {
  projects?: unknown[];
  people?: unknown[];
  tasks?: unknown[];
  checklist?: unknown[];
  task_links?: unknown[];
  task_contacts?: unknown[];
  activities?: unknown[];
  categories?: unknown[];
};

type ImportPreview = {
  valid: boolean;
  dryRun: boolean;
  counts: Record<string, number>;
  warnings: string[];
  existingRecords?: Record<string, number>;
  applied?: boolean;
};

type ConnectedBackup = {
  format: "task-tracker-connected";
  version: number;
  createdAt: string;
  workspaceId?: string;
  manifest?: { dataChecksum: string; counts?: Record<string, number>; excluded?: string[] };
  data: Record<string, unknown>;
};

type RestorePreview = {
  valid: boolean;
  counts: Record<string, number>;
  errors: string[];
  warnings: string[];
  checksum: string;
  database: {
    valid: boolean;
    errors: string[];
    warnings: string[];
    existingRecords: Record<string, number>;
    activeAttachmentCount: number;
  };
};
type BackupStatus = {
  lastVerifiedExport: { createdAt: string; payload?: { dataChecksum?: string } } | null;
  lastRestore: { createdAt: string; status: string; mode?: string } | null;
  attachmentArchiveSupported: boolean;
  scheduledVerificationSupported: boolean;
};

type Diagnostics = {
  services: Array<{
    name: string;
    status: string;
    latencyMs: number;
    version?: string;
    error?: string;
  }>;
  events: Array<{
    id: string;
    createdAt?: string;
    level?: string;
    service?: string;
    eventType?: string;
    requestId?: string;
    summary?: string;
    source?: string;
    details?: any;
  }>;
  privacy: string;
  environment?: string;
  generatedAt?: string;
  requestId?: string;
  level?: string;
};

const MAX_BACKUP_BYTES = 8 * 1024 * 1024;
const MAX_CONNECTED_BACKUP_BYTES = 20 * 1024 * 1024;

async function sha256(text: string) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(hash), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}

async function readLocalBackup(
  file: File,
): Promise<{ metadata: BackupMetadata; snapshot: LocalSnapshot }> {
  if (!file.name.toLowerCase().endsWith(".zip"))
    throw new Error("Select a Task Tracker .zip backup.");
  if (file.size > MAX_BACKUP_BYTES)
    throw new Error("The backup exceeds the 8 MB Connected import limit.");
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const metadataEntry = zip.file('metadata.json');
  const dataEntry = zip.file('data.json');
  if (!metadataEntry || !dataEntry)
    throw new Error("The ZIP must contain metadata.json and data.json.");
  const metadata = JSON.parse(
    await metadataEntry.async("string"),
  ) as BackupMetadata;
  const dataText = await dataEntry.async("string");
  if (metadata.format !== 'prioritydesk-backup')
    throw new Error("This is not a Task Tracker Local backup.");
  if (!Number.isInteger(metadata.formatVersion) || metadata.formatVersion > 1)
    throw new Error("This backup requires a newer Connected importer.");
  if ((await sha256(dataText)) !== metadata.checksum)
    throw new Error(
      "Backup checksum validation failed. The file may be damaged.",
    );
  const snapshot = JSON.parse(dataText) as LocalSnapshot;
  if (!Array.isArray(snapshot.tasks))
    throw new Error("The backup does not contain a tasks table.");
  return { metadata, snapshot };
}

async function readConnectedBackup(file: File) {
  if (!file.name.toLowerCase().endsWith(".json")) throw new Error("Select a Task Tracker Connected .json backup.");
  if (file.size > MAX_CONNECTED_BACKUP_BYTES) throw new Error("The backup exceeds the 20 MB restore limit.");
  const backup = JSON.parse(await file.text()) as ConnectedBackup;
  if (backup.format !== "task-tracker-connected" || ![2, 3].includes(backup.version) || !backup.data || typeof backup.data !== "object")
    throw new Error("This is not a supported Task Tracker Connected backup.");
  const checksum = await sha256(JSON.stringify(backup.data));
  if (backup.manifest?.dataChecksum && backup.manifest.dataChecksum !== checksum)
    throw new Error("Backup checksum validation failed. The file may be damaged or altered.");
  return { backup, checksum };
}

function downloadJson(filename: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function connectedRestoreError(reason: unknown) {
  const message = (reason as Error).message || "Connected restore failed.";
  return /route not found|rpc|database operation failed|404/i.test(message)
    ? "Connected restore is not available on the deployed backend yet. Apply migration 0021, then deploy the Data Worker, Backup Worker, API Gateway, and Pages in that order."
    : message;
}

export function BackupImportView() {
  const [selected, setSelected] = useState<{
    name: string;
    metadata: BackupMetadata;
    snapshot: LocalSnapshot;
    importId: string;
  } | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState<
    "reading" | "preview" | "apply" | "export" | null
  >(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [restore, setRestore] = useState<{ name: string; backup: ConnectedBackup; checksum: string; restoreId: string } | null>(null);
  const [restorePreview, setRestorePreview] = useState<RestorePreview | null>(null);
  const [restoreMode, setRestoreMode] = useState<"empty" | "replace">("empty");
  const [confirmation, setConfirmation] = useState("");
  const [backupStatus, setBackupStatus] = useState<BackupStatus | null>(null);

  useEffect(() => {
    void api<BackupStatus>("/backup/status").then(setBackupStatus).catch(() => undefined);
  }, []);

  const choose = async (file?: File) => {
    if (!file) return;
    setBusy("reading");
    setError("");
    setMessage("");
    setPreview(null);
    try {
      const parsed = await readLocalBackup(file);
      setSelected({
        name: file.name,
        ...parsed,
        importId: crypto.randomUUID(),
      });
    } catch (reason) {
      setSelected(null);
      setError((reason as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const validate = async () => {
    if (!selected) return;
    setBusy("preview");
    setError("");
    setMessage("");
    try {
      setPreview(
        await api<ImportPreview>("/backup/import-preview", {
          method: "POST",
          timeoutMs: 60_000,
          body: {
            importId: selected.importId,
            dryRun: true,
            snapshot: selected.snapshot,
          },
        }),
      );
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const apply = async () => {
    if (!selected || !preview?.valid) return;
    setBusy("apply");
    setError("");
    setMessage("");
    try {
      const result = await api<ImportPreview>("/backup/import-apply", {
        method: "POST",
        timeoutMs: 60_000,
        body: {
          importId: selected.importId,
          dryRun: false,
          snapshot: selected.snapshot,
        },
      });
      setPreview(result);
      setMessage(
        "Import completed. Your Local data is now in this private workspace.",
      );
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const exportConnected = async () => {
    setBusy("export");
    setError("");
    try {
      const result = await api<unknown>("/backup/export", {
        method: "POST",
        body: {},
      });
      downloadJson(
        `Task-Tracker-Connected-${new Date().toISOString().slice(0, 10)}.json`,
        result,
      );
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const chooseConnected = async (file?: File) => {
    if (!file) return;
    setBusy("reading"); setError(""); setMessage(""); setRestorePreview(null); setConfirmation("");
    try { setRestore({ name: file.name, ...(await readConnectedBackup(file)), restoreId: crypto.randomUUID() }); }
    catch (reason) { setRestore(null); setError((reason as Error).message); }
    finally { setBusy(null); }
  };

  const previewRestore = async () => {
    if (!restore) return;
    setBusy("preview"); setError(""); setMessage("");
    try {
      setRestorePreview(await api<RestorePreview>("/backup/restore-preview", { method: "POST", timeoutMs: 90_000, body: { restoreId: restore.restoreId, mode: restoreMode, checksum: restore.checksum, backup: restore.backup } }));
    } catch (reason) { setError(connectedRestoreError(reason)); }
    finally { setBusy(null); }
  };

  const applyRestore = async () => {
    if (!restore || !restorePreview?.valid || !restorePreview.database.valid) return;
    setBusy("apply"); setError(""); setMessage("");
    try {
      const safety = await api<unknown>("/backup/export", { method: "POST", timeoutMs: 90_000, body: {} });
      downloadJson(`Task-Tracker-Pre-Restore-Safety-${new Date().toISOString().slice(0, 10)}.json`, safety);
      await api("/backup/restore-apply", { method: "POST", timeoutMs: 180_000, body: { restoreId: restore.restoreId, mode: restoreMode, checksum: restore.checksum, confirmation, backup: restore.backup } });
      setMessage("Restore completed atomically. A pre-restore safety backup was downloaded and an internal safety snapshot and audit report were recorded.");
      setRestorePreview(null);
    } catch (reason) { setError(connectedRestoreError(reason)); }
    finally { setBusy(null); }
  };

  return (
    <Stack spacing={2}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        gap={1}
      >
        <div>
          <Typography variant="h4">Backup & import</Typography>
          <Typography color="text.secondary">Export, validate, import, and safely restore this private Connected workspace.</Typography>
        </div>
        <Button variant="outlined" disabled={!!busy} onClick={exportConnected}>
          {busy === "export" ? (
            <CircularProgress size={20} />
          ) : (
            "Download Connected backup"
          )}
        </Button>
      </Stack>
      <Alert severity="info">
        Import is additive and idempotent. It never deletes Local data or
        another workspace. Local attachment files and device-only settings are
        not uploaded.
      </Alert>
      {error && <Alert severity="error">{error}</Alert>}
      {message && (
        <Alert
          severity="success"
          action={
            <Button
              color="inherit"
              onClick={() => location.assign("?view=dashboard")}
            >
              Open dashboard
            </Button>
          }
        >
          {message}
        </Alert>
      )}
      {backupStatus && <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography fontWeight={700}>Backup health</Typography>
        <Typography variant="body2">Last checksum-verified export: {backupStatus.lastVerifiedExport ? new Date(backupStatus.lastVerifiedExport.createdAt).toLocaleString() : "No Connected export recorded yet"}</Typography>
        <Typography variant="body2">Last restore: {backupStatus.lastRestore ? `${backupStatus.lastRestore.status} · ${new Date(backupStatus.lastRestore.createdAt).toLocaleString()}` : "No Connected restore recorded"}</Typography>
        <Typography variant="caption" color="text.secondary">Attachment archive: not yet supported · Scheduled isolated restore verification: not yet supported</Typography>
      </Paper>}
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6">1. Select the Local backup ZIP</Typography>
            <Button component="label" variant="contained" disabled={!!busy}>
              Choose backup
              <input
                id="backup-zip-upload"
                name="backupZip"
                aria-label="Backup ZIP file"
                hidden
                type="file"
                accept=".zip,application/zip"
                onChange={(event) => {
                  void choose(event.target.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />
            </Button>
            {busy === "reading" && <LinearProgress />}
            {selected && (
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography fontWeight={700}>{selected.name}</Typography>
                <Typography variant="body2">
                  Local app {selected.metadata.appVersion || "unknown"} ·
                  created{" "}
                  {selected.metadata.createdAt
                    ? new Date(selected.metadata.createdAt).toLocaleString()
                    : "unknown"}
                </Typography>
                <Typography variant="body2" color="success.main">
                  Checksum verified
                </Typography>
              </Paper>
            )}
            <Divider />
            <Typography variant="h6">
              2. Validate without changing data
            </Typography>
            <Button
              variant="outlined"
              disabled={!selected || !!busy}
              onClick={validate}
            >
              {busy === "preview" ? (
                <CircularProgress size={20} />
              ) : (
                "Validate and preview"
              )}
            </Button>
            {preview && (
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Stack spacing={1}>
                  <Typography fontWeight={700}>Import preview</Typography>
                  <Stack direction="row" gap={1} flexWrap="wrap">
                    {Object.entries(preview.counts || {}).map(
                      ([name, count]) => (
                        <Chip key={name} label={`${name}: ${count}`} />
                      ),
                    )}
                  </Stack>
                  {preview.warnings?.map((warning) => (
                    <Alert key={warning} severity="warning">
                      {warning}
                    </Alert>
                  ))}
                </Stack>
              </Paper>
            )}
            <Divider />
            <Typography variant="h6">3. Import into this workspace</Typography>
            <Typography variant="body2" color="text.secondary">
              Use the same stable record IDs, skip records already imported, and
              commit all supported records in one database transaction.
            </Typography>
            <Button
              color="warning"
              variant="contained"
              disabled={!preview?.valid || !!busy || !!preview.applied}
              onClick={apply}
            >
              {busy === "apply" ? (
                <CircularProgress size={20} />
              ) : (
                "Confirm and import"
              )}
            </Button>
          </Stack>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h5">Connected disaster recovery</Typography>
            <Alert severity="warning">
              Owner-only. Replace mode deletes current workspace data in one database transaction. It first downloads a portable safety backup and stores a second internal safety snapshot. Any failure rolls back the entire database restore.
            </Alert>
            <Alert severity="info">
              This release restores the 11 Connected JSON tables. It never restores sessions, credentials, push subscriptions, guest links, or delivery history. Attachment files are not yet in the archive, so replace mode is blocked while active attachments exist.
            </Alert>
            <Typography variant="h6">1. Select and verify a Connected JSON backup</Typography>
            <Button component="label" variant="contained" disabled={!!busy}>
              Choose Connected backup
              <input hidden type="file" accept=".json,application/json" aria-label="Connected JSON backup" onChange={(event) => { void chooseConnected(event.target.files?.[0]); event.currentTarget.value = ""; }} />
            </Button>
            {restore && <Paper variant="outlined" sx={{ p: 2 }}><Typography fontWeight={700}>{restore.name}</Typography><Typography variant="body2">Format v{restore.backup.version} · created {new Date(restore.backup.createdAt).toLocaleString()}</Typography><Typography variant="body2" color="success.main">SHA-256 checksum verified: {restore.checksum.slice(0, 12)}…</Typography></Paper>}
            <TextField select label="Restore mode" value={restoreMode} onChange={(event) => { setRestoreMode(event.target.value as "empty" | "replace"); setRestorePreview(null); setConfirmation(""); }}>
              <MenuItem value="empty">Restore into empty workspace</MenuItem>
              <MenuItem value="replace">Replace current workspace</MenuItem>
            </TextField>
            <Button variant="outlined" disabled={!restore || !!busy} onClick={previewRestore}>Validate and preview restore</Button>
            {restorePreview && <Paper variant="outlined" sx={{ p: 2 }}><Stack spacing={1}>
              <Typography fontWeight={700}>Restore preview</Typography>
              <Stack direction="row" gap={1} flexWrap="wrap">{Object.entries(restorePreview.counts).map(([name,count]) => <Chip key={name} label={`${name}: ${count}`} />)}</Stack>
              {[...restorePreview.errors, ...(restorePreview.database.errors || [])].map(item => <Alert severity="error" key={item}>{item}</Alert>)}
              {[...restorePreview.warnings, ...(restorePreview.database.warnings || [])].map(item => <Alert severity="warning" key={item}>{item}</Alert>)}
              <Typography variant="body2">Current workspace: {Object.entries(restorePreview.database.existingRecords || {}).map(([name,count]) => `${name} ${count}`).join(" · ") || "empty"}</Typography>
            </Stack></Paper>}
            <Divider />
            <Typography variant="h6">2. Confirm and restore</Typography>
            <Typography variant="body2">Type <strong>{restoreMode === "empty" ? "RESTORE EMPTY" : "REPLACE MY WORKSPACE"}</strong> exactly.</Typography>
            <TextField label="Confirmation phrase" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" />
            <Button color="error" variant="contained" disabled={!restorePreview?.valid || !restorePreview?.database.valid || !!busy || confirmation !== (restoreMode === "empty" ? "RESTORE EMPTY" : "REPLACE MY WORKSPACE")} onClick={applyRestore}>
              {busy === "apply" ? <CircularProgress size={20} /> : restoreMode === "empty" ? "Restore into empty workspace" : "Replace workspace atomically"}
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}

export function DiagnosticsView() {
  const [data, setData] = useState<Diagnostics | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [level, setLevel] = useState("info"),
    [service, setService] = useState("all");
  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      setData(await api<Diagnostics>(`/diagnostics?level=${level}`));
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }, [level]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <Stack spacing={2}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        gap={1}
      >
        <div>
          <Typography variant="h4">Diagnostics</Typography>
          <Typography color="text.secondary">
            Privacy-safe Connected service and security events.
          </Typography>
        </div>
        <Stack direction={{ xs: "column", sm: "row" }} gap={1}>
          <TextField
            select
            size="small"
            label="Log detail"
            value={level}
            onChange={(event) => setLevel(event.target.value)}
            sx={{ minWidth: 140 }}
          >
            <MenuItem value="error">Errors only</MenuItem>
            <MenuItem value="warn">Warnings</MenuItem>
            <MenuItem value="info">Info</MenuItem>
            <MenuItem value="debug">Debug</MenuItem>
            <MenuItem value="verbose">Verbose</MenuItem>
          </TextField>
          <TextField
            select
            size="small"
            label="Service"
            value={service}
            onChange={(event) => setService(event.target.value)}
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="all">All services</MenuItem>
            {data?.services.map((item) => (
              <MenuItem key={item.name} value={item.name}>
                {item.name}
              </MenuItem>
            ))}
          </TextField>
          <Button startIcon={<Refresh />} onClick={load} disabled={busy}>
            Refresh
          </Button>
          <Button
            variant="outlined"
            disabled={!data}
            onClick={() =>
              data &&
              downloadJson(
                `Task-Tracker-Diagnostics-${new Date().toISOString().slice(0, 10)}.json`,
                data,
              )
            }
          >
            Download JSON
          </Button>
        </Stack>
      </Stack>
      {busy && <LinearProgress />}
      {error && <Alert severity="error">{error}</Alert>}
      {data && (
        <>
          <Alert
            severity={
              data.services.every((item) => item.status === "ok")
                ? "success"
                : "warning"
            }
          >
            {data.services.filter((item) => item.status === "ok").length} of{" "}
            {data.services.length} internal services are responding.
            Environment: {data.environment || "production"}.
          </Alert>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography fontWeight={700} mb={1.5}>
              Connected services
            </Typography>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2,minmax(0,1fr))", lg: "repeat(3,minmax(0,1fr))" }, gap: 1 }}>
              {data.services.map((item) => (
                <Paper variant="outlined" key={item.name} sx={{ p: 1.5 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
                    <Box minWidth={0}><Typography fontWeight={700} noWrap>{item.name}</Typography><Typography variant="caption" color="text.secondary">{item.latencyMs} ms · {item.version || "unknown"}</Typography></Box>
                <Chip size="small" color={item.status === "ok" ? "success" : "error"}
                  variant="outlined"
                  label={item.status}
                />
                  </Stack>
                </Paper>
              ))}
            </Box>
          </Paper>
          <Alert severity="info">{data.privacy}</Alert>
          <Stack direction="row" justifyContent="space-between">
            <Typography variant="h6">Recent events</Typography>
            <Typography variant="caption" color="text.secondary">
              Generated{" "}
              {data.generatedAt
                ? new Date(data.generatedAt).toLocaleString()
                : "now"}{" "}
              · {data.events.length} entries
            </Typography>
          </Stack>
          {data.events.filter(
            (event) => service === "all" || event.service === service,
          ).length === 0 ? (
            <Paper variant="outlined" sx={{ p: 3 }}>
              <Typography>No events match this level and service.</Typography>
            </Paper>
          ) : (
            <Stack spacing={1}>
              {data.events
                .filter(
                  (event) => service === "all" || event.service === service,
                )
                .map((event) => (
                  <Paper variant="outlined" sx={{ p: 2 }} key={event.id}>
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      justifyContent="space-between"
                    >
                      <Typography fontWeight={700}>
                        {event.summary || event.eventType}
                      </Typography>
                      <Stack direction="row" gap={0.5}>
                        <Chip
                          size="small"
                          variant="outlined"
                          label={event.source || "audit"}
                        />
                        <Chip
                          size="small"
                          color={
                            event.level === "error"
                              ? "error"
                              : event.level === "warn"
                                ? "warning"
                                : event.level === "debug" ||
                                    event.level === "verbose"
                                  ? "secondary"
                                  : "default"
                          }
                          label={event.level || "info"}
                        />
                      </Stack>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      {event.service} · {event.eventType} ·{" "}
                      {event.createdAt
                        ? new Date(event.createdAt).toLocaleString()
                        : "Unknown time"}
                      {event.requestId ? ` · request ${event.requestId}` : ""}
                    </Typography>
                    {event.details && (
                      <Box component="details" mt={1}>
                        <Typography
                          component="summary"
                          variant="caption"
                          sx={{ cursor: "pointer" }}
                        >
                          Technical details
                        </Typography>
                        <Box
                          component="pre"
                          sx={{
                            fontSize: 12,
                            whiteSpace: "pre-wrap",
                            overflowWrap: "anywhere",
                            m: 0,
                            mt: 1,
                            p: 1,
                            bgcolor: "action.hover",
                            borderRadius: 1,
                          }}
                        >
                          {JSON.stringify(event.details, null, 2)}
                        </Box>
                      </Box>
                    )}
                  </Paper>
                ))}
            </Stack>
          )}
        </>
      )}
    </Stack>
  );
}
