import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const CSS = readFileSync(resolve(__dirname, '../styles/osaka-theme.css'), 'utf8');

describe('Osaka text-input focus treatment', () => {
  it('keeps text fields on their resting edge instead of drawing a neon focus ring', () => {
    expect(CSS).toContain('Text fields retain their resting bento edge while focused.');
    expect(CSS).toContain('box-shadow: inset 0 0 0 1px rgb(var(--osaka-mist) / 0.1) !important;');
    expect(CSS).not.toContain('[data-search-bento]:focus-within');
  });

  it('keeps the custom keyboard outline off text fields', () => {
    expect(CSS).toContain('*:focus-visible:not(input):not(textarea):not(select)');
  });
});
