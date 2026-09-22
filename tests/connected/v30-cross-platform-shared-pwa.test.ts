import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');
const portal = read('apps/connected-web/src/PublicPersonTasks.tsx');

describe('v16.16.3 cross-platform shared PWA installation', () => {
  it('treats Android and native install-prompt browsers as installation capable', () => {
    expect(portal).toContain("install.platform === 'ios' || install.platform === 'android' || install.canPrompt");
    expect(portal).toContain('if (install.canPrompt) setSharedInstallCapable(true)');
    expect(portal).toContain('{needsInstall && <Box>');
    expect(portal).toContain('Install Task Tracker to enable notifications');
  });

  it('uses the native prompt while preserving the originating shared destination', () => {
    expect(portal).toContain('localStorage.setItem(PWA_INSTALL_RETURN_PATH_KEY');
    expect(portal).toContain('void install.requestInstall()');
    const prompt = read('apps/connected-web/src/PwaInstallPrompt.tsx');
    expect(prompt).toContain('await promptEvent.prompt()');
    expect(prompt).toContain('location.replace(returnPath)');
  });

  it('sequences install, permission, and subscription without blocking non-installable browsers', () => {
    expect(portal).toContain('const needsPermission = install.installed');
    expect(portal).toContain('const showPushSwitch = (!sharedInstallCapable && !install.installed)');
    expect(portal).toContain("if (sharedInstallCapable && !install.installed) { await install.requestInstall(); return; }");
    expect(portal).toContain('Notification.requestPermission()');
  });

  it('advances the connected release and application shell cache', () => {
    expect(read('packages/connected-contracts/release.ts')).toContain("'16.17.1'");
    expect(read('apps/connected-web/public/service-worker.js')).toContain('task-tracker-connected-v16-17-1');
  });
});
