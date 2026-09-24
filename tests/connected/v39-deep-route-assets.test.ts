import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('v16.20.2 deep-route assets', () => {
  it('builds browser assets from the site root so /join links can load them', () => {
    const config = read('apps/connected-web/vite.config.ts');
    expect(config).toContain("base:'/'");
    expect(config).not.toContain("base:'./'");
  });

  it('keeps the Cloudflare Pages SPA fallback for invitation routes', () => {
    expect(read('apps/connected-web/public/_redirects')).toContain('/* /index.html 200');
  });
});
