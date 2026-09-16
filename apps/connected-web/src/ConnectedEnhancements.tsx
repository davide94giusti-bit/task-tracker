import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Avatar, Badge, Box, Button, Card, CardActionArea, CardContent, Checkbox,
  Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, IconButton, LinearProgress, Menu, MenuItem, Paper, Stack,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField,
  ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import { Add, Delete, NotificationsActive, Refresh, TableRows, ViewModule } from '@mui/icons-material';
import { api } from './api';
import type { ChecklistItem, Dashboard, NotificationItem, Person, Project, Task, TaskDependency, View } from './types';

function titleFor(view: View, override?: string) {
  if (override) return override;
  if (view === 'tasks') return 'All Tasks';
  return view[0].toUpperCase() + view.slice(1);
}

export function EnhancedTasksView({ view, query, title, onOpen, onNew }: {
  view: View; query?: Record<string, unknown>; title?: string;
  onOpen: (task: Task) => void; onNew: () => void;
}) {
  const [data, setData] = useState<{ items: Task[]; total: number } | null>(null);
  const [projects, setProjects] = useState<Project[]>([]), [people, setPeople] = useState<Person[]>([]);
  const [error, setError] = useState(''), [layout, setLayout] = useState<'cards' | 'table'>('cards');
  const [filters, setFilters] = useState({ search: '', projectId: '', responsiblePersonId: '', status: '', priority: '' });
  const load = useCallback(async () => {
    setError(''); setData(null);
    try {
      const merged = { view: view === 'tasks' ? 'all' : view, ...query, ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value)) } as Record<string, string>;
      const [tasks, projectRows, peopleRows] = await Promise.all([
        api<{ items: Task[]; total: number }>(`/tasks?${new URLSearchParams(merged)}`),
        api<Project[]>('/projects'), api<Person[]>('/people'),
      ]);
      setData(tasks); setProjects(projectRows); setPeople(peopleRows);
    } catch (reason) { setError((reason as Error).message); }
  }, [view, JSON.stringify(query), JSON.stringify(filters)]);
  useEffect(() => { void load(); }, [load]);
  const cards = data?.items.map(task => <Card key={task.id}><CardActionArea onClick={() => onOpen(task)}><CardContent>
    <Stack direction="row" spacing={2} alignItems="center"><Box sx={{ width: 5, height: 48, borderRadius: 2, bgcolor: task.priority === 'critical' ? 'error.main' : task.priority === 'high' ? 'warning.main' : 'primary.main' }}/><Box flex={1} minWidth={0}><Typography fontWeight={750} noWrap>{task.title}</Typography><Typography variant="body2" color="text.secondary" noWrap>{[task.projectName, task.responsiblePersonName, task.dueDate && `Due ${task.dueDate}`].filter(Boolean).join(' • ') || 'No project or due date'}</Typography></Box>{task.blocked && <Chip label="Blocked" color="warning"/>}<Chip label={task.status.replaceAll('_', ' ')}/></Stack>
  </CardContent></CardActionArea></Card>);
  return <>
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={2} mb={3}><Box><Typography variant="h4">{titleFor(view, title)}</Typography><Typography color="text.secondary">{data ? `${data.total} matching tasks` : 'Loading validated cloud tasks'}</Typography></Box><Button variant="contained" startIcon={<Add/>} onClick={onNew}>New task</Button></Stack>
    <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1} mb={2} alignItems={{ lg: 'center' }}>
      <TextField size="small" label="Search" value={filters.search} onChange={event => setFilters(value => ({ ...value, search: event.target.value }))}/>
      <TextField select size="small" label="Project" value={filters.projectId} onChange={event => setFilters(value => ({ ...value, projectId: event.target.value }))} sx={{ minWidth: 180 }}><MenuItem value="">All projects</MenuItem>{projects.map(project => <MenuItem key={project.id} value={project.id}>{project.name}</MenuItem>)}</TextField>
      <TextField select size="small" label="Person" value={filters.responsiblePersonId} onChange={event => setFilters(value => ({ ...value, responsiblePersonId: event.target.value }))} sx={{ minWidth: 180 }}><MenuItem value="">All people</MenuItem>{people.map(person => <MenuItem key={person.id} value={person.id}>{person.fullName}</MenuItem>)}</TextField>
      <TextField select size="small" label="Status" value={filters.status} onChange={event => setFilters(value => ({ ...value, status: event.target.value }))} sx={{ minWidth: 150 }}><MenuItem value="">All statuses</MenuItem>{['not_started','in_progress','waiting','blocked','completed'].map(value => <MenuItem key={value} value={value}>{value.replaceAll('_',' ')}</MenuItem>)}</TextField>
      <TextField select size="small" label="Priority" value={filters.priority} onChange={event => setFilters(value => ({ ...value, priority: event.target.value }))} sx={{ minWidth: 140 }}><MenuItem value="">All priorities</MenuItem>{['critical','high','medium','low','none'].map(value => <MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField>
      <Button startIcon={<Refresh/>} onClick={load}>Refresh</Button>
      <ToggleButtonGroup exclusive size="small" value={layout} onChange={(_, value) => value && setLayout(value)} aria-label="Task layout"><ToggleButton value="cards" aria-label="Card view"><ViewModule sx={{ mr: .5 }}/>Cards</ToggleButton><ToggleButton value="table" aria-label="Table view"><TableRows sx={{ mr: .5 }}/>Table</ToggleButton></ToggleButtonGroup>
    </Stack>
    {error && <Alert severity="error" action={<Button onClick={load}>Retry</Button>}>{error}</Alert>}
    {!data && !error && <LinearProgress/>}
    {data?.items.length === 0 && <Paper sx={{ p: 4, textAlign: 'center' }}><Typography variant="h6">No tasks match these filters</Typography></Paper>}
    {layout === 'cards' ? <Stack spacing={1.25}>{cards}</Stack> : data && data.items.length > 0 && <TableContainer component={Paper} variant="outlined"><Table size="small"><TableHead><TableRow><TableCell>Task</TableCell><TableCell>Project</TableCell><TableCell>Person</TableCell><TableCell>Status</TableCell><TableCell>Priority</TableCell><TableCell>Due</TableCell><TableCell align="right">Progress</TableCell></TableRow></TableHead><TableBody>{data.items.map(task => <TableRow hover key={task.id} onClick={() => onOpen(task)} sx={{ cursor: 'pointer' }}><TableCell><Typography fontWeight={700}>{task.title}</Typography>{task.blocked && <Chip size="small" color="warning" label="Blocked"/>}</TableCell><TableCell>{task.projectName || '—'}</TableCell><TableCell>{task.responsiblePersonName || '—'}</TableCell><TableCell>{task.status.replaceAll('_',' ')}</TableCell><TableCell>{task.priority}</TableCell><TableCell>{task.dueDate || '—'}</TableCell><TableCell align="right">{task.calculatedProgress || 0}%</TableCell></TableRow>)}</TableBody></Table></TableContainer>}
  </>;
}

export function EnhancedDashboardView({ openFilter }: { openFilter: (title: string, query: Record<string, unknown>) => void }) {
  const [data, setData] = useState<Dashboard | null>(null), [projects, setProjects] = useState<Project[]>([]), [error, setError] = useState('');
  useEffect(() => { Promise.all([api<Dashboard>('/dashboard'), api<Project[]>('/projects')]).then(([dashboard, projectRows]) => { setData(dashboard); setProjects(projectRows); }).catch(reason => setError(reason.message)); }, []);
  const cards = [['Overdue','overdue',{ due:'overdue' }],['Due today','today',{ due:'today' }],['Next 7 days','next7',{ due:'next7' }],['Critical','critical',{ priority:'critical' }],['Blocked','blocked',{ blocked:'true' }],['Waiting','waiting',{ status:'waiting' }]] as const;
  if (error) return <Alert severity="error">{error}</Alert>;
  return <><Box mb={3}><Typography variant="h4">Dashboard</Typography><Typography color="text.secondary">A calm overview of what needs your attention.</Typography></Box>{!data ? <LinearProgress/> : <>
    <Box className="metric-grid">{cards.map(([label,key,query]) => <Card key={key}><CardActionArea onClick={() => openFilter(label, query)}><CardContent><Stack direction="row" justifyContent="space-between"><Box><Typography color="text.secondary">{label}</Typography><Typography variant="h4">{data.counts[key] || 0}</Typography></Box><Avatar sx={{ bgcolor:'action.hover' }}>{label[0]}</Avatar></Stack></CardContent></CardActionArea></Card>)}</Box>
    <Card sx={{ mt:2 }}><CardActionArea onClick={() => openFilter('Overall workload', {})}><CardContent><Stack direction="row" justifyContent="space-between"><Box><Typography variant="h6">Overall workload</Typography><Typography color="text.secondary">Average progress across active tasks</Typography></Box><Typography variant="h5">{data.overallProgress}%</Typography></Stack><LinearProgress variant="determinate" value={data.overallProgress} sx={{ mt:2,height:10,borderRadius:5 }}/></CardContent></CardActionArea></Card>
    <Card sx={{ mt:2 }}><CardContent><Typography variant="h6">Progress by project</Typography><Typography color="text.secondary" mb={2}>Select a project to open its tasks.</Typography><Stack spacing={1.5}>{projects.length ? projects.map(project => <CardActionArea key={project.id} onClick={() => openFilter(project.name,{ projectId:project.id })} sx={{ borderRadius:1,p:1 }}><Stack direction="row" alignItems="center" spacing={1.5}><Box sx={{ width:120 }}><Typography fontWeight={700} noWrap>{project.name}</Typography><Typography variant="caption">{project.activeTasks} active</Typography></Box><Box flex={1}><LinearProgress variant="determinate" value={project.progress || 0} sx={{ height:12,borderRadius:6,'& .MuiLinearProgress-bar':{ bgcolor:project.color } }}/></Box><Typography width={45} textAlign="right">{project.progress || 0}%</Typography></Stack></CardActionArea>) : <Typography color="text.secondary">Create a project to see project progress.</Typography>}</Stack></CardContent></Card>
  </>}</>;
}

export function NotificationBell() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null), [items, setItems] = useState<NotificationItem[]>([]), [unread, setUnread] = useState(0);
  const load = useCallback(() => api<{ items: NotificationItem[]; unread: number }>('/notifications/inbox').then(data => { setItems(data.items); setUnread(data.unread); }).catch(() => undefined), []);
  useEffect(() => { void load(); const timer = setInterval(load, 60_000); return () => clearInterval(timer); }, [load]);
  const read = async (item: NotificationItem) => { if (!item.readAt) { await api('/notifications/read',{ method:'POST',body:{ id:item.id } }); await load(); } };
  return <><Tooltip title="Notifications"><IconButton aria-label={`${unread} unread notifications`} onClick={event => { setAnchor(event.currentTarget); void load(); }}><Badge badgeContent={unread} color="error"><NotificationsActive/></Badge></IconButton></Tooltip><Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)} slotProps={{ paper:{ sx:{ width:340,maxWidth:'90vw',maxHeight:420 } } }}><MenuItem disabled><Typography fontWeight={800}>Notifications</Typography></MenuItem>{items.length ? items.map(item => <MenuItem key={item.id} onClick={() => void read(item)} sx={{ whiteSpace:'normal',alignItems:'flex-start' }}><Box><Typography fontWeight={item.readAt ? 400 : 800}>{item.kind === 'reminder' ? 'Task reminder' : item.kind}</Typography><Typography variant="body2" color="text.secondary">{new Date(item.createdAt).toLocaleString()} · {item.status}</Typography></Box></MenuItem>) : <MenuItem disabled>No notifications yet</MenuItem>}</Menu></>;
}

