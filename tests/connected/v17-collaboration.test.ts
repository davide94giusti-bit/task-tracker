import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PersonShareChecklistUpdate, PersonShareComment, PersonShareConfigure, PersonShareProjectPersonMutation, PersonShareTaskComplete, ProjectDelete, ProjectPersonRemove, ProjectPersonSave, ProjectWrite } from '../../packages/connected-contracts';

const uuid = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

describe('v16.13 collaboration contracts', () => {
  it('uses existing workspace membership helpers in collaboration RLS policies', () => {
    const migration = readFileSync('supabase/migrations/0011_verified_project_collaboration.sql', 'utf8');
    expect(migration).not.toContain('current_workspace_id()');
    expect(migration).toContain('public.is_workspace_member(workspace_id)');
    expect(migration).toContain("public.workspace_role_for(workspace_id) in ('owner','admin','member')");
  });

  it('requires a project when project-wide access is selected', () => {
    const base = { personId: uuid('1'), action: 'configure' as const, allowChecklistUpdates: true, allowTaskCompletion: true, allowComments: false, expiresAt: null };
    expect(PersonShareConfigure.safeParse({ ...base, scopeMode: 'project', projectId: null }).success).toBe(false);
    expect(PersonShareConfigure.safeParse({ ...base, scopeMode: 'project', projectId: uuid('2') }).success).toBe(true);
    expect(PersonShareConfigure.safeParse({ ...base, scopeMode: 'assigned', projectId: null }).success).toBe(true);
  });

  it('rejects unknown or malformed collaborator mutations', () => {
    expect(PersonShareChecklistUpdate.safeParse({ itemId: uuid('3'), completed: true, surprise: true }).success).toBe(false);
    expect(PersonShareTaskComplete.safeParse({ taskId: 'not-a-uuid' }).success).toBe(false);
    expect(PersonShareComment.safeParse({ taskId: uuid('4'), comment: ' '.repeat(3) }).success).toBe(false);
    expect(PersonShareComment.safeParse({ taskId: uuid('4'), comment: 'Cleaning completed' }).success).toBe(true);
  });

  it('requires project versions for destructive changes and accepts versioned renames', () => {
    expect(ProjectDelete.safeParse({ id: uuid('5') }).success).toBe(false);
    expect(ProjectDelete.safeParse({ id: uuid('5'), expectedVersion: 3 }).success).toBe(true);
    expect(ProjectWrite.safeParse({ id: uuid('5'), name: 'Airbnb Operations', description: '', color: '#16a34a', expectedVersion: 3 }).success).toBe(true);
  });

  it('validates project-contact sharing without making private fields public by default', () => {
    const parsed = ProjectPersonSave.parse({ projectId: uuid('6'), personId: uuid('7') });
    expect(parsed).toMatchObject({ sharePhone: false, shareEmail: false, shareAddress: false, shareNotes: false, supervisable: false });
    expect(ProjectPersonSave.safeParse({ ...parsed, shareNotes: 'yes' }).success).toBe(false);
    expect(ProjectPersonRemove.safeParse({ projectId: uuid('6'), personId: uuid('7') }).success).toBe(true);
    expect(ProjectPersonRemove.safeParse({ projectId: uuid('6'), personId: uuid('7'), deleteContact: true }).success).toBe(false);
  });

  it('keeps supervisory permissions independent from own-assignment permissions', () => {
    const result = PersonShareConfigure.parse({ personId: uuid('8'), action: 'configure', scopeMode: 'project', projectId: uuid('9'), allowChecklistUpdates: false, allowTaskCompletion: false, allowComments: false, allowViewProjectContacts: true, allowViewContactAssignments: true, allowSuperviseContactChecklists: true, allowCompleteContactTasks: false, allowManageProjectContacts: false, expiresAt: null });
    expect(result.allowChecklistUpdates).toBe(false);
    expect(result.allowSuperviseContactChecklists).toBe(true);
    expect(result.allowCompleteContactTasks).toBe(false);
  });

  it('strictly validates verified collaborator project-contact mutations', () => {
    expect(PersonShareProjectPersonMutation.safeParse({ action: 'create', fullName: 'Anna Cleaner', email: 'ANNA@EXAMPLE.COM' }).success).toBe(true);
    const created = PersonShareProjectPersonMutation.parse({ action: 'create', fullName: 'Anna Cleaner', email: 'ANNA@EXAMPLE.COM' });
    expect(created.action).toBe('create');
    if (created.action !== 'create') throw new Error('Expected a create mutation');
    expect(created.email).toBe('anna@example.com');
    expect(PersonShareProjectPersonMutation.safeParse({ action: 'remove', personId: uuid('10'), deleteFromPeople: true }).success).toBe(false);
    expect(PersonShareProjectPersonMutation.safeParse({ action: 'update', personId: uuid('10'), fullName: '' }).success).toBe(false);
  });

  it('makes pgcrypto available to verification and account-deletion functions', () => {
    const migration = readFileSync('supabase/migrations/0014_fix_pgcrypto_function_search_path.sql', 'utf8');
    expect(migration).toContain("where extension.extname = 'pgcrypto'");
    expect(migration).toContain('set_person_share_verification_code(uuid,text) set search_path');
    expect(migration).toContain('verify_person_share_code(uuid,text) set search_path');
    expect(migration).toContain('prepare_connected_account_deletion(uuid,uuid) set search_path');
  });
});
