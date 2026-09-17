import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Card, CardActionArea, CardContent, Chip, LinearProgress, Paper, Stack, Typography } from '@mui/material';
import { Refresh } from '@mui/icons-material';
import { api } from './api';

type DependencyLoadRow = {
  personId: string | null;
  personName: string;
  blockingPrerequisites: number;
  affectedTasks: number;
  affectedProjects: number;
  overduePrerequisites: number;
  criticalHighImpact: number;
  impactScore: number;
};

export function DependencyLoadView({ onOpenTasks }: { onOpenTasks: (personId: string | null, personName: string) => void }) {
  const [rows, setRows] = useState<DependencyLoadRow[] | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setError('');
    try {
      setRows(await api<DependencyLoadRow[]>('/dependencies/people-load'));
    } catch (reason) {
      setError((reason as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const totals = useMemo(
    () => ({
      people: rows?.length || 0,
      tasks: rows?.reduce((sum, row) => sum + row.affectedTasks, 0) || 0,
      overdue: rows?.reduce((sum, row) => sum + row.overduePrerequisites, 0) || 0
    }),
    [rows]
  );
  return (
    <>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={2} mb={3}>
        <Box>
          <Typography variant="h4">Dependency load</Typography>
          <Typography color="text.secondary">Who owns incomplete prerequisites and how much downstream work they affect.</Typography>
        </Box>
        <Button startIcon={<Refresh />} onClick={() => void load()}>Refresh</Button>
      </Stack>
      <Alert severity="info" sx={{ mb: 2 }}>Only mandatory, incomplete prerequisite chains are counted. Completed, cancelled, archived, and deleted tasks are excluded.</Alert>
      {error && <Alert severity="error" action={<Button onClick={() => void load()}>Retry</Button>}>{error}</Alert>}
      {!rows && !error && <LinearProgress />}
      {rows && (
        <>
          <Box className="metric-grid" mb={2}>
            {[
              ['People with blockers', totals.people],
              ['Affected tasks', totals.tasks],
              ['Overdue prerequisites', totals.overdue]
            ].map(([label, value]) => (
              <Card key={String(label)} variant="outlined"><CardContent><Typography color="text.secondary">{label}</Typography><Typography variant="h4">{value}</Typography></CardContent></Card>
            ))}
          </Box>
          {!rows.length ? (
            <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
              <Typography variant="h6">No active dependency bottlenecks</Typography>
              <Typography color="text.secondary">Link an incomplete task as a mandatory prerequisite to populate this view.</Typography>
            </Paper>
          ) : (
            <Stack spacing={1.25}>
              {rows.map((row) => (
                <Card key={row.personId || 'unassigned'} variant="outlined">
                  <CardActionArea onClick={() => onOpenTasks(row.personId, row.personName)}>
                    <CardContent>
                      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2}>
                        <Box>
                          <Typography variant="h6">{row.personName}</Typography>
                          <Typography color="text.secondary">{row.blockingPrerequisites} prerequisite{row.blockingPrerequisites === 1 ? '' : 's'} affecting {row.affectedTasks} task{row.affectedTasks === 1 ? '' : 's'} across {row.affectedProjects} project{row.affectedProjects === 1 ? '' : 's'}</Typography>
                        </Box>
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                          {row.overduePrerequisites > 0 && <Chip color="error" label={`${row.overduePrerequisites} overdue`} />}
                          {row.criticalHighImpact > 0 && <Chip color="warning" label={`${row.criticalHighImpact} critical/high`} />}
                          <Chip color="primary" label={`Impact ${row.impactScore}`} />
                        </Stack>
                      </Stack>
                    </CardContent>
                  </CardActionArea>
                </Card>
              ))}
            </Stack>
          )}
        </>
      )}
    </>
  );
}
