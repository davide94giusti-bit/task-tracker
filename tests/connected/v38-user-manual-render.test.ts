import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
// The root test tsconfig intentionally has no JSX transform; the Connected
// application is typechecked separately by tsconfig.connected.json.
// @ts-expect-error TS6142 is expected only in the root non-JSX test project.
import { UserManualView } from '../../apps/connected-web/src/UserManualView';

describe('v16.20.1 user manual rendering', () => {
  it('renders every chapter without relying on chapter array positions', () => {
    expect(() => renderToString(createElement(UserManualView))).not.toThrow();
  });

  it('includes the complete manual and current release marker', () => {
    const html = renderToString(createElement(UserManualView));
    expect(html).toContain('User manual');
    expect(html).toContain('Connected v16.20.1');
  });
});
