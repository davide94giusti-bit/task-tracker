import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { Alert, AppBar, Autocomplete, Avatar, Badge, Box, Button, Card, CardContent, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Drawer, FormControlLabel, IconButton, InputAdornment, LinearProgress, List, ListItemButton, ListItemIcon, ListItemText, MenuItem, Paper, Select, Snackbar, Stack, Tab, Tabs, TextField, ToggleButton, ToggleButtonGroup, Toolbar, Tooltip, Typography } from '@mui/material';
import { Add, Backup, CalendarMonth, CheckCircle, ChevronLeft, ChevronRight, Dashboard, DarkMode, Delete, Download, Edit, Event, ExpandLess, ExpandMore, Folder, Groups, Inbox, InfoOutlined, LightMode, Menu, MoreTime, Notifications, OpenInNew, People, Refresh, RestoreFromTrash, Search, Settings as SettingsIcon, TaskAlt, Today, Warning, BugReport, AttachFile, Link as LinkIcon, SwapHoriz } from '@mui/icons-material';
import { labels, visualState } from '../shared/business';
import type { Activity, BottleneckAnalysis, CalendarDay, CalendarRange, CompletionBlockers, DashboardData, LogEntry, Person as PersonType, PrerequisiteCandidate, Priority, Project, Settings, Task, TaskQuery, WorkloadSummaries } from '../shared/types';
const API = window.priorityDesk;
const nav = [['dashboard', 'Dashboard', <Dashboard />], ['all', 'All Tasks', <Inbox />], ['today', 'Today', <Today />], ['upcoming', 'Upcoming', <CalendarMonth />], ['calendar', 'Calendar', <Event />], ['completed', 'Completed', <TaskAlt />], ['trash', 'Trash', <Delete />], ['projects', 'Projects', <Folder />], ['people', 'People', <People />], ['dependency-load', 'Dependency load by person', <Groups />], ['logs', 'Logs and Diagnostics', <BugReport />], ['settings', 'Settings', <SettingsIcon />]] as const;
const navGroups=[
  {id:'overview',label:'Overview',items:['dashboard']},
  {id:'tasks',label:'Tasks',items:['all','today','upcoming','calendar','completed','trash']},
  {id:'organization',label:'Organization',items:['projects','people','dependency-load']},
  {id:'system',label:'System',items:['logs','settings']}
] as const;
const priorityColor: Record<Priority, 'error' | 'warning' | 'info' | 'default'> = {
  critical: 'error',
  high: 'warning',
  medium: 'info',
  low: 'default',
  none: 'default'
};
const emptyTask = (): Partial<Task> & {
  title: string;
} => ({
  title: '',
  description: '',
  status: 'not_started',
  priority: 'medium',
  progressMode: 'automatic',
  manualProgress: 0,
  tags: [],
  notes: '',
  checklist: [],
  links: [],
  attachments: []
});
const fmt = (s?: string | null) => s ? new Date(s).toLocaleDateString() : 'No due date';
type Drilldown={title:string;query:TaskQuery};
export default function App() {
  const [view, setView] = useState('dashboard'),
    [open, setOpen] = useState(true),
    [search, setSearch] = useState(''),
    [editing, setEditing] = useState<Task | Partial<Task> | null>(null),
    [quick, setQuick] = useState(false),
    [refresh, setRefresh] = useState(0),
    [toast, setToast] = useState<{
      text: string;
      severity: 'success' | 'error' | 'info';
    } | null>(null),
    [settings, setSettings] = useState<Settings | null>(null),
    [initialTab,setInitialTab]=useState(0),
    [reminderOpen,setReminderOpen]=useState(false),
    [reminderCount,setReminderCount]=useState(0),
    [calendarDate,setCalendarDate]=useState<string|undefined>(),
    [drilldown,setDrilldown]=useState<Drilldown|null>(null),
    [expandedGroups,setExpandedGroups]=useState<Record<string,boolean>>({overview:true,tasks:true,organization:true,system:true});
  useEffect(() => {
    API.settings.get().then(setSettings);
  }, []);
  useEffect(()=>{const report=(event:ErrorEvent)=>void API.rendererDiagnostic({type:'error',component:'window',errorName:event.error?.name||'Error',timestamp:new Date().toISOString()}).catch(()=>{});const rejection=(event:PromiseRejectionEvent)=>void API.rendererDiagnostic({type:'unhandled_rejection',component:'window',errorName:event.reason?.name||'PromiseRejection',timestamp:new Date().toISOString()}).catch(()=>{});addEventListener('error',report);addEventListener('unhandledrejection',rejection);let observer:PerformanceObserver|undefined;try{observer=new PerformanceObserver(list=>{for(const entry of list.getEntries())if(entry.duration>=250)void API.rendererDiagnostic({type:'long_task',component:'renderer',durationMs:Math.round(entry.duration),timestamp:new Date().toISOString()}).catch(()=>{})});observer.observe({entryTypes:['longtask']})}catch{}return()=>{removeEventListener('error',report);removeEventListener('unhandledrejection',rejection);observer?.disconnect()}},[]);
  useEffect(()=>{if(editing||quick||reminderOpen||document.hidden)return;const load=()=>API.reminders.center().then(items=>setReminderCount(items.filter(x=>x.actionable).length)).catch(()=>{});load();const timer=setInterval(load,60000);return()=>clearInterval(timer)},[editing,quick,reminderOpen]);
  const mode = settings?.theme === 'system' ? matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light' : settings?.theme || 'light';
  const theme = useMemo(() => createTheme({
    palette: {
      mode,
      primary: {
        main: '#1d4ed8'
      },
      background: {
        default: mode === 'dark' ? '#0c1220' : '#f4f7fb',
        paper: mode === 'dark' ? '#151d2e' : '#fff'
      }
    },
    shape: {
      borderRadius: 10
    },
    typography: {
      fontFamily: 'Inter, Segoe UI, Arial, sans-serif',
      h4: {
        fontWeight: 750
      },
      h5: {
        fontWeight: 700
      },
      h6: {
        fontWeight: 700
      },
      button: {
        textTransform: 'none',
        fontWeight: 650
      }
    },
    components: {
      MuiButton: {
        defaultProps: {
          disableElevation: true
        }
      },
      MuiCard: {
        styleOverrides: {
          root: {
            boxShadow: mode === 'dark' ? '0 1px 2px #0008' : '0 1px 3px #0f172a14',
            border: `1px solid ${mode === 'dark' ? '#26334a' : '#e7ecf3'}`
          }
        }
      },
      MuiChip: {
        styleOverrides: {
          root: {
            fontWeight: 650
          }
        }
      }
    }
  }), [mode]);
  const changed = () => setRefresh(x => x + 1);
  const notify = (text: string, severity: 'success' | 'error' | 'info' = 'success') => setToast({
    text,
    severity
  });
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'n'&&!editing&&!reminderOpen) {
        e.preventDefault();
        setQuick(true);
      }
      if (e.ctrlKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        document.getElementById('global-search')?.focus();
      }
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, [editing,reminderOpen]);
  const selectView = (v: string) => {
    setDrilldown(null);
    setCalendarDate(undefined);
    setView(v);
    if (innerWidth < 1100) setOpen(false);
  };
  const openFilteredTasks=useCallback((title:string,query:TaskQuery)=>{setCalendarDate(undefined);setDrilldown({title,query});setView('filtered');if(innerWidth<1100)setOpen(false)},[]);
  const openTask=useCallback((task:Task|Partial<Task>,tab=0)=>{setQuick(false);setReminderOpen(false);setInitialTab(tab);setEditing(task);if(task.id)history.replaceState(null,'',`#task=${task.id}&tab=${tab}`)},[]);
  const openTaskById=useCallback(async(id:string,tab=0,date?:string)=>{const task=await API.tasks.get(id);if(date){if(view!=='calendar')setCalendarDate(date);setView('calendar')}openTask(task,tab);if(date)history.replaceState(null,'',`#task=${id}&tab=${tab}&date=${date}`)},[openTask,view]);
  useEffect(()=>{const params=new URLSearchParams(location.hash.replace(/^#/,'')),id=params.get('task');if(id)void openTaskById(id,Number(params.get('tab')||0),params.get('date')||undefined)},[openTaskById]);
  return <ThemeProvider theme={theme}><Box sx={{
      display: 'flex',
      height: '100vh',
      overflow: 'hidden',
      bgcolor:'background.default',
      color:'text.primary'
    }}>
  <AppBar position="fixed" color="inherit" elevation={0} sx={{
        zIndex: t => t.zIndex.drawer + 1,
        borderBottom: 1,
        borderColor: 'divider'
      }}><Toolbar sx={{
          gap: 2
        }}><IconButton onClick={() => setOpen(!open)}><Menu /></IconButton><Stack direction="row" alignItems="center" spacing={1} sx={{
            minWidth: open ? 214 : 44
          }}><Box className="logoMark">T</Box>{open && <Typography fontWeight={800} color="primary">Task Tracker</Typography>}</Stack><TextField id="global-search" size="small" placeholder="Search tasks, notes, contacts, projects…" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => {
            if (e.key === 'Enter') setView('all');
          }} sx={{
            maxWidth: 620,
            flex: 1
          }} InputProps={{
            startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment>
          }} /><Box sx={{
            flex: 1
          }} /><Tooltip title="Reminder center"><IconButton aria-label="Open reminder center" onClick={()=>{setQuick(false);setEditing(null);setReminderOpen(true)}}><Badge color="error" badgeContent={reminderCount} invisible={!reminderCount}><Notifications /></Badge></IconButton></Tooltip><Tooltip title={`Use ${mode === 'dark' ? 'light' : 'dark'} theme`}><IconButton aria-label={`Use ${mode === 'dark' ? 'light' : 'dark'} theme`} onClick={async () => {
              const s = await API.settings.save({
                theme: mode === 'dark' ? 'light' : 'dark'
              });
              setSettings(s);
            }}>{mode === 'dark' ? <LightMode /> : <DarkMode />}</IconButton></Tooltip><Button variant="contained" startIcon={<Add />} disabled={Boolean(editing||reminderOpen)} onClick={() => setQuick(true)}>Quick add</Button></Toolbar></AppBar>
  <Drawer variant="permanent" open={open} sx={{
        width: open ? 260 : 72,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: open ? 260 : 72,
          boxSizing: 'border-box',
          transition: 'width .18s',
          overflowX: 'hidden'
        }
      }}><Toolbar /><List sx={{
          px: 1.2,
          py: 1,
          overflowY:'auto'
        }}>{navGroups.map(group=><Box component="li" key={group.id} sx={{listStyle:'none'}}>
          {open&&<ListItemButton
            aria-expanded={expandedGroups[group.id]}
            aria-controls={`nav-${group.id}`}
            onClick={()=>setExpandedGroups(current=>({...current,[group.id]:!current[group.id]}))}
            sx={{minHeight:34,px:1.5,mt:1}}
          ><ListItemText primary={group.label} primaryTypographyProps={{variant:'overline',fontWeight:800,color:'text.secondary'}}/>{expandedGroups[group.id]?<ExpandLess fontSize="small"/>:<ExpandMore fontSize="small"/>}</ListItemButton>}
          {(!open||expandedGroups[group.id])&&<Box id={`nav-${group.id}`}>{group.items.map(itemId=>{
            const item=nav.find(([id])=>id===itemId);
            if(!item)return null;
            const [id,label,icon]=item;
            return <ListItemButton key={id} selected={view===id} onClick={()=>selectView(id)} sx={{mb:.5,minHeight:44,borderRadius:2,justifyContent:open?'initial':'center'}}>
              <ListItemIcon sx={{minWidth:open?42:0,justifyContent:'center',color:view===id?'primary.main':'inherit'}}>{icon}</ListItemIcon>
              {open&&<ListItemText primary={label} primaryTypographyProps={{fontWeight:view===id?700:500,fontSize:14}}/>}
            </ListItemButton>
          })}</Box>}
        </Box>)}</List><Box sx={{
          mt: 'auto',
          p: open ? 2 : 1
        }}>{open && <Typography variant="caption" color="text.secondary">100% local • No account required</Typography>}</Box></Drawer>
  <Box component="main" sx={{
        flex: 1,
        overflow: 'auto',
        pt: '64px',
        bgcolor:'background.default',
        color:'text.primary'
      }}><Box sx={{
          p: {
            xs: 2,
            md: 3
          },
          maxWidth: 1600,
          mx: 'auto'
        }}>{view === 'dashboard' ? <DashboardView refresh={refresh} openTask={task=>openTask(task)} filter={openFilteredTasks} /> : view==='calendar'?<CalendarView refresh={refresh} initialDate={calendarDate} openTask={openTaskById} createTask={date=>openTask({...emptyTask(),dueDate:date})}/>:view==='dependency-load'?<DependencyLoadView refresh={refresh} openTask={openTaskById}/>:view === 'projects' ? <ProjectsViewV2 refresh={refresh} changed={changed} notify={notify} openTask={task=>openTask(task)} filter={openFilteredTasks}/> : view === 'people' ? <PeopleViewV2 refresh={refresh} changed={changed} notify={notify} filter={openFilteredTasks}/> : view === 'logs' ? <LogsView refresh={refresh} notify={notify} /> : view === 'settings' ? <SettingsView value={settings} setValue={setSettings} notify={notify} /> : <TaskList key={view==='filtered'?JSON.stringify(drilldown):view} view={view} titleOverride={drilldown?.title} queryOverride={drilldown?.query} search={search} refresh={refresh} openTask={task=>openTask(task)} changed={changed} notify={notify} />}</Box></Box>
  <TaskEditorV2 task={editing} initialTab={initialTab} navigate={openTaskById} close={() => {setEditing(null);history.replaceState(null,'',location.pathname+location.search)}} saved={() => {
        setEditing(null);
        changed();
        notify('Task saved');
      }} />
  <ReminderCenter open={reminderOpen} close={()=>setReminderOpen(false)} openTask={task=>openTask(task)} changed={changed}/>
  <QuickAdd open={quick&&!editing&&!reminderOpen} close={() => setQuick(false)} saved={t => {
        setQuick(false);
        changed();
        notify('Task created');
        openTask(t);
      }} />
  <Snackbar open={!!toast} autoHideDuration={4500} onClose={() => setToast(null)} anchorOrigin={{
        vertical: 'bottom',
        horizontal: 'center'
      }}>{toast ? <Alert severity={toast.severity} onClose={() => setToast(null)}>{toast.text}</Alert> : undefined}</Snackbar>
 </Box></ThemeProvider>;
}
function PageHead({
  title,
  subtitle,
  action
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}><Box><Typography variant="h4">{title}</Typography>{subtitle && <Typography color="text.secondary" mt={.5}>{subtitle}</Typography>}</Box>{action}</Stack>;
}
function DashboardView({
  refresh,
  openTask,
  filter
}: {
  refresh: number;
  openTask: (t: Task) => void;
  filter: (title:string,query:TaskQuery) => void;
}) {
  const [data, setData] = useState<DashboardData | null>(null);
  useEffect(() => {
    API.dashboard().then(setData);
  }, [refresh]);
  if (!data) return <Loading />;
  const weekAgo=new Date(Date.now()-7*864e5).toISOString();
  const cards:Array<[string,string,React.ReactNode,string,TaskQuery,string]> = [
    ['overdue','Overdue',<Warning/>,'#b91c1c',{due:'overdue'},'Active tasks whose due date has passed.'],
    ['today','Due today',<Today/>,'#ea580c',{due:'today'},'Active tasks due today.'],
    ['next7','Next 7 days',<Event/>,'#d97706',{due:'next7'},'Active tasks due after today and within seven days.'],
    ['critical','Critical',<Warning/>,'#dc2626',{priorities:['critical']},'Active tasks with Critical priority.'],
    ['blocked','Blocked',<LinkIcon/>,'#64748b',{blocked:true},'Tasks prevented from progressing by an incomplete mandatory prerequisite.'],
    ['waiting','Waiting',<MoreTime/>,'#7c3aed',{statuses:['waiting']},'Active tasks explicitly set to Waiting.'],
    ['recentCompleted','Recently completed',<CheckCircle/>,'#16a34a',{view:'completed',completedSince:weekAgo},'Tasks completed during the last seven days.'],
    ['active','Active tasks',<TaskAlt/>,'#2563eb',{},'All current tasks excluding completed, cancelled, archived, and trashed tasks.']
  ];
  const info=(title:string)=><Tooltip title={title}><InfoOutlined fontSize="small" color="action" aria-label={title}/></Tooltip>;
  return <><PageHead title="Dashboard" subtitle="A calm overview of what needs your attention." /><Box className="metricGrid">{cards.map(([k,l,i,c,query,help]) => <Card key={k} onClick={() => filter(l,query)} className="metricCard" role="button" tabIndex={0} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();filter(l,query)}}}><CardContent><Stack direction="row" justifyContent="space-between"><Box><Stack direction="row" spacing={.7} alignItems="center"><Typography color="text.secondary" variant="body2">{l}</Typography>{info(help)}</Stack><Typography variant="h4" mt={.5}>{data.counts[k]}</Typography></Box><Avatar sx={{
              bgcolor: `${c}18`,
              color: c
            }}>{i}</Avatar></Stack></CardContent></Card>)}</Box><Box className="dashGrid" mt={3}><Card><CardContent><Stack direction="row" justifyContent="space-between"><Box><Typography variant="h6">Needs attention</Typography><Typography variant="body2" color="text.secondary">Ranked by deterministic urgency</Typography></Box><Chip label={`${data.needsAttention.length} shown`} size="small" /></Stack><Divider sx={{
            my: 2
          }} />{data.needsAttention.length ? data.needsAttention.map(t => <TaskRow key={t.id} task={t} click={() => openTask(t)} />) : <Empty icon={<CheckCircle />} title="All clear" text="There are no active tasks requiring attention." />}</CardContent></Card><Stack spacing={3}><Card className="drillable" role="button" tabIndex={0} onClick={()=>filter('Active tasks',{})} onKeyDown={event=>{if(event.key==='Enter')filter('Active tasks',{})}}><CardContent><Stack direction="row" spacing={.7} alignItems="center"><Typography variant="h6">Overall workload</Typography>{info('Average calculated progress across all active tasks. Select to see exactly those tasks.')}</Stack><Stack direction="row" alignItems="end" spacing={1} mt={2}><Typography variant="h3" color="primary">{data.overallProgress}%</Typography><Typography color="text.secondary" mb={.7}>average active progress</Typography></Stack><LinearProgress variant="determinate" value={data.overallProgress} sx={{
              height: 9,
              borderRadius: 5,
              mt: 1
            }} /></CardContent></Card><Card><CardContent><Stack direction="row" spacing={.7} alignItems="center" mb={2}><Typography variant="h6">Progress by project</Typography>{info('Average active-task progress for each project. Select a project to open only its active tasks.')}</Stack>{data.projectProgress.map(p => <Box key={p.id} mb={2} className="drillableRow" role="button" tabIndex={0} onClick={()=>filter(`${p.name} tasks`,{projectId:p.id})} onKeyDown={event=>{if(event.key==='Enter')filter(`${p.name} tasks`,{projectId:p.id})}}><Stack direction="row" justifyContent="space-between"><Typography variant="body2" fontWeight={650}>{p.name}</Typography><Typography variant="caption" color="text.secondary">{p.progress}% • {p.active} active</Typography></Stack><LinearProgress variant="determinate" value={p.progress} sx={{
                mt: .7,
                height: 6,
                borderRadius: 3
              }} /></Box>)}</CardContent></Card><Card><CardContent><Stack direction="row" spacing={.7} alignItems="center" mb={2}><Typography variant="h6">7-day workload</Typography>{info('Number of active tasks due on each day. Select a bar to see that day’s tasks.')}</Stack><Box className="bars">{data.workload.map(x => <Tooltip key={x.date} title={`${x.count} task(s) due`}><Box className="barWrap" role="button" tabIndex={0} onClick={()=>filter(`Tasks due ${fmt(x.date)}`,{dueDate:x.date})} onKeyDown={event=>{if(event.key==='Enter')filter(`Tasks due ${fmt(x.date)}`,{dueDate:x.date})}}><Box className="bar" style={{
                    height: `${Math.max(4, x.count * 18)}px`
                  }} /><Typography variant="caption">{new Date(`${x.date}T12:00`).toLocaleDateString(undefined, {
                      weekday: 'short'
                    })}</Typography></Box></Tooltip>)}</Box></CardContent></Card></Stack></Box></>;
}
function TaskList({
  view,
  titleOverride,
  queryOverride,
  search,
  refresh,
  openTask,
  changed,
  notify
}: {
  view: string;
  titleOverride?:string;
  queryOverride?:TaskQuery;
  search: string;
  refresh: number;
  openTask: (t: Task) => void;
  changed: () => void;
  notify: (s: string, t?: any) => void;
}) {
  const [tasks, setTasks] = useState<Task[]>([]),
    [loading, setLoading] = useState(true),
    [sort, setSort] = useState('smart'),
    [priority, setPriority] = useState('all'),
    [project,setProject]=useState(queryOverride?.projectId||'all'),
    [projects,setProjects]=useState<Project[]>([]),
    [layout, setLayout] = useState<'table' | 'cards'>('table'),
    [selected, setSelected] = useState<string[]>([]),
    [pendingDelete,setPendingDelete]=useState<Task|null>(null),
    [deleting,setDeleting]=useState(false);
  useEffect(()=>{API.projects.list().then(setProjects).catch(()=>setProjects([]))},[refresh]);
  const load = useCallback(() => {
    setLoading(true);
    const q: TaskQuery = {
      ...queryOverride,
      view:queryOverride?.view??(view==='filtered'?undefined:view),
      search,
      sort,
      priorities: priority === 'all' ? queryOverride?.priorities : [priority as Priority],
      projectId:project==='all'?queryOverride?.projectId:project,
      pageSize: 500
    };
    API.tasks.list(q).then(r => setTasks(r.items)).finally(() => setLoading(false));
  }, [view, queryOverride, search, sort, priority, project, refresh]);
  useEffect(load, [load]);
  const title = titleOverride||(nav.find(n => n[0] === view)?.[1] || 'Tasks');
  const bulk = async (p: Partial<Task>) => {
    await API.tasks.bulk(selected, p);
    setSelected([]);
    changed();
    notify('Tasks updated');
  };
  return <><PageHead title={title} subtitle={`${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'} in this view`} action={<Button variant="contained" startIcon={<Add />} onClick={() => openTask(emptyTask() as Task)}>New task</Button>} /><Paper sx={{
      p: 1.5,
      mb: 2
    }}><Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap"><Select size="small" value={priority} onChange={e => setPriority(e.target.value)}><MenuItem value="all">All priorities</MenuItem>{['critical', 'high', 'medium', 'low', 'none'].map(x => <MenuItem key={x} value={x}>{cap(x)}</MenuItem>)}</Select><Select size="small" value={project} onChange={e=>setProject(e.target.value)} sx={{minWidth:180}} aria-label="Filter tasks by project"><MenuItem value="all">All projects</MenuItem>{projects.filter(item=>!item.archived).map(item=><MenuItem value={item.id} key={item.id}>{item.name}</MenuItem>)}</Select><Select size="small" value={sort} onChange={e => setSort(e.target.value)}><MenuItem value="smart">Smart urgency</MenuItem><MenuItem value="due">Due date</MenuItem><MenuItem value="priority">Priority</MenuItem><MenuItem value="progress">Progress</MenuItem><MenuItem value="title">Alphabetical</MenuItem></Select><Box sx={{
          flex: 1
        }} />{selected.length > 0 && <><Chip label={`${selected.length} selected`} /><Button onClick={() => bulk({
            status: 'completed'
          })}>Complete</Button><Button onClick={() => bulk({
            archived: true,
            status: 'archived'
          })}>Archive</Button></>}<ToggleButtonGroup exclusive size="small" value={layout} onChange={(_, v) => v && setLayout(v)}><ToggleButton value="table">Table</ToggleButton><ToggleButton value="cards">Cards</ToggleButton></ToggleButtonGroup><IconButton onClick={load}><Refresh /></IconButton></Stack></Paper>{loading ? <Loading /> : tasks.length === 0 ? <Empty icon={view === 'trash' ? <Delete /> : <TaskAlt />} title={view === 'trash' ? 'Trash is empty' : 'No tasks found'} text={search ? 'Try changing the search or filters.' : 'Create a task to get started.'} /> : layout === 'cards' ? <Box className="taskCards">{tasks.map(t => <TaskCard key={t.id} task={t} click={() => openTask(t)} />)}</Box> : <Paper className="taskTable"><Box className="taskHeader"><Checkbox checked={selected.length === tasks.length} onChange={e => setSelected(e.target.checked ? tasks.map(t => t.id) : [])} /><span>Task</span><span>Status</span><span>Priority</span><span>Progress</span><span>Due date</span><span /></Box>{tasks.map(t => <Box className="taskTableRow" key={t.id} style={{
        borderLeftColor: stateColor(visualState(t))
      }}><Checkbox checked={selected.includes(t.id)} onChange={e => setSelected(e.target.checked ? [...selected, t.id] : selected.filter(x => x !== t.id))} /><Box onClick={() => openTask(t)} className="taskTitle"><Typography fontWeight={700}>{t.title}</Typography><Typography variant="caption" color="text.secondary">{t.blockedReasons?.length ? `Blocked by ${t.blockedReasons.join(', ')}` : t.description || 'No description'}</Typography></Box><Chip size="small" label={labels[t.status]} color={t.status === 'completed' ? 'success' : t.status === 'blocked' ? 'default' : 'primary'} variant="outlined" /><Chip size="small" label={cap(t.priority)} color={priorityColor[t.priority]} /><Box><Stack direction="row" justifyContent="space-between"><Typography variant="caption">{t.calculatedProgress}%</Typography><Typography variant="caption" color="text.secondary">{t.checklist.filter(i => i.completed).length}/{t.checklist.length}</Typography></Stack><LinearProgress variant="determinate" value={t.calculatedProgress} color={progressColor(t)} sx={{
            height: 6,
            borderRadius: 3,
            minWidth: 110
          }} /></Box><Typography variant="body2" color={t.dueDate && t.dueDate < new Date().toISOString().slice(0, 10) ? 'error' : 'text.primary'}>{fmt(t.dueDate)}</Typography><Stack direction="row"><Tooltip title="Edit"><IconButton size="small" onClick={() => openTask(t)}><Edit fontSize="small" /></IconButton></Tooltip>{view === 'trash' ? <Tooltip title="Restore"><IconButton size="small" onClick={async () => {
              await API.tasks.restore(t.id);
              changed();
              notify('Task restored');
            }}><RestoreFromTrash /></IconButton></Tooltip> : <Tooltip title="Move to Trash"><IconButton size="small" onClick={()=>setPendingDelete(t)}><Delete fontSize="small" /></IconButton></Tooltip>}</Stack></Box>)}</Paper>}
    <Dialog open={Boolean(pendingDelete)} onClose={deleting?undefined:()=>setPendingDelete(null)}><DialogTitle>Move task to Trash?</DialogTitle><DialogContent><Typography>“{pendingDelete?.title}” will leave active views. Its dependency links will reactivate if the task is restored.</Typography></DialogContent><DialogActions><Button disabled={deleting} onClick={()=>setPendingDelete(null)}>Cancel</Button><Button color="error" variant="contained" disabled={deleting} onClick={async()=>{if(!pendingDelete)return;setDeleting(true);try{await API.tasks.remove(pendingDelete.id);setPendingDelete(null);changed();notify('Moved to Trash')}catch(error){notify(apiError(error).message,'error')}finally{setDeleting(false)}}}>{deleting?<CircularProgress size={20}/>:'Move to Trash'}</Button></DialogActions></Dialog>
  </>;
}
function TaskRow({
  task,
  click
}: {
  task: Task;
  click: () => void;
}) {
  return <Box className="attentionRow" onClick={click} sx={{
    borderLeftColor: stateColor(visualState(task))
  }}><Box sx={{
      minWidth: 0
    }}><Typography fontWeight={700} noWrap>{task.title}</Typography><Typography variant="caption" color="text.secondary">{task.dueDate ? `Due ${fmt(task.dueDate)}` : 'No due date'} • {labels[task.status]}</Typography></Box><Chip size="small" label={cap(task.priority)} color={priorityColor[task.priority]} /><Box sx={{
      width: 90
    }}><Typography variant="caption">{task.calculatedProgress}%</Typography><LinearProgress variant="determinate" value={task.calculatedProgress} color={progressColor(task)} /></Box></Box>;
}
function TaskCard({
  task,
  click
}: {
  task: Task;
  click: () => void;
}) {
  return <Card onClick={click} sx={{
    borderLeft: 4,
    borderLeftColor: stateColor(visualState(task)),
    cursor: 'pointer'
  }}><CardContent><Stack direction="row" justifyContent="space-between"><Chip size="small" label={cap(task.priority)} color={priorityColor[task.priority]} /><Typography variant="caption">{fmt(task.dueDate)}</Typography></Stack><Typography variant="h6" mt={1}>{task.title}</Typography><Typography color="text.secondary" variant="body2" className="lineClamp">{task.description || 'No description'}</Typography><LinearProgress variant="determinate" value={task.calculatedProgress} color={progressColor(task)} sx={{
        mt: 2,
        height: 7,
        borderRadius: 4
      }} /><Stack direction="row" justifyContent="space-between" mt={1}><Typography variant="caption">{labels[task.status]}</Typography><Typography variant="caption">{task.calculatedProgress}%</Typography></Stack></CardContent></Card>;
}
function QuickAdd({
  open,
  close,
  saved
}: {
  open: boolean;
  close: () => void;
  saved: (t: Task) => void;
}) {
  const [form, setForm] = useState(emptyTask()),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const submit = async () => {
    setBusy(true);setError('');
    try {
      const t = await API.tasks.save(form);
      setForm(emptyTask());
      saved(t);
    } catch (e) {
      setError(apiError(e).message);
    } finally {setBusy(false)}
  };
  return <Dialog open={open} onClose={busy?undefined:close} fullWidth maxWidth="sm"><DialogTitle>Quick add task</DialogTitle><DialogContent><Stack spacing={2} mt={1}>{error&&<Alert severity="error" onClose={()=>setError('')}>{error}</Alert>}<TextField autoFocus label="Task title" required value={form.title} onChange={e => setForm({
          ...form,
          title: e.target.value
        })} /><Stack direction="row" spacing={2}><TextField select fullWidth label="Priority" value={form.priority} onChange={e => setForm({
            ...form,
            priority: e.target.value as Priority
          })}>{['critical', 'high', 'medium', 'low', 'none'].map(x => <MenuItem key={x} value={x}>{cap(x)}</MenuItem>)}</TextField><TextField fullWidth type="date" label="Due date" InputLabelProps={{
            shrink: true
          }} value={form.dueDate || ''} onChange={e => setForm({
            ...form,
            dueDate: e.target.value
          })} /></Stack></Stack></DialogContent><DialogActions><Button disabled={busy} onClick={close}>Cancel</Button><Button variant="contained" disabled={!form.title.trim()||busy} onClick={submit}>{busy?<CircularProgress size={20}/>:`Save & add details`}</Button></DialogActions></Dialog>;
}
function TaskEditor({
  task,
  close,
  saved
}: {
  task: Task | Partial<Task> | null;
  close: () => void;
  saved: () => void;
}) {
  const [form, setForm] = useState<any>(null),
    [tab, setTab] = useState(0),
    [dirty, setDirty] = useState(false),
    [activities, setActivities] = useState<Activity[]>([]),
    [allTasks, setAllTasks] = useState<Task[]>([]);
  useEffect(() => {
    if (task) {
      setForm({
        ...emptyTask(),
        ...task,
        checklist: task.checklist || [],
        links: task.links || [],
        attachments: task.attachments || []
      });
      setDirty(false);
      setTab(0);
      API.tasks.list({
        pageSize: 500
      }).then(r => setAllTasks(r.items.filter(t => t.id !== task.id)));
      if (task.id) API.activities(task.id).then(setActivities);
    }
  }, [task]);
  if (!task || !form) return null;
  const change = (k: string, v: any) => {
    setForm({
      ...form,
      [k]: v
    });
    setDirty(true);
  };
  const dismiss = () => {
    if (!dirty || confirm('Discard unsaved changes?')) close();
  };
  const submit = async () => {
    try {
      await API.tasks.save(form);
      saved();
    } catch (e) {
      alert(String(e));
    }
  };
  const addStep = () => change('checklist', [...form.checklist, {
    id: crypto.randomUUID(),
    taskId: form.id || crypto.randomUUID(),
    description: '',
    completed: false,
    weight: 1,
    notes: '',
    position: form.checklist.length,
    required: true
  }]);
  const attach = async () => {
    const a = await API.files.addAttachment();
    if (a) change('attachments', [...form.attachments, a]);
  };
  return <Drawer anchor="right" open onClose={dismiss} PaperProps={{
    sx: {
      width: {
        xs: '100%',
        md: 760
      }
    }
  }}><Box sx={{
      p: 3,
      pb: 1
    }}><Stack direction="row" justifyContent="space-between" alignItems="start"><Box><Typography variant="h5">{form.id ? 'Task details' : 'New task'}</Typography><Typography variant="body2" color="text.secondary">{form.id ? `Updated ${new Date(form.updatedAt).toLocaleString()}` : 'Create a complete task record'}</Typography></Box><IconButton onClick={dismiss}><ChevronRight /></IconButton></Stack><TextField label="Task title" required fullWidth value={form.title} onChange={e => change('title', e.target.value)} sx={{
        mt: 2
      }} /><Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" sx={{
        mt: 2,
        borderBottom: 1,
        borderColor: 'divider'
      }}>{['Overview', 'Checklist', 'Dependencies', 'People', 'Notes & files', 'History'].map(x => <Tab key={x} label={x} />)}</Tabs></Box><Box sx={{
      p: 3,
      overflow: 'auto',
      flex: 1
    }}>{tab === 0 && <Stack spacing={2}><TextField label="Description" multiline minRows={3} value={form.description} onChange={e => change('description', e.target.value)} /><Stack direction="row" spacing={2}><TextField select fullWidth label="Status" value={form.status} onChange={e => change('status', e.target.value)}>{Object.entries(labels).map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}</TextField><TextField select fullWidth label="Priority" value={form.priority} onChange={e => change('priority', e.target.value)}>{['critical', 'high', 'medium', 'low', 'none'].map(x => <MenuItem key={x} value={x}>{cap(x)}</MenuItem>)}</TextField></Stack><Stack direction="row" spacing={2}><TextField fullWidth type="date" label="Start date" InputLabelProps={{
            shrink: true
          }} value={form.startDate || ''} onChange={e => change('startDate', e.target.value || null)} /><TextField fullWidth type="date" label="Due date" InputLabelProps={{
            shrink: true
          }} value={form.dueDate || ''} onChange={e => change('dueDate', e.target.value || null)} /><TextField fullWidth type="time" label="Due time" InputLabelProps={{
            shrink: true
          }} value={form.dueTime || ''} onChange={e => change('dueTime', e.target.value || null)} /></Stack><TextField select label="Progress mode" value={form.progressMode} onChange={e => change('progressMode', e.target.value)}><MenuItem value="automatic">Automatic — equal checklist steps</MenuItem><MenuItem value="weighted">Weighted checklist steps</MenuItem><MenuItem value="manual">Manual percentage</MenuItem></TextField>{form.progressMode === 'manual' && <TextField type="number" label="Manual progress (%)" value={form.manualProgress} inputProps={{
          min: 0,
          max: 100
        }} onChange={e => change('manualProgress', Number(e.target.value))} />}<Alert severity="info">Progress is always shown with a percentage and status. Aggregate progress uses equal weighting per task.</Alert><TextField label="Tags (comma separated)" value={(form.tags || []).join(', ')} onChange={e => change('tags', e.target.value.split(',').map(x => x.trim()).filter(Boolean))} /><ScheduleFields form={form} change={change} /></Stack>}{tab === 1 && <Stack spacing={2}><Stack direction="row" justifyContent="space-between"><Box><Typography variant="h6">What needs to be done</Typography><Typography color="text.secondary" variant="body2">{form.checklist.filter((x: any) => x.completed).length} of {form.checklist.length} steps completed</Typography></Box><Button startIcon={<Add />} onClick={addStep}>Add step</Button></Stack>{form.checklist.length === 0 ? <Empty icon={<TaskAlt />} title="No checklist steps" text="Add concrete actions to calculate progress automatically." /> : form.checklist.map((c: any, i: number) => <Paper key={c.id} variant="outlined" sx={{
          p: 1.5
        }}><Stack direction="row" spacing={1} alignItems="center"><Checkbox checked={c.completed} onChange={e => {
              const next = [...form.checklist];
              next[i] = {
                ...c,
                completed: e.target.checked
              };
              change('checklist', next);
            }} /><TextField fullWidth size="small" label={`Step ${i + 1}`} value={c.description} onChange={e => {
              const next = [...form.checklist];
              next[i] = {
                ...c,
                description: e.target.value
              };
              change('checklist', next);
            }} /><TextField size="small" type="number" label="Weight" sx={{
              width: 100
            }} value={c.weight} onChange={e => {
              const next = [...form.checklist];
              next[i] = {
                ...c,
                weight: Number(e.target.value)
              };
              change('checklist', next);
            }} /><IconButton onClick={() => change('checklist', form.checklist.filter((_: any, j: number) => j !== i))}><Delete /></IconButton></Stack></Paper>)}</Stack>}{tab === 2 && <Stack spacing={2}><Typography variant="h6">Linked tasks and dependencies</Typography>{form.blockedReasons?.length > 0 && <Alert severity="warning">Blocked by: {form.blockedReasons.join(', ')}</Alert>}<TextField select label="Add prerequisite" value="" onChange={e => {
          const t = allTasks.find(x => x.id === e.target.value);
          if (t) change('links', [...form.links, {
            id: crypto.randomUUID(),
            fromTaskId: form.id || crypto.randomUUID(),
            toTaskId: t.id,
            type: 'blocked_by',
            mandatory: true
          }]);
        }}><MenuItem value="">Select a task…</MenuItem>{allTasks.map(t => <MenuItem key={t.id} value={t.id}>{t.title} • {labels[t.status]} • {fmt(t.dueDate)}</MenuItem>)}</TextField>{form.links.map((l: any, i: number) => {
          const t = allTasks.find(x => x.id === l.toTaskId);
          return <Paper key={l.id} variant="outlined" sx={{
            p: 2
          }}><Stack direction="row" alignItems="center" spacing={2}><LinkIcon color="action" /><Box flex={1}><Typography fontWeight={700}>{t?.title || 'Linked task'}</Typography><Typography variant="caption">{l.type.replace('_', ' ')} • {l.mandatory ? 'Mandatory' : 'Informational'}</Typography></Box><IconButton onClick={() => change('links', form.links.filter((_: any, j: number) => j !== i))}><Delete /></IconButton></Stack></Paper>;
        })}<Alert severity="info">Self-dependencies and direct or indirect cycles are rejected when you save.</Alert></Stack>}{tab === 3 && <PeopleAssignment value={form.responsiblePersonId || ''} change={v => change('responsiblePersonId', v || null)} />} {tab === 4 && <Stack spacing={2}><TextField multiline minRows={8} label="Notes" value={form.notes} onChange={e => change('notes', e.target.value)} /><Button startIcon={<AttachFile />} onClick={attach} sx={{
          alignSelf: 'start'
        }}>Attach local file reference</Button>{form.attachments.map((a: any, i: number) => <Paper variant="outlined" key={a.id} sx={{
          p: 1.5
        }}><Stack direction="row" alignItems="center"><AttachFile /><Box sx={{
              ml: 1,
              flex: 1
            }}><Typography fontWeight={650}>{a.name}</Typography><Typography variant="caption" color="text.secondary">{a.path}</Typography></Box><IconButton onClick={() => API.files.open(a.path)}><OpenInNew /></IconButton><IconButton onClick={() => change('attachments', form.attachments.filter((_: any, j: number) => j !== i))}><Delete /></IconButton></Stack></Paper>)}</Stack>}{tab === 5 && <Stack spacing={1}>{activities.length ? activities.map(a => <Paper variant="outlined" key={a.id} sx={{
          p: 1.5
        }}><Typography fontWeight={650}>{a.summary}</Typography><Typography variant="caption" color="text.secondary">{new Date(a.createdAt).toLocaleString()} • {a.action}</Typography></Paper>) : <Empty icon={<MoreTime />} title="No history yet" text="Changes will appear after the task is saved." />}</Stack>}</Box><Box sx={{
      p: 2,
      borderTop: 1,
      borderColor: 'divider'
    }}><Stack direction="row" justifyContent="space-between"><Box>{form.id && <Button color="error" startIcon={<Delete />} onClick={async () => {
            if (confirm(`Move “${form.title}” to Trash?`)) {
              await API.tasks.remove(form.id);
              saved();
            }
          }}>Move to Trash</Button>}</Box><Stack direction="row" spacing={1}><Button onClick={dismiss}>Cancel</Button><Button variant="contained" disabled={!form.title.trim()} onClick={submit}>Save task</Button></Stack></Stack></Box></Drawer>;
}
type ConfirmModel={title:string;message:string;confirmLabel:string;danger?:boolean;run:()=>Promise<void>|void};
function apiError(error:unknown):{message:string;code?:string;details?:CompletionBlockers}{
  const text=String(error),marker='PD_ERROR:',at=text.indexOf(marker);
  if(at>=0)try{const value=JSON.parse(text.slice(at+marker.length));return{message:value.message||text,code:value.code,details:value.details}}catch{}
  return{message:text.replace(/^Error:\s*/,'')};
}
const prerequisiteDraft=(task:Partial<Task>,title='')=>({title,description:'',priority:'medium' as Priority,dueDate:null as string|null,projectId:task.projectId||null,responsiblePersonId:null as string|null,mandatory:true});

