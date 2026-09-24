import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

describe('v16 usability and reliability', () => {
  const app = read('apps/connected-web/src/App.tsx');
  const enhancements = read('apps/connected-web/src/ConnectedEnhancements.tsx');
  const manual = read('apps/connected-web/src/UserManualView.tsx');
  const migration = read('supabase/migrations/0010_completed_task_progress.sql');

  it('confirms share-link actions and outlines destructive controls', () => {
    expect(app).toContain('Master link copied to the clipboard.');
    expect(app).toContain('previous link no longer works');
    expect(app).toContain('variant="outlined" color="error"');
    expect(app).toContain('Message preview');
    expect(app).toContain("'& > :not(style) ~ :not(style)': { ml: 0 }");
  });

  it('keeps task creation alive through cold connected writes', () => {
    expect(enhancements).toContain("timeoutMs: 60_000");
    expect(enhancements).toContain('createdTaskId.current = created.id');
    expect(enhancements).toContain("slotProps={{ inputLabel: { shrink: true } }}");
  });

  it('provides deletion and compact checklist controls', () => {
    expect(enhancements).toContain('Move “${shownTask.title}” to Trash?');
    expect(enhancements).toContain('>Delete task</Button>');
    expect(enhancements).toContain('aria-label="Delete checklist item"');
    expect(enhancements).toContain('gridTemplateColumns: \'auto minmax(0,1fr) auto auto\'');
  });

  it('guides completion through required checklist items and prerequisites', () => {
    expect(enhancements).toContain('Complete required work first');
    expect(enhancements).toContain('setChecklistCompleted');
    expect(enhancements).toContain('Required checklist items');
    expect(enhancements).toContain('Mandatory prerequisites');
    expect(enhancements).toContain('>Mark completed</Button>');
  });

  it('sets completed progress to one hundred throughout the stack', () => {
    expect(enhancements).toContain("task.status === 'completed' ? 100");
    expect(migration).toContain("when t.status = 'completed' then 100");
    expect(migration).toContain('set calculated_progress = 100');
    expect(migration).toContain('perform refresh_task_derived(new.id);');
  });

  it('adds a searchable collapsible manual with responsibility guidance', () => {
    expect(app).toContain("view: 'manual'");
    expect(manual).toContain('Search the manual');
    expect(manual).toContain('<Accordion');
    expect(manual).toContain('Checklist or separate task?');
    expect(manual).toContain('another person is accountable');
  });

  it('uses chapter-specific manual screenshots and annotation coordinates', () => {
    const screenshots = ['navigation.png', 'dashboard.png', 'tasks.png', 'task-editor.png', 'checklist.png', 'dependencies.png', 'projects.png', 'people.png', 'settings.png', 'access.png', 'diagnostics.png'];
    screenshots.forEach((screenshot) => expect(existsSync(`apps/connected-web/public/manual/${screenshot}`)).toBe(true));
    expect(manual).not.toContain('18 + point * 27');
    expect(manual).not.toContain('12 + point * 30');
    expect(manual).toContain('x: 82, y: 4');
    expect(manual).toContain('x: 84, y: 17');
  });

  it('groups the mobile More menu into collapsible macro areas', () => {
    expect(app).toContain("['Tasks', 'Organization', 'System'].map");
    expect(app).toContain('const mobileGroupKey = `mobile-${group}`');
    expect(app).toContain('collapsedGroups[mobileGroupKey]');
  });
});
