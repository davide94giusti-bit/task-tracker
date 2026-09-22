import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, Card, CardActionArea, CardContent, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Stack, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import { Refresh } from '@mui/icons-material';
import { api } from './api';
import type { ChecklistAttention, DeadlinePressure, DeadlineWorkItem, PressurePeriod, Task } from './types';

export const localDateKey = (date = new Date()) => {
  const year = date.getFullYear(), month = String(date.getMonth() + 1).padStart(2, '0'), day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const formatDate = (value?: string | null) => value ? new Date(`${value}T12:00:00`).toLocaleDateString() : 'No date';
const levelLabel = (level: PressurePeriod['level']) => level === 'no_deadlines' ? 'No deadlines' : level.replace('_', ' ');
const levelColor: Record<PressurePeriod['level'], string> = { no_deadlines: '#64748b', light: '#2563eb', moderate: '#ca8a04', heavy: '#ea580c', very_heavy: '#dc2626' };
const rolloutError = (reason: unknown) => {
  const message = (reason as Error).message || 'Deadline data is unavailable.';
  return /not found|database operation failed|invalid response/i.test(message)
    ? `Checklist Attention requires Connected v16.16.0 database and Workers. Finish the coordinated deployment, then retry. (${message})`
    : message;
};
const asTask = (item: DeadlineWorkItem): Task => ({ id: item.taskId, title: item.taskTitle, description: '', status: item.taskStatus, priority: item.taskPriority, dueDate: item.taskDueDate, projectId: item.projectId, projectName: item.projectName, responsiblePersonId: item.responsiblePersonId, responsiblePersonName: item.responsiblePersonName, calculatedProgress: 0, blocked: item.taskBlocked, version: item.taskVersion, updatedAt: '' });
const announceChange = () => window.dispatchEvent(new Event('task-tracker:deadline-change'));

function DeadlineItemRow({ item, onOpen, onCompleted }: { item: DeadlineWorkItem; onOpen: (task: Task) => void; onCompleted: () => void }) {
  const [pending, setPending] = useState(false), [error, setError] = useState('');
  const complete = async () => {
    setPending(true); setError('');
    try {
      await api('/tasks/checklist/toggle', { method: 'POST', body: { itemId: item.id, completed: true, expectedVersion: item.version } });
      announceChange(); onCompleted();
    } catch (reason) { setError((reason as Error).message); }
    finally { setPending(false); }
  };
  return <Card variant="outlined" sx={{ borderLeft: `4px solid ${item.overdue ? '#dc2626' : '#2563eb'}` }}>
    <CardContent sx={{ p: { xs: 1.5, sm: 2 }, '&:last-child': { pb: { xs: 1.5, sm: 2 } } }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5} justifyContent="space-between">
        <Box minWidth={0}>
          <Stack direction="row" gap={.75} flexWrap="wrap" mb={.75}>
            <Chip size="small" color={item.overdue ? 'error' : 'primary'} label={item.overdue ? 'Overdue' : item.dueDate === localDateKey() ? 'Due today' : 'Checklist deadline'} />
            <Chip size="small" variant="outlined" label={item.required ? 'Required' : 'Optional'} />
            {item.taskBlocked && <Chip size="small" color="warning" variant="outlined" label="Blocked" />}
            {['critical', 'high'].includes(item.taskPriority) && <Chip size="small" label={`${item.taskPriority} priority`} />}
          </Stack>
          <Typography fontWeight={800}>{item.title}</Typography>
          <Typography variant="body2">Parent task: {item.taskTitle}</Typography>
          <Typography variant="body2" color="text.secondary">{item.projectName} · {item.responsiblePersonName} · {item.taskStatus.replaceAll('_', ' ')} · Checklist {formatDate(item.dueDate)}{item.taskDueDate ? ` · Task ${formatDate(item.taskDueDate)}` : ''}</Typography>
          {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
        </Box>
        <Stack direction="row" alignItems="center" gap={1} flexShrink={0}>
          <FormControlLabel control={<Checkbox checked={false} disabled={pending} onChange={() => void complete()} inputProps={{ 'aria-label': `Complete checklist item ${item.title}` }} sx={{ minWidth: 44, minHeight: 44 }} />} label={pending ? 'Completing…' : 'Complete'} />
          <Button sx={{ minHeight: 44 }} onClick={() => onOpen(asTask(item))}>Open task</Button>
        </Stack>
      </Stack>
    </CardContent>
  </Card>;
}

export function ChecklistAttentionPanel({ onOpen, refreshToken = 0, compact = false }: { onOpen: (task: Task) => void; refreshToken?: number; compact?: boolean }) {
  const [data, setData] = useState<ChecklistAttention | null>(null), [error, setError] = useState(''), [expanded, setExpanded] = useState<'due'|'overdue'|null>(null);
  const load = useCallback(async () => {
    setError('');
    try { setData(await api<ChecklistAttention>(`/tasks/checklist/attention?date=${localDateKey()}`)); }
    catch (reason) { setError(rolloutError(reason)); }
  }, [refreshToken]);
  useEffect(() => { void load(); const listener = () => void load(); window.addEventListener('task-tracker:deadline-change', listener); return () => window.removeEventListener('task-tracker:deadline-change', listener); }, [load]);
  if (error) return <Alert severity="error" action={<Button color="inherit" onClick={() => void load()}>Retry</Button>}>{error}</Alert>;
  if (!data) return <Stack direction="row" gap={1} alignItems="center"><CircularProgress size={20}/><Typography>Loading checklist deadlines…</Typography></Stack>;
  const items = [...data.overdue.map(item => ({ ...item, overdue: true })), ...data.dueToday.map(item => ({ ...item, overdue: false }))];
  if (compact) return <><Card sx={{ mt: 2 }}><CardContent><Typography variant="h6">Checklist attention</Typography><Typography color="text.secondary">Checklist-item counts remain separate from task metrics.</Typography><Stack direction="row" gap={1} mt={1}><CardActionArea onClick={() => setExpanded('due')} sx={{ p: 1.25, border: 1, borderColor: 'divider', borderRadius: 1, minHeight: 82 }}><Typography color="text.secondary">Checklist due today</Typography><Typography variant="h4">{data.dueToday.length}</Typography></CardActionArea><CardActionArea onClick={() => setExpanded('overdue')} sx={{ p: 1.25, border: 1, borderColor: data.overdue.length ? 'error.main' : 'divider', borderRadius: 1, minHeight: 82 }}><Typography color="text.secondary">Checklist overdue</Typography><Typography variant="h4" color={data.overdue.length ? 'error.main' : 'text.primary'}>{data.overdue.length}</Typography></CardActionArea></Stack></CardContent></Card><Dialog open={!!expanded} onClose={() => setExpanded(null)} fullWidth maxWidth="md"><DialogTitle>{expanded === 'overdue' ? 'Overdue checklist items' : 'Checklist items due today'}</DialogTitle><DialogContent><Stack spacing={1} mt={1}>{(expanded === 'overdue' ? data.overdue : data.dueToday).map(item => <DeadlineItemRow key={item.id} item={{ ...item, overdue: expanded === 'overdue' }} onOpen={onOpen} onCompleted={load}/>)}{!(expanded === 'overdue' ? data.overdue : data.dueToday).length && <Typography color="text.secondary">No checklist items in this category.</Typography>}</Stack></DialogContent><DialogActions><Button onClick={() => setExpanded(null)}>Close</Button></DialogActions></Dialog></>;
  return <Box mb={3}>
    <Typography variant="h5" mb={1}>Checklist attention</Typography>
    {!items.length ? <Alert severity="success">No overdue or due-today checklist items.</Alert> : <Stack spacing={2}>
      {!!data.overdue.length && <Box><Typography variant="h6" color="error.main" mb={1}>Overdue checklist items ({data.overdue.length})</Typography><Stack spacing={1}>{data.overdue.map(item => <DeadlineItemRow key={item.id} item={{ ...item, overdue: true }} onOpen={onOpen} onCompleted={load}/>)}</Stack></Box>}
      {!!data.dueToday.length && <Box><Typography variant="h6" mb={1}>Checklist items due today ({data.dueToday.length})</Typography><Stack spacing={1}>{data.dueToday.map(item => <DeadlineItemRow key={item.id} item={item} onOpen={onOpen} onCompleted={load}/>)}</Stack></Box>}
    </Stack>}
  </Box>;
}

export function DeadlinePressureCard({ onOpen, refreshToken = 0, calendarStart, calendarDays, onData }: { onOpen: (task: Task) => void; refreshToken?: number; calendarStart?: string; calendarDays?: number; onData?: (data: DeadlinePressure) => void }) {
  const [data, setData] = useState<DeadlinePressure | null>(null), [mode, setMode] = useState<'daily'|'weekly'>('daily'), [selected, setSelected] = useState<PressurePeriod | null>(null), [error, setError] = useState('');
  const onDataRef = useRef(onData); onDataRef.current = onData;
  const start = calendarStart || localDateKey(), days = calendarDays || 28;
  const load = useCallback(async () => {
    setError('');
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const result = await api<DeadlinePressure>(`/tasks/deadline-pressure?${new URLSearchParams({ start, today: localDateKey(), days: String(days), weeks: '12', timezone, weekStartsOn: '1' })}`);
      setData(result); onDataRef.current?.(result);
    } catch (reason) { setError(rolloutError(reason)); }
  }, [start, days, refreshToken]);
  useEffect(() => { void load(); const listener = () => void load(); window.addEventListener('task-tracker:deadline-change', listener); return () => window.removeEventListener('task-tracker:deadline-change', listener); }, [load]);
  useEffect(() => { const listener = (event: Event) => { const date = (event as CustomEvent<string>).detail; const period = data?.daily.find(day => day.date === date); if (period) setSelected(period); }; window.addEventListener('task-tracker:open-pressure', listener); return () => window.removeEventListener('task-tracker:open-pressure', listener); }, [data]);
  const periods = useMemo(() => mode === 'daily' ? data?.daily || [] : data?.weekly || [], [data, mode]);
  if (error) return <Alert severity="error" action={<Button color="inherit" startIcon={<Refresh/>} onClick={() => void load()}>Retry</Button>}>{error}</Alert>;
  if (!data) return <Card sx={{ mt: 2 }}><CardContent><CircularProgress size={22}/> Loading deadline pressure…</CardContent></Card>;
  return <>
    <Card sx={{ mt: 2 }}><CardContent>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1} alignItems={{ sm: 'center' }}>
        <Box><Typography variant="h6">Deadline pressure</Typography><Typography color="text.secondary">Relative workload from task and checklist deadlines.</Typography></Box>
        <ToggleButtonGroup exclusive size="small" value={mode} onChange={(_, value) => value && setMode(value)} aria-label="Deadline pressure period"><ToggleButton value="daily">Daily</ToggleButton><ToggleButton value="weekly">Weekly</ToggleButton></ToggleButtonGroup>
      </Stack>
      <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 1, mt: 2, scrollSnapType: 'x proximity' }}>
        {periods.map(period => { const key = period.date || period.startDate!; return <Tooltip key={key} title={`${levelLabel(period.level)}: ${period.taskCount} tasks, ${period.checklistCount} checklist items, score ${period.score}`}>
          <CardActionArea onClick={() => setSelected(period)} aria-label={`${key}, ${levelLabel(period.level)}, ${period.taskCount} tasks and ${period.checklistCount} checklist items`} sx={{ minWidth: mode === 'daily' ? 112 : 160, minHeight: 110, p: 1.25, border: '2px solid', borderColor: levelColor[period.level], borderRadius: 1.5, scrollSnapAlign: 'start' }}>
            <Typography fontWeight={800}>{mode === 'daily' ? formatDate(period.date) : `${formatDate(period.startDate)}–${formatDate(period.endDate)}`}</Typography>
            <Typography variant="body2" sx={{ color: levelColor[period.level], textTransform: 'capitalize', fontWeight: 800 }}>{levelLabel(period.level)}</Typography>
            <Typography variant="caption" display="block">{period.taskCount} tasks · {period.checklistCount} checklist</Typography>
            {!!period.overdueCount && <Typography variant="caption" color="error.main" display="block">{period.overdueCount} overdue</Typography>}
            {mode === 'weekly' && period.heaviestDate && <Typography variant="caption" display="block">Peak {formatDate(period.heaviestDate)}</Typography>}
          </CardActionArea></Tooltip>; })}
      </Box>
    </CardContent></Card>
    <Dialog open={!!selected} onClose={() => setSelected(null)} fullWidth maxWidth="md">
      <DialogTitle>Deadline pressure · {selected?.date ? formatDate(selected.date) : `${formatDate(selected?.startDate)}–${formatDate(selected?.endDate)}`}</DialogTitle>
      <DialogContent><Stack spacing={1.25} mt={1}>
        {selected && <Alert severity={selected.level === 'very_heavy' ? 'error' : selected.level === 'heavy' ? 'warning' : 'info'}>{levelLabel(selected.level)} · score {selected.score}. {selected.taskCount} tasks, {selected.checklistCount} checklist items, {selected.overdueCount} carried-over overdue.</Alert>}
        {selected?.items.map(item => item.kind === 'checklist' ? <DeadlineItemRow key={`${item.kind}:${item.id}`} item={item} onOpen={onOpen} onCompleted={() => { setSelected(null); void load(); }}/> : <Card key={`${item.kind}:${item.id}`} variant="outlined"><CardContent><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1}><Box><Stack direction="row" gap={.5} flexWrap="wrap"><Chip size="small" label="Task deadline"/>{item.overdue && <Chip size="small" color="error" label="Carried-over overdue"/>}{item.taskBlocked && <Chip size="small" color="warning" label="Blocked"/>}</Stack><Typography fontWeight={800} mt={.5}>{item.title}</Typography><Typography variant="body2" color="text.secondary">{item.projectName} · {item.responsiblePersonName} · due {formatDate(item.dueDate)} · {item.taskPriority} priority</Typography><Typography variant="caption">Score contribution {item.contribution}{item.blockedBonus ? ' including blocked bonus' : ''}</Typography></Box><Button sx={{ minHeight: 44 }} onClick={() => onOpen(asTask(item))}>Open task</Button></Stack></CardContent></Card>)}
        {selected && !selected.items.length && <Typography color="text.secondary">No upcoming deadlines in this period.</Typography>}
      </Stack></DialogContent><DialogActions><Button onClick={() => setSelected(null)}>Close</Button></DialogActions>
    </Dialog>
  </>;
}

export function TodayPressureWarning({ onOpen, refreshToken = 0 }: { onOpen: (task: Task) => void; refreshToken?: number }) {
  const [period, setPeriod] = useState<PressurePeriod | null>(null);
  return <Box mb={2}>{period && ['heavy','very_heavy'].includes(period.level) && <Alert severity={period.level === 'very_heavy' ? 'error' : 'warning'} action={<Button color="inherit" onClick={() => window.dispatchEvent(new CustomEvent('task-tracker:open-pressure', { detail: localDateKey() }))}>View details</Button>} sx={{ mb: 1 }}>{levelLabel(period.level)} deadline day: {period.taskCount} tasks, {period.checklistCount} checklist items, and {period.overdueCount} overdue items.</Alert>}<DeadlinePressureCard onOpen={onOpen} refreshToken={refreshToken} calendarStart={localDateKey()} calendarDays={28} onData={data => setPeriod(data.daily[0] || null)}/></Box>;
}
