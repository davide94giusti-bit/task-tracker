import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

describe('v15 person task portal', () => {
  it('groups shared work by project and exposes read-only checklist filters', () => {
    const portal = read('apps/connected-web/src/PublicPersonTasks.tsx');
    const migration = read('supabase/migrations/0009_person_portal_notifications.sql');
    expect(portal).toContain('Project progress');
    expect(portal).toContain('<ToggleButton value="todo">To do</ToggleButton>');
    expect(portal).toContain('<ToggleButton value="done">Done</ToggleButton>');
    expect(portal).toContain('<Checkbox checked={item.completed} disabled');
    expect(migration).toContain("'checklist', coalesce");
    expect(migration).not.toContain("'costAmount'");
    expect(migration).not.toContain("'notes'");
  });

  it('lets the recipient opt in to email and browser updates and choose a theme', () => {
    const portal = read('apps/connected-web/src/PublicPersonTasks.tsx');
    const gateway = read('services-connected/api-gateway/index.ts');
    expect(portal).toContain('Email updates');
    expect(portal).toContain('Browser notifications');
    expect(portal).toContain("localStorage.setItem('shared-task-theme'");
    expect(gateway).toContain('/v1/public/person-preferences');
    expect(gateway).toContain('/v1/public/person-push-subscribe');
  });

  it('queues and delivers task and checklist changes through the existing scheduler', () => {
    const migration = read('supabase/migrations/0009_person_portal_notifications.sql');
    const reminders = read('services-connected/reminders/index.ts');
    const notifications = read('services-connected/notifications/index.ts');
    expect(migration).toContain('create trigger task_person_share_change');
    expect(migration).toContain('create trigger checklist_person_share_change');
    expect(migration).toContain("'task.unassigned'");
    expect(reminders).toContain('/admin/claim-person-share-events');
    expect(notifications).toContain('/deliver-person-share');
  });

  it('polishes recap actions, records sharing history and uses a generic back label', () => {
    const app = read('apps/connected-web/src/App.tsx');
    const enhancements = read('apps/connected-web/src/ConnectedEnhancements.tsx');
    expect(app).toContain('<DialogTitle>Recap</DialogTitle>');
    expect(app).toContain('Last shared:');
    expect(app).toContain("noteShared('whatsapp')");
    expect(app).toContain("noteShared('email')");
    expect(app).toContain('>← Back</Button>');
    expect(enhancements).toContain("history.length > 1 ? 'Previous task' : 'Back'");
  });
});
