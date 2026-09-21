import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Avatar, Badge, Box, Button, Card, CardActionArea, CardContent, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, LinearProgress, Menu, MenuItem, Paper, Stack, Switch, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import { Add, ArrowBack, AttachFile, Call, CheckCircle, Close, Delete, Edit, Email, Link as LinkIcon, NotificationsActive, OpenInNew, Person as PersonIcon, Refresh, TableRows, ViewModule, WhatsApp } from '@mui/icons-material';
import { api } from './api';
import { AccessibleTextField as TextField } from './AccessibleTextField';
import type { ChecklistItem, CostEntry, CostSummary, Dashboard, NotificationItem, Person, Project, Task, TaskAttachment, TaskDependency, View } from './types';

function titleFor(view: View, override?: string) {
  if (override) return override;
  if (view === 'tasks') return 'All Tasks';
  return view[0].toUpperCase() + view.slice(1);
}

export function EnhancedTasksView({ view, query, title, onOpen, onNew, refreshToken = 0 }: { view: View; query?: Record<string, unknown>; title?: string; onOpen: (task: Task) => void; onNew: () => void; refreshToken?: number }) {
  const [data, setData] = useState<{ items: Task[]; total: number } | null>(null);
  const [projects, setProjects] = useState<Project[]>([]),
    [people, setPeople] = useState<Person[]>([]);
  const [error, setError] = useState(''),
    [layout, setLayout] = useState<'cards' | 'table'>('cards'),
    [urgency, setUrgency] = useState('smart'),
    [selected, setSelected] = useState<string[]>([]);
  const [filters, setFilters] = useState({
    search: '',
    projectId: '',
    responsiblePersonId: '',
    status: '',
    priority: ''
  });
  const load = useCallback(async () => {
    setError('');
    setData(null);
    try {
      const merged = {
        view: view === 'tasks' ? 'all' : view,
        ...query,
        ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value))
      } as Record<string, string>;
      if (merged.status === 'blocked') {
        delete merged.status;
        merged.blocked = 'true';
      }
      const [tasks, projectRows, peopleRows] = await Promise.all([api<{ items: Task[]; total: number }>(`/tasks?${new URLSearchParams(merged)}`), api<Project[]>('/projects'), api<Person[]>('/people')]);
      setData(tasks);
      setProjects(projectRows);
      setPeople(peopleRows);
    } catch (reason) {
      setError((reason as Error).message);
    }
  }, [view, JSON.stringify(query), JSON.stringify(filters), refreshToken]);
  useEffect(() => {
    void load();
  }, [load]);
  const priorityColor = (task: Task) => (task.priority === 'critical' ? '#dc2626' : task.priority === 'high' ? '#f97316' : task.priority === 'low' ? '#16a34a' : '#2563eb');
  const sorted = useMemo(
    () =>
      [...(data?.items || [])].sort((a, b) => {
        if (urgency === 'due') return (a.dueDate || '9999').localeCompare(b.dueDate || '9999');
        if (urgency === 'priority') {
          const order = ['critical', 'high', 'medium', 'low', 'none'];
          return order.indexOf(a.priority) - order.indexOf(b.priority);
        }
        if (urgency === 'updated') return b.updatedAt.localeCompare(a.updatedAt);
        const now = new Date().toISOString().slice(0, 10),
          score = (task: Task) => (task.dueDate && task.dueDate < now ? 0 : task.priority === 'critical' ? 1 : task.priority === 'high' ? 2 : task.dueDate || '9999');
        return String(score(a)).localeCompare(String(score(b)));
      }),
    [data, urgency]
  );
  const formatDue = (value?: string | null) => (value ? new Date(`${value}T12:00:00`).toLocaleDateString() : 'No due date');
  const remove = async (task: Task) => {
    if (!confirm(`Move “${task.title}” to Trash?`)) return;
    try {
      await api('/tasks/delete', { method: 'POST', body: { id: task.id } });
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    }
  };
  const progress = (task: Task) => task.status === 'completed' ? 100 : Math.max(0, Math.min(100, task.calculatedProgress || 0));
  const cards = sorted.map((task) => (
    <Card key={task.id} variant="outlined" sx={{ borderLeft: `4px solid ${priorityColor(task)}`, minHeight: 178 }}>
      <CardActionArea onClick={() => onOpen(task)} sx={{ height: '100%' }}>
        <CardContent sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
            <Stack direction="row" spacing={0.75} alignItems="center">
              <Chip
                size="small"
                label={task.priority}
                sx={{
                  textTransform: 'capitalize',
                  bgcolor: priorityColor(task),
                  color: task.priority === 'high' ? '#111827' : '#fff',
                  fontWeight: 800
                }}
              />
              {task.blocked && <Chip size="small" label="Blocked" color="warning" variant="outlined" sx={{ fontWeight: 700 }} />}
            </Stack>
            <Typography variant="caption" fontWeight={700}>
              {formatDue(task.dueDate)}
            </Typography>
          </Stack>
          <Typography variant="h6" mt={1.5} lineHeight={1.2}>
            {task.title}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ minHeight: 34 }}>
            {task.description || 'No description'}
          </Typography>
          <Box mt="auto">
            <LinearProgress
              variant="determinate"
              value={progress(task)}
              sx={{
                height: 7,
                borderRadius: 4,
                '& .MuiLinearProgress-bar': { bgcolor: priorityColor(task) }
              }}
            />
            <Stack direction="row" justifyContent="space-between" mt={0.75}>
              <Typography variant="caption" sx={{ textTransform: 'capitalize' }}>
                {task.status.replaceAll('_', ' ')}
              </Typography>
              <Typography variant="caption" fontWeight={700}>
                {progress(task)}%
              </Typography>
            </Stack>
          </Box>
        </CardContent>
      </CardActionArea>
    </Card>
  ));
  return (
    <>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={2} mb={3}>
        <Box>
          <Typography variant="h4">{titleFor(view, title)}</Typography>
          <Typography color="text.secondary">{data ? `${data.total} matching tasks` : 'Loading validated cloud tasks'}</Typography>
        </Box>
        <Button variant="contained" startIcon={<Add />} onClick={onNew}>
          New task
        </Button>
      </Stack>
      <Paper variant="outlined" sx={{ p: 1.25, mb: 2 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) auto' }, gap: 1.5, alignItems: 'center' }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))' }, gap: 1 }}>
          <TextField
            select
            size="small"
            label="Priority"
            value={filters.priority}
            slotProps={{
              inputLabel: { shrink: true },
              select: {
                displayEmpty: true,
                renderValue: (selected: unknown) => (selected ? String(selected).replaceAll('_', ' ') : 'All priorities')
              }
            }}
            onChange={(event) =>
              setFilters((value) => ({
                ...value,
                priority: event.target.value
              }))
            }
            fullWidth
          >
            <MenuItem value="">All priorities</MenuItem>
            {['critical', 'high', 'medium', 'low', 'none'].map((value) => (
              <MenuItem key={value} value={value}>
                {value}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Project"
            value={filters.projectId}
            slotProps={{
              inputLabel: { shrink: true },
              select: {
                displayEmpty: true,
                renderValue: (selected: unknown) => projects.find((project) => project.id === selected)?.name || 'All projects'
              }
            }}
            onChange={(event) =>
              setFilters((value) => ({
                ...value,
                projectId: event.target.value
              }))
            }
            fullWidth
          >
            <MenuItem value="">All projects</MenuItem>
            {projects.map((project) => (
              <MenuItem key={project.id} value={project.id}>
                {project.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField select fullWidth size="small" label="Sort" value={urgency} onChange={(event) => setUrgency(event.target.value)}>
            <MenuItem value="smart">Smart urgency</MenuItem>
            <MenuItem value="due">Due date</MenuItem>
            <MenuItem value="priority">Priority</MenuItem>
            <MenuItem value="updated">Recently updated</MenuItem>
          </TextField>
          <TextField fullWidth size="small" label="Search" value={filters.search} onChange={(event) => setFilters((value) => ({ ...value, search: event.target.value }))} />
          <TextField
            select
            size="small"
            label="Person"
            value={filters.responsiblePersonId}
            onChange={(event) =>
              setFilters((value) => ({
                ...value,
                responsiblePersonId: event.target.value
              }))
            }
            fullWidth
          >
            <MenuItem value="">All people</MenuItem>
            {people.map((person) => (
              <MenuItem key={person.id} value={person.id}>
                {person.fullName}
              </MenuItem>
            ))}
          </TextField>
          <TextField select fullWidth size="small" label="Status" value={filters.status} onChange={(event) => setFilters((value) => ({ ...value, status: event.target.value }))}>
            <MenuItem value="">All statuses</MenuItem>
            {['not_started', 'in_progress', 'waiting', 'blocked', 'completed'].map((value) => (
              <MenuItem key={value} value={value}>
                {value === 'blocked' ? 'Blocked by dependency' : value.replaceAll('_', ' ')}
              </MenuItem>
            ))}
          </TextField>
        </Box>
        <Stack direction="row" spacing={0.75} alignItems="center" justifyContent={{ xs: 'space-between', lg: 'flex-end' }} sx={{ pl: { lg: 1.5 }, borderLeft: { lg: 1 }, borderColor: { lg: 'divider' } }}>
          <ToggleButtonGroup exclusive size="small" value={layout} onChange={(_, value) => value && setLayout(value)} aria-label="Task layout">
            <ToggleButton value="table" aria-label="Table view">
              <TableRows sx={{ mr: 0.5 }} />
              Table
            </ToggleButton>
            <ToggleButton value="cards" aria-label="Card view">
              <ViewModule sx={{ mr: 0.5 }} />
              Cards
            </ToggleButton>
          </ToggleButtonGroup>
          <Button variant="outlined" startIcon={<Refresh />} aria-label="Refresh tasks" onClick={load}>Refresh</Button>
        </Stack>
        </Box>
      </Paper>
      {error && (
        <Alert severity="error" action={<Button onClick={load}>Retry</Button>}>
          {error}
        </Alert>
      )}
      {!data && !error && <LinearProgress />}
      {data?.items.length === 0 && (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6">No tasks match these filters</Typography>
        </Paper>
      )}
      {layout === 'cards' ? (
        <Box className="task-card-grid">{cards}</Box>
      ) : (
        data &&
        sorted.length > 0 && (
          <TableContainer component={Paper} variant="outlined">
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox checked={selected.length === sorted.length && !!sorted.length} indeterminate={selected.length > 0 && selected.length < sorted.length} onChange={(event) => setSelected(event.target.checked ? sorted.map((task) => task.id) : [])} />
                  </TableCell>
                  <TableCell>Task</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Priority</TableCell>
                  <TableCell sx={{ minWidth: 230 }}>Progress</TableCell>
                  <TableCell>Due date</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sorted.map((task) => (
                  <TableRow
                    hover
                    key={task.id}
                    onClick={() => onOpen(task)}
                    sx={{
                      cursor: 'pointer',
                      '& td:first-of-type': {
                        borderLeft: `4px solid ${priorityColor(task)}`
                      }
                    }}
                  >
                    <TableCell padding="checkbox" onClick={(event) => event.stopPropagation()}>
                      <Checkbox checked={selected.includes(task.id)} onChange={(event) => setSelected((value) => (event.target.checked ? [...value, task.id] : value.filter((id) => id !== task.id)))} />
                    </TableCell>
                    <TableCell>
                      <Typography fontWeight={800}>{task.title}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {task.description || 'No description'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                        <Chip size="small" variant="outlined" color="primary" label={task.status.replaceAll('_', ' ')} />
                        {task.blocked && <Chip size="small" variant="outlined" color="warning" label="Blocked" />}
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={task.priority}
                        sx={{
                          textTransform: 'capitalize',
                          bgcolor: priorityColor(task),
                          color: task.priority === 'high' ? '#111827' : '#fff',
                          fontWeight: 800,
                          minWidth: 90
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" justifyContent="space-between">
                        <Typography variant="caption">{progress(task)}%</Typography>
                        <Typography variant="caption">
                          {task.checklistCompleted || 0}/{task.checklistTotal || 0}
                        </Typography>
                      </Stack>
                      <LinearProgress
                        variant="determinate"
                        value={progress(task)}
                        sx={{
                          height: 6,
                          borderRadius: 3,
                          '& .MuiLinearProgress-bar': {
                            bgcolor: priorityColor(task)
                          }
                        }}
                      />
                    </TableCell>
                    <TableCell>{formatDue(task.dueDate)}</TableCell>
                    <TableCell align="right" onClick={(event) => event.stopPropagation()}>
                      <Tooltip title="Edit">
                        <IconButton onClick={() => onOpen(task)}>
                          <Edit />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Move to Trash">
                        <IconButton onClick={() => void remove(task)}>
                          <Delete />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )
      )}
    </>
  );
}

function CostAnalyticsCard({ onOpenTask, refreshToken = 0 }: { onOpenTask: (task: Task) => void; refreshToken?: number }) {
  const currentYear = new Date().getFullYear(),
    [year, setYear] = useState(String(currentYear)),
    [month, setMonth] = useState(''),
    [compareYear, setCompareYear] = useState(''),
    [data, setData] = useState<CostSummary | null>(null),
    [error, setError] = useState(''),
    [drilldown, setDrilldown] = useState<{ title: string; entries: CostEntry[] } | null>(null);
  const load = useCallback(() => {
    const query = new URLSearchParams();
    if (year !== 'all') query.set('year', year);
    if (month && year !== 'all') query.set('month', month);
    if (compareYear && year !== 'all') query.set('compareYear', compareYear);
    setError('');
    return api<CostSummary>(`/costs?${query}`)
      .then(setData)
      .catch((reason) => setError(reason.message));
  }, [year, month, compareYear, refreshToken]);
  useEffect(() => {
    void load();
  }, [load]);
  const years = Array.from(new Set([currentYear, ...(data?.availableYears || [])])).sort((a, b) => b - a),
    comparisonYears = (data?.availableYears || []).filter((value) => String(value) !== year),
    money = (value: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency: data?.currencyCode || 'CHF', maximumFractionDigits: 2 }).format(value),
    monthLabel = (value: number) => new Date(2020, value - 1, 1).toLocaleDateString(undefined, { month: 'short' }),
    graphMaximum = Math.max(1, ...(data?.monthly.flatMap((item) => [item.total, item.compareTotal || 0]) || [0]));
  useEffect(() => {
    if (compareYear && !comparisonYears.includes(Number(compareYear))) setCompareYear('');
  }, [year, data?.availableYears.join(','), compareYear]);
  const openEntries = (title: string, predicate: (entry: CostEntry) => boolean = () => true) => {
    setDrilldown({ title, entries: (data?.entries || []).filter(predicate) });
  };
  const openTask = async (entry: CostEntry) => {
    try {
      const details = await api<TaskDetailsPayload>(`/tasks/details?taskId=${encodeURIComponent(entry.taskId)}`);
      setDrilldown(null);
      onOpenTask(details.task);
    } catch (reason) {
      setError((reason as Error).message);
    }
  };
  return (
    <>
      <Card sx={{ mt: 2 }}>
        <CardContent>
          <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2} mb={2}>
            <Box><Typography variant="h6">Total cost</Typography><Typography color="text.secondary">Past and future task costs, including checklist items.</Typography></Box>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <TextField select size="small" label="Period" value={year} onChange={(event) => { setYear(event.target.value); setMonth(''); }} sx={{ minWidth: 130 }}>
                <MenuItem value="all">All time</MenuItem>
                {years.map((value) => <MenuItem key={value} value={String(value)}>{value}</MenuItem>)}
              </TextField>
              <TextField select size="small" label="Month" value={month} disabled={year === 'all'} onChange={(event) => { setMonth(event.target.value); if (event.target.value) setCompareYear(''); }} sx={{ minWidth: 140 }}>
                <MenuItem value="">All months</MenuItem>
                {Array.from({ length: 12 }, (_, index) => index + 1).map((value) => <MenuItem key={value} value={String(value)}>{new Date(2020, value - 1, 1).toLocaleDateString(undefined, { month: 'long' })}</MenuItem>)}
              </TextField>
              {year !== 'all' && !month && comparisonYears.length > 0 && <TextField select size="small" label="Compare with" value={compareYear} onChange={(event) => setCompareYear(event.target.value)} sx={{ minWidth: 145 }}><MenuItem value="">No comparison</MenuItem>{comparisonYears.map((value) => <MenuItem key={value} value={String(value)}>{value}</MenuItem>)}</TextField>}
            </Stack>
          </Stack>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {!data ? <LinearProgress /> : <>
            <Box className="metric-grid">
              {[['Past / incurred', data.totals.past, 'past'], ['Future / planned', data.totals.future, 'future'], ['Total', data.totals.total, 'all']].map(([label, value, timing]) => <Card key={String(label)} variant="outlined"><CardActionArea onClick={() => openEntries(String(label), (entry) => timing === 'all' || entry.timing === timing)}><CardContent><Typography color="text.secondary">{label}</Typography><Typography variant="h5">{money(Number(value))}</Typography></CardContent></CardActionArea></Card>)}
            </Box>
            {year !== 'all' && !month && <Box sx={{ mt: 3, overflowX: 'auto', pb: 1 }}>
              <Stack direction="row" spacing={1} alignItems="flex-end" sx={{ minWidth: 720, height: 220 }}>
                {data.monthly.map((item) => <Box component="button" type="button" key={item.month} onClick={() => openEntries(`${monthLabel(item.month)} ${year}`, (entry) => !!entry.date && Number(entry.date.slice(5, 7)) === item.month)} sx={{ border: 0, bgcolor: 'transparent', color: 'inherit', cursor: 'pointer', flex: 1, height: '100%', p: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                  <Stack direction="row" spacing={0.4} alignItems="flex-end" justifyContent="center" flex={1} width="100%">
                    <Box title={`${year}: ${money(item.total)}`} sx={{ width: compareYear ? '34%' : '55%', minHeight: item.total ? 4 : 0, height: `${item.total / graphMaximum * 100}%`, maxHeight: '170px', bgcolor: 'primary.main', borderRadius: '5px 5px 0 0' }} />
                    {item.compareTotal !== undefined && <Box title={`${compareYear}: ${money(item.compareTotal)}`} onClick={(event) => { event.stopPropagation(); setDrilldown({ title: `${monthLabel(item.month)} ${compareYear}`, entries: data.comparisonEntries.filter((entry) => !!entry.date && Number(entry.date.slice(5, 7)) === item.month) }); }} sx={{ width: '34%', minHeight: item.compareTotal ? 4 : 0, height: `${item.compareTotal / graphMaximum * 100}%`, maxHeight: '170px', bgcolor: 'secondary.main', borderRadius: '5px 5px 0 0' }} />}
                  </Stack>
                  <Typography variant="caption" textAlign="center" mt={0.5}>{monthLabel(item.month)}</Typography>
                </Box>)}
              </Stack>
              <Stack direction="row" spacing={2} mt={1}><Typography variant="caption"><Box component="span" sx={{ display: 'inline-block', width: 10, height: 10, bgcolor: 'primary.main', mr: 0.5 }} />{year}</Typography>{data.compareYear && <Typography variant="caption"><Box component="span" sx={{ display: 'inline-block', width: 10, height: 10, bgcolor: 'secondary.main', mr: 0.5 }} />{data.compareYear}</Typography>}</Stack>
            </Box>}
            <Typography variant="h6" mt={3} mb={1}>Cost by project</Typography>
            <Stack spacing={1}>
              {data.projects.map((project) => <Card key={project.projectId || 'none'} variant="outlined"><CardActionArea onClick={() => openEntries(project.projectName, (entry) => entry.projectId === project.projectId)}><CardContent><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1}><Box><Typography fontWeight={700}>{project.projectName}</Typography><Typography variant="body2" color="text.secondary">Past {money(project.past)} · Future {money(project.future)}</Typography></Box><Typography variant="h6">{money(project.total)}</Typography></Stack></CardContent></CardActionArea></Card>)}
              {!data.projects.length && <Typography color="text.secondary">No costs exist for this period.</Typography>}
            </Stack>
          </>}
        </CardContent>
      </Card>
      <Dialog open={!!drilldown} onClose={() => setDrilldown(null)} fullWidth maxWidth="md">
        <DialogTitle>{drilldown?.title} cost details</DialogTitle>
        <DialogContent><Stack spacing={1} mt={1}>{drilldown?.entries.map((entry) => <Card key={entry.taskId} variant="outlined"><CardActionArea onClick={() => void openTask(entry)}><CardContent><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1}><Box><Typography fontWeight={700}>{entry.title}</Typography><Typography variant="body2" color="text.secondary">{entry.projectName} · {entry.timing} · {entry.date ? new Date(`${entry.date.slice(0, 10)}T12:00:00`).toLocaleDateString() : 'No cost date'}</Typography><Typography variant="caption">Task {money(entry.taskCost)} + checklist {money(entry.checklistCost)}</Typography></Box><Typography variant="h6">{money(entry.totalCost)}</Typography></Stack></CardContent></CardActionArea></Card>)}{drilldown && !drilldown.entries.length && <Typography color="text.secondary">No costs match this selection.</Typography>}</Stack></DialogContent>
        <DialogActions><Button onClick={() => setDrilldown(null)}>Close</Button></DialogActions>
      </Dialog>
    </>
  );
}

export function EnhancedDashboardView({ openFilter, openTask, refreshToken = 0 }: { openFilter: (title: string, query: Record<string, unknown>) => void; openTask: (task: Task) => void; refreshToken?: number }) {
  const [data, setData] = useState<Dashboard | null>(null),
    [projects, setProjects] = useState<Project[]>([]),
    [error, setError] = useState('');
  useEffect(() => {
    Promise.all([api<Dashboard>('/dashboard'), api<Project[]>('/projects')])
      .then(([dashboard, projectRows]) => {
        setData(dashboard);
        setProjects(projectRows);
      })
      .catch((reason) => setError(reason.message));
  }, [refreshToken]);
  const cards = [
    ['Overdue', 'overdue', { due: 'overdue' }],
    ['Due today', 'today', { due: 'today' }],
    ['Next 7 days', 'next7', { due: 'next7' }],
    ['Critical', 'critical', { priority: 'critical' }],
    ['Blocked', 'blocked', { blocked: 'true' }],
    ['Waiting', 'waiting', { status: 'waiting' }]
  ] as const;
  if (error) return <Alert severity="error">{error}</Alert>;
  return (
    <>
      <Box mb={3}>
        <Typography variant="h4">Dashboard</Typography>
        <Typography color="text.secondary">A calm overview of what needs your attention.</Typography>
      </Box>
      {!data ? (
        <LinearProgress />
      ) : (
        <>
          <Box className="metric-grid">
            {cards.map(([label, key, query]) => (
              <Card key={key}>
                <CardActionArea onClick={() => openFilter(label, query)}>
                  <CardContent>
                    <Stack direction="row" justifyContent="space-between">
                      <Box>
                        <Typography color="text.secondary">{label}</Typography>
                        <Typography variant="h4">{data.counts[key] || 0}</Typography>
                      </Box>
                    </Stack>
                  </CardContent>
                </CardActionArea>
              </Card>
            ))}
          </Box>
          <Card sx={{ mt: 2 }}>
            <CardActionArea onClick={() => openFilter('Overall workload', {})}>
              <CardContent>
                <Stack direction="row" justifyContent="space-between">
                  <Box>
                    <Typography variant="h6">Overall workload</Typography>
                    <Typography color="text.secondary">Average progress across active tasks</Typography>
                  </Box>
                  <Typography variant="h5">{data.overallProgress}%</Typography>
                </Stack>
                <LinearProgress variant="determinate" value={data.overallProgress} sx={{ mt: 2, height: 10, borderRadius: 5 }} />
              </CardContent>
            </CardActionArea>
          </Card>
          <Card sx={{ mt: 2 }}>
            <CardContent>
              <Typography variant="h6">Progress by project</Typography>
              <Typography color="text.secondary" mb={2}>
                Select a project to open its tasks.
              </Typography>
              <Stack spacing={1.5}>
                {projects.length ? (
                  projects.map((project) => (
                    <CardActionArea key={project.id} onClick={() => openFilter(project.name, { projectId: project.id })} sx={{ borderRadius: 1, p: 1 }}>
                      <Stack direction="row" alignItems="center" spacing={1.5}>
                        <Box sx={{ width: 120 }}>
                          <Typography fontWeight={700} noWrap>
                            {project.name}
                          </Typography>
                          <Typography variant="caption">{project.activeTasks} active</Typography>
                        </Box>
                        <Box flex={1}>
                          <LinearProgress
                            variant="determinate"
                            value={project.progress || 0}
                            sx={{
                              height: 12,
                              borderRadius: 6,
                              '& .MuiLinearProgress-bar': {
                                bgcolor: project.color
                              }
                            }}
                          />
                        </Box>
                        <Typography width={45} textAlign="right">
                          {project.progress || 0}%
                        </Typography>
                      </Stack>
                    </CardActionArea>
                  ))
                ) : (
                  <Typography color="text.secondary">Create a project to see project progress.</Typography>
                )}
              </Stack>
            </CardContent>
          </Card>
          <CostAnalyticsCard onOpenTask={openTask} refreshToken={refreshToken} />
        </>
      )}
    </>
  );
}

export function NotificationBell() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null),
    [items, setItems] = useState<NotificationItem[]>([]),
    [unread, setUnread] = useState(0);
  const load = useCallback(
    () =>
      api<{ items: NotificationItem[]; unread: number }>('/notifications/inbox')
        .then((data) => {
          setItems(data.items);
          setUnread(data.unread);
        })
        .catch(() => undefined),
    []
  );
  useEffect(() => {
    void load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [load]);
  const read = async (item: NotificationItem) => {
    if (!item.readAt) {
      await api('/notifications/read', {
        method: 'POST',
        body: { id: item.id }
      });
      await load();
    }
  };
  return (
    <>
      <Tooltip title="Notifications">
        <IconButton
          aria-label={`${unread} unread notifications`}
          onClick={(event) => {
            setAnchor(event.currentTarget);
            void load();
          }}
        >
          <Badge badgeContent={unread} color="error">
            <NotificationsActive />
          </Badge>
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchor}
        open={!!anchor}
        onClose={() => setAnchor(null)}
        slotProps={{
          paper: { sx: { width: 340, maxWidth: '90vw', maxHeight: 420 } }
        }}
      >
        <MenuItem disabled>
          <Typography fontWeight={800}>Notifications</Typography>
        </MenuItem>
        {items.length ? (
          items.map((item) => (
            <MenuItem key={item.id} onClick={() => void read(item)} sx={{ whiteSpace: 'normal', alignItems: 'flex-start' }}>
              <Box>
                <Typography fontWeight={item.readAt ? 400 : 800}>{item.kind === 'reminder' ? 'Task reminder' : item.kind}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {new Date(item.createdAt).toLocaleString()} · {item.status}
                </Typography>
              </Box>
            </MenuItem>
          ))
        ) : (
          <MenuItem disabled>No notifications yet</MenuItem>
        )}
      </Menu>
    </>
  );
}

function PersonDetailsDialog({ personId, fallbackName, open, onClose, mobile }: { personId: string | null; fallbackName?: string; open: boolean; onClose: () => void; mobile: boolean }) {
  const [person, setPerson] = useState<Person | null>(null),
    [error, setError] = useState(''),
    [phoneActions, setPhoneActions] = useState(false);
  useEffect(() => {
    if (!open || !personId) return;
    setPerson(null);
    setError('');
    api<Person>(`/people/details?personId=${encodeURIComponent(personId)}`)
      .then(setPerson)
      .catch((reason) => setError(reason.message));
  }, [open, personId]);
  const phone = person?.phone?.trim() || '';
  const callablePhone = phone.replace(/[^\d+]/g, '');
  const whatsappPhone = phone.replace(/\D/g, '');
  const openExternal = (url: string) => {
    if (url.startsWith('https://')) window.open(url, '_blank', 'noopener,noreferrer');
    else window.location.href = url;
  };
  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        fullScreen={mobile}
        fullWidth
        maxWidth="sm"
        slotProps={{ paper: { sx: mobile ? { height: '100dvh', maxHeight: '100dvh' } : undefined } }}
      >
        <DialogTitle sx={mobile ? { flexShrink: 0, borderBottom: 1, borderColor: 'divider' } : undefined}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <PersonIcon color="primary" />
            <Box flex={1}>{person?.fullName || fallbackName || 'Contact details'}</Box>
            <IconButton aria-label="Close contact details" onClick={onClose}><Close /></IconButton>
          </Stack>
        </DialogTitle>
        <DialogContent sx={mobile ? { overflowY: 'auto', px: 2, pb: 2 } : undefined}>
          {error && <Alert severity="error">{error}</Alert>}
          {!person && !error && <LinearProgress />}
          {person && (
            <Stack spacing={2} mt={1}>
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="overline" color="text.secondary">Role and company</Typography>
                <Typography>{[person.role, person.company].filter(Boolean).join(' · ') || 'Not specified'}</Typography>
              </Paper>
              <Button variant="outlined" startIcon={<Call />} disabled={!phone} onClick={() => setPhoneActions(true)} sx={{ justifyContent: 'flex-start', minHeight: 48 }}>
                {phone || 'No phone number'}
              </Button>
              <Button variant="outlined" startIcon={<Email />} disabled={!person.email} onClick={() => openExternal(`mailto:${person.email}`)} sx={{ justifyContent: 'flex-start', minHeight: 48 }}>
                {person.email || 'No email address'}
              </Button>
              {person.address && <Paper variant="outlined" sx={{ p: 2 }}><Typography variant="overline" color="text.secondary">Address</Typography><Typography>{person.address}</Typography></Paper>}
              {person.notes && <Paper variant="outlined" sx={{ p: 2 }}><Typography variant="overline" color="text.secondary">Notes</Typography><Typography sx={{ whiteSpace: 'pre-wrap' }}>{person.notes}</Typography></Paper>}
            </Stack>
          )}
        </DialogContent>
        <DialogActions
          sx={mobile ? {
            position: 'sticky',
            bottom: 0,
            zIndex: 3,
            flexShrink: 0,
            borderTop: 1,
            borderColor: 'divider',
            bgcolor: 'background.paper',
            px: 2,
            pt: 1.25,
            pb: 'calc(20px + env(safe-area-inset-bottom))',
            boxShadow: '0 -8px 20px rgba(0,0,0,.18)',
            '& .MuiButton-root': { minHeight: 48, m: 0 }
          } : undefined}
        >
          <Button fullWidth={mobile} variant={mobile ? 'contained' : 'text'} startIcon={mobile ? <Close /> : undefined} onClick={onClose}>Close</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={phoneActions} onClose={() => setPhoneActions(false)} fullWidth maxWidth="xs">
        <DialogTitle>Contact {person?.fullName || fallbackName}</DialogTitle>
        <DialogContent><Typography>How would you like to use {phone}?</Typography></DialogContent>
        <DialogActions sx={{ flexWrap: 'wrap' }}>
          <Button onClick={() => setPhoneActions(false)}>Cancel</Button>
          <Button startIcon={<Call />} disabled={!callablePhone} onClick={() => openExternal(`tel:${callablePhone}`)}>Call</Button>
          <Button variant="contained" startIcon={<WhatsApp />} disabled={!whatsappPhone} onClick={() => openExternal(`https://wa.me/${whatsappPhone}`)}>WhatsApp</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

type TaskDetailsPayload = {
  task: Task;
  checklist: ChecklistItem[];
  dependencies: TaskDependency[];
  activities: { id: string; eventType: string; summary: string; details?: { comment?: string }; createdAt: string; authorDisplayName?: string | null }[];
};

export function TaskDetailsDialog({ task, open, onClose, onEdit, onCompleted, onDeleted, mobile, refreshToken = 0 }: { task: Task | null; open: boolean; onClose: () => void; onEdit: (task: Task) => void; onCompleted: () => void; onDeleted: () => void; mobile: boolean; refreshToken?: number }) {
  const [history, setHistory] = useState<Task[]>([]),
    [details, setDetails] = useState<TaskDetailsPayload | null>(null),
    [attachments, setAttachments] = useState<TaskAttachment[]>([]),
    [projects, setProjects] = useState<Project[]>([]),
    [currencyCode, setCurrencyCode] = useState('CHF'),
    [responsiblePerson, setResponsiblePerson] = useState<Person | null>(null),
    [contactOpen, setContactOpen] = useState(false),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false),
    [completing, setCompleting] = useState(false),
    [deleting, setDeleting] = useState(false),
    [completionOpen, setCompletionOpen] = useState(false),
    [updatingChecklistId, setUpdatingChecklistId] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null),
    scrollPositions = useRef<Record<string, number>>({});
  const current = history[history.length - 1] || task;
  useEffect(() => {
    if (open && task) {
      setHistory([task]);
      setDetails(null);
      setAttachments([]);
      setResponsiblePerson(null);
      setContactOpen(false);
      setCompletionOpen(false);
      scrollPositions.current = {};
    }
  }, [open, task?.id]);
  useEffect(() => {
    if (!open || !current) return;
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([
      api<TaskDetailsPayload>(`/tasks/details?taskId=${encodeURIComponent(current.id)}`),
      api<TaskAttachment[]>(`/tasks/attachments?taskId=${encodeURIComponent(current.id)}`),
      api<Project[]>('/projects'),
      api<{ currencyCode?: string } | null>('/preferences')
    ])
      .then(([nextDetails, nextAttachments, projectRows, preferences]) => {
        if (!active) return;
        const mergedTask = { ...current, ...nextDetails.task };
        setDetails({ ...nextDetails, task: mergedTask });
        setAttachments(nextAttachments);
        setProjects(projectRows);
        setCurrencyCode(preferences?.currencyCode || 'CHF');
        setHistory((value) => value.map((entry, index) => (index === value.length - 1 ? mergedTask : entry)));
        setResponsiblePerson(null);
        if (mergedTask.responsiblePersonId)
          void api<Person>(`/people/details?personId=${encodeURIComponent(mergedTask.responsiblePersonId)}`)
            .then((person) => active && setResponsiblePerson(person))
            .catch(() => undefined);
        requestAnimationFrame(() => {
          if (contentRef.current) contentRef.current.scrollTop = scrollPositions.current[current.id] || 0;
        });
      })
      .catch((reason) => active && setError(reason.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [open, current?.id, refreshToken]);
  const saveScroll = () => {
    if (current && contentRef.current) scrollPositions.current[current.id] = contentRef.current.scrollTop;
  };
  const goBack = () => {
    saveScroll();
    if (history.length > 1) setHistory((value) => value.slice(0, -1));
    else onClose();
  };
  const openDependency = (dependency: TaskDependency) => {
    if (!dependency.prerequisiteTask) return;
    saveScroll();
    setHistory((value) => [...value, dependency.prerequisiteTask!]);
  };
  const openAttachment = async (attachment: TaskAttachment) => {
    try {
      const result = await api<{ url: string }>('/tasks/attachments/open', { method: 'POST', body: { id: attachment.id } });
      window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch (reason) {
      setError((reason as Error).message);
    }
  };
  const shownTask = details?.task || current;
  const projectName = shownTask?.projectName || projects.find((project) => project.id === shownTask?.projectId)?.name;
  const completedChecklist = details?.checklist.filter((item) => item.completed).length || 0;
  const taskCost = shownTask?.costAmount ?? null,
    checklistCost = details?.checklist.reduce((sum, item) => sum + (item.costAmount || 0), 0) || 0,
    hasCost = taskCost !== null || !!details?.checklist.some((item) => item.costAmount !== null && item.costAmount !== undefined),
    totalCost = (taskCost || 0) + checklistCost,
    money = (value: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode }).format(value);
  const completeTask = async () => {
    if (!shownTask) return;
    const unfinishedChecklist = details?.checklist.filter((item) => item.required && !item.completed) || [];
    const unfinishedDependencies = details?.dependencies.filter((dependency) => dependency.mandatory && !['completed', 'cancelled', 'archived'].includes(dependency.prerequisiteStatus)) || [];
    if (unfinishedChecklist.length || unfinishedDependencies.length) {
      setCompletionOpen(true);
      return;
    }
    setCompleting(true);
    setError('');
    try {
      await api('/tasks/save', {
        method: 'POST',
        body: {
          id: shownTask.id,
          title: shownTask.title,
          description: shownTask.description || '',
          status: 'completed',
          priority: shownTask.priority,
          dueDate: shownTask.dueDate || null,
          reminderAt: shownTask.reminderAt || null,
          reminderRepeat: shownTask.reminderRepeat || 'none',
          reminderRepeatInterval: shownTask.reminderRepeatInterval || 1,
          projectId: shownTask.projectId || null,
          responsiblePersonId: shownTask.responsiblePersonId || null,
          costAmount: shownTask.costAmount ?? null,
          costDate: shownTask.costDate || null,
          completeWhenChecklistDone: Boolean(shownTask.completeWhenChecklistDone),
          expectedVersion: shownTask.version
        }
      });
      setCompletionOpen(false);
      onCompleted();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setCompleting(false);
    }
  };
  const setChecklistCompleted = async (item: ChecklistItem, completed: boolean) => {
    if (!shownTask || !item.id) return;
    setUpdatingChecklistId(item.id);
    setError('');
    try {
      await api('/tasks/checklist/save', { method: 'POST', timeoutMs: 60_000, body: { ...item, taskId: shownTask.id, completed } });
      const refreshed = await api<TaskDetailsPayload>(`/tasks/details?taskId=${encodeURIComponent(shownTask.id)}`);
      setDetails(refreshed);
      setHistory((value) => value.map((entry, index) => index === value.length - 1 ? { ...entry, ...refreshed.task } : entry));
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setUpdatingChecklistId(null);
    }
  };
  const deleteTask = async () => {
    if (!shownTask || !confirm(`Move “${shownTask.title}” to Trash?`)) return;
    setDeleting(true);
    setError('');
    try {
      await api('/tasks/delete', { method: 'POST', body: { id: shownTask.id }, timeoutMs: 30_000 });
      onDeleted();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setDeleting(false);
    }
  };
  return (
    <>
      <Dialog open={open} onClose={onClose} fullScreen={mobile} fullWidth maxWidth="md" slotProps={{ paper: { sx: mobile ? { height: '100dvh', maxHeight: '100dvh' } : undefined } }}>
        <DialogTitle>
          <Stack direction="row" alignItems="center" spacing={1}>
            <IconButton aria-label={history.length > 1 ? 'Back to previous task' : 'Back to task list'} onClick={goBack}><ArrowBack /></IconButton>
            <Box flex={1} minWidth={0}>
              <Typography variant="h6" noWrap>{shownTask?.title || 'Task details'}</Typography>
              {history.length > 1 && <Typography variant="caption" color="text.secondary">Viewing linked task · {history.length} levels deep</Typography>}
            </Box>
            <IconButton aria-label="Close task details" onClick={onClose}><Close /></IconButton>
          </Stack>
        </DialogTitle>
        <DialogContent ref={contentRef} sx={mobile ? { pb: 2 } : undefined}>
          {loading && <LinearProgress sx={{ mb: 2 }} />}
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {shownTask && (
            <Stack spacing={2} mt={1}>
              {shownTask.description && <Paper variant="outlined" sx={{ p: 2 }}><Typography sx={{ whiteSpace: 'pre-wrap' }}>{shownTask.description}</Typography></Paper>}
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip label={shownTask.status.replaceAll('_', ' ')} color={shownTask.status === 'completed' ? 'success' : 'default'} />
                <Chip label={`${shownTask.priority} priority`} color={shownTask.priority === 'critical' ? 'error' : shownTask.priority === 'high' ? 'warning' : 'primary'} />
                {shownTask.blocked && <Chip label="Blocked" color="warning" />}
                {shownTask.dueDate && <Chip label={`Due ${new Date(`${shownTask.dueDate}T12:00:00`).toLocaleDateString()}`} />}
                {shownTask.reminderAt && <Chip label={`Reminder ${new Date(shownTask.reminderAt).toLocaleString()}`} variant="outlined" />}
                {shownTask.reminderAt && shownTask.reminderRepeat && shownTask.reminderRepeat !== 'none' && <Chip label={`Repeats every ${shownTask.reminderRepeatInterval || 1} ${reminderRepeatUnit(shownTask.reminderRepeat)}${(shownTask.reminderRepeatInterval || 1) > 1 ? 's' : ''}`} color="info" variant="outlined" />}
                {shownTask.completeWhenChecklistDone && <Chip label="Completes with checklist" color="success" variant="outlined" />}
                {projectName && <Chip label={projectName} />}
              </Stack>
              {shownTask.responsiblePersonId && (
                <Button variant="outlined" startIcon={<PersonIcon />} onClick={() => setContactOpen(true)} sx={{ justifyContent: 'flex-start', minHeight: 48 }}>
                  Responsible: {responsiblePerson?.fullName || shownTask.responsiblePersonName || 'Open contact details'}
                </Button>
              )}
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center"><Typography variant="h6">Cost breakdown</Typography><Typography variant="h6">{hasCost ? money(totalCost) : 'N/A'}</Typography></Stack>
                <Stack spacing={0.75} mt={1}>
                  <Stack direction="row" justifyContent="space-between"><Typography color="text.secondary">Task cost</Typography><Typography>{taskCost === null ? 'N/A' : money(taskCost)}</Typography></Stack>
                  {shownTask.costDate && <Stack direction="row" justifyContent="space-between"><Typography color="text.secondary">Cost date</Typography><Typography>{new Date(`${shownTask.costDate}T12:00:00`).toLocaleDateString()}</Typography></Stack>}
                  <Stack direction="row" justifyContent="space-between"><Typography color="text.secondary">Checklist items</Typography><Typography>{details?.checklist.some((item) => item.costAmount !== null && item.costAmount !== undefined) ? money(checklistCost) : 'N/A'}</Typography></Stack>
                </Stack>
              </Paper>
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Stack direction="row" justifyContent="space-between"><Typography variant="h6">Checklist</Typography><Typography color="text.secondary">{completedChecklist}/{details?.checklist.length || 0}</Typography></Stack>
                <Stack spacing={1} mt={1}>
                  {details?.checklist.map((item) => <Stack key={item.id || item.description} direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap><Checkbox checked={item.completed} disabled /><Typography flex={1} minWidth={160} sx={{ textDecoration: item.completed ? 'line-through' : 'none' }}>{item.description}</Typography>{item.dueDate && <Chip size="small" variant="outlined" label={new Date(`${item.dueDate}T12:00:00`).toLocaleDateString()} />}{item.costAmount !== null && item.costAmount !== undefined && <Chip size="small" label={money(item.costAmount)} />}{item.required && <Chip size="small" label="Required" />}</Stack>)}
                  {!details?.checklist.length && <Typography color="text.secondary">No checklist items.</Typography>}
                </Stack>
              </Paper>
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="h6">Blocking tasks and dependencies</Typography>
                <Typography variant="body2" color="text.secondary" mb={1}>Select a prerequisite to open it. Back returns here.</Typography>
                <Stack spacing={1}>
                  {details?.dependencies.map((dependency) => (
                    <Card key={dependency.id} variant="outlined">
                      <CardActionArea disabled={!dependency.prerequisiteTask} onClick={() => openDependency(dependency)}>
                        <CardContent>
                          <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                            <Box><Typography fontWeight={700}>{dependency.prerequisiteTitle}</Typography><Typography variant="body2" color="text.secondary">{dependency.prerequisiteStatus.replaceAll('_', ' ')} · {dependency.mandatory ? 'Required' : 'Optional'}</Typography></Box>
                            <OpenInNew color="action" />
                          </Stack>
                        </CardContent>
                      </CardActionArea>
                    </Card>
                  ))}
                  {!details?.dependencies.length && <Typography color="text.secondary">No dependencies.</Typography>}
                </Stack>
              </Paper>
              {!!attachments.length && <Paper variant="outlined" sx={{ p: 2 }}><Typography variant="h6">Files and links</Typography><Stack spacing={0.5} mt={1}>{attachments.map((attachment) => <Button key={attachment.id} startIcon={attachment.mimeType === 'text/uri-list' ? <LinkIcon /> : <AttachFile />} endIcon={<OpenInNew />} onClick={() => void openAttachment(attachment)} sx={{ justifyContent: 'flex-start' }}>{attachment.displayName}</Button>)}</Stack></Paper>}
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="h6">Activity</Typography>
                <Stack spacing={1.5} mt={1.5}>
                  {details?.activities?.map((activity) => {
                    const author = activity.authorDisplayName || (activity.eventType === 'external_collaboration' ? 'Shared collaborator' : 'Task Tracker');
                    const initials = author.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase();
                    return <Stack key={activity.id} direction="row" spacing={1.25} alignItems="flex-start">
                      <Avatar sx={{ width: 32, height: 32, fontSize: 12, bgcolor: activity.eventType === 'external_collaboration' ? 'secondary.main' : 'primary.main' }}>{initials}</Avatar>
                      <Box minWidth={0} flex={1}>
                        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={0.25}>
                          <Typography fontWeight={700}>{activity.summary}</Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>{new Date(activity.createdAt).toLocaleString()}</Typography>
                        </Stack>
                        {activity.authorDisplayName && <Typography variant="caption" color="text.secondary">by {activity.authorDisplayName}</Typography>}
                        {activity.details?.comment && <Typography mt={0.5} sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{activity.details.comment}</Typography>}
                      </Box>
                    </Stack>;
                  })}
                  {!details?.activities?.length && <Typography color="text.secondary">No activity has been recorded for this task yet.</Typography>}
                </Stack>
              </Paper>
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={mobile ? { position: 'sticky', bottom: 0, zIndex: 3, flexShrink: 0, display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 1, borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper', px: 2, pt: 1.25, pb: 'calc(20px + env(safe-area-inset-bottom))', boxShadow: '0 -8px 20px rgba(0,0,0,.18)', '& .MuiButton-root': { minHeight: 44, m: 0 } } : undefined}>
          <Button startIcon={<ArrowBack />} onClick={goBack}>{history.length > 1 ? 'Previous task' : 'Back'}</Button>
          <Button color="error" variant="outlined" startIcon={deleting ? <CircularProgress size={18} /> : <Delete />} disabled={!shownTask || deleting} onClick={() => void deleteTask()}>Delete task</Button>
          {shownTask?.status !== 'completed' && <Button color="success" variant="outlined" startIcon={completing ? <CircularProgress size={18} /> : <CheckCircle />} disabled={completing} onClick={() => void completeTask()}>Complete task</Button>}
          <Button variant="contained" startIcon={<Edit />} disabled={!shownTask} onClick={() => shownTask && onEdit(shownTask)}>Edit task</Button>
        </DialogActions>
      </Dialog>
      <PersonDetailsDialog personId={shownTask?.responsiblePersonId || null} fallbackName={responsiblePerson?.fullName || shownTask?.responsiblePersonName} open={contactOpen} onClose={() => setContactOpen(false)} mobile={mobile} />
      <Dialog open={completionOpen} onClose={() => !completing && setCompletionOpen(false)} fullScreen>
        <DialogTitle>
          <Stack direction="row" alignItems="center" spacing={1}>
            <IconButton aria-label="Back to task details" onClick={() => setCompletionOpen(false)}><ArrowBack /></IconButton>
            <Box><Typography variant="h6">Complete required work first</Typography><Typography variant="body2" color="text.secondary">{shownTask?.title}</Typography></Box>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ maxWidth: 820, mx: 'auto', py: 2 }}>
            <Alert severity="warning" sx={{ mb: 2 }}>This task cannot be marked completed until every required checklist item and mandatory prerequisite below is complete.</Alert>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
              <Typography variant="h6">Required checklist items</Typography>
              <Stack spacing={0.5} mt={1}>
                {details?.checklist.filter((item) => item.required).map((item) => <Stack key={item.id || item.description} direction="row" alignItems="center" spacing={1}>
                  <Checkbox checked={item.completed} disabled={!item.id || updatingChecklistId === item.id} onChange={(event) => void setChecklistCompleted(item, event.target.checked)} />
                  <Typography flex={1} sx={{ textDecoration: item.completed ? 'line-through' : 'none', color: item.completed ? 'text.secondary' : 'text.primary' }}>{item.description}</Typography>
                  {updatingChecklistId === item.id && <CircularProgress size={18} />}
                  {item.completed && <Chip size="small" color="success" label="Done" />}
                </Stack>)}
                {!details?.checklist.some((item) => item.required) && <Typography color="text.secondary">No required checklist items.</Typography>}
              </Stack>
            </Paper>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="h6">Mandatory prerequisites</Typography>
              <Typography variant="body2" color="text.secondary" mb={1}>Open an unfinished prerequisite to review or complete it.</Typography>
              <Stack spacing={1}>
                {details?.dependencies.filter((dependency) => dependency.mandatory).map((dependency) => {
                  const done = ['completed', 'cancelled', 'archived'].includes(dependency.prerequisiteStatus);
                  return <Card key={dependency.id} variant="outlined"><CardActionArea disabled={!dependency.prerequisiteTask || done} onClick={() => { setCompletionOpen(false); openDependency(dependency); }}><CardContent><Stack direction="row" alignItems="center" spacing={1}><Box flex={1}><Typography fontWeight={700}>{dependency.prerequisiteTitle}</Typography><Typography variant="body2" color="text.secondary">{dependency.prerequisiteStatus.replaceAll('_', ' ')}</Typography></Box><Chip size="small" color={done ? 'success' : 'warning'} label={done ? 'Done' : 'Open task'} />{!done && <OpenInNew color="action" />}</Stack></CardContent></CardActionArea></Card>;
                })}
                {!details?.dependencies.some((dependency) => dependency.mandatory) && <Typography color="text.secondary">No mandatory prerequisites.</Typography>}
              </Stack>
            </Paper>
          </Box>
        </DialogContent>
        <DialogActions sx={{ position: 'sticky', bottom: 0, borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper', px: 2, py: 1.5, pb: 'calc(12px + env(safe-area-inset-bottom))' }}>
          <Button startIcon={<ArrowBack />} onClick={() => setCompletionOpen(false)}>Back</Button>
          <Button variant="contained" color="success" startIcon={completing ? <CircularProgress size={18} /> : <CheckCircle />} disabled={completing || !!details?.checklist.some((item) => item.required && !item.completed) || !!details?.dependencies.some((dependency) => dependency.mandatory && !['completed', 'cancelled', 'archived'].includes(dependency.prerequisiteStatus))} onClick={() => void completeTask()}>Mark completed</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

const reminderInputValue = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const reminderRepeatUnit = (repeat: 'daily' | 'weekly' | 'monthly') => repeat === 'daily' ? 'day' : repeat === 'weekly' ? 'week' : 'month';

export function TaskEditorDialog({ task, newDate, open, onClose, onSaved, mobile }: { task: Task | null; newDate: string | null; open: boolean; onClose: () => void; onSaved: () => void; mobile: boolean }) {
  const createdTaskId = useRef<string | null>(null);
  const [editor, setEditor] = useState({
    title: '',
    description: '',
    status: 'not_started',
    priority: 'medium',
    dueDate: '',
    reminderAt: '',
    reminderRepeat: 'none' as 'none' | 'daily' | 'weekly' | 'monthly',
    reminderRepeatInterval: '1',
    projectId: '',
    responsiblePersonId: '',
    costAmount: '',
    costDate: '',
    completeWhenChecklistDone: false
  });
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]),
    [dependencies, setDependencies] = useState<TaskDependency[]>([]),
    [deletedChecklist, setDeletedChecklist] = useState<string[]>([]),
    [deletedDependencies, setDeletedDependencies] = useState<string[]>([]);
  const [projects, setProjects] = useState<Project[]>([]),
    [people, setPeople] = useState<Person[]>([]),
    [tasks, setTasks] = useState<Task[]>([]),
    [currencyCode, setCurrencyCode] = useState('CHF'),
    [checklistText, setChecklistText] = useState(''),
    [prerequisiteId, setPrerequisiteId] = useState('');
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]),
    [pendingFiles, setPendingFiles] = useState<File[]>([]),
    [linkLabel, setLinkLabel] = useState(''),
    [linkUrl, setLinkUrl] = useState(''),
    [pendingLinks, setPendingLinks] = useState<Array<{ label: string; url: string }>>([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    createdTaskId.current = task?.id || null;
    const applyTask = (current: Task | null) => setEditor({
      title: current?.title || '',
      description: current?.description || '',
      status: current?.status || 'not_started',
      priority: current?.priority || 'medium',
      dueDate: newDate || current?.dueDate || '',
      reminderAt: reminderInputValue(current?.reminderAt),
      reminderRepeat: current?.reminderRepeat || 'none',
      reminderRepeatInterval: String(current?.reminderRepeatInterval || 1),
      projectId: current?.projectId || '',
      responsiblePersonId: current?.responsiblePersonId || '',
      costAmount: current?.costAmount === null || current?.costAmount === undefined ? '' : String(current.costAmount),
      costDate: current?.costDate || '',
      completeWhenChecklistDone: Boolean(current?.completeWhenChecklistDone)
    });
    applyTask(task);
    setChecklist([]);
    setDependencies([]);
    setDeletedChecklist([]);
    setDeletedDependencies([]);
    setAttachments([]);
    setPendingFiles([]);
    setPendingLinks([]);
    setLinkLabel('');
    setLinkUrl('');
    setError('');
    Promise.all([api<Project[]>('/projects'), api<Person[]>('/people'), api<{ items: Task[] }>('/tasks?view=all&pageSize=100'), api<{ currencyCode?: string } | null>('/preferences')]).then(([projectRows, peopleRows, taskRows, preferences]) => {
      setProjects(projectRows);
      setPeople(peopleRows);
      setTasks(taskRows.items);
      setCurrencyCode(preferences?.currencyCode || 'CHF');
    });
    if (task)
      api<{
        task: Task;
        checklist: ChecklistItem[];
        dependencies: Omit<TaskDependency, 'prerequisiteTitle' | 'prerequisiteStatus'>[];
      }>(`/tasks/details?taskId=${task.id}`)
        .then((details) => {
          applyTask(details.task);
          setChecklist(details.checklist);
          setDependencies(
            details.dependencies.map((dependency) => {
              const prerequisite = tasks.find((item) => item.id === dependency.prerequisiteTaskId);
              return {
                ...dependency,
                prerequisiteTitle: prerequisite?.title || 'Prerequisite task',
                prerequisiteStatus: prerequisite?.status || ''
              };
            })
          );
        })
        .catch((reason) => setError(reason.message));
    if (task)
      api<TaskAttachment[]>(`/tasks/attachments?taskId=${task.id}`)
        .then(setAttachments)
        .catch((reason) => setError(reason.message));
  }, [open, task?.id, newDate]);
  useEffect(() => {
    setDependencies((value) =>
      value.map((dependency) => {
        const prerequisite = tasks.find((item) => item.id === dependency.prerequisiteTaskId);
        return {
          ...dependency,
          prerequisiteTitle: prerequisite?.title || dependency.prerequisiteTitle,
          prerequisiteStatus: prerequisite?.status || dependency.prerequisiteStatus
        };
      })
    );
  }, [tasks]);
  const addChecklist = () => {
    const description = checklistText.trim();
    if (!description) return;
    setChecklist((value) => [...value, { description, completed: false, required: true, position: value.length, costAmount: null, dueDate: null }]);
    setChecklistText('');
  };
  const addDependency = () => {
    const prerequisite = tasks.find((item) => item.id === prerequisiteId);
    if (!prerequisite || dependencies.some((item) => item.prerequisiteTaskId === prerequisite.id)) return;
    setDependencies((value) => [
      ...value,
      {
        id: `new-${crypto.randomUUID()}`,
        waitingTaskId: task?.id || '',
        prerequisiteTaskId: prerequisite.id,
        mandatory: true,
        prerequisiteTitle: prerequisite.title,
        prerequisiteStatus: prerequisite.status
      }
    ]);
    setPrerequisiteId('');
  };
  const addLink = () => {
    const url = linkUrl.trim();
    if (!url.startsWith('https://')) {
      setError('Task links must start with https://');
      return;
    }
    setPendingLinks((value) => [...value, { label: linkLabel.trim() || url, url }]);
    setLinkLabel('');
    setLinkUrl('');
  };
  const fileBase64 = async (file: File) => {
    const buffer = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < buffer.length; offset += 0x8000) binary += String.fromCharCode(...buffer.subarray(offset, offset + 0x8000));
    return btoa(binary);
  };
  const openAttachment = async (attachment: TaskAttachment) => {
    try {
      const result = await api<{ url: string }>('/tasks/attachments/open', {
        method: 'POST',
        body: { id: attachment.id }
      });
      window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch (reason) {
      setError((reason as Error).message);
    }
  };
  const deleteAttachment = async (attachment: TaskAttachment) => {
    try {
      await api('/tasks/attachments/delete', {
        method: 'POST',
        body: { id: attachment.id }
      });
      setAttachments((value) => value.filter((item) => item.id !== attachment.id));
    } catch (reason) {
      setError((reason as Error).message);
    }
  };
  const saveRelated = async (taskId: string) => {
    await Promise.all(deletedChecklist.map((id) => api('/tasks/checklist/delete', { method: 'POST', timeoutMs: 60_000, body: { id } })));
    await Promise.all(
      checklist.map((item, index) =>
        api('/tasks/checklist/save', {
          method: 'POST',
          timeoutMs: 60_000,
          body: { ...item, taskId, position: index }
        })
      )
    );
    await Promise.all(deletedDependencies.map((id) => api('/dependencies/unlink', { method: 'POST', timeoutMs: 60_000, body: { id } })));
    await Promise.all(
      dependencies
        .filter((item) => !item.id.startsWith('new-'))
        .map((item) =>
          api('/dependencies/update', {
            method: 'POST',
            timeoutMs: 60_000,
            body: { id: item.id, mandatory: item.mandatory }
          })
        )
    );
    await Promise.all(
      dependencies
        .filter((item) => item.id.startsWith('new-'))
        .map((item) =>
          api('/dependencies/link', {
            method: 'POST',
            timeoutMs: 60_000,
            body: {
              waitingTaskId: taskId,
              prerequisiteTaskId: item.prerequisiteTaskId,
              mandatory: item.mandatory
            }
          })
        )
    );
    for (const file of pendingFiles) {
      if (file.size > 6 * 1024 * 1024) throw new Error(`${file.name} is larger than 6 MB.`);
      await api('/tasks/attachments/upload', {
        method: 'POST',
        timeoutMs: 60_000,
        body: {
          taskId,
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
          base64Data: await fileBase64(file)
        }
      });
    }
    for (const link of pendingLinks)
      await api('/tasks/attachments/link', {
        method: 'POST',
        timeoutMs: 60_000,
        body: { taskId, ...link }
      });
  };
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const body = {
        title: editor.title.trim(),
        description: editor.description,
        status: editor.status,
        priority: editor.priority,
        dueDate: editor.dueDate || null,
        reminderAt: editor.reminderAt ? new Date(editor.reminderAt).toISOString() : null,
        reminderRepeat: editor.reminderAt ? editor.reminderRepeat : 'none',
        reminderRepeatInterval: Math.max(1, Number(editor.reminderRepeatInterval) || 1),
        projectId: editor.projectId || null,
        responsiblePersonId: editor.responsiblePersonId || null,
        costAmount: editor.costAmount === '' ? null : Number(editor.costAmount.replace(',', '.')),
        costDate: editor.costAmount === '' ? null : editor.costDate || null,
        completeWhenChecklistDone: editor.completeWhenChecklistDone
      };
      const persistTask = async (payload: typeof body & { id?: string; status?: string }) => {
        const saved = await api<Task>('/tasks/save', {
          method: 'POST',
          timeoutMs: 60_000,
          body: payload
        });
        if ((payload.costDate ?? null) !== (saved.costDate ?? null))
          throw new Error('The cost date was not saved because the connected Workers are out of date. Deploy Connected v16.14.3, then save this task again.');
        return saved;
      };
      let taskId = task?.id || createdTaskId.current;
      if (!taskId) {
        const initialStatus = (checklist.length || dependencies.length) && editor.status === 'completed' ? 'not_started' : editor.status;
        const created = await persistTask({ ...body, status: initialStatus });
        taskId = created.id;
        createdTaskId.current = created.id;
        await saveRelated(taskId);
        if (initialStatus !== editor.status)
          await persistTask({ id: taskId, ...body });
      } else {
        await saveRelated(taskId);
        await persistTask({ id: taskId, ...body });
      }
      onSaved();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      fullScreen={mobile}
      fullWidth
      maxWidth="md"
      slotProps={{
        paper: {
          sx: mobile ? { height: '100dvh', maxHeight: '100dvh' } : undefined
        }
      }}
    >
      <DialogTitle>{task ? 'Edit task' : 'Create task'}</DialogTitle>
      <DialogContent sx={mobile ? { pb: 2 } : undefined}>
        <Stack spacing={2} mt={1}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField label="Title" value={editor.title} onChange={(event) => setEditor((value) => ({ ...value, title: event.target.value }))} />
          <TextField
            multiline
            minRows={3}
            label="Description"
            value={editor.description}
            onChange={(event) =>
              setEditor((value) => ({
                ...value,
                description: event.target.value
              }))
            }
          />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField select fullWidth label="Status" value={editor.status} onChange={(event) => setEditor((value) => ({ ...value, status: event.target.value }))}>
              {['not_started', 'in_progress', 'waiting', 'completed'].map((value) => (
                <MenuItem key={value} value={value}>
                  {value.replaceAll('_', ' ')}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              fullWidth
              label="Priority"
              value={editor.priority}
              onChange={(event) =>
                setEditor((value) => ({
                  ...value,
                  priority: event.target.value
                }))
              }
            >
              {['critical', 'high', 'medium', 'low', 'none'].map((value) => (
                <MenuItem key={value} value={value}>
                  {value}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              select
              fullWidth
              label="Project"
              value={editor.projectId}
              onChange={(event) =>
                setEditor((value) => ({
                  ...value,
                  projectId: event.target.value
                }))
              }
            >
              <MenuItem value="">No project</MenuItem>
              {projects.map((project) => (
                <MenuItem key={project.id} value={project.id}>
                  {project.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              fullWidth
              label="Responsible person"
              value={editor.responsiblePersonId}
              onChange={(event) =>
                setEditor((value) => ({
                  ...value,
                  responsiblePersonId: event.target.value
                }))
              }
            >
              <MenuItem value="">Unassigned</MenuItem>
              {people.map((person) => (
                <MenuItem key={person.id} value={person.id}>
                  {person.fullName}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField fullWidth label="Due date" type="date" value={editor.dueDate} onChange={(event) => setEditor((value) => ({ ...value, dueDate: event.target.value }))} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField fullWidth label="Reminder date and time" type="datetime-local" value={editor.reminderAt} onChange={(event) => setEditor((value) => ({ ...value, reminderAt: event.target.value }))} helperText="Leave empty for no scheduled notification." slotProps={{ inputLabel: { shrink: true } }} />
          </Stack>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle1" fontWeight={700}>Notification schedule</Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} mt={1}>
              <TextField select fullWidth label="Repeat" value={editor.reminderRepeat} disabled={!editor.reminderAt} onChange={(event) => setEditor((value) => ({ ...value, reminderRepeat: event.target.value as typeof value.reminderRepeat }))}>
                <MenuItem value="none">Does not repeat</MenuItem><MenuItem value="daily">Daily</MenuItem><MenuItem value="weekly">Weekly</MenuItem><MenuItem value="monthly">Monthly</MenuItem>
              </TextField>
              {editor.reminderRepeat !== 'none' && <TextField fullWidth type="number" label={`Repeat every ${reminderRepeatUnit(editor.reminderRepeat)}`} value={editor.reminderRepeatInterval} onChange={(event) => setEditor((value) => ({ ...value, reminderRepeatInterval: event.target.value }))} slotProps={{ htmlInput: { min: 1, max: 365, step: 1 } }}/>}
            </Stack>
            <Typography variant="caption" color="text.secondary">Recurring reminders continue until the task is completed, cancelled, or archived.</Typography>
          </Paper>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField fullWidth label={`Task cost (${currencyCode})`} type="number" value={editor.costAmount} placeholder="N/A" helperText="Checklist costs are added separately." onChange={(event) => setEditor((value) => ({ ...value, costAmount: event.target.value, costDate: event.target.value && !value.costDate ? new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10) : value.costDate }))} slotProps={{ htmlInput: { min: 0, step: 0.01 } }}/>
            <TextField fullWidth label="Cost date" type="date" value={editor.costDate} disabled={!editor.costAmount} helperText="Used immediately in the financial graph, even without a task due date." onChange={(event) => setEditor((value) => ({ ...value, costDate: event.target.value }))} slotProps={{ inputLabel: { shrink: true } }}/>
          </Stack>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="h6">Checklist</Typography>
            <FormControlLabel sx={{ mt: .5 }} control={<Switch checked={editor.completeWhenChecklistDone} onChange={(event) => setEditor((value) => ({ ...value, completeWhenChecklistDone: event.target.checked }))}/>} label="Complete task automatically when every checklist item is done"/>
            <Typography variant="caption" color="text.secondary" display="block">If an automatically completed checklist item is reopened, the task returns to In progress.</Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} my={1}>
              <TextField
                fullWidth
                size="small"
                label="New checklist item"
                value={checklistText}
                onChange={(event) => setChecklistText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addChecklist();
                  }
                }}
              />
              <Button startIcon={<Add />} onClick={addChecklist}>
                Add
              </Button>
            </Stack>
            <Stack spacing={0.5}>
              {checklist.map((item, index) => (
                <Box key={item.id || index} sx={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr) auto', columnGap: 0.5, rowGap: 0.75, alignItems: 'center', py: 0.5 }}>
                  <Checkbox checked={item.completed} onChange={(event) => setChecklist((value) => value.map((entry, i) => (i === index ? { ...entry, completed: event.target.checked } : entry)))} />
                  <Typography
                    sx={{
                      textDecoration: item.completed ? 'line-through' : 'none',
                      flex: 1
                    }}
                  >
                    {item.description}
                  </Typography>
                  <IconButton
                    size="small"
                    aria-label="Delete checklist item"
                    onClick={() => {
                      if (item.id) setDeletedChecklist((value) => [...value, item.id!]);
                      setChecklist((value) => value.filter((_, i) => i !== index));
                    }}
                  >
                    <Delete fontSize="small" />
                  </IconButton>
                  <Box />
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
                    <TextField size="small" type="number" label={`Cost (${currencyCode})`} placeholder="N/A" value={item.costAmount ?? ''} onChange={(event) => setChecklist((value) => value.map((entry, i) => (i === index ? { ...entry, costAmount: event.target.value === '' ? null : Number(event.target.value) } : entry)))} slotProps={{ htmlInput: { min: 0, step: 0.01 } }} sx={{ width: { xs: '100%', sm: 150 } }} />
                    <TextField size="small" type="date" label="Checklist date" value={item.dueDate || ''} onChange={(event) => setChecklist((value) => value.map((entry, i) => (i === index ? { ...entry, dueDate: event.target.value || null } : entry)))} slotProps={{ inputLabel: { shrink: true } }} sx={{ width: { xs: '100%', sm: 175 } }}/>
                    <FormControlLabel control={<Checkbox size="small" checked={item.required} onChange={(event) => setChecklist((value) => value.map((entry, i) => (i === index ? { ...entry, required: event.target.checked } : entry)))} />} label="Required" />
                  </Stack>
                  <Box />
                </Box>
              ))}
            </Stack>
          </Paper>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="h6">Dependencies</Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} my={1}>
              <TextField select fullWidth size="small" label="Prerequisite task" value={prerequisiteId} onChange={(event) => setPrerequisiteId(event.target.value)}>
                <MenuItem value="">Choose a task</MenuItem>
                {tasks
                  .filter((item) => item.id !== task?.id)
                  .map((item) => (
                    <MenuItem key={item.id} value={item.id}>
                      {item.title}
                    </MenuItem>
                  ))}
              </TextField>
              <Button startIcon={<Add />} onClick={addDependency}>
                Link
              </Button>
            </Stack>
            <Stack spacing={1}>
              {dependencies.map((dependency, index) => (
                <Stack key={dependency.id} direction="row" alignItems="center">
                  <Box flex={1}>
                    <Typography fontWeight={700}>{dependency.prerequisiteTitle}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {dependency.prerequisiteStatus.replaceAll('_', ' ') || 'Pending'} · {dependency.mandatory ? 'Required' : 'Optional'}
                    </Typography>
                  </Box>
                  <FormControlLabel control={<Checkbox checked={dependency.mandatory} onChange={(event) => setDependencies((value) => value.map((entry, i) => (i === index ? { ...entry, mandatory: event.target.checked } : entry)))} />} label="Required" />
                  <IconButton
                    aria-label="Remove dependency"
                    onClick={() => {
                      if (!dependency.id.startsWith('new-')) setDeletedDependencies((value) => [...value, dependency.id]);
                      setDependencies((value) => value.filter((_, i) => i !== index));
                    }}
                  >
                    <Delete />
                  </IconButton>
                </Stack>
              ))}
            </Stack>
          </Paper>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="h6">Files, images, documents & links</Typography>
            <Typography variant="body2" color="text.secondary" mb={1.5}>
              Files are private to this workspace. Maximum 6 MB each. Links must use HTTPS.
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button component="label" variant="outlined" startIcon={<AttachFile />}>
                Add files
                <input
                  id="task-file-upload"
                  name="taskFiles"
                  aria-label="Task files"
                  hidden
                  multiple
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain,text/csv,application/zip,.docx,.xlsx,.pptx"
                  onChange={(event) => {
                    const files = Array.from(event.target.files || []);
                    setPendingFiles((value) => [...value, ...files]);
                    event.currentTarget.value = '';
                  }}
                />
              </Button>
              <TextField size="small" label="Link label" value={linkLabel} onChange={(event) => setLinkLabel(event.target.value)} />
              <TextField size="small" fullWidth label="https:// link" value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} />
              <Button startIcon={<LinkIcon />} disabled={!linkUrl.trim()} onClick={addLink}>
                Add link
              </Button>
            </Stack>
            <Stack mt={1} spacing={0.5}>
              {attachments.map((attachment) => (
                <Stack key={attachment.id} direction="row" alignItems="center">
                  <AttachFile fontSize="small" />
                  <Typography flex={1} ml={1}>
                    {attachment.displayName}
                  </Typography>
                  <IconButton aria-label="Open attachment" onClick={() => void openAttachment(attachment)}>
                    <OpenInNew />
                  </IconButton>
                  <IconButton aria-label="Delete attachment" onClick={() => void deleteAttachment(attachment)}>
                    <Delete />
                  </IconButton>
                </Stack>
              ))}
              {pendingFiles.map((file, index) => (
                <Stack key={`${file.name}-${index}`} direction="row" alignItems="center">
                  <AttachFile fontSize="small" />
                  <Typography flex={1} ml={1}>
                    {file.name} · {(file.size / 1024).toFixed(0)} KB · uploads when saved
                  </Typography>
                  <IconButton onClick={() => setPendingFiles((value) => value.filter((_, i) => i !== index))}>
                    <Delete />
                  </IconButton>
                </Stack>
              ))}
              {pendingLinks.map((link, index) => (
                <Stack key={`${link.url}-${index}`} direction="row" alignItems="center">
                  <LinkIcon fontSize="small" />
                  <Typography flex={1} ml={1}>
                    {link.label} · saves when task is saved
                  </Typography>
                  <IconButton onClick={() => setPendingLinks((value) => value.filter((_, i) => i !== index))}>
                    <Delete />
                  </IconButton>
                </Stack>
              ))}
            </Stack>
          </Paper>
        </Stack>
      </DialogContent>
      <DialogActions
        sx={
          mobile
            ? {
                position: 'sticky',
                bottom: 0,
                zIndex: 3,
                flexShrink: 0,
                borderTop: 1,
                borderColor: 'divider',
                bgcolor: 'background.paper',
                px: 2,
                pt: 1.25,
                pb: 'calc(20px + env(safe-area-inset-bottom))',
                boxShadow: '0 -8px 20px rgba(0,0,0,.18)',
                '& .MuiButton-root': { minHeight: 44, minWidth: 110 }
              }
            : undefined
        }
      >
        <Button disabled={busy} onClick={onClose}>
          Cancel
        </Button>
        <Button variant="contained" disabled={busy || !editor.title.trim()} onClick={save}>
          {busy ? <CircularProgress size={20} /> : 'Save task'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