function TaskEditorV2({task,initialTab,close,saved,navigate}:{task:Task|Partial<Task>|null;initialTab:number;close:()=>void;saved:()=>void;navigate:(id:string,tab?:number)=>Promise<void>}){
  const[form,setForm]=useState<any>(null),[tab,setTab]=useState(initialTab),[dirty,setDirty]=useState(false),[activities,setActivities]=useState<Activity[]>([]),[projects,setProjects]=useState<Project[]>([]),[people,setPeople]=useState<PersonType[]>([]),[linked,setLinked]=useState<Record<string,Task>>({}),[candidateSearch,setCandidateSearch]=useState(''),[candidates,setCandidates]=useState<PrerequisiteCandidate[]>([]),[candidateLoading,setCandidateLoading]=useState(false),[operation,setOperation]=useState(''),[error,setError]=useState(''),[completion,setCompletion]=useState<CompletionBlockers|null>(null),[confirm,setConfirm]=useState<ConfirmModel|null>(null),[create,setCreate]=useState<any>(null),[convert,setConvert]=useState<{itemId:string;draft:any}|null>(null);
  useEffect(()=>{if(!task)return;setForm({...emptyTask(),...task,checklist:task.checklist||[],links:task.links||[],attachments:task.attachments||[]});setTab(initialTab);setDirty(false);setError('');setCompletion(null);setCreate(null);setConvert(null);API.projects.list().then(setProjects);API.people.list().then(setPeople);if(task.id)API.activities(task.id).then(setActivities)},[task,initialTab]);
  useEffect(()=>{if(!form?.id)return;const ids=(form.links||[]).map((link:any)=>link.toTaskId);Promise.all(ids.map((id:string)=>API.tasks.get(id).catch(()=>null))).then(items=>setLinked(Object.fromEntries(items.filter(Boolean).map(item=>[(item as Task).id,item as Task]))))},[form?.id,form?.links?.length]);
  useEffect(()=>{if(tab!==2||!form?.id)return;let active=true;setCandidateLoading(true);const timer=setTimeout(()=>API.tasks.candidates({taskId:form.id,search:candidateSearch,pageSize:25}).then(page=>{if(active)setCandidates(page.items)}).catch(e=>setError(apiError(e).message)).finally(()=>{if(active)setCandidateLoading(false)}),250);return()=>{active=false;clearTimeout(timer)}},[tab,form?.id,candidateSearch]);
  if(!task||!form)return null;
  const change=(key:string,value:any)=>{setForm((current:any)=>({...current,[key]:value}));setDirty(true)};
  const dismiss=()=>dirty?setConfirm({title:'Discard unsaved changes?',message:'Your changes to this task will be lost.',confirmLabel:'Discard',danger:true,run:close}):close();
  const submit=async()=>{setOperation('save');setError('');try{const result=await API.tasks.save(form);setForm(result);setDirty(false);saved()}catch(e){const parsed=apiError(e);setError(parsed.message);if(parsed.code==='TASK_COMPLETION_BLOCKED'&&parsed.details)setCompletion(parsed.details)}finally{setOperation('')}};
  const saveAndContinue=async()=>{setOperation('save');try{const result=await API.tasks.save(form);setForm(result);setDirty(false);history.replaceState(null,'',`#task=${result.id}&tab=2`)}catch(e){setError(apiError(e).message)}finally{setOperation('')}};
  const createPrerequisite=async(draft:any,conversion?:string)=>{if(!form.id)return;setOperation(conversion?'convert':'create-prerequisite');setError('');try{const payload={waitingTaskId:form.id,task:{title:draft.title,description:draft.description,priority:draft.priority,dueDate:draft.dueDate||null,projectId:draft.projectId||null,responsiblePersonId:draft.responsiblePersonId||null},mandatory:Boolean(draft.mandatory)};const result=conversion?await API.tasks.convertChecklist({...payload,checklistItemId:conversion}):await API.tasks.createPrerequisite(payload);setForm(result.waitingTask);setLinked(current=>({...current,[result.prerequisite.id]:result.prerequisite}));setDirty(false);setCreate(null);setConvert(null)}catch(e){setError(apiError(e).message)}finally{setOperation('')}};
  const addLink=(candidate:PrerequisiteCandidate|null)=>{if(!candidate||form.links.some((link:any)=>link.toTaskId===candidate.id))return;change('links',[...form.links,{id:crypto.randomUUID(),fromTaskId:form.id,toTaskId:candidate.id,type:'blocked_by',mandatory:true}]);setLinked(current=>({...current,[candidate.id]:candidate as unknown as Task}))};
  const updateChecklist=(index:number,patch:any)=>{const next=[...form.checklist];next[index]={...next[index],...patch};change('checklist',next)};
return <><Drawer anchor="right" open ModalProps={{keepMounted:false,disableEnforceFocus:Boolean(confirm||completion)}} onClose={dismiss} PaperProps={{sx:{width:{xs:'100%',md:800},top:'64px',height:'calc(100% - 64px)'}}}>
    <Box sx={{p:3,pb:1}}><Stack direction="row" justifyContent="space-between"><Box><Typography variant="h5">{form.id?'Task details':'New task'}</Typography><Typography variant="body2" color="text.secondary">{form.id?`Updated ${new Date(form.updatedAt).toLocaleString()}`:'Create a complete task record'}</Typography></Box><IconButton aria-label="Close task editor" onClick={dismiss}><ChevronRight/></IconButton></Stack><TextField label="Task title" required fullWidth value={form.title} onChange={e=>change('title',e.target.value)} sx={{mt:2}}/><Tabs value={tab} onChange={(_,value)=>setTab(value)} variant="scrollable" sx={{mt:2,borderBottom:1,borderColor:'divider'}}>{['Overview','Checklist','Dependencies','People','Notes & files','History'].map(label=><Tab key={label} label={label}/>)}</Tabs></Box>
    <Box sx={{p:3,overflow:'auto',flex:1}}>{error&&<Alert severity="error" sx={{mb:2}} onClose={()=>setError('')}>{error}</Alert>}
      {tab===0&&<Stack spacing={2}><TextField label="Description" multiline minRows={3} value={form.description} onChange={e=>change('description',e.target.value)}/><TextField select label="Project" value={form.projectId||''} onChange={e=>change('projectId',e.target.value||null)}><MenuItem value="">No project</MenuItem>{projects.filter(p=>!p.archived).map(p=><MenuItem value={p.id} key={p.id}>{p.name}</MenuItem>)}</TextField><Stack direction={{xs:'column',sm:'row'}} spacing={2}><TextField select fullWidth label="Status" value={form.status} onChange={e=>change('status',e.target.value)}>{Object.entries(labels).map(([value,label])=><MenuItem value={value} key={value}>{label}</MenuItem>)}</TextField><TextField select fullWidth label="Priority" value={form.priority} onChange={e=>change('priority',e.target.value)}>{['critical','high','medium','low','none'].map(value=><MenuItem value={value} key={value}>{cap(value)}</MenuItem>)}</TextField></Stack><Stack direction={{xs:'column',sm:'row'}} spacing={2}><TextField fullWidth type="date" label="Start date" InputLabelProps={{shrink:true}} value={form.startDate||''} onChange={e=>change('startDate',e.target.value||null)}/><TextField fullWidth type="date" label="Due date" InputLabelProps={{shrink:true}} value={form.dueDate||''} onChange={e=>change('dueDate',e.target.value||null)}/><TextField fullWidth type="time" label="Due time" InputLabelProps={{shrink:true}} value={form.dueTime||''} onChange={e=>change('dueTime',e.target.value||null)}/></Stack><TextField select label="Progress mode" value={form.progressMode} onChange={e=>change('progressMode',e.target.value)}><MenuItem value="automatic">Automatic — equal checklist steps</MenuItem><MenuItem value="weighted">Weighted checklist steps</MenuItem><MenuItem value="manual">Manual percentage</MenuItem></TextField>{form.progressMode==='manual'&&<TextField type="number" label="Manual progress (%)" value={form.manualProgress} onChange={e=>change('manualProgress',Number(e.target.value))}/>}<TextField label="Tags (comma separated)" value={(form.tags||[]).join(', ')} onChange={e=>change('tags',e.target.value.split(',').map((x:string)=>x.trim()).filter(Boolean))}/><ScheduleFields form={form} change={change}/></Stack>}
      {tab===1&&<Stack spacing={2}><Alert severity="info">Use checklist items for steps performed within this task. Create a prerequisite task when the work needs its own owner, due date, reminder, history, or must block other tasks.</Alert><Stack direction="row" justifyContent="space-between"><Box><Typography variant="h6">Checklist steps</Typography><Typography variant="body2" color="text.secondary">{form.checklist.filter((x:any)=>x.completed).length} of {form.checklist.length} completed</Typography></Box><Button startIcon={<Add/>} onClick={()=>change('checklist',[...form.checklist,{id:crypto.randomUUID(),taskId:form.id||crypto.randomUUID(),description:'',completed:false,weight:1,notes:'',position:form.checklist.length,required:true}])}>Add step</Button></Stack>{form.checklist.length===0?<Empty icon={<TaskAlt/>} title="No checklist steps" text="Add small steps that belong inside this task."/>:form.checklist.map((item:any,index:number)=><Paper key={item.id} variant="outlined" sx={{p:1.5}}><Stack spacing={1}><Stack direction={{xs:'column',sm:'row'}} spacing={1} alignItems={{sm:'center'}}><Checkbox checked={item.completed} onChange={e=>updateChecklist(index,{completed:e.target.checked})}/><TextField fullWidth size="small" label={`Step ${index+1}`} value={item.description} onChange={e=>updateChecklist(index,{description:e.target.value})}/><TextField size="small" type="number" label="Weight" sx={{width:100}} value={item.weight} onChange={e=>updateChecklist(index,{weight:Number(e.target.value)})}/><IconButton aria-label="Delete checklist item" onClick={()=>change('checklist',form.checklist.filter((_:any,i:number)=>i!==index))}><Delete/></IconButton></Stack><Stack direction="row" justifyContent="space-between" alignItems="center"><FormControlLabel control={<Checkbox checked={item.required!==false} onChange={e=>updateChecklist(index,{required:e.target.checked})}/>} label="Required to complete"/><Button size="small" startIcon={<SwapHoriz/>} disabled={!form.id||dirty} onClick={()=>setConvert({itemId:item.id,draft:prerequisiteDraft(form,item.description)})}>Convert to prerequisite task</Button></Stack>{convert?.itemId===item.id&&<PrerequisiteForm draft={convert!.draft} setDraft={draft=>setConvert(current=>current?{...current,draft}:current)} people={people} projects={projects} busy={operation==='convert'} actionLabel="Convert and link" cancel={()=>setConvert(null)} submit={()=>{if(convert)void createPrerequisite(convert.draft,item.id)}}/>}</Stack></Paper>)}</Stack>}
      {tab===2&&<Stack spacing={2}><Alert severity="info"><strong>Checklist or prerequisite?</strong><br/>A checklist item is a step inside this task. A prerequisite is an independently managed task with its own owner, due date, reminder and history that can block this task and populate Dependency load by person.</Alert>{form.blockedReasons?.length>0&&<Alert severity="warning">This task is blocked by: {form.blockedReasons.join(', ')}</Alert>}{!form.id?<Alert severity="warning" action={<Button size="small" disabled={operation==='save'||!form.title.trim()} onClick={saveAndContinue}>Save and continue</Button>}>Save this task before adding a prerequisite.</Alert>:<><Stack direction="row" spacing={1}><Button variant="outlined" startIcon={<LinkIcon/>} onClick={()=>setCreate(null)}>Link existing task</Button><Button variant="contained" startIcon={<Add/>} onClick={()=>setCreate(prerequisiteDraft(form))}>Create new prerequisite</Button></Stack><Autocomplete options={candidates} loading={candidateLoading} getOptionLabel={option=>option.title} filterOptions={options=>options} onInputChange={(_,value)=>setCandidateSearch(value)} onChange={(_,value)=>addLink(value)} renderInput={params=><TextField {...params} label="Search existing tasks" helperText="Only matching active tasks are loaded; circular dependencies are rejected when you save."/>}/>{create&&<PrerequisiteForm draft={create} setDraft={setCreate} people={people} projects={projects} busy={operation==='create-prerequisite'} actionLabel="Create and link" cancel={()=>setCreate(null)} submit={()=>createPrerequisite(create)}/>}</>}{form.links.length===0&&<Alert severity="success">No active prerequisites: this task can proceed independently.</Alert>}{form.links.map((link:any,index:number)=>{const target=linked[link.toTaskId];if(!target)return null;return <Paper key={link.id} variant="outlined" sx={{p:2,borderLeft:4,borderLeftColor:'primary.main'}}><Stack direction="row" spacing={2} alignItems="center"><LinkIcon color="primary"/><Box flex={1}><Typography variant="overline" color="primary">PREREQUISITE — COMPLETE FIRST</Typography><Typography fontWeight={750}>{target.title}</Typography><Typography variant="caption" color="text.secondary">{link.mandatory?'Mandatory — blocks completion':'Optional relationship'}</Typography></Box><FormControlLabel control={<Checkbox checked={link.mandatory} onChange={e=>{const next=[...form.links];next[index]={...link,mandatory:e.target.checked};change('links',next)}}/>} label="Mandatory"/><IconButton aria-label={`Remove prerequisite ${target.title}`} onClick={()=>change('links',form.links.filter((_:any,i:number)=>i!==index))}><Delete/></IconButton></Stack></Paper>})}</Stack>}
      {tab===3&&<PeopleAssignment value={form.responsiblePersonId||''} change={value=>change('responsiblePersonId',value||null)}/>}
      {tab===4&&<Stack spacing={2}><TextField multiline minRows={8} label="Notes" value={form.notes} onChange={e=>change('notes',e.target.value)}/><Button startIcon={<AttachFile/>} onClick={async()=>{const file=await API.files.addAttachment();if(file)change('attachments',[...form.attachments,file])}} sx={{alignSelf:'start'}}>Attach local file reference</Button>{form.attachments.map((attachment:any,index:number)=><Paper key={attachment.id} variant="outlined" sx={{p:1.5}}><Stack direction="row" alignItems="center"><AttachFile/><Box ml={1} flex={1}><Typography fontWeight={650}>{attachment.name}</Typography><Typography variant="caption" color="text.secondary">Local file reference</Typography></Box><IconButton onClick={()=>API.files.open(attachment.path)}><OpenInNew/></IconButton><IconButton onClick={()=>change('attachments',form.attachments.filter((_:any,i:number)=>i!==index))}><Delete/></IconButton></Stack></Paper>)}</Stack>}
      {tab===5&&<Stack spacing={1}>{activities.length?activities.map(activity=><Paper key={activity.id} variant="outlined" sx={{p:1.5}}><Typography fontWeight={650}>{activity.summary}</Typography><Typography variant="caption" color="text.secondary">{new Date(activity.createdAt).toLocaleString()} • {activity.action}</Typography></Paper>):<Empty icon={<MoreTime/>} title="No history yet" text="Changes appear after the task is saved."/>}</Stack>}
    </Box>
    <Box sx={{p:2,borderTop:1,borderColor:'divider'}}><Stack direction="row" justifyContent="space-between"><Box>{form.id&&<Button color="error" startIcon={<Delete/>} disabled={Boolean(operation)} onClick={()=>setConfirm({
      title:'Move task to Trash?',
      message:'Active dependency links will be suspended and restored if this task is restored.',
      confirmLabel:'Move to Trash',
      danger:true,
      run:async()=>{
        setOperation('delete');
        try{await API.tasks.remove(form.id);saved()}
        catch(e){setError(apiError(e).message)}
        finally{setOperation('')}
      }
    })}>Move to Trash</Button>}</Box><Stack direction="row" spacing={1}><Button onClick={dismiss}>Cancel</Button><Button variant="contained" disabled={!form.title.trim()||Boolean(operation)} onClick={submit}>{operation==='save'?<CircularProgress size={20}/>:dirty?'Save task':'Saved'}</Button></Stack></Stack></Box>
  </Drawer>
  <Dialog open={!!confirm} onClose={()=>setConfirm(null)}><DialogTitle>{confirm?.title}</DialogTitle><DialogContent><Typography>{confirm?.message}</Typography></DialogContent><DialogActions><Button onClick={()=>setConfirm(null)}>Cancel</Button><Button color={confirm?.danger?'error':'primary'} variant="contained" onClick={async()=>{const action=confirm?.run;setConfirm(null);await action?.()}}>{confirm?.confirmLabel}</Button></DialogActions></Dialog>
  <Dialog open={!!completion} onClose={()=>setCompletion(null)} fullWidth maxWidth="sm"><DialogTitle>Task cannot be completed</DialogTitle><DialogContent><Alert severity="warning">{completion?.incompleteRequiredChecklist||0} required checklist step(s) and {completion?.activeMandatoryPrerequisites||0} mandatory prerequisite(s) remain incomplete.</Alert>{completion?.prerequisites.map(item=><Button key={item.id} onClick={()=>{setCompletion(null);void navigate(item.id,2)}}>{item.title}</Button>)}</DialogContent><DialogActions><Button onClick={()=>setCompletion(null)}>Return to task</Button>{Boolean(completion?.incompleteRequiredChecklist)&&<Button onClick={()=>{setCompletion(null);setTab(1)}}>Open Checklist</Button>}{Boolean(completion?.activeMandatoryPrerequisites)&&<Button onClick={()=>{setCompletion(null);setTab(2)}}>Open Dependencies</Button>}</DialogActions></Dialog>
  </>;
}

