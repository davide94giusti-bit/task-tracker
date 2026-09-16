import { useCallback, useEffect, useState } from 'react';
import JSZip from 'jszip';
import { Alert, Button, Card, CardContent, Chip, CircularProgress, Divider, LinearProgress, Paper, Stack, Typography } from '@mui/material';
import { api } from './api';

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

type Diagnostics = {
  services: Array<{ name: string; status: string; latencyMs: number; version?: string; error?: string }>;
  events: Array<{ id: string; createdAt?: string; level?: string; service?: string; eventType?: string; requestId?: string; summary?: string }>;
  privacy: string;
};

const MAX_BACKUP_BYTES = 8 * 1024 * 1024;

async function sha256(text: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join('');
}

async function readLocalBackup(file: File): Promise<{ metadata: BackupMetadata; snapshot: LocalSnapshot }> {
  if (!file.name.toLowerCase().endsWith('.zip')) throw new Error('Select a Task Tracker .zip backup.');
  if (file.size > MAX_BACKUP_BYTES) throw new Error('The backup exceeds the 8 MB Connected import limit.');
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const metadataEntry = zip.file('metadata.json');
  const dataEntry = zip.file('data.json');
  if (!metadataEntry || !dataEntry) throw new Error('The ZIP must contain metadata.json and data.json.');
  const metadata = JSON.parse(await metadataEntry.async('string')) as BackupMetadata;
  const dataText = await dataEntry.async('string');
  if (metadata.format !== 'prioritydesk-backup') throw new Error('This is not a Task Tracker Local backup.');
  if (!Number.isInteger(metadata.formatVersion) || metadata.formatVersion > 1) throw new Error('This backup requires a newer Connected importer.');
  if ((await sha256(dataText)) !== metadata.checksum) throw new Error('Backup checksum validation failed. The file may be damaged.');
  const snapshot = JSON.parse(dataText) as LocalSnapshot;
  if (!Array.isArray(snapshot.tasks)) throw new Error('The backup does not contain a tasks table.');
  return { metadata, snapshot };
}

function downloadJson(filename: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function BackupImportView() {
  const [selected, setSelected] = useState<{ name: string; metadata: BackupMetadata; snapshot: LocalSnapshot; importId: string } | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState<'reading' | 'preview' | 'apply' | 'export' | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const choose = async (file?: File) => {
    if (!file) return;
    setBusy('reading'); setError(''); setMessage(''); setPreview(null);
    try {
      const parsed = await readLocalBackup(file);
      setSelected({ name: file.name, ...parsed, importId: crypto.randomUUID() });
    } catch (reason) { setSelected(null); setError((reason as Error).message); }
    finally { setBusy(null); }
  };

  const validate = async () => {
    if (!selected) return;
    setBusy('preview'); setError(''); setMessage('');
    try {
      setPreview(await api<ImportPreview>('/backup/import-preview', { method: 'POST', timeoutMs: 60_000, body: { importId: selected.importId, dryRun: true, snapshot: selected.snapshot } }));
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(null); }
  };

  const apply = async () => {
    if (!selected || !preview?.valid) return;
    setBusy('apply'); setError(''); setMessage('');
    try {
      const result = await api<ImportPreview>('/backup/import-apply', { method: 'POST', timeoutMs: 60_000, body: { importId: selected.importId, dryRun: false, snapshot: selected.snapshot } });
      setPreview(result); setMessage('Import completed. Your Local data is now in this private workspace.');
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(null); }
  };

  const exportConnected = async () => {
    setBusy('export'); setError('');
    try {
      const result = await api<unknown>('/backup/export', { method: 'POST', body: {} });
      downloadJson(`Task-Tracker-Connected-${new Date().toISOString().slice(0, 10)}.json`, result);
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(null); }
  };

  return <Stack spacing={2}>
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1}>
      <div><Typography variant="h4">Backup & import</Typography><Typography color="text.secondary">Move an explicit Local backup into this private Connected workspace.</Typography></div>
      <Button variant="outlined" disabled={!!busy} onClick={exportConnected}>{busy === 'export' ? <CircularProgress size={20}/> : 'Download Connected backup'}</Button>
    </Stack>
    <Alert severity="info">Import is additive and idempotent. It never deletes Local data or another workspace. Local attachment files and device-only settings are not uploaded.</Alert>
    {error && <Alert severity="error">{error}</Alert>}{message && <Alert severity="success" action={<Button color="inherit" onClick={() => location.assign('?view=dashboard')}>Open dashboard</Button>}>{message}</Alert>}
    <Card><CardContent><Stack spacing={2}>
      <Typography variant="h6">1. Select the Local backup ZIP</Typography>
      <Button component="label" variant="contained" disabled={!!busy}>Choose backup<input hidden type="file" accept=".zip,application/zip" onChange={event => { void choose(event.target.files?.[0]); event.currentTarget.value = ''; }}/></Button>
      {busy === 'reading' && <LinearProgress/>}
      {selected && <Paper variant="outlined" sx={{ p: 2 }}><Typography fontWeight={700}>{selected.name}</Typography><Typography variant="body2">Local app {selected.metadata.appVersion || 'unknown'} · created {selected.metadata.createdAt ? new Date(selected.metadata.createdAt).toLocaleString() : 'unknown'}</Typography><Typography variant="body2" color="success.main">Checksum verified</Typography></Paper>}
      <Divider/>
      <Typography variant="h6">2. Validate without changing data</Typography>
      <Button variant="outlined" disabled={!selected || !!busy} onClick={validate}>{busy === 'preview' ? <CircularProgress size={20}/> : 'Validate and preview'}</Button>
      {preview && <Paper variant="outlined" sx={{ p: 2 }}><Stack spacing={1}>
        <Typography fontWeight={700}>Import preview</Typography>
        <Stack direction="row" gap={1} flexWrap="wrap">{Object.entries(preview.counts || {}).map(([name, count]) => <Chip key={name} label={`${name}: ${count}`}/>)}</Stack>
        {preview.warnings?.map(warning => <Alert key={warning} severity="warning">{warning}</Alert>)}
      </Stack></Paper>}
      <Divider/>
      <Typography variant="h6">3. Import into this workspace</Typography>
      <Typography variant="body2" color="text.secondary">Use the same stable record IDs, skip records already imported, and commit all supported records in one database transaction.</Typography>
      <Button color="warning" variant="contained" disabled={!preview?.valid || !!busy || !!preview.applied} onClick={apply}>{busy === 'apply' ? <CircularProgress size={20}/> : 'Confirm and import'}</Button>
    </Stack></CardContent></Card>
  </Stack>;
}

