import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('collaboration workspace regression', () => {
  const migration = readFileSync('supabase/migrations/0016_restore_collaboration_workspace_user.sql', 'utf8');

  it('repairs both functions recreated by migration 0015', () => {
    expect(migration).toContain("procedure.proname in ('user_configure_person_share', 'user_linked_projects')");
    expect(migration).toContain('Expected to correct 2 collaboration functions recreated by migration 0015');
  });

  it('restores authorization before reading the authenticated user id', () => {
    expect(migration).toContain('perform assert_connected_workspace(p_workspace_id); v_user:=auth.uid();');
    expect(migration).toContain('A recreated collaboration workspace assignment remains broken');
  });
});
