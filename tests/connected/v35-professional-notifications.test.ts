import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { reminderEmail } from '../../services-connected/_shared/email';

const read = (path: string) => readFileSync(path, 'utf8');

describe('v16.19.0 professional notifications and deep links', () => {
  it('renders useful, escaped HTML and plain-text reminder content', () => {
    const message = reminderEmail({
      title: 'Pay <electricity> bill',
      kind: 'Task reminder',
      summary: 'This task needs attention.',
      url: 'https://task-tracker.example/?view=tasks&task=123',
      actionLabel: 'Open task',
      details: [
        { label: 'Due', value: '23 Sep 2026 at 18:00' },
        { label: 'Project', value: 'House renovation' },
        { label: 'Priority', value: 'High priority' },
      ],
    });
    expect(message.html).toContain('Connected workspace notification');
    expect(message.html).toContain('Pay &lt;electricity&gt; bill');
    expect(message.html).toContain('23 Sep 2026 at 18:00');
    expect(message.html).toContain('House renovation');
    expect(message.html).toContain('Open task');
    expect(message.text).toContain('Priority: High priority');
    expect(message.html).not.toContain('Pay <electricity> bill');
  });

  it('sends rich task and shared-work push payloads', () => {
    const notifications = read('services-connected/notifications/index.ts');
    expect(notifications).toContain('title: `Reminder · ${d.title}`');
    expect(notifications).toContain('body: taskPushBody(d)');
    expect(notifications).toContain('taskDueLabel(delivery)');
    expect(notifications).toContain('delivery.projectName || "No project"');
    expect(notifications).toContain('delivery.taskBlocked ? "Blocked"');
    expect(notifications).toContain('title: `Shared work · ${d.title}`');
  });

  it('opens the exact task and retains it through authentication', () => {
    const app = read('apps/connected-web/src/App.tsx');
    const notifications = read('services-connected/notifications/index.ts');
    expect(notifications).toContain('/?view=tasks&task=${encodeURIComponent(d.taskId)}&source=notification');
    expect(app).toContain("localStorage.setItem(PWA_INSTALL_RETURN_PATH_KEY");
    expect(app).toContain('`/tasks/details?taskId=${encodeURIComponent(linkedTaskId)}`');
    expect(app).toContain('setTask(details.task)');
    expect(app).toContain("params.delete('task')");
  });

  it('adds compatible installed-PWA launch handling without claiming unsupported iOS behavior', () => {
    const manifest = read('apps/connected-web/public/manifest.webmanifest');
    const prompt = read('apps/connected-web/src/PwaInstallPrompt.tsx');
    const manual = read('apps/connected-web/src/UserManualView.tsx');
    expect(manifest).toContain('"launch_handler":{"client_mode":"navigate-existing"}');
    expect(manifest).toContain('"handle_links":"preferred"');
    expect(prompt).toContain("returnPath?.startsWith('/') && !returnPath.startsWith('//')");
    expect(manual).toContain('iPhone and iPad email clients cannot be forced');
  });

  it('uses a permission-checked scheduler migration for canonical context', () => {
    const migration = read('supabase/migrations/0023_professional_notifications.sql');
    expect(migration).toContain('create or replace function public.claim_due_notification_deliveries');
    expect(migration).toContain("'dueDate',task.due_date");
    expect(migration).toContain("'projectName',coalesce(project.name,'No project')");
    expect(migration).toContain('revoke all on function public.claim_due_notification_deliveries(integer,text) from public,anon,authenticated');
    expect(migration).toContain('grant execute on function public.claim_due_notification_deliveries(integer,text) to service_role');
  });
});
