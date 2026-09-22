import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

describe('v16.18.1 Work and checklist overview', () => {
  it('renames Tasks to Work and starts both work lists collapsed', () => {
    const app = read('apps/connected-web/src/App.tsx'), enhancements = read('apps/connected-web/src/ConnectedEnhancements.tsx');
    expect(app).toContain("view: 'tasks', label: 'Work'");
    expect(app).toContain('label="Work"');
    expect(enhancements).toContain('title="All tasks"');
    expect(enhancements).toContain('title="All checklist"');
    expect(enhancements).toContain('const [expanded, setExpanded] = useState(false)');
    expect(enhancements).toContain('<EnhancedTasksView view="tasks"');
  });

  it('routes a backend checklist list with parent context and useful filters', () => {
    const gateway = read('services-connected/api-gateway/index.ts'), tasks = read('services-connected/tasks/index.ts'), contracts = read('packages/connected-contracts/index.ts');
    expect(gateway).toContain('/v1\\/tasks\\/checklists');
    expect(tasks).toContain('url.pathname === "/checklists"');
    for (const field of ['taskTitle', 'projectName', 'responsiblePersonName', 'taskPriority', 'taskBlocked']) expect(tasks).toContain(field);
    for (const scope of ['open', 'overdue', 'today', 'next7', 'required', 'completed']) expect(contracts).toContain(`"${scope}"`);
  });

  it('keeps six compact checklist cards only on Dashboard', () => {
    const enhancements = read('apps/connected-web/src/ConnectedEnhancements.tsx');
    expect(enhancements).toContain('const checklistCards =');
    expect(enhancements).toContain('compact-metric-grid');
    expect(enhancements).not.toContain('<DashboardSection title="Checklist attention"');
    expect(enhancements).toContain('<ChecklistWorkspaceView onOpen={onOpen} refreshToken={refreshToken} embedded/>');
  });

  it('uses one card component and a parallel metric order for tasks and checklist items', () => {
    const enhancements = read('apps/connected-web/src/ConnectedEnhancements.tsx');
    expect(enhancements).toContain('function DashboardMetricCard');
    expect(enhancements).toContain("['Open', 'active', {}]");
    expect(enhancements).toContain("['Completed', 'completed', { view: 'completed' }]");
    expect(enhancements).toContain("['Needs attention', 'needsAttention', { attention: 'true' }]");
    expect(enhancements).toContain("['Completed', 'completed'], ['Required', 'required']");
  });

  it('adds backend counts and a distinct needs-attention task filter', () => {
    const migration = read('supabase/migrations/0022_dashboard_metric_parity.sql');
    const contracts = read('packages/connected-contracts/index.ts');
    const data = read('services-connected/data/index.ts');
    expect(migration).toContain("'needsAttention',coalesce(c.needs_attention,0)");
    expect(migration).toContain("'completed',coalesce(d.completed,0)");
    expect(contracts).toContain('attention: z.boolean().optional()');
    expect(data).toContain("or=(priority.eq.critical,blocked.eq.true)");
  });
});
