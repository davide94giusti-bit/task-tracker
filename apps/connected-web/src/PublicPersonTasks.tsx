import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, CssBaseline, LinearProgress, Stack, ThemeProvider, Typography, createTheme } from '@mui/material';
import { Refresh, TaskAlt } from '@mui/icons-material';
import { publicApi } from './api';

type SharedTask = {
  id: string;
  title: string;
  projectName?: string | null;
  status: string;
  priority: string;
  dueDate?: string | null;
  calculatedProgress: number;
  blocked: boolean;
};
type SharedView = { personName: string; generatedAt: string; tasks: SharedTask[] };
const label = (value: string) => value.replaceAll('_', ' ').replace(/^./, (character) => character.toUpperCase());

export function PublicPersonTasks() {
  const token = new URLSearchParams(location.search).get('token') || '';
  const [data, setData] = useState<SharedView | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setError('');
    try { setData(await publicApi<SharedView>(`/public/person-tasks?token=${encodeURIComponent(token)}`)); }
    catch (reason) { setError((reason as Error).message); }
  }, [token]);
  useEffect(() => { void load(); }, [load]);
  const theme = createTheme({ palette: { primary: { main: '#1d4ed8' }, background: { default: '#f4f7fb' } }, shape: { borderRadius: 14 }, typography: { fontFamily: 'Inter,Segoe UI,Arial,sans-serif', h4: { fontWeight: 800 }, h6: { fontWeight: 750 } } });
  return <ThemeProvider theme={theme}><CssBaseline/><Box sx={{ minHeight: '100vh', bgcolor: 'background.default', py: { xs: 2, sm: 5 }, px: 2 }}><Box sx={{ maxWidth: 760, mx: 'auto' }}>
    <Stack direction="row" alignItems="center" spacing={1.25} mb={3}><TaskAlt color="primary"/><Box><Typography variant="h4">Active tasks</Typography><Typography color="text.secondary">{data?.personName || 'Shared task view'}</Typography></Box></Stack>
    <Alert severity="info" sx={{ mb: 2 }} action={<Button startIcon={<Refresh/>} onClick={() => void load()}>Refresh</Button>}>This live link shows the current active tasks whenever it is opened or refreshed.</Alert>
    {!data && !error && <LinearProgress/>}{error && <Alert severity="error" action={<Button onClick={() => void load()}>Retry</Button>}>{error}</Alert>}
    {data && <><Typography color="text.secondary" mb={2}>{data.tasks.length} active task{data.tasks.length === 1 ? '' : 's'} · refreshed {new Date(data.generatedAt).toLocaleString()}</Typography>
      {!data.tasks.length ? <Alert severity="success">No active tasks are currently assigned.</Alert> : <Stack spacing={1.25}>{data.tasks.map((task) => <Card key={task.id} variant="outlined"><CardContent>
        <Stack direction="row" justifyContent="space-between" gap={2}><Box><Typography variant="h6">{task.title}</Typography><Typography color="text.secondary">{task.projectName || 'No project'}</Typography></Box><Stack direction="row" spacing={0.75} alignItems="flex-start" flexWrap="wrap" useFlexGap>{task.blocked && <Chip size="small" color="warning" label="Blocked"/>}<Chip size="small" variant="outlined" label={label(task.priority)}/></Stack></Stack>
        <Stack direction="row" justifyContent="space-between" mt={2}><Typography variant="body2">{label(task.status)} · {task.dueDate ? `Due ${new Date(`${task.dueDate}T12:00:00`).toLocaleDateString()}` : 'No due date'}</Typography><Typography variant="body2" fontWeight={700}>{task.calculatedProgress || 0}%</Typography></Stack><LinearProgress variant="determinate" value={task.calculatedProgress || 0} sx={{ mt: 1, height: 7, borderRadius: 4 }}/>
      </CardContent></Card>)}</Stack>}
    </>}
    <Typography variant="caption" color="text.secondary" display="block" textAlign="center" mt={4}>Read-only task view · No sign-in required</Typography>
  </Box></Box></ThemeProvider>;
}