export function TaskEditorDialog({ task, newDate, open, onClose, onSaved, mobile }: { task: Task | null; newDate: string | null; open: boolean; onClose: () => void; onSaved: () => void; mobile: boolean }) {
  const [editor, setEditor] = useState({ title:'',description:'',status:'not_started',priority:'medium',dueDate:'',projectId:'',responsiblePersonId:'' });
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]), [dependencies, setDependencies] = useState<TaskDependency[]>([]), [deletedChecklist, setDeletedChecklist] = useState<string[]>([]), [deletedDependencies, setDeletedDependencies] = useState<string[]>([]);
  const [projects, setProjects] = useState<Project[]>([]), [people, setPeople] = useState<Person[]>([]), [tasks, setTasks] = useState<Task[]>([]), [checklistText, setChecklistText] = useState(''), [prerequisiteId, setPrerequisiteId] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    setEditor({ title:task?.title || '',description:task?.description || '',status:task?.status || 'not_started',priority:task?.priority || 'medium',dueDate:newDate || task?.dueDate || '',projectId:task?.projectId || '',responsiblePersonId:task?.responsiblePersonId || '' });
    setChecklist([]); setDependencies([]); setDeletedChecklist([]); setDeletedDependencies([]); setError('');
    Promise.all([api<Project[]>('/projects'),api<Person[]>('/people'),api<{items:Task[]}>('/tasks?view=all&pageSize=100')]).then(([projectRows,peopleRows,taskRows]) => { setProjects(projectRows); setPeople(peopleRows); setTasks(taskRows.items); });
    if (task) api<{ checklist: ChecklistItem[]; dependencies: Omit<TaskDependency,'prerequisiteTitle'|'prerequisiteStatus'>[] }>(`/tasks/details?taskId=${task.id}`).then(details => { setChecklist(details.checklist); setDependencies(details.dependencies.map(dependency => { const prerequisite = tasks.find(item => item.id === dependency.prerequisiteTaskId); return { ...dependency, prerequisiteTitle:prerequisite?.title || 'Prerequisite task', prerequisiteStatus:prerequisite?.status || '' }; })); }).catch(reason => setError(reason.message));
  }, [open, task?.id, newDate]);
  useEffect(() => { setDependencies(value => value.map(dependency => { const prerequisite=tasks.find(item=>item.id===dependency.prerequisiteTaskId); return {...dependency,prerequisiteTitle:prerequisite?.title||dependency.prerequisiteTitle,prerequisiteStatus:prerequisite?.status||dependency.prerequisiteStatus}; })); }, [tasks]);
  const addChecklist = () => { const description=checklistText.trim(); if (!description) return; setChecklist(value => [...value,{ description,completed:false,required:true,position:value.length }]); setChecklistText(''); };
  const addDependency = () => { const prerequisite=tasks.find(item=>item.id===prerequisiteId); if (!prerequisite || dependencies.some(item=>item.prerequisiteTaskId===prerequisite.id)) return; setDependencies(value=>[...value,{ id:`new-${crypto.randomUUID()}`,waitingTaskId:task?.id||'',prerequisiteTaskId:prerequisite.id,mandatory:true,prerequisiteTitle:prerequisite.title,prerequisiteStatus:prerequisite.status }]); setPrerequisiteId(''); };
  const saveRelated = async (taskId:string) => {
    await Promise.all(deletedChecklist.map(id=>api('/tasks/checklist/delete',{method:'POST',body:{id}})));
    await Promise.all(checklist.map((item,index)=>api('/tasks/checklist/save',{method:'POST',body:{...item,taskId,position:index}})));
    await Promise.all(deletedDependencies.map(id=>api('/dependencies/unlink',{method:'POST',body:{id}})));
    await Promise.all(dependencies.filter(item=>!item.id.startsWith('new-')).map(item=>api('/dependencies/update',{method:'POST',body:{id:item.id,mandatory:item.mandatory}})));
    await Promise.all(dependencies.filter(item=>item.id.startsWith('new-')).map(item=>api('/dependencies/link',{method:'POST',body:{waitingTaskId:taskId,prerequisiteTaskId:item.prerequisiteTaskId,mandatory:item.mandatory}})));
  };
  const save = async () => {
    setBusy(true); setError('');
    try {
      const body = { title:editor.title.trim(),description:editor.description,status:editor.status,priority:editor.priority,dueDate:editor.dueDate||null,projectId:editor.projectId||null,responsiblePersonId:editor.responsiblePersonId||null };
      let taskId=task?.id;
      if (!taskId) { const initialStatus=(checklist.length||dependencies.length)&&editor.status==='completed'?'not_started':editor.status; const created=await api<Task>('/tasks/save',{method:'POST',body:{...body,status:initialStatus}}); taskId=created.id; await saveRelated(taskId); if(initialStatus!==editor.status)await api('/tasks/save',{method:'POST',body:{id:taskId,...body}}); }
      else { await saveRelated(taskId); await api('/tasks/save',{method:'POST',body:{id:taskId,...body}}); }
      onSaved();
    } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  };
  return <Dialog open={open} onClose={busy?undefined:onClose} fullScreen={mobile} fullWidth maxWidth="md"><DialogTitle>{task?'Task details':'Create task'}</DialogTitle><DialogContent><Stack spacing={2} mt={1}>{error&&<Alert severity="error">{error}</Alert>}<TextField label="Title" value={editor.title} onChange={event=>setEditor(value=>({...value,title:event.target.value}))}/><TextField multiline minRows={3} label="Description" value={editor.description} onChange={event=>setEditor(value=>({...value,description:event.target.value}))}/><Stack direction={{xs:'column',sm:'row'}} spacing={2}><TextField select fullWidth label="Status" value={editor.status} onChange={event=>setEditor(value=>({...value,status:event.target.value}))}>{['not_started','in_progress','waiting','completed'].map(value=><MenuItem key={value} value={value}>{value.replaceAll('_',' ')}</MenuItem>)}</TextField><TextField select fullWidth label="Priority" value={editor.priority} onChange={event=>setEditor(value=>({...value,priority:event.target.value}))}>{['critical','high','medium','low','none'].map(value=><MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField></Stack><Stack direction={{xs:'column',sm:'row'}} spacing={2}><TextField select fullWidth label="Project" value={editor.projectId} onChange={event=>setEditor(value=>({...value,projectId:event.target.value}))}><MenuItem value="">No project</MenuItem>{projects.map(project=><MenuItem key={project.id} value={project.id}>{project.name}</MenuItem>)}</TextField><TextField select fullWidth label="Responsible person" value={editor.responsiblePersonId} onChange={event=>setEditor(value=>({...value,responsiblePersonId:event.target.value}))}><MenuItem value="">Unassigned</MenuItem>{people.map(person=><MenuItem key={person.id} value={person.id}>{person.fullName}</MenuItem>)}</TextField></Stack><TextField label="Due date" type="date" value={editor.dueDate} onChange={event=>setEditor(value=>({...value,dueDate:event.target.value}))} slotProps={{inputLabel:{shrink:true}}}/>
    <Paper variant="outlined" sx={{p:2}}><Typography variant="h6">Checklist</Typography><Stack direction={{xs:'column',sm:'row'}} spacing={1} my={1}><TextField fullWidth size="small" label="New checklist item" value={checklistText} onChange={event=>setChecklistText(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();addChecklist();}}}/><Button startIcon={<Add/>} onClick={addChecklist}>Add</Button></Stack><Stack spacing={.5}>{checklist.map((item,index)=><Stack key={item.id||index} direction="row" alignItems="center"><Checkbox checked={item.completed} onChange={event=>setChecklist(value=>value.map((entry,i)=>i===index?{...entry,completed:event.target.checked}:entry))}/><Typography sx={{textDecoration:item.completed?'line-through':'none',flex:1}}>{item.description}</Typography><FormControlLabel control={<Checkbox size="small" checked={item.required} onChange={event=>setChecklist(value=>value.map((entry,i)=>i===index?{...entry,required:event.target.checked}:entry))}/>} label="Required"/><IconButton aria-label="Delete checklist item" onClick={()=>{if(item.id)setDeletedChecklist(value=>[...value,item.id!]);setChecklist(value=>value.filter((_,i)=>i!==index));}}><Delete/></IconButton></Stack>)}</Stack></Paper>
    <Paper variant="outlined" sx={{p:2}}><Typography variant="h6">Dependencies</Typography><Stack direction={{xs:'column',sm:'row'}} spacing={1} my={1}><TextField select fullWidth size="small" label="Prerequisite task" value={prerequisiteId} onChange={event=>setPrerequisiteId(event.target.value)}><MenuItem value="">Choose a task</MenuItem>{tasks.filter(item=>item.id!==task?.id).map(item=><MenuItem key={item.id} value={item.id}>{item.title}</MenuItem>)}</TextField><Button startIcon={<Add/>} onClick={addDependency}>Link</Button></Stack><Stack spacing={1}>{dependencies.map((dependency,index)=><Stack key={dependency.id} direction="row" alignItems="center"><Box flex={1}><Typography fontWeight={700}>{dependency.prerequisiteTitle}</Typography><Typography variant="body2" color="text.secondary">{dependency.prerequisiteStatus.replaceAll('_',' ')||'Pending'} · {dependency.mandatory?'Required':'Optional'}</Typography></Box><FormControlLabel control={<Checkbox checked={dependency.mandatory} onChange={event=>setDependencies(value=>value.map((entry,i)=>i===index?{...entry,mandatory:event.target.checked}:entry))}/>} label="Required"/><IconButton aria-label="Remove dependency" onClick={()=>{if(!dependency.id.startsWith('new-'))setDeletedDependencies(value=>[...value,dependency.id]);setDependencies(value=>value.filter((_,i)=>i!==index));}}><Delete/></IconButton></Stack>)}</Stack></Paper>
  </Stack></DialogContent><DialogActions><Button disabled={busy} onClick={onClose}>Cancel</Button><Button variant="contained" disabled={busy||!editor.title.trim()} onClick={save}>{busy?<CircularProgress size={20}/>:'Save task'}</Button></DialogActions></Dialog>;
}