function PrerequisiteForm({draft,setDraft,people,projects,busy,actionLabel,cancel,submit}:{draft:any;setDraft:(draft:any)=>void;people:PersonType[];projects:Project[];busy:boolean;actionLabel:string;cancel:()=>void;submit:()=>void}){
  return <Paper variant="outlined" sx={{p:2,bgcolor:'action.hover'}}><Stack spacing={2}><Typography fontWeight={750}>Prerequisite task</Typography><TextField autoFocus label="Title" required value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/><TextField label="Description" multiline minRows={2} value={draft.description} onChange={e=>setDraft({...draft,description:e.target.value})}/><Stack direction={{xs:'column',sm:'row'}} spacing={2}><TextField select fullWidth label="Responsible person" value={draft.responsiblePersonId||''} onChange={e=>setDraft({...draft,responsiblePersonId:e.target.value||null})}><MenuItem value="">Unassigned</MenuItem>{people.map(person=><MenuItem value={person.id} key={person.id}>{person.fullName}</MenuItem>)}</TextField><TextField select fullWidth label="Project" value={draft.projectId||''} onChange={e=>setDraft({...draft,projectId:e.target.value||null})}><MenuItem value="">No project</MenuItem>{projects.filter(project=>!project.archived).map(project=><MenuItem value={project.id} key={project.id}>{project.name}</MenuItem>)}</TextField></Stack><Stack direction={{xs:'column',sm:'row'}} spacing={2}><TextField type="date" fullWidth label="Due date" InputLabelProps={{shrink:true}} value={draft.dueDate||''} onChange={e=>setDraft({...draft,dueDate:e.target.value||null})}/><TextField select fullWidth label="Priority" value={draft.priority} onChange={e=>setDraft({...draft,priority:e.target.value})}>{['critical','high','medium','low','none'].map(value=><MenuItem value={value} key={value}>{cap(value)}</MenuItem>)}</TextField></Stack><FormControlLabel control={<Checkbox checked={draft.mandatory} onChange={e=>setDraft({...draft,mandatory:e.target.checked})}/>} label="Mandatory — blocks completion"/><Stack direction="row" justifyContent="end" spacing={1}><Button onClick={cancel}>Cancel</Button><Button variant="contained" disabled={busy||!draft.title.trim()} onClick={submit}>{busy?<CircularProgress size={20}/>:actionLabel}</Button></Stack></Stack></Paper>;
}

