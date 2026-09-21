import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const enhancements = readFileSync('apps/connected-web/src/ConnectedEnhancements.tsx', 'utf8').replace(/\r\n/g, '\n');

describe('mobile person details dialog', () => {
  it('keeps the close action visible, tappable, and above the device safe area', () => {
    expect(enhancements).toContain("height: '100dvh', maxHeight: '100dvh'");
    expect(enhancements).toContain("pb: 'calc(20px + env(safe-area-inset-bottom))'");
    expect(enhancements).toContain("'& .MuiButton-root': { minHeight: 48, m: 0 }");
    expect(enhancements).toContain("fullWidth={mobile} variant={mobile ? 'contained' : 'text'}");
    expect(enhancements).toContain('aria-label="Close contact details"');
  });
});
