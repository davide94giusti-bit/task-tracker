import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');
const portal = read('apps/connected-web/src/PublicPersonTasks.tsx');

describe('v16.16.2 shared portal PWA notification onboarding', () => {
  it('requires installation before notification permission on iPhone and iPad', () => {
    expect(portal).toContain("install.platform === 'ios' && !install.installed");
    expect(portal).toContain('Install Task Tracker to enable notifications');
    expect(portal).toContain('install.requestInstall()');
    expect(portal).toContain('<PwaInstallInstructions/>');
    expect(portal).toContain('PWA_INSTALL_RETURN_PATH_KEY');
    expect(portal).toContain('`${location.pathname}${location.search}`');
  });

  it('requests permission after installation and explains denied permission', () => {
    expect(portal).toContain("install.platform === 'ios' && install.installed && notificationPermission !== 'granted'");
    expect(portal).toContain('>Enable notifications</Button>');
    expect(portal).toContain("Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()");
    expect(portal).toContain('Notifications are blocked in device settings');
  });

  it('shows the subscription switch only after installed iOS permission is granted', () => {
    expect(portal).toContain("install.platform !== 'ios' || (install.installed && notificationPermission === 'granted')");
    expect(portal).toContain('{showPushSwitch && <FormControlLabel');
    expect(portal).toContain('data.preferences.pushEnabled && data.preferences.activePushSubscriptions > 0');
    expect(portal).toContain("void savePreferences({ pushEnabled: false })");
  });

  it('refreshes permission state after device settings or app switching', () => {
    expect(portal).toContain("document.addEventListener('visibilitychange', refreshPermission)");
    expect(portal).toContain("window.addEventListener('focus', refreshPermission)");
    expect(read('apps/connected-web/public/service-worker.js')).toContain('task-tracker-connected-v16-16-2');
    expect(read('packages/connected-contracts/release.ts')).toContain("'16.16.2'");
  });

  it('returns an installed Home Screen app to the originating shared link', () => {
    const prompt = read('apps/connected-web/src/PwaInstallPrompt.tsx');
    expect(prompt).toContain("returnPath?.startsWith('/shared-tasks?token=')");
    expect(prompt).toContain('location.replace(returnPath)');
    expect(prompt).toContain('localStorage.removeItem(PWA_INSTALL_RETURN_PATH_KEY)');
  });
});
