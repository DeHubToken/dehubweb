import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const POST_PAGE = readFileSync(resolve(__dirname, '../pages/app/SinglePostPage.tsx'), 'utf8');
const THEME_CSS = readFileSync(resolve(__dirname, '../styles/osaka-theme.css'), 'utf8');
const SHARED_CSS = readFileSync(resolve(__dirname, '../index.css'), 'utf8');

describe('Osaka dedicated post transparency', () => {
  it('marks every dedicated post layout as a post surface', () => {
    expect(POST_PAGE.match(/data-post-page/g)).toHaveLength(3);
  });

  it('clears both direct-route and feed-overlay post surfaces', () => {
    expect(THEME_CSS).toContain("html[data-theme='osaka'] #app-root [data-post-page]");
    expect(SHARED_CSS).toMatch(/\[data-theme="osaka"\][^\n]*\[data-post-overlay\]/);
    expect(SHARED_CSS).toMatch(/\[data-theme="osaka"\][^\n]*\[data-post-overlay-backdrop\]/);
  });
});
