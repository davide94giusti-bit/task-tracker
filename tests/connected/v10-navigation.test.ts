import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const read = (filePath: string) => readFileSync(path.join(root, filePath), 'utf8');

describe('v10 task and contact navigation', () => {
  const app = read('apps/connected-web/src/App.tsx');
  const gateway = read('services-connected/api-gateway/index.ts');

  it('opens tasks read-only before editing and preserves dependency navigation', () => {
    const enhancements = read('apps/connected-web/src/ConnectedEnhancements.tsx');
    const tasks = read('services-connected/tasks/index.ts');
    const types = read('apps/connected-web/src/types.ts');
    expect(app).toContain('<TaskDetailsDialog task={task}');
    expect(app).toContain('<TaskEditorDialog task={editingTask}');
    expect(enhancements).toContain("'Back to previous task'");
    expect(enhancements).toContain('scrollPositions.current[current.id]');
    expect(enhancements).toContain('openDependency(dependency)');
    expect(types).toContain('prerequisiteTask?:Task');
    expect(tasks).toContain('prerequisiteTask,');
  });

  it('provides workspace-scoped contact actions from task details', () => {
    const enhancements = read('apps/connected-web/src/ConnectedEnhancements.tsx');
    const people = read('services-connected/people/index.ts');
    expect(gateway).toContain('/^\\/v1\\/people\\/details$/');
    expect(people).toContain('filters: { id: personId, deleted_at: null }');
    expect(enhancements).toContain('How would you like to use');
    expect(enhancements).toContain('`https://wa.me/${whatsappPhone}`');
    expect(enhancements).toContain('`tel:${callablePhone}`');
    expect(enhancements).toContain('`mailto:${person.email}`');
  });
});
