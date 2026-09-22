import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const enhancements = readFileSync('apps/connected-web/src/ConnectedEnhancements.tsx', 'utf8');
const attention = readFileSync('apps/connected-web/src/DeadlineAttention.tsx', 'utf8');
const manual = readFileSync('apps/connected-web/src/UserManualView.tsx', 'utf8');
const app = readFileSync('apps/connected-web/src/App.tsx', 'utf8');

describe('v16.16.1 focused Today and collapsible Dashboard', () => {
  it('keeps checklist attention in Today without embedding deadline pressure', () => {
    expect(enhancements).toContain("view === 'today' && <ChecklistAttentionPanel");
    expect(enhancements).not.toContain('TodayPressureWarning');
    expect(attention).not.toContain('export function TodayPressureWarning');
  });

  it('starts every analytical Dashboard section collapsed', () => {
    expect(enhancements).toContain('function DashboardSection');
    expect(enhancements).toContain('const [expanded, setExpanded] = useState(false)');
    expect(enhancements).toContain('<Collapse in={expanded} timeout="auto" unmountOnExit>');
    for (const title of ['Overall progress', 'Progress by project', 'Deadline pressure', 'Total cost']) {
      expect(enhancements).toContain(`<DashboardSection title="${title}"`);
    }
  });

  it('shows separate compact task and checklist metric groups without a checklist dropdown', () => {
    expect(enhancements).toContain('compact-metric-grid');
    expect(enhancements).toContain('Checklist items');
    expect(enhancements).toContain("['Open', 'open']");
    expect(enhancements).not.toContain('<DashboardSection title="Checklist attention"');
  });

  it('documents where pressure lives and how Dashboard sections behave', () => {
    expect(manual).toContain('start collapsed');
    expect(manual).toContain('Deadline Pressure is available only in its collapsible Dashboard card');
  });

  it('keeps deadline pressure off Calendar while retaining it on Dashboard', () => {
    expect(app).not.toContain('DeadlinePressureCard');
    expect(app).not.toContain('Pressure dot:');
    expect(app).not.toContain('deadline pressure`}');
    expect(enhancements).toContain('<DeadlinePressureCard onOpen={openTask}');
  });
});