function PeopleAssignment({
  value,
  change
}: {
  value: string;
  change: (s: string) => void;
}) {
  const [people, setPeople] = useState<PersonType[]>([]);
  useEffect(() => {
    API.people.list().then(setPeople);
  }, []);
  return <Stack spacing={2}><Typography variant="h6">Responsible person</Typography><TextField select label="Responsible person" value={value} onChange={e => change(e.target.value)}><MenuItem value="">Unassigned</MenuItem>{people.map(p => <MenuItem key={p.id} value={p.id}>{p.fullName}{p.company ? ` • ${p.company}` : ''}</MenuItem>)}</TextField><Alert severity="info">Create and manage reusable contacts from the People section. Contact details are stored locally.</Alert></Stack>;
}
function ScheduleFields({
  form,
  change
}: {
  form: any;
  change: (key: string, value: any) => void;
}) {
  const recurrence = form.recurrence || null;
  return <Paper variant="outlined" sx={{
    p: 2
  }}><Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.5}><Typography fontWeight={750}>Reminder and recurrence</Typography>{(form.reminder||form.recurrence)&&<Button size="small" onClick={()=>{change('reminder',null);change('recurrence',null)}}>Clear reminder and recurrence</Button>}</Stack><Stack direction={{xs:'column',md:'row'}} spacing={2}><TextField fullWidth type="datetime-local" label="Reminder date and time" InputLabelProps={{
        shrink: true
      }} value={form.reminder?.at?.slice(0, 16) || ''} onChange={e => change('reminder', e.target.value ? {
        id: form.reminder?.id || crypto.randomUUID(),
        at: e.target.value,
        repeatOverdue: false,
        fired: false
      } : null)} /><TextField select fullWidth label="Repeat" value={recurrence?.frequency || 'none'} onChange={e => change('recurrence', e.target.value === 'none' ? null : {
        frequency: e.target.value,
        interval: 1,
        generation: 'completion'
      })}><MenuItem value="none">Does not repeat</MenuItem><MenuItem value="daily">Daily</MenuItem><MenuItem value="weekdays">Weekdays</MenuItem><MenuItem value="weekly">Weekly</MenuItem><MenuItem value="monthly">Monthly</MenuItem><MenuItem value="yearly">Yearly</MenuItem><MenuItem value="custom">Custom days</MenuItem></TextField>{recurrence && <TextField type="number" label="Interval" sx={{
        width: 130
      }} value={recurrence.interval || 1} inputProps={{
        min: 1,
        max: 365
      }} onChange={e => change('recurrence', {
        ...recurrence,
        interval: Number(e.target.value)
      })} />}</Stack>{recurrence && <Typography variant="caption" color="text.secondary">The next occurrence is generated after this task is completed, preserving its project, contacts, priority, notes, checklist structure, and reminder pattern.</Typography>}</Paper>;
}
const isoLocal=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const calendarColors={red:'#dc2626',orange:'#ea580c',blue:'#2563eb',green:'#16a34a',neutral:'#cbd5e1'};
function monthCells(month:Date){const first=new Date(month.getFullYear(),month.getMonth(),1),start=new Date(first),offset=(first.getDay()+6)%7;start.setDate(first.getDate()-offset);return Array.from({length:42},(_,index)=>{const date=new Date(start);date.setDate(start.getDate()+index);return date})}
function CalendarView({refresh,initialDate,openTask,createTask}:{refresh:number;initialDate?:string;openTask:(id:string,tab?:number,date?:string)=>void;createTask:(date:string)=>void}){
  const initial=initialDate?new Date(`${initialDate}T12:00:00`):new Date(),[month,setMonth]=useState(new Date(initial.getFullYear(),initial.getMonth(),1)),[data,setData]=useState<CalendarRange|null>(null),[selected,setSelected]=useState<CalendarDay|null>(null),[error,setError]=useState('');
  const consumedInitialDate=useRef<string|undefined>(undefined);
  const cells=useMemo(()=>monthCells(month),[month]),start=isoLocal(cells[0]),end=isoLocal(cells[41]),map=useMemo(()=>new Map(data?.days.map(day=>[day.date,day])||[]),[data]);
  useEffect(()=>{setError('');API.calendar.range(start,end).then(setData).catch(e=>setError(apiError(e).message))},[start,end,refresh]);
  useEffect(()=>{if(initialDate&&data&&consumedInitialDate.current!==initialDate){consumedInitialDate.current=initialDate;const day=map.get(initialDate);if(day)setSelected(day)}if(!initialDate)consumedInitialDate.current=undefined},[initialDate,data,map]);
  const select=(date:string)=>setSelected(map.get(date)||{date,severity:'neutral',counts:{total:0,overdue:0,critical:0,high:0,completed:0},tasks:[]});
  return <><PageHead title="Calendar" subtitle="Due dates, reminders and completion dates. Project start dates are intentionally excluded." action={<Stack direction="row" spacing={1}><Button onClick={()=>{const now=new Date();setMonth(new Date(now.getFullYear(),now.getMonth(),1));select(isoLocal(now))}}>Today</Button><IconButton aria-label="Previous month" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()-1,1))}><ChevronLeft/></IconButton><Button>{month.toLocaleDateString(undefined,{month:'long',year:'numeric'})}</Button><IconButton aria-label="Next month" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()+1,1))}><ChevronRight/></IconButton></Stack>}/><Paper sx={{p:1.5,mb:2}}><Stack direction="row" flexWrap="wrap" gap={2}>{Object.entries({red:'Overdue or critical',orange:'High priority',blue:'Scheduled',green:'Completed only',neutral:'No tasks'}).map(([color,label])=><Stack direction="row" gap={.7} alignItems="center" key={color}><Box sx={{width:12,height:12,borderRadius:'50%',bgcolor:(calendarColors as any)[color]}}/><Typography variant="caption">{label}</Typography></Stack>)}</Stack></Paper>{error&&<Alert severity="error">{error}</Alert>}{!data?<Loading/>:<Paper className="calendar"><Box className="calendarWeekdays">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(day=><Typography variant="caption" fontWeight={750} key={day}>{day}</Typography>)}</Box><Box className="calendarGrid">{cells.map(date=>{const key=isoLocal(date),day=map.get(key),muted=date.getMonth()!==month.getMonth();return <Box component="button" type="button" key={key} className={`calendarDay ${muted?'muted':''} ${key===isoLocal(new Date())?'today':''} ${selected?.date===key?'selected':''}`} onClick={()=>select(key)} aria-label={`${date.toLocaleDateString()}, ${day?.counts.total||0} tasks`}><Stack direction="row" justifyContent="space-between"><Typography fontWeight={650}>{date.getDate()}</Typography>{Boolean(day?.counts.total)&&<Chip size="small" label={day?.counts.total}/>}</Stack><Box className="calendarStatus" sx={{bgcolor:(calendarColors as any)[day?.severity||'neutral']}}/><Typography variant="caption">{day?.counts.overdue?`${day.counts.overdue} overdue`:day?.counts.critical?`${day.counts.critical} critical`:day?.counts.high?`${day.counts.high} high`:day?.counts.completed===day?.counts.total&&day?.counts.total?'Completed':day?.counts.total?'Scheduled':'No tasks'}</Typography></Box>})}</Box></Paper>}
    <Dialog open={!!selected} onClose={()=>setSelected(null)} fullWidth maxWidth="md"><DialogTitle><Stack direction="row" justifyContent="space-between" alignItems="center"><Box><Typography variant="h6">{selected&&new Date(`${selected.date}T12:00:00`).toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</Typography><Typography variant="body2" color="text.secondary">{selected?.counts.total||0} task(s)</Typography></Box><Button variant="contained" startIcon={<Add/>} onClick={()=>{const date=selected!.date;setSelected(null);createTask(date)}}>New task on this day</Button></Stack></DialogTitle><DialogContent dividers><Stack spacing={1.5}>{selected?.tasks.length?selected.tasks.map(item=><Paper key={item.task.id} variant="outlined" role="button" tabIndex={0} onClick={()=>{const date=selected.date;setSelected(null);openTask(item.task.id,item.reasons.includes('completed')?5:0,date)}} sx={{p:2,cursor:'pointer',borderLeft:5,borderLeftColor:(calendarColors as any)[item.severity]}}><Stack direction="row" justifyContent="space-between"><Box><Typography fontWeight={750}>{item.task.title}</Typography><Typography variant="body2" color="text.secondary">{item.projectName} • {item.responsiblePersonName}{item.relevantTime?` • ${item.relevantTime}`:''}</Typography></Box><Stack direction="row" gap={.5} flexWrap="wrap">{item.reasons.map(reason=><Chip size="small" label={cap(reason)} key={reason}/>)}
      {item.blocked&&<Chip size="small" label="Blocked"/>}{item.overdue&&<Chip size="small" color="error" label="Overdue"/>}</Stack></Stack></Paper>):<Empty icon={<Event/>} title="Nothing scheduled" text="Create a task for this date using the button above."/>}</Stack></DialogContent></Dialog></>;
}

