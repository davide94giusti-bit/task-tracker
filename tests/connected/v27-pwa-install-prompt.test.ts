import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { detectPwaPlatform } from '../../apps/connected-web/src/pwaInstall';

const read = (path: string) => readFileSync(path, 'utf8');

describe('v16.16.1 guided PWA installation', () => {
  it('detects iPhone, iPad desktop mode, Android, and desktop platforms deterministically', () => {
    expect(detectPwaPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe('ios');
    expect(detectPwaPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', 5)).toBe('ios');
    expect(detectPwaPlatform('Mozilla/5.0 (Linux; Android 16; Pixel)')).toBe('android');
    expect(detectPwaPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('desktop');
  });

  it('captures the native prompt and responds to successful installation', () => {
    const source = read('apps/connected-web/src/PwaInstallPrompt.tsx');
    expect(source).toContain("addEventListener('beforeinstallprompt'");
    expect(source).toContain("addEventListener('appinstalled'");
    expect(source).toContain('await promptEvent.prompt()');
    expect(source).toContain('await promptEvent.userChoice');
    expect(source).toContain("matchMedia('(display-mode: standalone)')");
  });

  it('provides iOS guidance, separates permission, and keeps a persistent Settings entry point', () => {
    const source = read('apps/connected-web/src/PwaInstallPrompt.tsx');
    const app = read('apps/connected-web/src/App.tsx');
    expect(source).toContain('Add Task Tracker to your Home Screen');
    expect(source).toContain('Open this page in Safari and tap Share');
    expect(source).toContain('Installation alone does not grant notification permission');
    expect(app).toContain('<PwaInstallCard');
    expect(app).toContain('install.requiresInstallForPush');
    expect(app).toContain('Install Task Tracker first');
  });

  it('ships an installable manifest and refreshes the application shell cache', () => {
    const manifest = JSON.parse(read('apps/connected-web/public/manifest.webmanifest'));
    expect(manifest.display).toBe('standalone');
    expect(manifest.categories).toContain('productivity');
    expect(manifest.prefer_related_applications).toBe(false);
    expect(read('apps/connected-web/public/service-worker.js')).toMatch(/task-tracker-connected-v16-16-\d+/);
  });
});
