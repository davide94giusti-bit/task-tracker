import { useCallback, useEffect, useMemo, useState } from 'react';
import { Accordion, AccordionDetails, AccordionSummary, Alert, AppBar, Avatar, BottomNavigation, BottomNavigationAction, Box, Button, Card, CardActionArea, CardActions, CardContent, Chip, CircularProgress, CssBaseline, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Drawer, FormControlLabel, IconButton, LinearProgress, List, ListItemButton, ListItemIcon, ListItemText, MenuItem, Paper, Snackbar, Stack, Switch, TextField, ThemeProvider, Toolbar, Tooltip, Typography, createTheme, useMediaQuery } from '@mui/material';
import { Add, CalendarMonth, CheckCircle, CloudDone, Dashboard as DashboardIcon, DarkMode, Delete, Edit, Event, ExpandLess, ExpandMore, Folder, Groups, Inbox, InfoOutlined, LightMode, Logout, Menu, MenuBook, MoreHoriz, Notifications, People, Refresh, Security, Settings, TaskAlt, Today } from '@mui/icons-material';
import { api, flushQueue } from './api';
import { consumeAuthLink, resetPassword, session, signIn } from './auth';
import { AccountSecurity, PasswordSetup, UsersAccessView } from './AccessViews';
import { BackupImportView, DiagnosticsView } from './BackupDiagnosticsViews';
import { EnhancedDashboardView, EnhancedTasksView, NotificationBell, TaskDetailsDialog, TaskEditorDialog } from './ConnectedEnhancements';
import { DependencyLoadView } from './OperationalViews';
import { PublicPersonTasks } from './PublicPersonTasks';
import { UserManualView } from './UserManualView';
import type { Dashboard, Person, Project, Task, View } from './types';
// React 19 no longer exports JSX globally; this local bridge types stored icon elements.
// eslint-disable-next-line @typescript-eslint/no-namespace
declare namespace JSX {
    type Element = React.ReactElement;
}
const nav: {
    view: View;
    label: string;
    icon: JSX.Element;
    group: string;
}[] = [{ view: 'dashboard', label: 'Dashboard', icon: <DashboardIcon />, group: 'Overview' }, { view: 'today', label: 'Today', icon: <Today />, group: 'Tasks' }, { view: 'tasks', label: 'All Tasks', icon: <Inbox />, group: 'Tasks' }, { view: 'upcoming', label: 'Upcoming', icon: <Event />, group: 'Tasks' }, { view: 'calendar', label: 'Calendar', icon: <CalendarMonth />, group: 'Tasks' }, { view: 'completed', label: 'Completed', icon: <CheckCircle />, group: 'Tasks' }, { view: 'trash', label: 'Trash', icon: <Delete />, group: 'Tasks' }, { view: 'projects', label: 'Projects', icon: <Folder />, group: 'Organization' }, { view: 'people', label: 'People', icon: <People />, group: 'Organization' }, { view: 'dependencies', label: 'Dependency load', icon: <Groups />, group: 'Organization' }, { view: 'settings', label: 'Settings', icon: <Settings />, group: 'System' }, { view: 'access', label: 'Users & access', icon: <Groups />, group: 'System' }, { view: 'security', label: 'Security', icon: <Security />, group: 'System' }, { view: 'backup', label: 'Backup & import', icon: <CloudDone />, group: 'System' }, { view: 'diagnostics', label: 'Diagnostics', icon: <TaskAlt />, group: 'System' }, { view: 'manual', label: 'User manual', icon: <MenuBook />, group: 'System' }];
function Login({ onSignedIn }: { onSignedIn: () => void }) { const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [sent, setSent] = useState(false);
return <Box className="login">
<Card sx={{ width: 'min(430px,calc(100vw - 32px))' }}>
<CardContent sx={{ p: 4 }}>
<Stack spacing={2.5}>
<Avatar sx={{ bgcolor: 'primary.main', fontWeight: 800 }}>T</Avatar>
<Box>
<Typography variant="h4">Task Tracker</Typography>
<Typography color="text.secondary">Connected personal workspace</Typography>
</Box>{error && <Alert severity="error">{error}</Alert>}{sent && <Alert severity="success">Password reset email requested.</Alert>}<TextField label="Email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)}/>
<TextField label="Password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)}/>
<Button variant="contained" size="large" disabled={busy || !email || !password} onClick={async () => { setBusy(true); setError(''); try {
    await signIn(email, password);
    onSignedIn();
}
catch (e) {
    setError((e as Error).message);
}
finally {
    setBusy(false);
} }}>{busy ? <CircularProgress size={22}/> : 'Sign in'}</Button>
<Button onClick={async () => { try {
    await resetPassword(email);
    setSent(true);
}
catch (e) {
    setError((e as Error).message);
} }} disabled={!email}>Forgot password?</Button>
<Typography variant="caption" color="text.secondary">Access is limited to configured workspace members. Your local edition remains separate.</Typography>
</Stack>
</CardContent>
</Card>
</Box>; }
function PageTitle({ title, subtitle, action }: {
    title: string;
    subtitle: string;
    action?: React.ReactNode;
}) { return <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2} mb={3}>
<Box>
<Typography variant="h4">{title}</Typography>
<Typography color="text.secondary">{subtitle}</Typography>
</Box>{action}</Stack>; }
function TasksView({ view, query, onOpen, onNew }: {
    view: View;
    query?: Record<string, unknown>;
    onOpen: (t: Task) => void;
    onNew: () => void;
}) { const [data, setData] = useState<{
    items: Task[];
    total: number;
} | null>(null), [error, setError] = useState(''), [project, setProject] = useState('');
const load = useCallback(() => { setError(''); setData(null); api<{
    items: Task[];
    total: number;
}>('/tasks?' + new URLSearchParams({ view: view === 'tasks' ? 'all' : view, ...(project ? { projectId: project } : {}), ...(query as Record<string, string> || {}) })).then(setData).catch(e => setError(e.message)); }, [view, project, JSON.stringify(query)]); useEffect(load, [load]);
return <>
<PageTitle title={view === 'tasks' ? 'All Tasks' : view[0].toUpperCase() + view.slice(1)} subtitle={data ? `${data.total} tasks in this view` : 'Validated cloud task view'} action={<Button variant="contained" startIcon={<Add />} onClick={onNew}>New task</Button>}/>
<Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} mb={2}>
<TextField select size="small" label="Project" value={project} onChange={e => setProject(e.target.value)} sx={{ minWidth: 220 }}>
<MenuItem value="">All projects</MenuItem>
</TextField>
<Button startIcon={<Refresh />} onClick={load}>Refresh</Button>
</Stack>{error && <Alert severity="error" action={<Button onClick={load}>Retry</Button>}>{error}</Alert>}{!data && !error && <LinearProgress />}{data && data.items.length === 0 && <Paper sx={{ p: 4, textAlign: 'center' }}>
<Typography variant="h6">No tasks here</Typography>
<Typography color="text.secondary">This view only includes records that match its backend rules.</Typography>
</Paper>}<Stack spacing={1.25}>{data?.items.map(t => <Card key={t.id}>
<CardActionArea onClick={() => onOpen(t)}>
<CardContent>
<Stack direction="row" spacing={2} alignItems="center">
<Box sx={{ width: 5, height: 48, borderRadius: 2, bgcolor: t.priority === 'critical' ? 'error.main' : t.priority === 'high' ? 'warning.main' : 'primary.main' }}/>
<Box flex={1} minWidth={0}>
<Typography fontWeight={750} noWrap>{t.title}</Typography>
<Typography variant="body2" color="text.secondary" noWrap>{[t.projectName, t.responsiblePersonName, t.dueDate && `Due ${t.dueDate}`].filter(Boolean).join(' • ') || 'No project or due date'}</Typography>
</Box>{t.blocked && <Chip label="Blocked" color="warning"/>}<Chip label={t.status.replaceAll('_', ' ')}/>
</Stack>
</CardContent>
</CardActionArea>
</Card>)}</Stack>
</>; }
function DashboardView({ openFilter }: {
    openFilter: (title: string, q: Record<string, unknown>) => void;
}) { const [data, setData] = useState<Dashboard | null>(null), [error, setError] = useState(''); useEffect(() => { api<Dashboard>('/dashboard').then(setData).catch(e => setError(e.message)); }, []);
const cards = [['Overdue', 'overdue', { due: 'overdue' }, 'Active tasks whose due date has passed.'], ['Due today', 'today', { due: 'today' }, 'Active tasks due today.'], ['Next 7 days', 'next7', { due: 'next7' }, 'Active tasks due in the next seven days.'], ['Critical', 'critical', { priority: 'critical' }, 'Active critical-priority tasks.'], ['Blocked', 'blocked', { blocked: 'true' }, 'Tasks prevented by mandatory prerequisites.'], ['Waiting', 'waiting', { view: 'all', status: 'waiting' }, 'Tasks intentionally waiting for an external action.']] as const; if (error)
    return <Alert severity="error">{error}</Alert>;
return <>
<PageTitle title="Dashboard" subtitle="A calm overview of what needs your attention."/>{!data ? <LinearProgress /> : <>
<Box className="metric-grid">{cards.map(([label, key, q, help]) => <Card key={key}>
<CardActionArea onClick={() => openFilter(label, q)}>
<CardContent>
<Stack direction="row" justifyContent="space-between">
<Box>
<Stack direction="row" alignItems="center" spacing={.5}>
<Typography color="text.secondary">{label}</Typography>
<Tooltip title={help}>
<InfoOutlined fontSize="small" color="action"/>
</Tooltip>
</Stack>
<Typography variant="h4">{data.counts[key] || 0}</Typography>
</Box>
</Stack>
</CardContent>
</CardActionArea>
</Card>)}</Box>
<Card sx={{ mt: 2 }}>
<CardActionArea onClick={() => openFilter('Overall workload', { view: 'all' })}>
<CardContent>
<Stack direction="row" justifyContent="space-between">
<Box>
<Typography variant="h6">Overall workload</Typography>
<Typography color="text.secondary">Average progress across your active task load</Typography>
</Box>
<Typography variant="h5">{data.overallProgress}%</Typography>
</Stack>
<LinearProgress variant="determinate" value={data.overallProgress} sx={{ mt: 2, height: 10, borderRadius: 5 }}/>
</CardContent>
</CardActionArea>
</Card>
</>}</>; }
type LinkedProject = Project & { shareId: string; token: string; verificationToken: string; allowChecklistUpdates: boolean; allowTaskCompletion: boolean; allowComments: boolean; expiresAt?: string | null };
type ProjectPerson = Person & { personId: string; sharePhone: boolean; shareEmail: boolean; shareAddress: boolean; shareNotes: boolean; supervisable: boolean };
const emptyProjectPersonAccess = { sharePhone: false, shareEmail: false, shareAddress: false, shareNotes: false, supervisable: false };
function ProjectPeopleDialog({ project, onClose }: { project: Project | null; onClose: () => void }) {
  const [items, setItems] = useState<ProjectPerson[]>([]), [people, setPeople] = useState<Person[]>([]), [personId, setPersonId] = useState(''), [access, setAccess] = useState(emptyProjectPersonAccess), [creating, setCreating] = useState(false), [form, setForm] = useState({ fullName: '', role: '', company: '', phone: '', email: '', address: '', notes: '' }), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const load = useCallback(async () => { if (!project) return; setError(''); try { const [assigned, directory] = await Promise.all([api<ProjectPerson[]>(`/people/project-people?projectId=${encodeURIComponent(project.id)}`), api<Person[]>('/people')]); setItems(assigned); setPeople(directory); } catch (reason) { setError((reason as Error).message); } }, [project]);
  useEffect(() => { void load(); }, [load]);
  const saveAssociation = async (selectedPersonId: string) => { if (!project) return; await api('/people/project-people/save', { method: 'POST', body: { projectId: project.id, personId: selectedPersonId, ...access } }); };
  return <Dialog open={!!project} onClose={() => !busy && onClose()} fullWidth maxWidth="md"><DialogTitle>Project people · {project?.name}</DialogTitle><DialogContent><Stack spacing={2} mt={1}>
    <Alert severity="info">These are live references to your People directory. Notes and contact details stay private unless explicitly shared. “Supervisable” permits authorised collaborators to record updates on this contact’s behalf.</Alert>
    {error && <Alert severity="error">{error}</Alert>}{message && <Alert severity="success" onClose={() => setMessage('')}>{message}</Alert>}
    <Typography variant="h6">Shared with this project</Typography>{!items.length && <Typography color="text.secondary">No contacts are attached yet.</Typography>}
    {items.map(item => <Paper key={item.personId} variant="outlined" sx={{ p: 2 }}><Stack spacing={1}><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1}><Box><Typography fontWeight={750}>{item.fullName}</Typography><Typography variant="body2" color="text.secondary">{[item.role, item.company].filter(Boolean).join(' · ') || 'No function'}</Typography></Box><Button color="error" size="small" disabled={busy} onClick={async () => { if (!project) return; setBusy(true); try { await api('/people/project-people/remove', { method: 'POST', body: { projectId: project.id, personId: item.personId } }); setMessage(`${item.fullName} was removed from the project, but remains in People.`); await load(); } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); } }}>Remove from project</Button></Stack><Stack direction="row" flexWrap="wrap" useFlexGap gap={1}>{item.sharePhone && <Chip size="small" label="Phone shared"/>}{item.shareEmail && <Chip size="small" label="Email shared"/>}{item.shareAddress && <Chip size="small" label="Address shared"/>}{item.shareNotes && <Chip size="small" label="Notes shared" color="warning"/>}{item.supervisable && <Chip size="small" label="Supervision allowed" color="secondary"/>}</Stack><Button size="small" sx={{ alignSelf: 'flex-start' }} onClick={() => { setCreating(false); setPersonId(item.personId); setAccess({ sharePhone: item.sharePhone, shareEmail: item.shareEmail, shareAddress: item.shareAddress, shareNotes: item.shareNotes, supervisable: item.supervisable }); }}>Edit sharing</Button></Stack></Paper>)}
    <Divider/><Stack direction="row" spacing={1}><Button variant={!creating ? 'contained' : 'outlined'} onClick={() => setCreating(false)}>Add existing contact</Button><Button variant={creating ? 'contained' : 'outlined'} onClick={() => setCreating(true)}>Create project contact</Button></Stack>
    {creating ? <Stack spacing={1.5}><TextField label="Full name" value={form.fullName} onChange={e => setForm(v => ({ ...v, fullName: e.target.value }))}/><Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}><TextField fullWidth label="Function / role" value={form.role} onChange={e => setForm(v => ({ ...v, role: e.target.value }))}/><TextField fullWidth label="Company" value={form.company} onChange={e => setForm(v => ({ ...v, company: e.target.value }))}/></Stack><TextField label="Phone" value={form.phone} onChange={e => setForm(v => ({ ...v, phone: e.target.value }))}/><TextField label="Email" type="email" value={form.email} onChange={e => setForm(v => ({ ...v, email: e.target.value }))}/><TextField label="Address" value={form.address} onChange={e => setForm(v => ({ ...v, address: e.target.value }))}/><TextField multiline minRows={2} label="Private notes" value={form.notes} onChange={e => setForm(v => ({ ...v, notes: e.target.value }))}/></Stack> : <TextField select label="Contact" value={personId} onChange={e => { setPersonId(e.target.value); const current = items.find(item => item.personId === e.target.value); setAccess(current ? { sharePhone: current.sharePhone, shareEmail: current.shareEmail, shareAddress: current.shareAddress, shareNotes: current.shareNotes, supervisable: current.supervisable } : emptyProjectPersonAccess); }}><MenuItem value="">Choose a person</MenuItem>{people.map(person => <MenuItem key={person.id} value={person.id}>{person.fullName}{person.role ? ` · ${person.role}` : ''}</MenuItem>)}</TextField>}
    <Paper variant="outlined" sx={{ p: 2 }}><Typography fontWeight={700} mb={1}>Visible to project collaborators</Typography><Stack><FormControlLabel control={<Switch checked={access.sharePhone} onChange={e => setAccess(v => ({ ...v, sharePhone: e.target.checked }))}/>} label="Telephone number"/><FormControlLabel control={<Switch checked={access.shareEmail} onChange={e => setAccess(v => ({ ...v, shareEmail: e.target.checked }))}/>} label="Email"/><FormControlLabel control={<Switch checked={access.shareAddress} onChange={e => setAccess(v => ({ ...v, shareAddress: e.target.checked }))}/>} label="Address"/><FormControlLabel control={<Switch checked={access.shareNotes} onChange={e => setAccess(v => ({ ...v, shareNotes: e.target.checked }))}/>} label="Notes (private by default)"/><FormControlLabel control={<Switch checked={access.supervisable} onChange={e => setAccess(v => ({ ...v, supervisable: e.target.checked }))}/>} label="Allow authorised collaborators to supervise this contact’s tasks"/></Stack></Paper>
  </Stack></DialogContent><DialogActions><Button disabled={busy} onClick={onClose}>Close</Button><Button variant="contained" disabled={busy || (creating ? !form.fullName.trim() : !personId)} onClick={async () => { setBusy(true); setError(''); try { if (creating) await api('/people/project-people/create', { method: 'POST', body: { projectId: project?.id, ...form, fullName: form.fullName.trim(), email: form.email.trim().toLowerCase(), ...access } }); else await saveAssociation(personId); setMessage(creating ? 'Project contact created and attached.' : 'Project contact sharing updated.'); setPersonId(''); setForm({ fullName: '', role: '', company: '', phone: '', email: '', address: '', notes: '' }); setAccess(emptyProjectPersonAccess); setCreating(false); await load(); } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); } }}>{busy ? <CircularProgress size={20}/> : creating ? 'Create and attach' : 'Save project contact'}</Button></DialogActions></Dialog>;
}
function ProjectsView({ onOpen }: { onOpen: (project: Project) => void }) {
  const [items, setItems] = useState<Project[]>([]), [linked, setLinked] = useState<LinkedProject[]>([]), [open, setOpen] = useState(false), [editing, setEditing] = useState<Project | null>(null), [projectPeople, setProjectPeople] = useState<Project | null>(null), [deleting, setDeleting] = useState<Project | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState(() => { const value = sessionStorage.getItem('linked-project-claim-message') || ''; sessionStorage.removeItem('linked-project-claim-message'); return value; }), [form, setForm] = useState({ name: '', description: '', color: '#2563eb' });
  const load = useCallback(async () => {
    setError('');
    const [owned, shared] = await Promise.allSettled([api<Project[]>('/projects'), api<LinkedProject[]>('/people/linked-projects')]);
    if (owned.status === 'fulfilled') setItems(owned.value);
    if (shared.status === 'fulfilled') setLinked(shared.value);
    const failures = [owned, shared].filter(result => result.status === 'rejected') as PromiseRejectedResult[];
    if (failures.length) setError(failures.length === 2 ? failures[0].reason.message : `Some projects could not be loaded: ${failures[0].reason.message}`);
  }, []);
  useEffect(() => { void load(); }, [load]);
  const showCreate = () => { setEditing(null); setForm({ name: '', description: '', color: '#2563eb' }); setOpen(true); };
  const showEdit = (project: Project) => { setEditing(project); setForm({ name: project.name, description: project.description || '', color: project.color }); setOpen(true); };
  return <>
    <PageTitle title="Projects" subtitle="Group responsibilities and measure aggregate progress." action={<Button variant="contained" startIcon={<Add />} onClick={showCreate}>New project</Button>}/>
    {message && <Alert severity="success" onClose={() => setMessage('')} sx={{ mb: 2 }}>{message}</Alert>}
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    <Box className="card-grid">{items.map(project => <Card key={project.id} sx={{ borderLeft: 5, borderLeftColor: project.color }}><CardActionArea onClick={() => onOpen(project)}><CardContent><Typography variant="h6">{project.name}</Typography><Typography color="text.secondary">{project.activeTasks} active tasks</Typography><LinearProgress variant="determinate" value={project.progress} sx={{ mt: 2, height: 8, borderRadius: 4 }}/><Typography variant="caption">{project.progress}% complete</Typography></CardContent></CardActionArea><Divider/><CardActions sx={{ flexWrap: 'wrap' }}><Button size="small" startIcon={<Groups/>} onClick={() => setProjectPeople(project)}>Project people</Button><Button size="small" startIcon={<Edit/>} onClick={() => showEdit(project)}>Rename / edit</Button><Button size="small" color="error" startIcon={<Delete/>} onClick={() => setDeleting(project)}>Delete</Button></CardActions></Card>)}</Box>
    {linked.length > 0 && <><Typography variant="h5" mt={4} mb={.5}>Linked projects</Typography><Typography color="text.secondary" mb={2}>Projects shared with your Task Tracker account. They remain separate from your private workspace.</Typography><Box className="card-grid">{linked.map(project => <Card key={project.id} sx={{ borderLeft: 5, borderLeftColor: project.color }}><CardActionArea onClick={() => { sessionStorage.setItem(`share-verification:${project.token.slice(0, 36)}`, project.verificationToken); location.href = `/shared-tasks?token=${encodeURIComponent(project.token)}`; }}><CardContent><Stack direction="row" justifyContent="space-between"><Typography variant="h6">{project.name}</Typography><Chip size="small" color="secondary" label="Linked"/></Stack><Typography color="text.secondary">{project.activeTasks} active tasks</Typography><LinearProgress variant="determinate" value={project.progress} sx={{ mt: 2, height: 8, borderRadius: 4 }}/><Typography variant="caption">{project.progress}% complete · select to open</Typography></CardContent></CardActionArea></Card>)}</Box></>}
    <Dialog open={open} onClose={() => !busy && setOpen(false)} fullWidth maxWidth="sm"><DialogTitle>{editing ? 'Edit project' : 'Create project'}</DialogTitle><DialogContent><Stack spacing={2} mt={1}><TextField autoFocus label="Project name" value={form.name} onChange={e => setForm(v => ({ ...v, name: e.target.value }))}/><TextField multiline minRows={3} label="Description" value={form.description} onChange={e => setForm(v => ({ ...v, description: e.target.value }))}/><TextField label="Colour" type="color" value={form.color} onChange={e => setForm(v => ({ ...v, color: e.target.value }))} slotProps={{ inputLabel: { shrink: true } }}/></Stack></DialogContent><DialogActions><Button disabled={busy} onClick={() => setOpen(false)}>Cancel</Button><Button variant="contained" disabled={busy || !form.name.trim()} onClick={async () => { setBusy(true); setError(''); try { await api('/projects/save', { method: 'POST', body: { ...form, name: form.name.trim(), ...(editing ? { id: editing.id, expectedVersion: editing.version } : {}) } }); setOpen(false); setMessage(editing ? 'Project updated.' : 'Project created.'); await load(); } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); } }}>{busy ? <CircularProgress size={20}/> : editing ? 'Save changes' : 'Create project'}</Button></DialogActions></Dialog>
    <Dialog open={!!deleting} onClose={() => !busy && setDeleting(null)} fullWidth maxWidth="xs"><DialogTitle>Delete project?</DialogTitle><DialogContent><Alert severity="warning" sx={{ mt: 1 }}>The project “{deleting?.name}” will be removed. Its {deleting?.activeTasks || 0} active task{deleting?.activeTasks === 1 ? '' : 's'} will be preserved under No project. Any guest or linked-project access will be revoked.</Alert></DialogContent><DialogActions><Button disabled={busy} onClick={() => setDeleting(null)}>Cancel</Button><Button color="error" variant="contained" disabled={busy || !deleting} onClick={async () => { if (!deleting) return; setBusy(true); setError(''); try { const result = await api<{ tasksPreserved: number }>('/projects/delete', { method: 'POST', body: { id: deleting.id, expectedVersion: deleting.version } }); setDeleting(null); setMessage(`Project deleted. ${result.tasksPreserved} task${result.tasksPreserved === 1 ? '' : 's'} preserved under No project.`); await load(); } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); } }}>{busy ? <CircularProgress size={20}/> : 'Delete project'}</Button></DialogActions></Dialog>
    <ProjectPeopleDialog project={projectPeople} onClose={() => setProjectPeople(null)}/>
  </>;
}
const recapDate = (date?: string | null) => date ? new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${date.slice(0, 10)}T12:00:00`)) : 'No due date';
const recapPriority = (priority: string) => priority ? priority[0].toUpperCase() + priority.slice(1) : 'None';
function sortRecapTasks(tasks: Task[]) { const today = new Date().toISOString().slice(0, 10), priority: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, none: 4 }; return [...tasks].sort((a, b) => { const aGroup = a.blocked ? 0 : a.dueDate && a.dueDate.slice(0, 10) < today ? 1 : 2, bGroup = b.blocked ? 0 : b.dueDate && b.dueDate.slice(0, 10) < today ? 1 : 2; return aGroup - bGroup || (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || (priority[a.priority] ?? 5) - (priority[b.priority] ?? 5) || a.title.localeCompare(b.title); }); }
function makeRecap(person: Person, tasks: Task[], shareUrl = '') { const today = new Date().toLocaleDateString(), shown = tasks.slice(0, 30), firstName = person.fullName.trim().split(/\s+/)[0] || person.fullName, lines = shown.flatMap((task, index) => { const due = task.dueDate ? recapDate(task.dueDate) : 'No due date', overdue = !!task.dueDate && task.dueDate.slice(0, 10) < new Date().toISOString().slice(0, 10), flags = [task.blocked ? 'BLOCKED' : '', overdue ? 'OVERDUE' : ''].filter(Boolean).join(' · '); return [`${index + 1}. ${task.title}`, `   Project: ${task.projectName || 'No project'}`, `   Status: ${task.status}${flags ? ` (${flags})` : ''}`, `   Due: ${due}`, `   Priority: ${recapPriority(task.priority)}`, `   Checklist: ${task.checklistCompleted || 0}/${task.checklistTotal || 0}`, '']; }), remainder = tasks.length - shown.length; return { subject: `Pending task recap – ${today}`, body: [`Hi ${firstName},`, '', `Here is your pending task recap for ${today}:`, '', ...lines, ...(remainder > 0 ? [`…and ${remainder} more tasks.`, ''] : []), `Total pending tasks: ${tasks.length}`, ...(shareUrl ? ['', 'Live task list (bookmark this link):', shareUrl] : [])].join('\n') }; }
const vcardEscape = (value?: string) => (value || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
function downloadContact(person: Person) { const fields = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${vcardEscape(person.fullName)}`, `N:${vcardEscape(person.fullName)};;;;`, person.company && `ORG:${vcardEscape(person.company)}`, person.role && `TITLE:${vcardEscape(person.role)}`, person.phone && `TEL;TYPE=CELL:${vcardEscape(person.phone)}`, person.email && `EMAIL;TYPE=INTERNET:${vcardEscape(person.email)}`, person.address && `ADR;TYPE=HOME:;;${vcardEscape(person.address)};;;;`, person.website && `URL:${vcardEscape(person.website)}`, person.notes && `NOTE:${vcardEscape(person.notes)}`, 'END:VCARD'].filter(Boolean).join('\r\n'), url = URL.createObjectURL(new Blob([fields], { type: 'text/vcard;charset=utf-8' })), link = document.createElement('a'); link.href = url; link.download = `${person.fullName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'contact'}.vcf`; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
type ShareLinkState = { active: boolean; token?: string; createdAt?: string; lastSharedAt?: string | null; lastSharedChannel?: string | null; emailEnabled?: boolean; pushEnabled?: boolean; scopeMode?: 'assigned' | 'project'; projectId?: string | null; allowChecklistUpdates?: boolean; allowTaskCompletion?: boolean; allowComments?: boolean; allowViewProjectContacts?: boolean; allowViewContactAssignments?: boolean; allowSuperviseContactChecklists?: boolean; allowCompleteContactTasks?: boolean; allowManageProjectContacts?: boolean; expiresAt?: string | null };
function PersonRecapDialog({ person, onClose }: { person: Person | null; onClose: () => void }) {
  const [details, setDetails] = useState<Person | null>(null), [tasks, setTasks] = useState<Task[]>([]), [projectOptions, setProjectOptions] = useState<Project[]>([]), [share, setShare] = useState<ShareLinkState | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState(''), [confirmation, setConfirmation] = useState('');
  const [access, setAccess] = useState({ scopeMode: 'assigned' as 'assigned' | 'project', projectId: '', allowChecklistUpdates: false, allowTaskCompletion: false, allowComments: false, allowViewProjectContacts: false, allowViewContactAssignments: false, allowSuperviseContactChecklists: false, allowCompleteContactTasks: false, allowManageProjectContacts: false, expiresAt: '' });
  const shareUrl = share?.token ? `${location.origin}/shared-tasks?token=${encodeURIComponent(share.token)}` : '';
  const requestLink = async (action: 'ensure' | 'regenerate' | 'revoke' | 'mark-shared', channel?: 'email' | 'whatsapp' | 'copy') => { if (!person) return null; setError(''); try { const response = await api<ShareLinkState>('/people/share-link', { method: 'POST', body: { personId: person.id, action, channel } }); setShare(response); if (action === 'regenerate') setConfirmation('A new master link was generated. The previous link no longer works.'); if (action === 'revoke') setConfirmation('The master link was revoked successfully.'); return response; } catch (reason) { setError((reason as Error).message); return null; } };
  useEffect(() => { if (!person) { setDetails(null); setTasks([]); setProjectOptions([]); setShare(null); setConfirmation(''); return; } let active = true; setLoading(true); setError(''); setConfirmation(''); Promise.all([api<Person>(`/people/details?personId=${encodeURIComponent(person.id)}`), api<{ items: Task[] }>(`/tasks?view=all&responsiblePersonId=${encodeURIComponent(person.id)}&pageSize=100`), api<Project[]>('/projects'), api<ShareLinkState>('/people/share-link', { method: 'POST', body: { personId: person.id, action: 'ensure' } })]).then(([contact, response, projects, link]) => { if (active) { setDetails({ ...person, ...contact }); setTasks(sortRecapTasks(response.items)); setProjectOptions(projects); setShare(link); setAccess({ scopeMode: link.scopeMode || 'assigned', projectId: link.projectId || '', allowChecklistUpdates: !!link.allowChecklistUpdates, allowTaskCompletion: !!link.allowTaskCompletion, allowComments: !!link.allowComments, allowViewProjectContacts: !!link.allowViewProjectContacts, allowViewContactAssignments: !!link.allowViewContactAssignments, allowSuperviseContactChecklists: !!link.allowSuperviseContactChecklists, allowCompleteContactTasks: !!link.allowCompleteContactTasks, allowManageProjectContacts: !!link.allowManageProjectContacts, expiresAt: link.expiresAt?.slice(0, 10) || '' }); } }).catch(e => { if (active) setError((e as Error).message); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [person]);
  const recap = details ? makeRecap(details, tasks, shareUrl) : null, whatsappPhone = details?.phone?.replace(/\D/g, '') || '';
  const noteShared = (channel: 'email' | 'whatsapp' | 'copy') => { void requestLink('mark-shared', channel); };
  return <Dialog open={!!person} onClose={onClose} fullWidth maxWidth="sm">
    <DialogTitle>Recap</DialogTitle>
    <DialogContent><Stack spacing={2} mt={1}>
      {loading && <Stack alignItems="center"><CircularProgress size={28}/></Stack>}{error && <Alert severity="error">{error}</Alert>}{confirmation && <Alert severity="success" onClose={() => setConfirmation('')}>{confirmation}</Alert>}
      {details && <><Typography><strong>{details.fullName}</strong> has {tasks.length} pending task{tasks.length === 1 ? '' : 's'}.</Typography>
        {tasks.length === 0 ? <Alert severity="info">There are no pending tasks to send.</Alert> : <Accordion variant="outlined" disableGutters sx={{ '&:before': { display: 'none' } }}><AccordionSummary expandIcon={<ExpandMore />} aria-controls="recap-message-preview"><Box flex={1}><Typography fontWeight={700}>Message preview</Typography><Typography variant="body2" color="text.secondary">{tasks.length} pending task{tasks.length === 1 ? '' : 's'} · select to expand</Typography></Box></AccordionSummary><AccordionDetails id="recap-message-preview" sx={{ pt: 0 }}><Paper variant="outlined" sx={{ p: 2, maxHeight: 260, overflow: 'auto', whiteSpace: 'pre-wrap', bgcolor: 'background.default' }}>{recap?.body}</Paper></AccordionDetails></Accordion>}
        <Alert severity="info">Choose exactly what this person may see and update. Changes are limited to tasks assigned to them and require a code sent to their email.</Alert>
        {share?.active && <Accordion variant="outlined" disableGutters sx={{ '&:before': { display: 'none' } }}><AccordionSummary expandIcon={<ExpandMore />}><Box><Typography fontWeight={700}>Collaboration access</Typography><Typography variant="body2" color="text.secondary">Permissions and expiry · select to expand</Typography></Box></AccordionSummary><AccordionDetails><Stack spacing={1.5}>
          <TextField select size="small" label="Visible work" value={access.scopeMode} onChange={e => setAccess(v => ({ ...v, scopeMode: e.target.value as 'assigned' | 'project' }))}><MenuItem value="assigned">All tasks assigned to this person</MenuItem><MenuItem value="project">One entire project</MenuItem></TextField>
          {access.scopeMode === 'project' && <TextField select size="small" label="Project" value={access.projectId} onChange={e => setAccess(v => ({ ...v, projectId: e.target.value }))}>{projectOptions.map(project => <MenuItem key={project.id} value={project.id}>{project.name}</MenuItem>)}</TextField>}
          <FormControlLabel control={<Switch checked={access.allowChecklistUpdates} onChange={e => setAccess(v => ({ ...v, allowChecklistUpdates: e.target.checked }))}/>} label="Can update checklist items"/>
          <FormControlLabel control={<Switch checked={access.allowTaskCompletion} onChange={e => setAccess(v => ({ ...v, allowTaskCompletion: e.target.checked }))}/>} label="Can mark assigned tasks complete"/>
          <FormControlLabel control={<Switch checked={access.allowComments} onChange={e => setAccess(v => ({ ...v, allowComments: e.target.checked }))}/>} label="Can add comments"/>
          {access.scopeMode === 'project' && <Paper variant="outlined" sx={{ p: 1.5 }}><Typography fontWeight={700} mb={.5}>Project contact permissions</Typography><Stack>
            <FormControlLabel control={<Switch checked={access.allowViewProjectContacts} onChange={e => setAccess(v => ({ ...v, allowViewProjectContacts: e.target.checked }))}/>} label="Can view contacts attached to this project"/>
            <FormControlLabel control={<Switch checked={access.allowViewContactAssignments} onChange={e => setAccess(v => ({ ...v, allowViewContactAssignments: e.target.checked }))}/>} label="Can see who project tasks are assigned to"/>
            <FormControlLabel control={<Switch checked={access.allowSuperviseContactChecklists} onChange={e => setAccess(v => ({ ...v, allowSuperviseContactChecklists: e.target.checked }))}/>} label="Can update checklist items for supervisable contacts"/>
            <FormControlLabel control={<Switch checked={access.allowCompleteContactTasks} onChange={e => setAccess(v => ({ ...v, allowCompleteContactTasks: e.target.checked }))}/>} label="Can complete tasks for supervisable contacts"/>
            <FormControlLabel control={<Switch checked={access.allowManageProjectContacts} onChange={e => setAccess(v => ({ ...v, allowManageProjectContacts: e.target.checked }))}/>} label="Can manage project contacts (advanced)"/>
          </Stack></Paper>}
          <TextField size="small" type="date" label="Access expires (optional)" value={access.expiresAt} onChange={e => setAccess(v => ({ ...v, expiresAt: e.target.value }))} slotProps={{ inputLabel: { shrink: true } }}/>
          <Button variant="contained" disabled={loading || (access.scopeMode === 'project' && !access.projectId)} onClick={async () => { if (!person) return; setLoading(true); setError(''); try { const result = await api<ShareLinkState>('/people/share-link', { method: 'POST', body: { personId: person.id, action: 'configure', ...access, projectId: access.projectId || null, expiresAt: access.expiresAt ? new Date(`${access.expiresAt}T23:59:59Z`).toISOString() : null } }); setShare(result); setConfirmation('Collaboration access updated.'); } catch (reason) { setError((reason as Error).message); } finally { setLoading(false); } }}>Save access settings</Button>
        </Stack></AccordionDetails></Accordion>}
        {share?.active && <Paper variant="outlined" sx={{ p: 1.5 }}><Typography variant="body2"><strong>Link created:</strong> {share.createdAt ? new Date(share.createdAt).toLocaleString() : 'Available'}</Typography><Typography variant="body2"><strong>Last shared:</strong> {share.lastSharedAt ? `${new Date(share.lastSharedAt).toLocaleString()} via ${share.lastSharedChannel || 'link'}` : 'Not shared yet'}</Typography><Typography variant="body2"><strong>Recipient updates:</strong> Email {share.emailEnabled ? 'enabled' : 'disabled'} · Browser {share.pushEnabled ? 'enabled' : 'disabled'}</Typography></Paper>}
        {shareUrl ? <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3,minmax(0,1fr))' }, gap: 1 }}><Button size="small" variant="outlined" onClick={async () => { setError(''); try { await navigator.clipboard.writeText(shareUrl); setConfirmation('Master link copied to the clipboard.'); noteShared('copy'); } catch { setError('The browser could not copy the link.'); } }}>Copy link</Button><Button size="small" variant="outlined" onClick={() => void requestLink('regenerate')}>Regenerate</Button><Button size="small" variant="outlined" color="error" onClick={() => void requestLink('revoke')}>Revoke</Button></Box> : <Button variant="outlined" onClick={async () => { const result = await requestLink('ensure'); if (result) setConfirmation('Master link created successfully.'); }}>Create master link</Button>}
        {!details.phone && !details.email && <Alert severity="warning">Add a phone number or email address before sharing this recap.</Alert>}
        <Typography variant="caption" color="text.secondary">“Last shared” records when Task Tracker copied the link or launched the external message. WhatsApp and email do not report whether Send was subsequently pressed.</Typography>
      </>}
    </Stack></DialogContent>
    <DialogActions sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2,minmax(0,1fr))', sm: 'repeat(4,minmax(0,1fr))' }, gap: 1, p: 2, '& > :not(style) ~ :not(style)': { ml: 0 }, '& .MuiButton-root': { minHeight: 44, m: 0 } }}>
      <Button fullWidth variant="outlined" onClick={onClose}>Close</Button>
      <Button fullWidth variant="outlined" disabled={!details} onClick={() => details && downloadContact(details)}>Add to contacts</Button>
      <Button fullWidth variant="contained" color="success" disabled={!whatsappPhone || !recap || tasks.length === 0} onClick={() => { noteShared('whatsapp'); window.open(`https://wa.me/${whatsappPhone}?text=${encodeURIComponent(`*${recap?.subject}*\n\n${recap?.body}`)}`, '_blank', 'noopener,noreferrer'); }}>WhatsApp</Button>
      <Button fullWidth variant="contained" disabled={!details?.email || !recap || tasks.length === 0} onClick={() => { noteShared('email'); window.location.href = `mailto:${details?.email}?subject=${encodeURIComponent(recap?.subject || '')}&body=${encodeURIComponent(recap?.body || '')}`; }}>Email</Button>
    </DialogActions>
  </Dialog>;
}
function PeopleView({ onOpen }: { onOpen: (person: Person) => void }) { const [items, setItems] = useState<Person[]>([]), [role, setRole] = useState(''), [open, setOpen] = useState(false), [recapPerson, setRecapPerson] = useState<Person | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [form, setForm] = useState({ fullName: '', email: '', company: '', role: '', phone: '', notes: '' }); const load = useCallback(() => { setError(''); return api<Person[]>('/people' + (role ? `?role=${encodeURIComponent(role)}` : '')).then(setItems).catch(e => setError(e.message)); }, [role]); useEffect(() => { void load(); }, [load]); const addToContacts = async (person: Person) => { setError(''); try { const details = await api<Person>(`/people/details?personId=${encodeURIComponent(person.id)}`); downloadContact({ ...person, ...details }); } catch (e) { setError((e as Error).message); } };
return <>
<PageTitle title="People" subtitle="Contacts and responsibilities. People do not receive login access." action={<Button variant="contained" startIcon={<Add />} onClick={() => setOpen(true)}>Add person</Button>}/>
{error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
<TextField size="small" label="Filter by function" value={role} onChange={e => setRole(e.target.value)} sx={{ mb: 2 }}/>
<Box className="card-grid">{items.map(p => <Card key={p.id}><CardActionArea onClick={() => onOpen(p)}>
<CardContent>
<Typography variant="h6">{p.fullName}</Typography>
<Typography color="text.secondary">{p.role || 'No function'} • {p.activeTasks} active</Typography>
<LinearProgress variant="determinate" value={p.progress} sx={{ mt: 2, height: 8, borderRadius: 4 }}/>
<Typography variant="caption">{p.progress}% of task load complete</Typography>
</CardContent>
</CardActionArea><Divider/><CardActions sx={{ flexWrap: 'wrap', gap: 0.5 }}><Button size="small" onClick={event => { event.currentTarget.blur(); setRecapPerson(p); }}>Recap</Button><Button size="small" onClick={() => void addToContacts(p)}>Add to contacts</Button></CardActions></Card>)}</Box>
<PersonRecapDialog person={recapPerson} onClose={() => setRecapPerson(null)}/>
<Dialog open={open} onClose={() => !busy && setOpen(false)} fullWidth maxWidth="sm"><DialogTitle>Add person or contact</DialogTitle><DialogContent><Stack spacing={2} mt={1}><TextField autoFocus label="Full name" value={form.fullName} onChange={e => setForm(v => ({ ...v, fullName: e.target.value }))}/><TextField label="Email (optional)" type="email" value={form.email} onChange={e => setForm(v => ({ ...v, email: e.target.value }))}/><TextField label="Company" value={form.company} onChange={e => setForm(v => ({ ...v, company: e.target.value }))}/><TextField label="Function / role" value={form.role} onChange={e => setForm(v => ({ ...v, role: e.target.value }))}/><TextField label="Phone" value={form.phone} onChange={e => setForm(v => ({ ...v, phone: e.target.value }))}/><TextField multiline minRows={3} label="Notes" value={form.notes} onChange={e => setForm(v => ({ ...v, notes: e.target.value }))}/></Stack></DialogContent><DialogActions><Button disabled={busy} onClick={() => setOpen(false)}>Cancel</Button><Button variant="contained" disabled={busy || !form.fullName.trim()} onClick={async () => { setBusy(true); setError(''); try { await api('/people/save', { method: 'POST', body: { ...form, fullName: form.fullName.trim() } }); setForm({ fullName: '', email: '', company: '', role: '', phone: '', notes: '' }); setOpen(false); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}>{busy ? <CircularProgress size={20}/> : 'Add person'}</Button></DialogActions></Dialog>
</>; }
function CalendarView({ onOpen, onNew }: {
    onOpen: (t: Task) => void;
    onNew: (date: string) => void;
}) { const now = new Date(), [cursor, setCursor] = useState(new Date(now.getFullYear(), now.getMonth(), 1)), [selected, setSelected] = useState<string | null>(null), [days, setDays] = useState<Array<{
    date: string;
    severity: string;
    count: number;
    tasks: Task[];
}>>([]); useEffect(() => { const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1), end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0); api<typeof days>(`/calendar?start=${start.toISOString().slice(0, 10)}&end=${end.toISOString().slice(0, 10)}`).then(setDays); }, [cursor]);
const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
const cells = useMemo(() => { const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1), offset = (first.getDay() + 6) % 7, count = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate(); return [...Array(offset).fill(null), ...Array.from({ length: count }, (_, i) => { const date = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`; return days.find(d => d.date === date) || { date, severity: 'neutral', count: 0, tasks: [] }; })]; }, [cursor, days]);
const day = days.find(d => d.date === selected);
return <>
<PageTitle title="Calendar" subtitle="Due dates, reminders, and completion dates. Project start dates are excluded."/>
<Stack direction="row" justifyContent="space-between" mb={2}>
<Button onClick={() => setCursor(new Date())}>Today</Button>
<Stack direction="row">
<Button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>‹</Button>
<Typography fontWeight={700} sx={{ p: 1 }}>{cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</Typography>
<Button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>›</Button>
</Stack>
</Stack>
<Stack direction="row" gap={2} flexWrap="wrap" mb={2}>{[['red', 'Overdue or critical'], ['orange', 'High priority'], ['blue', 'Scheduled'], ['green', 'Completed only']].map(([c, l]) => <Typography variant="caption" key={c}>
<span className={`legend ${c}`}/>{l}</Typography>)}</Stack>
<Box className="calendar-grid">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(x => <Typography key={x} fontWeight={700} textAlign="center">{x}</Typography>)}{cells.map((d, i) => d ? <Card key={d.date} className={`calendar-day ${d.severity}${d.date === todayKey ? ' today' : ''}`}>
<CardActionArea onClick={() => setSelected(d.date)}>
<CardContent>
<Typography fontWeight={700}>{Number(d.date.slice(-2))}</Typography>
{d.count > 0 && <Box className="calendar-count" aria-label={`${d.count} tasks`}>{d.count}</Box>}
</CardContent>
</CardActionArea>
</Card> : <Box key={`blank${i}`}/>)}</Box>
<Dialog open={!!selected} onClose={() => setSelected(null)} fullWidth>
<DialogTitle>{selected && new Date(`${selected}T12:00`).toLocaleDateString(undefined, { dateStyle: 'full' })}</DialogTitle>
<DialogContent>
<Stack spacing={1}>{day?.tasks.map(t => <Card key={t.id}>
<CardActionArea onClick={() => { setSelected(null); onOpen(t); }}>
<CardContent>
<Typography fontWeight={700}>{t.title}</Typography>
<Typography variant="body2" color="text.secondary">{t.projectName || 'No project'} • {t.dueTime || 'All day'}</Typography>
</CardContent>
</CardActionArea>
</Card>)}{!day?.tasks.length && <Typography color="text.secondary">No tasks on this day.</Typography>}</Stack>
</DialogContent>
<DialogActions>
<Button onClick={() => selected && onNew(selected)} startIcon={<Add />}>New task on this day</Button>
<Button onClick={() => setSelected(null)}>Close</Button>
</DialogActions>
</Dialog>
</>; }
function applicationServerKey(value: string) { const padding = '='.repeat((4 - value.length % 4) % 4), raw = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, character => character.charCodeAt(0)); }
type NotificationPreferences={emailEnabled:boolean;pushEnabled:boolean;reminder:boolean;dueToday:boolean;overdue:boolean;dailySummary:boolean;timezone:string;quietStart:string;quietEnd:string;currencyCode:string};
type NotificationReadiness={email:{providerConfigured:boolean;accountAddressAvailable:boolean;enabled:boolean};push:{providerConfigured:boolean;enabled:boolean;activeSubscriptions:number};scheduler:{cadenceMinutes:number;explicitTaskReminders:boolean;dueTodayAutomation:boolean;overdueAutomation:boolean;dailySummaryAutomation:boolean};deliveries:{pending:number;failed:number;delivered:number;latest:{status:string;createdAt:string;deliveredAt?:string|null;errorCode?:string|null}|null}};
const defaultPreferences:NotificationPreferences={emailEnabled:false,pushEnabled:false,reminder:true,dueToday:true,overdue:true,dailySummary:false,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC',quietStart:'22:00',quietEnd:'07:00',currencyCode:'CHF'};
function SettingsView() { const [supported] = useState('serviceWorker' in navigator && 'PushManager' in window), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [preferences,setPreferences]=useState<NotificationPreferences>(defaultPreferences),[readiness,setReadiness]=useState<NotificationReadiness|null>(null);
const loadReadiness=()=>api<NotificationReadiness>('/notifications/readiness').then(setReadiness).catch(error=>setMessage(error.message));
useEffect(()=>{void Promise.all([api<NotificationPreferences|null>('/preferences').then(value=>value&&setPreferences({...defaultPreferences,...value})),loadReadiness()]).catch(error=>setMessage(error.message))},[]);
const savePreferences=async(next:NotificationPreferences)=>{setPreferences(next);await api('/preferences',{method:'POST',body:next})};
return <>
<PageTitle title="Settings" subtitle="Notifications, email, timezone, and connected account."/>
<Stack spacing={2}>
	<Card>
	<CardContent>
	<Typography variant="h6">Live notifications</Typography>
	<Typography color="text.secondary">iPhone requires iOS 16.4 or later and the PWA added to the Home Screen.</Typography>
	<Stack direction={{xs:'column',sm:'row'}} spacing={1} mt={2} alignItems={{sm:'center'}}>
	<Button variant="contained" disabled={!supported || busy || preferences.pushEnabled} onClick={async () => {
    setBusy(true);
    try {
        if(!import.meta.env.VITE_VAPID_PUBLIC_KEY)throw new Error('The Pages VAPID public key is missing.');
        const permission = await Notification.requestPermission();
        if (permission === 'denied') throw new Error('Notifications are blocked for this site. Change the browser site permission to Allow.');
        if (permission !== 'granted') throw new Error('The notification permission request was dismissed.');
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(import.meta.env.VITE_VAPID_PUBLIC_KEY) as BufferSource });
        const subscriptionJson = subscription.toJSON();
        await api('/push/subscribe', { method: 'POST', body: { ...subscriptionJson, expirationTime: subscriptionJson.expirationTime ?? null, deviceLabel: navigator.userAgent.slice(0, 100) } });
        await savePreferences({...preferences,pushEnabled:true});
        await loadReadiness();
        setMessage('Live notifications are enabled on this device.');
    }
    catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
	}}>{preferences.pushEnabled ? 'Notifications enabled' : 'Enable notifications'}</Button>
	<Button variant="outlined" disabled={!supported || busy || !preferences.pushEnabled} onClick={async()=>{setBusy(true);try{const result=await api<{sent:number}>('/notifications/test-push',{method:'POST',body:{}});setMessage(`Notification test sent to ${result.sent} device${result.sent===1?'':'s'}.`);await loadReadiness()}catch(error){setMessage((error as Error).message)}finally{setBusy(false)}}}>Send notification test</Button>
	</Stack>
	<Divider sx={{ my: 2 }}/>
	<Typography variant="h6">Email reminders</Typography>
	<Typography color="text.secondary">Reminder emails are sent to {session.get()?.user.email || 'the current signed-in email'}.</Typography>
	<Stack direction={{xs:'column',sm:'row'}} spacing={1} mt={2} alignItems={{sm:'center'}}>
	<Button variant="contained" disabled={busy || preferences.emailEnabled} onClick={async()=>{setBusy(true);try{await savePreferences({...preferences,emailEnabled:true});await loadReadiness();setMessage('Reminder emails enabled.')}catch(error){setMessage((error as Error).message)}finally{setBusy(false)}}}>{preferences.emailEnabled?'Reminder emails enabled':'Enable reminder emails'}</Button>
	<Button variant="outlined" disabled={busy || !preferences.emailEnabled} onClick={async () => { setBusy(true); try { await api('/notifications/test-email', { method: 'POST', body: {} }); setMessage('Test email sent.'); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); } }}>Send email test</Button>
	{preferences.emailEnabled && <Button color="inherit" size="small" disabled={busy} onClick={async()=>{setBusy(true);try{await savePreferences({...preferences,emailEnabled:false});await loadReadiness();setMessage('Reminder emails disabled.')}catch(error){setMessage((error as Error).message)}finally{setBusy(false)}}}>Disable reminder emails</Button>}
	</Stack>
	</CardContent>
	</Card>
	<Card>
	<CardContent>
	<Stack direction="row" justifyContent="space-between" alignItems="center" gap={1} mb={2}><Box><Typography variant="h6">Notification readiness</Typography><Typography variant="body2" color="text.secondary">Configuration and delivery evidence.</Typography></Box><Button size="small" startIcon={<Refresh/>} onClick={()=>void loadReadiness()}>Refresh</Button></Stack>
{!readiness?<LinearProgress/>:<Stack spacing={1.25}>
<Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
<Chip color={readiness.email.providerConfigured&&readiness.email.accountAddressAvailable?'success':'error'} label={`Email provider ${readiness.email.providerConfigured?'configured':'missing'}`}/>
<Chip color={readiness.email.enabled?'success':'default'} label={`Email ${readiness.email.enabled?'enabled':'disabled'}`}/>
<Chip color={readiness.push.providerConfigured?'success':'error'} label={`Web push ${readiness.push.providerConfigured?'configured':'missing'}`}/>
<Chip color={readiness.push.activeSubscriptions>0?'success':'warning'} label={`${readiness.push.activeSubscriptions} active push subscription${readiness.push.activeSubscriptions===1?'':'s'}`}/>
</Stack>
<Typography variant="body2">Reminder scheduler: every {readiness.scheduler.cadenceMinutes} minutes · explicit task reminders enabled.</Typography>
<Typography variant="body2" color="text.secondary">Deliveries: {readiness.deliveries.delivered} delivered · {readiness.deliveries.pending} pending/retrying · {readiness.deliveries.failed} failed.</Typography>
{readiness.deliveries.latest&&<Typography variant="caption" color="text.secondary">Latest delivery: {readiness.deliveries.latest.status} · {new Date(readiness.deliveries.latest.createdAt).toLocaleString()}{readiness.deliveries.latest.errorCode?` · ${readiness.deliveries.latest.errorCode}`:''}</Typography>}
<Alert severity="info">Due-today, overdue, and daily-summary automation are not active yet. This version sends explicit task reminders configured in the task editor.</Alert>
</Stack>}
	</CardContent>
	</Card>
<Card>
<CardContent>
<Typography variant="h6">Workspace currency</Typography>
<Typography color="text.secondary" mb={2}>One currency is used consistently for task costs, project totals, and comparison charts. Changing it relabels existing amounts; it does not perform currency conversion.</Typography>
<TextField select size="small" label="Currency" value={preferences.currencyCode} disabled={busy} onChange={async event=>{setBusy(true);try{await savePreferences({...preferences,currencyCode:event.target.value});setMessage(`Workspace currency changed to ${event.target.value}.`)}catch(error){setMessage((error as Error).message)}finally{setBusy(false)}}} sx={{minWidth:180}}>
{['CHF','EUR','USD','GBP'].map(code=><MenuItem key={code} value={code}>{code}</MenuItem>)}
</TextField>
</CardContent>
</Card>
</Stack>
<Snackbar open={!!message} autoHideDuration={5000} message={message} onClose={() => setMessage('')}/>
</>; }
function Generic({ view }: {
    view: View;
}) { return <>
<PageTitle title={nav.find(n => n.view === view)?.label || view} subtitle="Connected service view"/>
<Paper sx={{ p: 4 }}>
<Typography color="text.secondary">This view is ready to load its validated data from the matching connected service.</Typography>
</Paper>
</>; }
export default function App() { const [logged, setLogged] = useState(!!session.get()), [platformAdmin, setPlatformAdmin] = useState(false), [authMode,setAuthMode]=useState<'invite'|'recovery'|null>(null), [view, setView] = useState<View>((new URLSearchParams(location.search).get('view') as View) || 'dashboard'), [dark, setDark] = useState(matchMedia('(prefers-color-scheme: dark)').matches), [drawer, setDrawer] = useState(false), [desktopNav, setDesktopNav] = useState(true), [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({}), [offline, setOffline] = useState(!navigator.onLine), [task, setTask] = useState<Task | null>(null), [editingTask, setEditingTask] = useState<Task | null>(null), [newDate, setNewDate] = useState<string | null>(null), [refreshToken, setRefreshToken] = useState(0), [filter, setFilter] = useState<{
    title: string;
    q: Record<string, unknown>;
} | null>(null);
const mobile = useMediaQuery('(max-width:800px)'); useEffect(()=>{void consumeAuthLink().then(mode=>{if(mode){setLogged(true);setAuthMode(mode)}})},[]); useEffect(()=>{if(logged)void api<{platformAdmin:boolean}>('/access/state').then(state=>setPlatformAdmin(state.platformAdmin)).catch(()=>setPlatformAdmin(false))},[logged]); useEffect(() => { if (!logged) return; const params = new URLSearchParams(location.search), token = params.get('claimProject'); if (!token) return; void api('/people/claim-linked-project', { method: 'POST', body: { token } }).then(() => { sessionStorage.setItem('linked-project-claim-message', 'Project linked to your Task Tracker account.'); setView('projects'); history.replaceState(null, '', '?view=projects'); }).catch(error => { sessionStorage.setItem('linked-project-claim-message', (error as Error).message); setView('projects'); history.replaceState(null, '', '?view=projects'); }); }, [logged]); useEffect(() => { const online = () => { setOffline(false); void flushQueue(); };
const off = () => setOffline(true); addEventListener('online', online); addEventListener('offline', off);
const focus = () => document.visibilityState === 'visible' && navigator.onLine && void flushQueue(); document.addEventListener('visibilitychange', focus); return () => { removeEventListener('online', online); removeEventListener('offline', off); document.removeEventListener('visibilitychange', focus); }; }, []);
const theme = useMemo(() => createTheme({ palette: { mode: dark ? 'dark' : 'light', primary: { main: dark ? '#60a5fa' : '#1d4ed8', contrastText: dark ? '#07111f' : '#fff' }, background: { default: dark ? '#0c1220' : '#f4f7fb', paper: dark ? '#151d2e' : '#fff' } }, shape: { borderRadius: 12 }, typography: { fontFamily: 'Inter,Segoe UI,Arial,sans-serif', h4: { fontWeight: 800 }, h6: { fontWeight: 750 } }, components: { MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { minHeight: 38, fontWeight: 700, textTransform: 'none' }, outlined: { borderColor: dark ? '#64748b' : undefined } } }, MuiCard: { styleOverrides: { root: { border: '1px solid', borderColor: dark ? '#475569' : '#d5dde8' } } }, MuiOutlinedInput: { styleOverrides: { root: { '& .MuiOutlinedInput-notchedOutline': { borderColor: dark ? '#64748b' : '#94a3b8' }, '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: dark ? '#93c5fd' : '#1d4ed8' } } } }, MuiToggleButton: { styleOverrides: { root: { borderColor: dark ? '#64748b' : '#94a3b8', '&.Mui-selected': { backgroundColor: dark ? '#334155' : '#dbeafe', color: dark ? '#fff' : '#1e3a8a' } } } } } }), [dark]); if(location.pathname === '/shared-tasks')return <PublicPersonTasks/>; if(authMode)return <ThemeProvider theme={theme}><CssBaseline/><PasswordSetup mode={authMode} onDone={()=>{setAuthMode(null);setView('dashboard')}}/></ThemeProvider>; if (!logged)
    return <ThemeProvider theme={theme}><CssBaseline/>
	<Login onSignedIn={() => setLogged(true)} />
</ThemeProvider>;
const releaseFocus = () => (document.activeElement as HTMLElement | null)?.blur();
const openTask = (nextTask: Task) => { releaseFocus(); setTask(nextTask); };
const openNewTask = (date = '') => { releaseFocus(); setNewDate(date); };
const body = filter ? <EnhancedTasksView view="tasks" query={filter.q} title={filter.title} onOpen={openTask} onNew={() => openNewTask()} refreshToken={refreshToken}/> : view === 'dashboard' ? <EnhancedDashboardView openFilter={(title, q) => setFilter({ title, q })} openTask={openTask} refreshToken={refreshToken}/> : ['tasks', 'today', 'upcoming', 'completed', 'trash'].includes(view) ? <EnhancedTasksView view={view} onOpen={openTask} onNew={() => openNewTask()} refreshToken={refreshToken}/> : view === 'projects' ? <ProjectsView onOpen={project => setFilter({ title: project.name, q: { projectId: project.id } })}/> : view === 'people' ? <PeopleView onOpen={person => setFilter({ title: person.fullName, q: { responsiblePersonId: person.id } })}/> : view === 'dependencies' ? <DependencyLoadView onOpenTasks={(title, q) => setFilter({ title, q })}/> : view === 'calendar' ? <CalendarView onOpen={openTask} onNew={openNewTask}/> : view === 'settings' ? <SettingsView /> : view==='access'?(platformAdmin?<UsersAccessView/>:<Alert severity="info">Only the platform administrator can invite and manage application users.</Alert>):view==='security'?<AccountSecurity/>:view==='backup'?<BackupImportView/>:view==='diagnostics'?<DiagnosticsView/>:view==='manual'?<UserManualView/>:<Generic view={view}/>;
const navigate = (v: View) => { releaseFocus(); setFilter(null); setView(v); setDrawer(false); history.replaceState(null, '', `?view=${v}`); };
return <ThemeProvider theme={theme}><CssBaseline/>
<Box sx={{ minHeight: '100vh', bgcolor: 'background.default', color: 'text.primary', pb: mobile ? 'calc(76px + env(safe-area-inset-bottom))' : 0 }}>
<AppBar color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
<Toolbar sx={{ paddingTop: 'env(safe-area-inset-top)' }}>{!mobile && <IconButton aria-label={desktopNav ? 'Collapse navigation' : 'Expand navigation'} onClick={() => setDesktopNav(value => !value)}>
<Menu />
</IconButton>}<Avatar sx={{ width: 34, height: 34, bgcolor: 'primary.main', fontWeight: 800 }}>T</Avatar>
<Typography fontWeight={800} color="primary" ml={1}>Task Tracker</Typography>
<Chip label="Connected" size="small" color="success" sx={{ ml: 1 }}/>
<Box flex={1}/>{offline && <Chip color="warning" label="Offline"/>}<NotificationBell/><IconButton onClick={() => setDark(!dark)}>{dark ? <LightMode /> : <DarkMode />}</IconButton>
<Tooltip title="Sign out">
<IconButton onClick={() => { session.set(null); setLogged(false); }}>
<Logout />
</IconButton>
</Tooltip>
</Toolbar>
</AppBar>{!mobile && desktopNav && <Drawer variant="permanent" open sx={{ width: 260, '& .MuiDrawer-paper': { width: 260, mt: '64px', height: 'calc(100% - 64px)' } }}>
<List>{['Overview', 'Tasks', 'Organization', 'System'].map(group => <Box key={group}>
<ListItemButton aria-expanded={!collapsedGroups[group]} onClick={() => setCollapsedGroups(value => ({ ...value, [group]: !value[group] }))}>
<ListItemText primary={group} primaryTypographyProps={{ variant: 'overline', fontWeight: 800 }}/>
{collapsedGroups[group] ? <ExpandMore /> : <ExpandLess />}
</ListItemButton>{!collapsedGroups[group] && nav.filter(n => n.group === group && (n.view !== 'access' || platformAdmin)).map(n => <ListItemButton key={n.view} selected={view === n.view && !filter} onClick={() => navigate(n.view)}>
<ListItemIcon>{n.icon}</ListItemIcon>
<ListItemText primary={n.label}/>
</ListItemButton>)}</Box>)}</List>
</Drawer>}<Box component="main" sx={{ pt: { xs: '82px', md: '96px' }, pl: { xs: 2, md: desktopNav ? '292px' : 4 }, pr: { xs: 2, md: 4 }, pb: 4, maxWidth: 1800 }}>{filter && <Button onClick={() => setFilter(null)}>← Back</Button>}{body}</Box>{mobile && <Paper elevation={8} className="bottom-nav">
<BottomNavigation value={view} onChange={(_, v) => { if (v === 'more') { releaseFocus(); setDrawer(true); } else navigate(v); }} showLabels>
<BottomNavigationAction value="dashboard" label="Dashboard" icon={<DashboardIcon />}/>
<BottomNavigationAction value="today" label="Today" icon={<Today />}/>
<BottomNavigationAction value="tasks" label="Tasks" icon={<Inbox />}/>
<BottomNavigationAction value="calendar" label="Calendar" icon={<CalendarMonth />}/>
<BottomNavigationAction value="more" label="More" icon={<MoreHoriz />}/>
</BottomNavigation>
</Paper>}<Drawer anchor="right" open={mobile && drawer} onClose={() => { releaseFocus(); setDrawer(false); }}>
<Box sx={{ width: 'min(88vw,360px)', pt: 'env(safe-area-inset-top)' }}>
<List>{['Tasks', 'Organization', 'System'].map((group, index) => {
  const mobileGroupKey = `mobile-${group}`, groupItems = nav.filter(n => n.group === group && !['dashboard', 'today', 'tasks', 'calendar'].includes(n.view) && (n.view !== 'access' || platformAdmin));
  if (!groupItems.length) return null;
  return <Box key={group}>{index > 0 && <Divider/>}<ListItemButton aria-expanded={!collapsedGroups[mobileGroupKey]} onClick={() => setCollapsedGroups(value => ({ ...value, [mobileGroupKey]: !value[mobileGroupKey] }))}>
    <ListItemText primary={group} primaryTypographyProps={{ variant: 'overline', fontWeight: 800 }}/>
    {collapsedGroups[mobileGroupKey] ? <ExpandMore/> : <ExpandLess/>}
  </ListItemButton>{!collapsedGroups[mobileGroupKey] && groupItems.map(n => <ListItemButton key={n.view} selected={view === n.view && !filter} onClick={() => navigate(n.view)} sx={{ pl: 3 }}>
    <ListItemIcon>{n.icon}</ListItemIcon>
    <ListItemText primary={n.label}/>
  </ListItemButton>)}</Box>;
})}</List>
</Box>
</Drawer>
<TaskDetailsDialog task={task} open={!!task} mobile={mobile} refreshToken={refreshToken} onClose={() => setTask(null)} onEdit={nextTask => { releaseFocus(); setEditingTask(nextTask); }} onCompleted={() => setRefreshToken(value => value + 1)} onDeleted={() => { setTask(null); setRefreshToken(value => value + 1); }}/>
<TaskEditorDialog task={editingTask} newDate={newDate} open={!!editingTask || newDate !== null} mobile={mobile} onClose={() => { setEditingTask(null); setNewDate(null); }} onSaved={() => { setEditingTask(null); setNewDate(null); setRefreshToken(value => value + 1); }}/>
</Box>
</ThemeProvider>; }