export function DiagnosticsView() {
  const [data, setData] = useState<Diagnostics | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const load = useCallback(async () => { setBusy(true); setError(''); try { setData(await api<Diagnostics>('/diagnostics')); } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  return <Stack spacing={2}>
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1}>
      <div><Typography variant="h4">Diagnostics</Typography><Typography color="text.secondary">Privacy-safe Connected service and security events.</Typography></div>
      <Stack direction="row" gap={1}><Button onClick={load} disabled={busy}>Refresh</Button><Button variant="outlined" disabled={!data} onClick={() => data && downloadJson(`Task-Tracker-Diagnostics-${new Date().toISOString().slice(0, 10)}.json`, data)}>Download JSON</Button></Stack>
    </Stack>
    {busy && <LinearProgress/>}{error && <Alert severity="error">{error}</Alert>}
    {data && <><Alert severity={data.services.every(service => service.status === 'ok') ? 'success' : 'warning'}>{data.services.filter(service => service.status === 'ok').length} of {data.services.length} internal services are responding.</Alert><Paper variant="outlined" sx={{ p: 2 }}><Typography fontWeight={700} mb={1}>Connected services</Typography><Stack direction="row" gap={1} flexWrap="wrap">{data.services.map(service => <Chip color={service.status === 'ok' ? 'success' : 'error'} variant="outlined" key={service.name} label={`${service.name}: ${service.status} (${service.latencyMs} ms)`}/>)}</Stack></Paper><Alert severity="info">{data.privacy}</Alert><Typography variant="h6">Recent events</Typography>{data.events.length === 0 ? <Paper variant="outlined" sx={{ p: 3 }}><Typography>No workspace audit events have been recorded yet.</Typography></Paper> : <Stack spacing={1}>{data.events.map(event => <Paper variant="outlined" sx={{ p: 2 }} key={event.id}><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between"><Typography fontWeight={700}>{event.summary || event.eventType}</Typography><Chip size="small" label={event.level || 'info'}/></Stack><Typography variant="body2" color="text.secondary">{event.service} · {event.createdAt ? new Date(event.createdAt).toLocaleString() : 'Unknown time'}{event.requestId ? ` · request ${event.requestId}` : ''}</Typography></Paper>)}</Stack>}</>}
  </Stack>;
}