function DependencyLoadView({refresh,openTask}:{refresh:number;openTask:(id:string,tab?:number)=>void}){
  const[data,setData]=useState<BottleneckAnalysis|null>(null),[search,setSearch]=useState(''),[selected,setSelected]=useState<BottleneckAnalysis['people'][number]|null>(null),[error,setError]=useState('');
  useEffect(()=>{API.bottlenecks().then(setData).catch(e=>setError(apiError(e).message))},[refresh]);const rows=(data?.people||[]).filter(row=>row.personName.toLowerCase().includes(search.toLowerCase()));
  return <><PageHead title="Dependency load by person" subtitle="Shows responsibility impact without labelling people negatively."/><Paper sx={{p:1.5,mb:2}}><TextField size="small" fullWidth value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search people…" InputProps={{startAdornment:<InputAdornment position="start"><Search/></InputAdornment>}}/></Paper>{error&&<Alert severity="error">{error}</Alert>}{!data?<Loading/>:rows.length===0?<Empty icon={<Groups/>} title="No dependency load" text="Create an incomplete mandatory prerequisite and assign its responsible person."/>:<Paper className="dependencyTable"><Box className="dependencyHeader"><span>Person</span><span>Prerequisites</span><span>Affected tasks</span><span>Projects</span><span>Overdue</span><span>Critical/high</span><span>Impact score</span></Box>{rows.map(row=><Box className="dependencyRow" key={row.personId||'unassigned'} role="button" tabIndex={0} onClick={()=>setSelected(row)}><strong>{row.personName}</strong><span>{row.blockingPrerequisites}</span><span>{row.affectedTasks}</span><span>{row.affectedProjects}</span><span>{row.overduePrerequisites}</span><span>{row.criticalHighImpact}</span><Tooltip title={data.formula}><Chip color="primary" label={row.impactScore}/></Tooltip></Box>)}</Paper>}
    <Drawer anchor="right" open={!!selected} onClose={()=>setSelected(null)} PaperProps={{sx:{width:{xs:'100%',md:760},top:'64px',height:'calc(100% - 64px)'}}}><Box sx={{p:3}}><Stack direction="row" justifyContent="space-between"><Box><Typography variant="h5">{selected?.personName}</Typography><Typography color="text.secondary">Dependency impact details</Typography></Box><IconButton onClick={()=>setSelected(null)}><ChevronRight/></IconButton></Stack><Stack spacing={1.5} mt={3}>{selected?.relationships.map((relationship,index)=><Paper variant="outlined" sx={{p:2}} key={`${relationship.prerequisite.id}-${relationship.affectedTask.id}-${index}`}><Stack direction="row" justifyContent="space-between"><Box><Button onClick={()=>{setSelected(null);openTask(relationship.prerequisite.id,2)}}>{relationship.prerequisite.title}</Button><Typography variant="body2">blocks</Typography><Button onClick={()=>{setSelected(null);openTask(relationship.affectedTask.id,2)}}>{relationship.affectedTask.title}</Button><Typography variant="caption" color="text.secondary">{relationship.affectedTask.projectName} • {relationship.direct?'Direct':'Indirect'} • depth {relationship.depth}{relationship.daysOverdue?` • ${relationship.daysOverdue} days overdue`:''}</Typography></Box>{relationship.sharedDependency&&<Tooltip title={`Shared with ${relationship.otherResponsiblePeople.join(', ')}`}><Chip label="Shared dependency"/></Tooltip>}</Stack></Paper>)}</Stack></Box></Drawer></>;
}

