import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const read = (filePath: string) => readFileSync(path.join(root, filePath), 'utf8');

describe('v9.3 regressions', () => {
  it('labels task filters when no value is selected', () => {
    const enhancements = read('apps/connected-web/src/ConnectedEnhancements.tsx');
    expect(enhancements).toContain('label="Priority"');
    expect(enhancements).toContain("'All priorities'");
    expect(enhancements).toContain('label="Project"');
    expect(enhancements).toContain("'All projects'");
  });
});
