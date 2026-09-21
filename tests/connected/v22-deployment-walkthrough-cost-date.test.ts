import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
const deploy = readFileSync('scripts/deploy-connected.mjs', 'utf8');
const manual = readFileSync('apps/connected-web/src/UserManualView.tsx', 'utf8');
const fields = readFileSync('apps/connected-web/src/AccessibleTextField.tsx', 'utf8');
const tasks = readFileSync('services-connected/tasks/index.ts', 'utf8');
const taskView = readFileSync('apps/connected-web/src/ConnectedEnhancements.tsx', 'utf8');

describe('coordinated deployment and refined connected UI', () => {
  it('deploys backend Workers before the Pages frontend on main', () => {
    expect(workflow).toContain('Deploy Workers, then Pages');
    expect(workflow).toContain('CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}');
    expect(deploy.indexOf("['data','identity-access','tasks'")).toBeLessThan(deploy.indexOf("'pages','deploy'"));
  });

  it('fails explicitly when a deployed data service drops the cost date', () => {
    expect(tasks).toContain('(input.costDate ?? null) !== (saved?.costDate ?? null)');
    expect(tasks).toContain('Deploy the current Tasks and Data Workers together');
  });

  it('uses a tap animation and three labelled walkthrough cards without arrow callouts', () => {
    expect(manual).toContain("'manualTap 1.35s ease-in-out infinite'");
    expect(manual).toContain('entry.label');
    expect(manual).not.toContain('ArrowForwardRounded');
  });

  it('uses aria labelling for non-native selects and ids for their hidden inputs', () => {
    expect(fields).toContain('htmlFor: undefined');
    expect(fields).toContain('id: `${fieldId}-native`');
  });

  it('uses the full filter toolbar width with a right-aligned action group', () => {
    expect(taskView).toContain("gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) auto' }");
    expect(taskView).toContain('borderLeft: { lg: 1 }');
  });
});
