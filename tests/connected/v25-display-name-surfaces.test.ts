import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('v16.15.0 display-name identity surfaces', () => {
  it('shows the active display name in an accessible account menu', () => {
    const app = read('apps/connected-web/src/App.tsx');
    expect(app).toContain("identity?.displayName?.trim()");
    expect(app).toContain('Account menu for ${accountName}');
    expect(app).toContain('Profile &amp; security');
    expect(app).toContain('onProfileUpdated');
  });

  it('shows accepted user names while retaining their sign-in email', () => {
    const access = read('apps/connected-web/src/AccessViews.tsx');
    const migration = read('supabase/migrations/0019_display_name_identity_surfaces.sql');
    expect(access).toContain('invite.displayName || invite.email');
    expect(access).toContain("invite.displayName &&");
    expect(migration).toContain("'displayName', nullif(trim(p.display_name), '')");
    expect(migration).toContain('left join public.profiles p on p.id = i.accepted_user_id');
  });

  it('returns and renders a permission-checked task activity timeline', () => {
    const data = read('services-connected/data/index.ts');
    const tasks = read('services-connected/tasks/index.ts');
    const ui = read('apps/connected-web/src/ConnectedEnhancements.tsx');
    const migration = read('supabase/migrations/0019_display_name_identity_surfaces.sql');
    expect(data).toContain("task_activity_timeline:'user_task_activity_timeline'");
    expect(tasks).toContain('name: "task_activity_timeline"');
    expect(tasks).toContain('}).catch(() => [])');
    expect(tasks).toContain('dependencies: enrichedDependencies, activities');
    expect(ui).toContain('activity.authorDisplayName');
    expect(ui).toContain('activity.details?.comment');
    expect(migration).toContain('m.user_id = auth.uid()');
    expect(migration).toContain("person_share.id::text = activity.details->>'shareId'");
    expect(migration).toContain('limit 100');
  });
});