function ReminderCenter({open,close,openTask,changed}:{open:boolean;close:()=>void;openTask:(task:Task)=>void;changed:()=>void}){
  const[items,setItems]=useState<Array<{task:Task;state:string;actionable:boolean}>>([]),[loading,setLoading]=useState(false),[error,setError]=useState('');
  const load=useCallback(()=>{if(!open)return;setLoading(true);API.reminders.center().then(setItems).catch(e=>setError(apiError(e).message)).finally(()=>setLoading(false))},[open]);useEffect(load,[load]);
  const snooze=async(taskId:string,ms:number)=>{await API.reminders.snooze(taskId,new Date(Date.now()+ms).toISOString());load();changed()};
  return <Drawer anchor="right" open={open} onClose={close} ModalProps={{keepMounted:false}} PaperProps={{sx:{width:{xs:'100%',sm:470},top:'64px',height:'calc(100% - 64px)'}}}><Box sx={{p:2.5}}><Stack direction="row" justifyContent="space-between"><Box><Typography variant="h5">Reminder center</Typography><Typography color="text.secondary">Due, overdue and snoozed reminders</Typography></Box><IconButton onClick={close}><ChevronRight/></IconButton></Stack>{error&&<Alert severity="warning" sx={{mt:2}}>{error}</Alert>}{loading?<Loading/>:<Stack spacing={1.5} mt={2}>{items.length===0&&<Alert severity="success">You have no active reminders.</Alert>}{items.map(item=><Paper key={item.task.id} variant="outlined" sx={{p:1.7}}><Typography fontWeight={750}>{item.task.title}</Typography><Typography variant="caption" color="text.secondary">{cap(item.state)} • {new Date(item.task.reminder?.snoozedUntil||item.task.reminder?.at||'').toLocaleString()}</Typography><Stack direction="row" spacing={.5} mt={1.5} flexWrap="wrap"><Button size="small" onClick={()=>{close();openTask(item.task)}}>Open task</Button><Button size="small" onClick={()=>snooze(item.task.id,15*60000)}>15 min</Button><Button size="small" onClick={()=>snooze(item.task.id,3600000)}>1 hour</Button><Button size="small" onClick={()=>snooze(item.task.id,86400000)}>Tomorrow</Button><Button size="small" color="inherit" onClick={async()=>{await API.reminders.dismiss(item.task.id);load();changed()}}>Dismiss</Button></Stack></Paper>)}</Stack>}</Box></Drawer>;
}

