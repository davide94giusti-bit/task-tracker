import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ChecklistWrite, ProjectInvitationWrite } from '../../packages/connected-contracts';

const read = (path: string) => readFileSync(path, 'utf8');

describe('v16.20.0 checklist editor and project invitations', () => {
  const contracts = read('packages/connected-contracts/index.ts');
  const taskUi = read('apps/connected-web/src/ConnectedEnhancements.tsx');
  const migration = read('supabase/migrations/0025_checklist_editor_project_invitations.sql');
  const people = read('services-connected/people/index.ts');
  const onboarding = read('apps/connected-web/src/ProjectInvitationOnboarding.tsx');

  it('provides a full-screen hierarchical checklist editor', () => {
    expect(taskUi).toContain('function ChecklistEditorDialog');
    expect(taskUi).toContain('fullScreen slotProps');
    expect(taskUi).toContain("{projectName || 'No project'} → {taskTitle || 'New task'} → Checklist item");
    expect(taskUi).toContain('Select a due time to configure notifications.');
  });

  it('validates two ordered relative notifications in both contract and UI', () => {
    expect(contracts).toContain('notificationOffsets');
    expect(contracts).toContain('The first notification must occur before the second notification');
    expect(taskUi).toContain("[2880, '2 days before']");
    expect(taskUi).toContain("[30, '30 minutes before']");
    expect(taskUi).toContain('A checklist notification cannot be scheduled in the past.');
    const valid = ChecklistWrite.parse({ taskId: '10000000-0000-4000-8000-000000000001', description: 'Request quote', dueDate: '2026-09-30', dueTime: '17:00', notificationOffsets: [2880, 30] });
    expect(valid.notificationOffsets).toEqual([2880, 30]);
    expect(() => ChecklistWrite.parse({ taskId: valid.taskId, description: 'Request quote', dueDate: '2026-09-30', dueTime: '17:00', notificationOffsets: [60, 1440] })).toThrow(/first notification/i);
    expect(() => ChecklistWrite.parse({ taskId: valid.taskId, description: 'Request quote', dueDate: '2026-09-30', dueTime: '17:00', notificationOffsets: [60, 60] })).toThrow(/different times/i);
    expect(() => ChecklistWrite.parse({ taskId: valid.taskId, description: 'Request quote', dueDate: '2026-09-30', notificationOffsets: [60] })).toThrow(/date and time/i);
  });

  it('persists schedules atomically and cancels inactive work', () => {
    expect(migration).toContain('create table if not exists public.checklist_reminders');
    expect(migration).toContain('user_save_checklist_item_schedule');
    expect(migration).toContain('p_expected_version');
    expect(migration).toContain('cancel_inactive_checklist_reminders');
    expect(migration).toContain("new.status in('completed','cancelled','archived')");
  });

  it('reuses the delivery queue for checklist push and email', () => {
    const notifications = read('services-connected/notifications/index.ts');
    expect(migration).toContain("'checklist_reminder'");
    expect(migration).toContain("'checklist-reminder:'");
    expect(notifications).toContain('Checklist reminder');
    expect(notifications).toContain('checklistRelativeReminders: true');
  });

  it('creates short hashed invitations and requires explicit acceptance', () => {
    expect(people).toContain('projectInvitationCode');
    expect(people).toContain('projectInvitationHash');
    expect(people).toContain('invitationClientHash');
    expect(people).toContain('/accept-project-invitation');
    expect(migration).toContain('invitation_code_hash');
    expect(migration).toContain('project_invitation_attempts');
    expect(onboarding).toContain('Accept project');
    expect(onboarding).toContain('Continue as guest');
    expect(onboarding).toContain('Shared with me');
    expect(ProjectInvitationWrite.parse({ projectId: '10000000-0000-4000-8000-000000000001', personId: '10000000-0000-4000-8000-000000000002', access: 'read_only' }).offerNotifications).toBe(true);
  });

  it('documents and versions the coordinated release', () => {
    const manual = read('apps/connected-web/src/UserManualView.tsx');
    expect(manual).toContain('Checklist editor and reminders');
    expect(manual).toContain('Project people and invitations');
    expect(read('packages/connected-contracts/release.ts')).toContain("'16.20.2'");
    expect(read('apps/connected-web/public/service-worker.js')).toContain('task-tracker-connected-v16-20-2');
  });
});
