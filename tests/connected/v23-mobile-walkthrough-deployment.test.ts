import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('v16.14.3 walkthrough and coordinated deployment', () => {
  it('keeps walkthrough controls outside the animated screenshot and stacks them on mobile', () => {
    const manual = read('apps/connected-web/src/UserManualView.tsx');
    expect(manual).not.toContain("position: 'absolute', left: 0, right: 0, bottom: 0");
    expect(manual).toContain("gridTemplateColumns: { xs: '1fr', sm:");
    expect(manual).toContain("minHeight: { xs: 46, sm: 58 }");
  });

  it('publishes one release identifier from every Worker health endpoint', () => {
    const runtime = read('services-connected/_shared/runtime.ts');
    const diagnostics = read('services-connected/logging-diagnostics/index.ts');
    expect(runtime).toContain("version:CONNECTED_RELEASE");
    expect(runtime).not.toContain("version:'v1'");
    expect(diagnostics).toContain("version:health('logging-diagnostics').version");
  });

  it('does not report a successful task save when an old Worker drops the cost date', () => {
    const editor = read('apps/connected-web/src/ConnectedEnhancements.tsx');
    expect(editor).toContain('(payload.costDate ?? null) !== (saved.costDate ?? null)');
    expect(editor).toContain('connected Workers are out of date');
  });

  it('allows a manual coordinated deploy and does not wait for the desktop build', () => {
    const workflow = read('.github/workflows/ci.yml');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('needs: [verify]');
    expect(workflow).toContain("github.event_name == 'workflow_dispatch'");
  });

  it('uses standard browser autocomplete values for profile and password fields', () => {
    const access = read('apps/connected-web/src/AccessViews.tsx');
    expect(access).not.toContain('autoComplete="nickname"');
    expect(access).toContain('autoComplete="username"');
    expect(access.match(/autoComplete="new-password"/g)?.length).toBeGreaterThanOrEqual(3);
    expect(access).toContain('id="security-display-name" name="displayName"');
    expect(access).toContain('id="security-new-password" name="newPassword"');
    expect(access).toContain('id="account-confirm-password" name="confirmPassword"');
  });
});