function PeopleViewV2({refresh,changed,notify,filter}:{refresh:number;changed:()=>void;notify:(s:string,t?:any)=>void;filter:(title:string,query:TaskQuery)=>void}){
  const[items,setItems]=useState<PersonType[]>([]),[workloads,setWorkloads]=useState<WorkloadSummaries|null>(null),[edit,setEdit]=useState<any>(null),[search,setSearch]=useState(''),[role,setRole]=useState('all');useEffect(()=>{Promise.all([API.people.list(),API.workloads()]).then(([people,summary])=>{setItems(people);setWorkloads(summary)})},[refresh]);const roles=[...new Set(items.map(item=>item.role.trim()).filter(Boolean))].sort(),filtered=items.filter(item=>(role==='all'||(role==='unspecified'?!item.role.trim():item.role===role))&&[item.fullName,item.company,item.role,item.email,item.phone].some(value=>value.toLowerCase().includes(search.toLowerCase())));
  const save=async()=>{try{await API.people.save(edit);setEdit(null);changed();notify('Contact saved')}catch(e){notify(apiError(e).message,'error')}};
  return <><PageHead title="People" subtitle="Reusable contacts linked to tasks." action={<Button variant="contained" startIcon={<Add/>} onClick={()=>setEdit({fullName:'',company:'',role:'',phone:'',email:'',address:'',website:'',preferredContact:'',notes:'',tags:[]})}>New contact</Button>}/><Paper sx={{p:1.5,mb:2}}><Stack direction={{xs:'column',sm:'row'}} spacing={1.5}><TextField size="small" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search people…"/><TextField select size="small" label="Function" value={role} onChange={e=>setRole(e.target.value)} sx={{minWidth:220}}><MenuItem value="all">All functions</MenuItem>{roles.map(value=><MenuItem value={value} key={value}>{value}</MenuItem>)}<MenuItem value="unspecified">Unspecified</MenuItem></TextField><Chip label={`${filtered.length} of ${items.length} people`}/></Stack></Paper><Box className="peopleGrid">{filtered.map(person=>{const load=workloads?.people.find(item=>item.personId===person.id);return <Card key={person.id} role="button" tabIndex={0} className="drillable" onClick={()=>filter(`${person.fullName} — assigned tasks`,{responsiblePersonId:person.id})} onKeyDown={event=>{if(event.key==='Enter')filter(`${person.fullName} — assigned tasks`,{responsiblePersonId:person.id})}}><CardContent><Stack direction="row" spacing={2}><Avatar>{person.fullName[0]?.toUpperCase()}</Avatar><Box flex={1}><Typography variant="h6">{person.fullName}</Typography><Typography color="text.secondary">{[person.role,person.company].filter(Boolean).join(' • ')||'No company or function'}</Typography></Box><IconButton aria-label={`Edit ${person.fullName}`} onClick={event=>{event.stopPropagation();setEdit(person)}}><Edit/></IconButton></Stack><Divider sx={{my:2}}/><Stack direction="row" justifyContent="space-between"><Typography variant="body2" fontWeight={650}>Entire task load</Typography><Typography variant="body2">{load?.progress||0}%</Typography></Stack><LinearProgress variant="determinate" value={load?.progress||0} sx={{height:8,borderRadius:4,my:1}}/><Typography variant="caption" color="text.secondary">{load?.completedTasks||0} completed • {load?.activeTasks||0} active • select to drill down</Typography><Typography variant="body2" mt={1.5}>{person.email||'No email'}</Typography><Typography variant="body2">{person.phone||'No phone'}</Typography></CardContent></Card>})}</Box>{filtered.length===0&&<Empty icon={<Groups/>} title="No matching people" text="Change the search or Function filter."/>}<Dialog open={!!edit} onClose={()=>setEdit(null)} fullWidth maxWidth="sm"><DialogTitle>{edit?.id?'Edit contact':'New contact'}</DialogTitle><DialogContent><Stack spacing={2} mt={1}>{[['fullName','Full name'],['company','Company'],['role','Function / role'],['phone','Phone'],['email','Email'],['website','Website'],['address','Address']].map(([key,label])=><TextField key={key} label={label} required={key==='fullName'} value={edit?.[key]||''} onChange={e=>setEdit({...edit,[key]:e.target.value})}/>)}</Stack></DialogContent><DialogActions><Button onClick={()=>setEdit(null)}>Cancel</Button><Button variant="contained" disabled={!edit?.fullName.trim()} onClick={save}>Save</Button></DialogActions></Dialog></>;
}

function ProjectsViewV2({refresh,changed,notify,openTask,filter}:{refresh:number;changed:()=>void;notify:(s:string)=>void;openTask:(task:Task|Partial<Task>)=>void;filter:(title:string,query:TaskQuery)=>void}){
  const[items,setItems]=useState<Project[]>([]),[workloads,setWorkloads]=useState<WorkloadSummaries|null>(null),[edit,setEdit]=useState<any>(null);useEffect(()=>{Promise.all([API.projects.list(),API.workloads()]).then(([projects,summary])=>{setItems(projects);setWorkloads(summary)})},[refresh]);
  return <><PageHead title="Projects" subtitle="Group responsibilities and measure aggregate progress." action={<Button variant="contained" startIcon={<Add/>} onClick={()=>setEdit({name:'',description:'',color:'#2563eb'})}>New project</Button>}/><Box className="peopleGrid">{items.map(project=>{const load=workloads?.projects.find(item=>item.projectId===project.id);return <Card key={project.id} role="button" tabIndex={0} className="drillable" onClick={()=>filter(`${project.name} — project tasks`,{projectId:project.id})} onKeyDown={event=>{if(event.key==='Enter')filter(`${project.name} — project tasks`,{projectId:project.id})}}><CardContent><Stack direction="row" alignItems="center" spacing={2}><Avatar sx={{bgcolor:project.color}}>{project.name[0]}</Avatar><Box flex={1}><Typography variant="h6">{project.name}</Typography><Typography color="text.secondary">{project.description||'No description'}</Typography></Box><IconButton aria-label={`Edit ${project.name}`} onClick={event=>{event.stopPropagation();setEdit(project)}}><Edit/></IconButton></Stack><Stack direction="row" justifyContent="space-between" mt={2}><Typography variant="body2" fontWeight={650}>Project completion</Typography><Typography variant="body2">{load?.progress||0}%</Typography></Stack><LinearProgress variant="determinate" value={load?.progress||0} sx={{height:9,borderRadius:5,my:1}}/><Stack direction="row" justifyContent="space-between"><Typography variant="caption" color="text.secondary">{load?.completedTasks||0} completed • {load?.activeTasks||0} active</Typography><Typography variant="caption" color="primary">Open filtered tasks</Typography></Stack><Button size="small" startIcon={<Add/>} sx={{mt:1}} onClick={event=>{event.stopPropagation();openTask({...emptyTask(),projectId:project.id})}}>New task</Button></CardContent></Card>})}</Box><Dialog open={!!edit} onClose={()=>setEdit(null)} fullWidth maxWidth="sm"><DialogTitle>{edit?.id?'Edit project':'New project'}</DialogTitle><DialogContent><Stack spacing={2} mt={1}><TextField label="Project name" required value={edit?.name||''} onChange={e=>setEdit({...edit,name:e.target.value})}/><TextField label="Description" multiline rows={3} value={edit?.description||''} onChange={e=>setEdit({...edit,description:e.target.value})}/><TextField label="Color" type="color" value={edit?.color||'#2563eb'} onChange={e=>setEdit({...edit,color:e.target.value})}/></Stack></DialogContent><DialogActions><Button onClick={()=>setEdit(null)}>Cancel</Button><Button variant="contained" disabled={!edit?.name.trim()} onClick={async()=>{await API.projects.save(edit);setEdit(null);changed();notify('Project saved')}}>Save</Button></DialogActions></Dialog></>;
}

