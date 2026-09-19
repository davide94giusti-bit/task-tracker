import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');

describe('v16.13.1 hotfix regressions', () => {
  it('keeps mobile authentication in-app and serializes token refresh', () => {
    const app = read('apps/connected-web/src/App.tsx');
    const auth = read('apps/connected-web/src/auth.ts');
    expect(app).toContain('onSignedIn();');
    expect(app).not.toContain('await signIn(email, password);\n    location.reload();');
    expect(auth).toContain('let refreshInFlight');
    expect(auth).toContain('return memorySession');
  });

  it('uses task status for shared To do and Done tabs', () => {
    const portal = read('apps/connected-web/src/PublicPersonTasks.tsx');
    const migration = read('supabase/migrations/0013_shared_task_status_filter.sql');
    expect(portal).toContain("task.status === 'completed'");
    expect(portal).not.toContain("filter === 'done' ? item.completed");
    expect(migration).toContain("t.status not in (''cancelled'',''archived'')");
  });

  it('uses the share-token verification key for linked collaboration', () => {
    const app = read('apps/connected-web/src/App.tsx');
    expect(app).toContain('share-verification:${project.token.slice(0, 36)}');
    expect(app).not.toContain('share-verification:${project.shareId}');
  });

  it('preserves internal HTTP status and includes the repaired migration', () => {
    const runtime = read('services-connected/_shared/runtime.ts');
    const migration = read('supabase/migrations/0012_fix_collaboration_workspace_user.sql');
    expect(runtime).toContain('status:response.status');
    expect(migration).toContain('patched_count <> 8');
    expect(migration).toContain('perform assert_connected_workspace(p_workspace_id); v_user:=auth.uid();');
  });

  it('marks today and exposes lifecycle controls in collapsed groups', () => {
    const app = read('apps/connected-web/src/App.tsx');
    const access = read('apps/connected-web/src/AccessViews.tsx');
    expect(app).toContain("? ' today' : ''");
    expect(access).toContain('<Accordion key={section.key}');
    expect(access).toContain("act('/access/disable'");
    expect(access).toContain("act('/access/enable'");
  });
});
