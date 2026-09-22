import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

describe('v16.18.2 overall task and checklist progress', () => {
  it('keeps task progress and active-parent checklist completion separate', () => {
    const enhancements = read('apps/connected-web/src/ConnectedEnhancements.tsx');
    expect(enhancements).toContain('title="Overall progress"');
    expect(enhancements).toContain('Active task progress');
    expect(enhancements).toContain('Checklist completion');
    expect(enhancements).toContain('activeChecklistCompleted / activeChecklistTotal * 100');
    expect(enhancements).toContain('Remaining work:');
  });

  it('opens the corresponding task and checklist Work lists', () => {
    const enhancements = read('apps/connected-web/src/ConnectedEnhancements.tsx');
    expect(enhancements).toContain("openFilter('Open tasks', {})");
    expect(enhancements).toContain("openChecklistFilter('All', 'all')");
  });

  it('counts checklist progress only beneath active parents', () => {
    const tasks = read('services-connected/tasks/index.ts');
    expect(tasks).toContain('const activeParent =');
    expect(tasks).toContain('activeCompleted: eligible.filter(item => activeParent(item) && item.completed).length');
    expect(tasks).toContain('activeTotal: eligible.filter(activeParent).length');
  });
});