function PeopleView({
  refresh,
  changed,
  notify
}: {
  refresh: number;
  changed: () => void;
  notify: (s: string, t?: any) => void;
}) {
  const [items, setItems] = useState<PersonType[]>([]),
    [edit, setEdit] = useState<any>(null);
  useEffect(() => {
    API.people.list().then(setItems);
  }, [refresh]);
  const save = async () => {
    try {
      await API.people.save(edit);
      setEdit(null);
      changed();
      notify('Contact saved');
    } catch (e) {
      notify(String(e), 'error');
    }
  };
  return <><PageHead title="People" subtitle="Reusable contacts linked to your tasks." action={<Button variant="contained" startIcon={<Add />} onClick={() => setEdit({
      fullName: '',
      company: '',
      role: '',
      phone: '',
      email: '',
      address: '',
      website: '',
      preferredContact: '',
      notes: '',
      tags: []
    })}>New contact</Button>} /><Box className="peopleGrid">{items.map(p => <Card key={p.id}><CardContent><Stack direction="row" spacing={2}><Avatar>{p.fullName[0]?.toUpperCase()}</Avatar><Box flex={1}><Typography variant="h6">{p.fullName}</Typography><Typography color="text.secondary">{[p.role, p.company].filter(Boolean).join(' • ') || 'No company or role'}</Typography></Box><IconButton onClick={() => setEdit(p)}><Edit /></IconButton></Stack><Divider sx={{
            my: 2
          }}><Typography variant="caption">CONTACT</Typography></Divider><Stack spacing={1}><Typography variant="body2">{p.email || 'No email'}</Typography><Typography variant="body2">{p.phone || 'No phone'}</Typography>{p.website && <Button size="small" endIcon={<OpenInNew />} onClick={() => API.files.open(p.website)} sx={{
              alignSelf: 'start'
            }}>Open website</Button>}</Stack></CardContent></Card>)}</Box>{items.length === 0 && <Empty icon={<Groups />} title="No people yet" text="Create a contact once and link it to many tasks." />}<Dialog open={!!edit} onClose={() => setEdit(null)} fullWidth maxWidth="sm"><DialogTitle>{edit?.id ? 'Edit contact' : 'New contact'}</DialogTitle><DialogContent><Stack spacing={2} mt={1}>{[['fullName', 'Full name'], ['company', 'Company'], ['role', 'Role or profession'], ['phone', 'Phone'], ['email', 'Email'], ['website', 'Website'], ['address', 'Address']].map(([k, l]) => <TextField key={k} label={l} required={k === 'fullName'} value={edit?.[k] || ''} onChange={e => setEdit({
            ...edit,
            [k]: e.target.value
          })} />)}</Stack></DialogContent><DialogActions><Button onClick={() => setEdit(null)}>Cancel</Button><Button variant="contained" disabled={!edit?.fullName.trim()} onClick={save}>Save</Button></DialogActions></Dialog></>;
}
function ProjectsView({
  refresh,
  changed,
  notify
}: {
  refresh: number;
  changed: () => void;
  notify: (s: string) => void;
}) {
  const [items, setItems] = useState<Project[]>([]),
    [edit, setEdit] = useState<any>(null);
  useEffect(() => {
    API.projects.list().then(setItems);
  }, [refresh]);
  return <><PageHead title="Projects" subtitle="Group responsibilities and measure aggregate progress." action={<Button variant="contained" startIcon={<Add />} onClick={() => setEdit({
      name: '',
      description: '',
      color: '#2563eb'
    })}>New project</Button>} /><Box className="peopleGrid">{items.map(p => <Card key={p.id}><CardContent><Stack direction="row" alignItems="center" spacing={2}><Avatar sx={{
              bgcolor: p.color
            }}>{p.name[0]}</Avatar><Box flex={1}><Typography variant="h6">{p.name}</Typography><Typography color="text.secondary">{p.description || 'No description'}</Typography></Box><IconButton onClick={() => setEdit(p)}><Edit /></IconButton></Stack></CardContent></Card>)}</Box><Dialog open={!!edit} onClose={() => setEdit(null)} fullWidth maxWidth="sm"><DialogTitle>{edit?.id ? 'Edit project' : 'New project'}</DialogTitle><DialogContent><Stack spacing={2} mt={1}><TextField label="Project name" value={edit?.name || ''} onChange={e => setEdit({
            ...edit,
            name: e.target.value
          })} /><TextField label="Description" multiline rows={3} value={edit?.description || ''} onChange={e => setEdit({
            ...edit,
            description: e.target.value
          })} /><TextField label="Color" type="color" value={edit?.color || '#2563eb'} onChange={e => setEdit({
            ...edit,
            color: e.target.value
          })} /></Stack></DialogContent><DialogActions><Button onClick={() => setEdit(null)}>Cancel</Button><Button variant="contained" onClick={async () => {
          await API.projects.save(edit);
          setEdit(null);
          changed();
          notify('Project saved');
        }}>Save</Button></DialogActions></Dialog></>;
}
function LogsView({
  refresh,
  notify
}: {
  refresh: number;
  notify: (s: string, t?: any) => void;
}) {
  const [items, setItems] = useState<LogEntry[]>([]),
    [search, setSearch] = useState(''),
    [level, setLevel] = useState(''),
    [clearConfirmation,setClearConfirmation]=useState(false);
  const load = () => API.logs({
    search,
    level
  }).then(setItems);
  useEffect(() => {
    load();
  }, [refresh]);
  return <><PageHead title="Logs and Diagnostics" subtitle="Local technical events; nothing is uploaded automatically." action={<Stack direction="row" spacing={1}><Button startIcon={<Download />} onClick={async () => {
        const p = await API.export('diagnostic');
        if (p) notify('Privacy-safe diagnostic package created');
        }}>Diagnostic package</Button><IconButton onClick={load}><Refresh /></IconButton></Stack>} /><ServiceHealth /><Paper sx={{
      p: 2,
      mb: 2
    }}><Stack direction="row" spacing={2}><TextField size="small" fullWidth label="Search logs" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()} /><TextField select size="small" label="Level" value={level} onChange={e => setLevel(e.target.value)} sx={{
          width: 180
        }}><MenuItem value="">All levels</MenuItem>{['debug', 'info', 'warn', 'error'].map(x => <MenuItem value={x} key={x}>{cap(x)}</MenuItem>)}</TextField><Button onClick={load}>Apply</Button><Button color="error" onClick={()=>setClearConfirmation(true)}>Clear</Button></Stack></Paper><Paper className="logList">{items.map(l => <details key={l.id}><summary><span className={`logLevel ${l.level}`}>{l.level.toUpperCase()}</span><span>{new Date(l.timestamp).toLocaleString()}</span><strong>{l.module}</strong><span>{l.message}</span>{l.errorRef && <code>{l.errorRef}</code>}</summary><pre>{l.details}</pre></details>)}</Paper>{items.length === 0 && <Empty icon={<BugReport />} title="No matching logs" text="Adjust filters or refresh the view." />}<Dialog open={clearConfirmation} onClose={()=>setClearConfirmation(false)}><DialogTitle>Clear all logs?</DialogTitle><DialogContent><Typography>This removes the current local diagnostic history. It does not affect tasks or settings.</Typography></DialogContent><DialogActions><Button onClick={()=>setClearConfirmation(false)}>Cancel</Button><Button color="error" variant="contained" onClick={async()=>{await API.clearLogs();setClearConfirmation(false);load()}}>Clear logs</Button></DialogActions></Dialog></>;
}
function SettingsView({
  value,
  setValue,
  notify
}: {
  value: Settings | null;
  setValue: (s: Settings) => void;
  notify: (s: string, t?: any) => void;
}) {
  const [version, setVersion] = useState(''),
    [preview, setPreview] = useState<any>(null),
    [importPreview, setImportPreview] = useState<any>(null),
    [dataOperation,setDataOperation]=useState(''),
    [dataConfirmation,setDataConfirmation]=useState<{title:string;message:string;label:string;run:()=>Promise<void>}|null>(null);
  useEffect(() => {
    API.app.version().then(setVersion);
  }, []);
  if (!value) return <Loading />;
  const update = async (p: Partial<Settings>) => {
    const s = await API.settings.save(p);
    setValue(s);
    notify('Settings saved');
  };
  const chooseBackup = async () => {
    const p = await API.files.pick('backup');
    if (p) setPreview(await API.backup.validate(p));
  };
  const chooseImport = async () => {
    const p = await API.files.pick('import');
    if (p) setImportPreview(await API.importData(p));
  };
  const runDataOperation=async(label:string,operation:()=>Promise<void>)=>{setDataOperation(label);try{await operation()}catch(error){notify(apiError(error).message,'error')}finally{setDataOperation('')}};
  return <><PageHead title="Settings" subtitle={`Task Tracker ${version} • local-first and offline`} />{dataOperation&&<Paper sx={{p:2,mb:2}} role="status" aria-live="polite"><Typography fontWeight={700} mb={1}>{dataOperation}</Typography><LinearProgress/><Typography variant="caption" color="text.secondary">Keep Task Tracker open. The operation is transactional and will recover safely if it fails.</Typography></Paper>}<Box className="settingsGrid"><Card><CardContent><Typography variant="h6">Appearance and defaults</Typography><Stack spacing={2} mt={2}><TextField select label="Theme" value={value.theme} onChange={e => update({
              theme: e.target.value as any
            })}><MenuItem value="system">System</MenuItem><MenuItem value="light">Light</MenuItem><MenuItem value="dark">Dark</MenuItem></TextField><TextField select label="Default priority" value={value.defaultPriority} onChange={e => update({
              defaultPriority: e.target.value as Priority
            })}>{['critical', 'high', 'medium', 'low', 'none'].map(x => <MenuItem value={x} key={x}>{cap(x)}</MenuItem>)}</TextField><TextField select label="First day of week" value={value.firstDay} onChange={e => update({
              firstDay: Number(e.target.value)
            })}><MenuItem value={1}>Monday</MenuItem><MenuItem value={0}>Sunday</MenuItem></TextField></Stack></CardContent></Card><Card><CardContent><Typography variant="h6">Notifications</Typography><Stack mt={1}><FormControlLabel control={<Checkbox checked={value.notifications} onChange={e => update({
              notifications: e.target.checked
            })} />} label="Enable local Windows notifications" /><FormControlLabel control={<Checkbox checked={value.startWithWindows} onChange={e => update({
              startWithWindows: e.target.checked
            })} />} label="Start with Windows" /><Stack direction="row" spacing={2} mt={1}><TextField type="time" label="Quiet hours start" InputLabelProps={{
                shrink: true
              }} value={value.quietStart} onChange={e => update({
                quietStart: e.target.value
              })} /><TextField type="time" label="Quiet hours end" InputLabelProps={{
            shrink: true
              }} value={value.quietEnd} onChange={e => update({
                quietEnd: e.target.value
              })} /></Stack></Stack></CardContent></Card><Card className="span2"><CardContent><Typography variant="h6">Backup and recovery</Typography><Typography color="text.secondary" variant="body2" mt={.5}>Backups are portable, versioned ZIP files with an integrity checksum.</Typography><Stack direction="row" spacing={1.5} mt={2} flexWrap="wrap"><Button variant="contained" startIcon={<Backup />} onClick={async () => {
              await runDataOperation('Creating and validating backup…',async()=>{const p=await API.backup.create('Manual backup');notify(`Backup created: ${p}`)});
            }} disabled={Boolean(dataOperation)}>Create backup</Button><Button startIcon={<RestoreFromTrash />} disabled={Boolean(dataOperation)} onClick={chooseBackup}>Validate or restore</Button><Button startIcon={<Folder />} disabled={Boolean(dataOperation)} onClick={async () => {
              const p = await API.files.pick('folder');
              if (p) update({
                backupFolder: p
              });
            }}>Choose backup folder</Button></Stack>{preview && <Alert severity={preview.valid ? 'success' : 'error'} sx={{
            mt: 2
          }}>{preview.valid ? <Stack><span>Healthy backup • checksum verified • {new Date(preview.createdAt).toLocaleString()} • App {preview.appVersion}</span><Stack direction="row" spacing={1} mt={1}><Button size="small" variant="outlined" disabled={Boolean(dataOperation)} onClick={()=>setDataConfirmation({title:'Merge healthy backup?',message:'New records will be merged with current data. A safety backup is created first.',label:'Merge backup',run:()=>runDataOperation('Creating safety backup and merging records…',async()=>{await API.backup.restore(preview.path,'merge');notify('Backup merged')})})}>Merge</Button><Button size="small" color="error" variant="outlined" disabled={Boolean(dataOperation)} onClick={()=>setDataConfirmation({title:'Replace current data?',message:'All current records will be replaced only after a safety backup is created and the selected backup passes validation.',label:'Replace current data',run:()=>runDataOperation('Creating safety backup and restoring data…',async()=>{await API.backup.restore(preview.path,'replace');notify('Backup restored')})})}>Replace current data</Button></Stack></Stack> : preview.errors.join('; ')}</Alert>}<Divider sx={{
            my: 2
          }} /><Stack direction="row" spacing={3}><TextField select label="Automatic backup" value={value.backupFrequency} onChange={e => update({
              backupFrequency: e.target.value as any
            })} sx={{
              minWidth: 190
            }}><MenuItem value="off">Off</MenuItem><MenuItem value="daily">Daily</MenuItem><MenuItem value="weekly">Weekly</MenuItem></TextField><TextField type="number" label="Backups to retain" value={value.backupRetention} onChange={e => update({
              backupRetention: Number(e.target.value)
            })} /><TextField fullWidth label="Backup folder" value={value.backupFolder || 'Default app data / backups'} disabled /></Stack></CardContent></Card><Card className="span2"><CardContent><Typography variant="h6">Import and export</Typography><Typography color="text.secondary" variant="body2">Import CSV, XLSX, or JSON with preview and rollback. Export the active dataset.</Typography><Stack direction="row" spacing={1} mt={2} flexWrap="wrap"><Button startIcon={<Download />} onClick={chooseImport}>Preview import</Button>{(['csv', 'xlsx', 'json', 'pdf'] as const).map(k => <Button key={k} variant="outlined" onClick={async () => {
              const p = await API.export(k);
              if (p) notify(`${k.toUpperCase()} exported`);
            }}>Export {k.toUpperCase()}</Button>)}</Stack>{importPreview && <Alert severity={importPreview.preview.errors.length ? 'warning' : 'info'} sx={{
            mt: 2
          }}><Typography>{importPreview.preview.valid} valid of {importPreview.preview.total} rows.</Typography>{importPreview.preview.errors.slice(0, 3).map((e: string) => <Typography variant="caption" display="block" key={e}>{e}</Typography>)}<Stack direction="row" spacing={1} mt={1}><Button size="small" variant="outlined" disabled={Boolean(dataOperation)} onClick={()=>void runDataOperation('Creating safety backup and importing tasks…',async()=>{await API.applyImport(importPreview.token,'merge');setImportPreview(null);notify('Import merged')})}>Merge valid rows</Button><Button size="small" color="error" variant="outlined" disabled={Boolean(dataOperation)} onClick={()=>setDataConfirmation({title:'Replace existing tasks?',message:'A safety backup is created first. Then existing tasks are replaced by the valid import rows.',label:'Replace tasks',run:()=>runDataOperation('Creating safety backup and replacing tasks…',async()=>{await API.applyImport(importPreview.token,'replace');setImportPreview(null);notify('Tasks replaced')})})}>Replace tasks</Button></Stack></Alert>}</CardContent></Card><Card><CardContent><Typography variant="h6">Data and retention</Typography><Stack spacing={2} mt={2}><TextField type="number" label="Trash retention (days)" value={value.trashRetentionDays} onChange={e => update({
              trashRetentionDays: Number(e.target.value)
            })} /><TextField type="number" label="Log retention (days)" value={value.logRetentionDays} onChange={e => update({
              logRetentionDays: Number(e.target.value)
            })} /><Alert severity="info">Database, logs, and backups are stored under the Windows user application-data folder. View the exact location in the user manual.</Alert></Stack></CardContent></Card><Card><CardContent><Typography variant="h6">Privacy and security</Typography><Typography color="text.secondary" mt={1}>No accounts, telemetry, analytics, advertising, paid services, or remote application code. Attachments are referenced by path and are not copied into SQLite.</Typography><Button sx={{
            mt: 2
          }} startIcon={<BugReport />} onClick={async () => {
            const p = await API.export('diagnostic');
            if (p) notify('Diagnostic package created');
          }}>Create privacy-safe diagnostics</Button></CardContent></Card></Box><Dialog open={Boolean(dataConfirmation)} onClose={dataOperation?undefined:()=>setDataConfirmation(null)}><DialogTitle>{dataConfirmation?.title}</DialogTitle><DialogContent><Typography>{dataConfirmation?.message}</Typography></DialogContent><DialogActions><Button disabled={Boolean(dataOperation)} onClick={()=>setDataConfirmation(null)}>Cancel</Button><Button color="error" variant="contained" disabled={Boolean(dataOperation)} onClick={async()=>{const action=dataConfirmation?.run;setDataConfirmation(null);await action?.()}}>{dataConfirmation?.label}</Button></DialogActions></Dialog></>;
}
function ServiceHealth() {
  const [health, setHealth] = useState<Record<string, {
    service: string;
    status: string;
    uptime?: number;
    error?: string;
  }>>({}),[restarting,setRestarting]=useState('');
  const load=()=>API.app.health().then(setHealth).catch(() => setHealth({
    gateway: {service:'gateway',status:'failed',error:'Health endpoint unavailable'}
  }));
  useEffect(() => {
    load();
  }, []);
  return <Paper sx={{
    p: 2,
    mb: 2
  }}><Stack direction="row" alignItems="center" spacing={1} mb={1.5}><Typography fontWeight={750}>Local service health</Typography><Chip size="small" color={Object.values(health).every(x => x.status === 'ok') ? 'success' : 'warning'} label={Object.values(health).every(x => x.status === 'ok') ? 'All services operational' : 'Degraded'} /></Stack><Box sx={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))',
      gap: 1
    }}>{Object.entries(health).map(([name, h]) => <Paper key={name} variant="outlined" sx={{
        p: 1.2
      }}><Stack direction="row" justifyContent="space-between"><Typography variant="body2" fontWeight={650}>{name}</Typography><Chip size="small" color={h.status === 'ok' ? 'success' : 'error'} label={h.status} /></Stack><Typography variant="caption" color="text.secondary" display="block">{h.uptime ? `${Math.round(h.uptime)} s uptime` : h.error || 'Starting…'}</Typography>{name!=='data'&&<Button size="small" sx={{mt:.5}} disabled={Boolean(restarting)} onClick={async()=>{setRestarting(name);try{await API.app.restartService(name);setTimeout(load,700)}finally{setRestarting('')}}}>{restarting===name?'Restarting…':'Restart service'}</Button>}</Paper>)}</Box><Alert severity="info" sx={{mt:1.5}}>The Data service can only be restarted safely by restarting Task Tracker. Other services may be restarted individually without touching the database.</Alert></Paper>;
}
function Loading() {
  return <Box sx={{
    display: 'grid',
    placeItems: 'center',
    height: 300
  }}><CircularProgress /></Box>;
}
function Empty({
  icon,
  title,
  text
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return <Box sx={{
    textAlign: 'center',
    py: 7,
    color: 'text.secondary'
  }}><Avatar sx={{
      mx: 'auto',
      mb: 2,
      bgcolor: 'action.hover',
      color: 'text.secondary'
    }}>{icon}</Avatar><Typography variant="h6" color="text.primary">{title}</Typography><Typography>{text}</Typography></Box>;
}
function cap(s: string) {
  return s.replace(/_/g, ' ').replace(/^./, x => x.toUpperCase());
}
function stateColor(s: string) {
  return ({
    darkred: '#991b1b',
    red: '#dc2626',
    orange: '#ea580c',
    amber: '#d97706',
    blue: '#2563eb',
    purple: '#7c3aed',
    gray: '#64748b',
    green: '#16a34a',
    neutral: '#cbd5e1'
  } as any)[s];
}
function progressColor(t: Task): 'primary' | 'success' | 'warning' | 'error' | 'inherit' {
  const s = visualState(t);
  return s === 'green' ? 'success' : s === 'darkred' || s === 'red' ? 'error' : s === 'amber' || s === 'orange' ? 'warning' : s === 'gray' ? 'inherit' : 'primary';
}
