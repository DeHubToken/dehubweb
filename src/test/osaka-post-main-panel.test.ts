import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const LAYOUT = readFileSync(resolve(__dirname, '../components/app/AppLayout.tsx'), 'utf8');
const THEME_CSS = readFileSync(resolve(__dirname, '../styles/osaka-theme.css'), 'utf8');

describe('Osaka dedicated-post middle panel', () => {
  it('marks the main panel when a post route is active', () => {
    expect(LAYOUT).toContain("data-post-route={isPostRoute ? '' : undefined}");
  });

  it('clears the complete main-panel background for Osaka post routes', () => {
    expect(THEME_CSS).toContain("html[data-theme='osaka'] #app-root main[data-main-panel][data-post-route]");
    expect(THEME_CSS).toContain('background: transparent !important;');
  });
});
