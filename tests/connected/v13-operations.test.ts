import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const read = (filePath: string) => readFileSync(path.join(root, filePath), 'utf8');

describe('v13 operational polish', () => {
  it('keeps task controls together and filters dependency-blocked tasks correctly', () => {
    const enhancements = read('apps/connected-web/src/ConnectedEnhancements.tsx');
    expect(enhancements).toContain('aria-label="Refresh tasks"');
    expect(enhancements).toContain("if (merged.status === 'blocked')");
    expect(enhancements).toContain("merged.blocked = 'true'");
    expect(enhancements).toContain('Blocked by dependency');
    expect(enhancements).toContain('variant="outlined" color="warning" label="Blocked"');
  });

  it('renders the configured dependency-load service instead of a placeholder', () => {
    const app = read('apps/connected-web/src/App.tsx');
    const operations = read('apps/connected-web/src/OperationalViews.tsx');
    const dependencies = read('services-connected/dependencies-progress/index.ts');
    expect(app).toContain("view === 'dependencies' ? <DependencyLoadView");
    expect(operations).toContain("'/dependencies/people-load'");
    expect(operations).toContain('Overdue prerequisites');
    expect(dependencies).toContain('connected_dependency_load');
  });

  it('groups invitation statuses into clear macro areas', () => {
    const access = read('apps/connected-web/src/AccessViews.tsx');
    expect(access).toContain('Pending invitations');
    expect(access).toContain('Accepted users');
    expect(access).toContain('Disabled users');
    expect(access).toContain('Closed invitations');
  });

  it('improves theme contrast and keeps calendar counts centered at the bottom', () => {
    const app = read('apps/connected-web/src/App.tsx');
    const styles = read('apps/connected-web/src/styles.css');
    expect(app).toContain("dark ? '#60a5fa' : '#1d4ed8'");
    expect(app).toContain("bgcolor: 'primary.main', color: 'primary.contrastText'");
    expect(styles).toContain('.calendar-day .MuiCardActionArea-root');
    expect(styles).toMatch(/\.calendar-count\s*\{[^}]*left:\s*50%;[^}]*bottom:\s*10px;/s);
  });

  it('adds explicit reminders, readiness reporting and real delivery tests', () => {
    const app = read('apps/connected-web/src/App.tsx');
    const enhancements = read('apps/connected-web/src/ConnectedEnhancements.tsx');
    const notifications = read('services-connected/notifications/index.ts');
    const gateway = read('services-connected/api-gateway/index.ts');
    const migration = read('supabase/migrations/0007_task_reminder_sync.sql');
    expect(app).toContain('Notification readiness');
    expect(app).toContain("'/notifications/test-push'");
    expect(enhancements).toContain('Reminder date and time');
    expect(enhancements).toContain('new Date(editor.reminderAt).toISOString()');
    expect(notifications).toContain('url.pathname === "/readiness"');
    expect(notifications).toContain('url.pathname === "/test-push"');
    expect(gateway).toContain('/^\\/v1\\/notifications\\/readiness$/');
    expect(migration).toContain('create trigger task_reminder_sync');
  });
});
