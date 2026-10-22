import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const PAGE = readFileSync(resolve(__dirname, '../pages/ConnectChatGPTPage.tsx'), 'utf8');
const BACKGROUND = readFileSync(resolve(__dirname, '../styles/glass.css'), 'utf8');

describe('ChatGPT account consent theme surface', () => {
  it('keeps consent text above the shared glass canvas on desktop and mobile', () => {
    expect(PAGE).toContain('data-glass-page data-theme-page-surface className="relative z-[1] min-h-screen');
    expect(PAGE).toContain('<AccountConnection />');
    expect(BACKGROUND).toContain('[data-glass-page]');
  });
});
