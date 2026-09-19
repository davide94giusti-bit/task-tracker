import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PersonShareChecklistMutation, PersonShareConfigure, PersonShareTaskMutation } from '../../packages/connected-contracts';

const uuid = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;
const read = (path: string) => readFileSync(path, 'utf8');

describe('project collaborator authoring', () => {
  it('keeps task and checklist authoring as independent project permissions', () => {
    const base = {
      personId: uuid('1'), action: 'configure' as const, scopeMode: 'project' as const,
      projectId: uuid('2'), allowChecklistUpdates: false, allowTaskCompletion: false,
      allowComments: false, allowCreateEditTasks: true, allowManageChecklistItems: false,
      expiresAt: null,
    };
    const taskAuthor = PersonShareConfigure.parse(base);
    const checklistManager = PersonShareConfigure.parse({ ...base, allowCreateEditTasks: false, allowManageChecklistItems: true });
    expect(taskAuthor.allowCreateEditTasks).toBe(true);
    expect(taskAuthor.allowManageChecklistItems).toBe(false);
    expect(checklistManager.allowCreateEditTasks).toBe(false);
    expect(checklistManager.allowManageChecklistItems).toBe(true);
  });

  it('validates bounded task authoring without destructive statuses', () => {
    expect(PersonShareTaskMutation.safeParse({ action: 'create', title: 'Inspect boiler', description: '', status: 'in_progress', priority: 'high', dueDate: '2026-09-30' }).success).toBe(true);
    expect(PersonShareTaskMutation.safeParse({ action: 'create', title: 'Delete me', description: '', status: 'archived', priority: 'low' }).success).toBe(false);
    expect(PersonShareTaskMutation.safeParse({ action: 'update', taskId: uuid('3'), expectedVersion: 2, title: 'Repair shower', description: '', status: 'completed', priority: 'high' }).success).toBe(false);
  });

  it('validates checklist create edit remove and reorder operations', () => {
    const taskId = uuid('4'), itemId = uuid('5');
    expect(PersonShareChecklistMutation.safeParse({ action: 'create', taskId, description: 'Photograph completed rooms', required: true }).success).toBe(true);
    expect(PersonShareChecklistMutation.safeParse({ action: 'update', taskId, itemId, description: 'Photograph every room', required: true, expectedVersion: 2 }).success).toBe(true);
    expect(PersonShareChecklistMutation.safeParse({ action: 'remove', taskId, itemId, expectedVersion: 2 }).success).toBe(true);
    expect(PersonShareChecklistMutation.safeParse({ action: 'reorder', taskId, orderedItemIds: [itemId, uuid('6')] }).success).toBe(true);
    expect(PersonShareChecklistMutation.safeParse({ action: 'reorder', taskId, orderedItemIds: [] }).success).toBe(false);
  });

  it('enforces project boundaries and records collaborator actions in the database', () => {
    const migration = read('supabase/migrations/0015_project_collaborator_authoring.sql');
    expect(migration).toContain("scope_mode='project'");
    expect(migration).toContain('project_id=v_share.project_id');
    expect(migration).toContain("status not in ('completed','cancelled','archived')");
    expect(migration).toContain("perform record_person_share_action(v_share.id,v_task.id,'task_created'");
    expect(migration).toContain('Checklist order is incomplete or contains invalid items');
  });

  it('requires verified access for every new public mutation route', () => {
    const gateway = read('services-connected/api-gateway/index.ts');
    expect(gateway).toContain('PersonShareTaskMutation.parse(publicPayload)');
    expect(gateway).toContain('PersonShareChecklistMutation.parse(publicPayload)');
    expect(gateway).toContain('"/v1/public/person-task-mutation", "/v1/public/person-checklist-mutation"');
  });

  it('exposes understandable controls in both owner and collaborator interfaces', () => {
    const owner = read('apps/connected-web/src/App.tsx');
    const portal = read('apps/connected-web/src/PublicPersonTasks.tsx');
    expect(owner).toContain('Can tick checklist items on assigned tasks');
    expect(owner).toContain('Can create and edit tasks');
    expect(owner).toContain('Can manage checklist items');
    expect(portal).toContain('New task');
    expect(portal).toContain('Add checklist item');
    expect(portal).toContain('Checklist order updated.');
  });
});
