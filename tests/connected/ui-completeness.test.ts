import{describe,expect,it}from'vitest';
import{readFileSync}from'node:fs';

const read=(path:string)=>readFileSync(path,'utf8');

describe('connected UI completeness',()=>{
  const app=read('apps/connected-web/src/App.tsx');
  const gateway=read('services-connected/api-gateway/index.ts');

  it('wires project and person creation to write endpoints',()=>{
    expect(app).toContain("api('/projects/save'");
    expect(app).toContain("api('/people/save'");
    expect(gateway).toContain('/^\\/v1\\/projects\\/save$/');
  });

  it('supports navigation and section collapse',()=>{
    expect(app).toContain('setDesktopNav(value => !value)');
    expect(app).toContain('setCollapsedGroups(value =>');
    expect(app).toContain('releaseFocus(); setDrawer(true)');
  });

  it('keeps mobile task actions reachable and dashboard metrics compact',()=>{
    const enhancements=read('apps/connected-web/src/ConnectedEnhancements.tsx');
    const styles=read('apps/connected-web/src/styles.css');
    expect(enhancements).toContain('calc(20px + env(safe-area-inset-bottom))');
    expect(enhancements).toContain('minHeight: 44');
    expect(styles).toMatch(/\.metric-grid\s*\{\s*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/);
  });

  it('keeps mobile calendar counts separate from day numbers',()=>{
    const styles=read('apps/connected-web/src/styles.css');
    expect(app).toContain('className="calendar-count"');
    expect(styles).toContain('.calendar-count {');
    expect(styles).toContain('transform: translateX(-50%)');
    expect(app).not.toContain('`${d.count} task${d.count === 1');
  });

  it('provides table cards drilldowns progress and real task detail controls',()=>{
    const enhancements=read('apps/connected-web/src/ConnectedEnhancements.tsx');
    expect(enhancements).toContain('value="cards"');
    expect(enhancements).toContain('value="table"');
    expect(enhancements).toContain('Progress by project');
    expect(enhancements).toContain('/tasks/checklist/save');
    expect(enhancements).toContain('/dependencies/link');
    expect(app).not.toContain('Checklist and Dependencies sections enforce required completion rules on the server.');
    expect(app).toContain('responsiblePersonId: person.id');
    expect(app).toContain('projectId: project.id');
  });

  it('wires the notification bell and admin-only invitation UI',()=>{
    const enhancements=read('apps/connected-web/src/ConnectedEnhancements.tsx');
    expect(enhancements).toContain('function NotificationBell');
    expect(enhancements).toContain('/notifications/inbox');
    expect(app).toContain("n.view !== 'access' || platformAdmin");
  });
});

describe('connected filters and notification persistence',()=>{
  it('implements date views and dashboard due filters',()=>{
    const data=read('services-connected/data/index.ts');
    expect(data).toContain("q.view==='today'||q.due==='today'");
    expect(data).toContain("q.view==='upcoming'");
    expect(data).toContain("q.due==='overdue'");
    expect(data).toContain("q.due==='next7'");
    expect(data).toContain("JSON.stringify({...input.args,p_workspace_id:context.workspaceId})");
  });

  it('updates an existing browser push subscription instead of duplicating it',()=>{
    const notifications=read('services-connected/notifications/index.ts');
    expect(notifications).toContain('method: existing ? "patch" : "post"');
    expect(notifications).toContain('`test-${context.userId}-${crypto.randomUUID()}`');
    expect(notifications).toContain('email_enabled: input.emailEnabled');
    expect(notifications).toContain('push_enabled: input.pushEnabled');
  });

  it('normalizes a missing browser push expiration time',()=>{
    const app=read('apps/connected-web/src/App.tsx');
    expect(app).toContain('expirationTime: subscriptionJson.expirationTime ?? null');
  });

  it('keeps checklist writes aligned with the database and refreshes derived task state',()=>{
    const tasks=read('services-connected/tasks/index.ts');
    const migration=read('supabase/migrations/0004_task_details_notifications.sql');
    expect(tasks).not.toContain('notes: input.notes');
    expect(migration).toContain('task_status_refresh_dependents');
    expect(migration).toContain('on conflict(waiting_task_id, prerequisite_task_id) do update');
  });

  it('provides private task files links and the requested task layouts',()=>{
    const enhancements=read('apps/connected-web/src/ConnectedEnhancements.tsx');
    const tasks=read('services-connected/tasks/index.ts');
    const data=read('services-connected/data/index.ts');
    expect(enhancements).toContain('Files, images, documents & links');
    expect(enhancements).toContain('className="task-card-grid"');
    expect(enhancements).toContain('Smart urgency');
    expect(tasks).toContain('TaskAttachmentUpload.parse');
    expect(data).toContain("'/attachments/upload'");
    expect(data).toContain('/storage/v1/object/sign/task-attachments/');
  });

  it('offers server-side diagnostic detail levels',()=>{
    const view=read('apps/connected-web/src/BackupDiagnosticsViews.tsx');
    const diagnostics=read('services-connected/logging-diagnostics/index.ts');
    expect(view).toContain('Debug');
    expect(view).toContain('Verbose');
    expect(view).toContain('Technical details');
    expect(diagnostics).toContain("const levels=['error','warn','info','debug','verbose']");
  });
});

describe('internal health endpoints',()=>{
  for(const service of ['identity-access','tasks','people','dependencies-progress']){
    it(`${service} answers health before user authentication`,()=>{
      const source=read(`services-connected/${service}/index.ts`);
      expect(source.indexOf('pathname === "/health"')).toBeGreaterThan(-1);
      expect(source.indexOf('pathname === "/health"')).toBeLessThan(source.indexOf('authContext(request)'));
    });
  }
});
