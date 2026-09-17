import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const read = (filePath: string) => readFileSync(path.join(root, filePath), 'utf8');

describe('v11 cost UI', () => {
  const enhancements = read('apps/connected-web/src/ConnectedEnhancements.tsx');
  const gateway = read('services-connected/api-gateway/index.ts');

  it('provides nullable task costs, checklist costs and explicit completion', () => {
    const tasks = read('services-connected/tasks/index.ts');
    const data = read('services-connected/data/index.ts');
    expect(enhancements).toContain('Task cost (${currencyCode})');
    expect(enhancements).toContain('Checklist items');
    expect(enhancements).toContain('Complete task');
    expect(enhancements).toContain("status: 'completed'");
    expect(tasks).toContain('cost_amount: input.costAmount');
    expect(data).toContain('cost_amount:input.costAmount');
  });

  it('adds drillable project cost analytics with optional year comparison', () => {
    const migration = read('supabase/migrations/0006_task_cost_tracking.sql');
    expect(gateway).toContain('/^\\/v1\\/costs$/');
    expect(enhancements).toContain('Total cost');
    expect(enhancements).toContain('Cost by project');
    expect(enhancements).toContain('Compare with');
    expect(enhancements).toContain('comparisonYears.length > 0');
    expect(migration).toContain('cost_amount numeric(14,2)');
    expect(migration).toContain("currency_code text not null default 'CHF'");
  });
});
