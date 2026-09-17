import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

describe('person master links and dependency drilldowns', () => {
  it('removes dashboard initials and centers the task layout controls', () => {
    const app = read('apps/connected-web/src/App.tsx');
    const enhancements = read('apps/connected-web/src/ConnectedEnhancements.tsx');
    expect(app).not.toContain('{label[0]}</Avatar>');
    expect(enhancements).not.toContain('{label[0]}</Avatar>');
    expect(enhancements).toContain('justifyContent="center" sx={{ mt: { xs: 1, md: 0 }, ml: { md: \'auto\' } }}');
  });

  it('drills dependency cards into matching task sets', () => {
    const operations = read('apps/connected-web/src/OperationalViews.tsx');
    const tasks = read('services-connected/tasks/index.ts');
    expect(operations).toContain("dependencyRole: 'prerequisite'");
    expect(operations).toContain("{ blocked: 'true' }");
    expect(tasks).toContain('query.dependencyRole === "prerequisite"');
  });

  it('provides revocable live person task links without private fields', () => {
    const app = read('apps/connected-web/src/App.tsx');
    const publicView = read('apps/connected-web/src/PublicPersonTasks.tsx');
    const migration = read('supabase/migrations/0008_person_task_share_links.sql');
    expect(app).toContain('Copy link');
    expect(app).toContain("requestLink('regenerate')");
    expect(app).toContain("requestLink('revoke')");
    expect(publicView).toContain('live, read-only view');
    expect(migration).toContain('public.public_person_task_share');
    expect(migration).not.toContain("'costAmount'");
    expect(migration).not.toContain("'notes'");
    expect(migration).not.toContain("'description'");
  });
});
