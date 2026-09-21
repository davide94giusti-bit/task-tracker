import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('v16.14.4 deployment environment reliability', () => {
  it('forwards every connected frontend setting during automatic deployment', () => {
    const workflow = read('.github/workflows/ci.yml');
    for (const name of [
      'CLOUDFLARE_ACCOUNT_ID',
      'VITE_SUPABASE_URL',
      'VITE_SUPABASE_ANON_KEY',
      'VITE_API_BASE_URL',
      'VITE_VAPID_PUBLIC_KEY',
      'VITE_APP_URL',
    ]) expect(workflow).toContain(`${name}: \${{ secrets.${name} }}`);
    expect(workflow).toContain('environment: production');
  });

  it('refuses to publish Pages when a required setting is absent', () => {
    const deploy = read('scripts/deploy-connected.mjs');
    expect(deploy).toContain("'VITE_API_BASE_URL'");
    expect(deploy).toContain('Deployment stopped before build. Missing GitHub secrets:');
    expect(deploy.indexOf('missingEnvironment.length')).toBeLessThan(deploy.indexOf("['run', 'build:connected']"));
  });

  it('reports an actionable error when an API request receives Pages HTML', () => {
    const api = read('apps/connected-web/src/api.ts');
    expect(api).toContain("text.trimStart().startsWith('<')");
    expect(api).toContain('This request reached the website instead of the API Gateway');
  });
});
