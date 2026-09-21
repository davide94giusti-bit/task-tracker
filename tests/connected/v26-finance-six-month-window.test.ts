import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const enhancements = readFileSync('apps/connected-web/src/ConnectedEnhancements.tsx', 'utf8');

describe('v16.15.1 finance six-month chart window', () => {
  it('opens the chart on the six-month period containing the current month', () => {
    expect(enhancements).toContain('now.getMonth() < 6 ? 0 : 1');
    expect(enhancements).toContain('graph.scrollWidth - graph.clientWidth');
    expect(enhancements).toContain('data?.selectedYear');
  });

  it('keeps all twelve months horizontally scrollable in two equal windows', () => {
    expect(enhancements).toContain("gridTemplateColumns: 'repeat(12,minmax(0,1fr))'");
    expect(enhancements).toContain("width: '200%'");
    expect(enhancements).toContain("scrollSnapType: 'x proximity'");
    expect(enhancements).toContain('Scroll horizontally to see other months.');
  });
});
