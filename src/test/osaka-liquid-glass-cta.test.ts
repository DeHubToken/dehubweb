import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SIDEBAR = readFileSync(
  resolve(__dirname, '../components/app/navigation/DesktopSidebar.tsx'),
  'utf8',
);
const CSS = readFileSync(resolve(__dirname, '../styles/osaka-theme.css'), 'utf8');

describe('Osaka primary CTA material', () => {
  it('uses the same liquid-glass tokens as the bento above', () => {
    const primaryRule = CSS.slice(
      CSS.indexOf("html[data-theme='osaka'] [data-primary-cta] {"),
      CSS.indexOf("html[data-theme='osaka'] [data-primary-cta]:hover"),
    );
    expect(primaryRule).toContain('border-radius: var(--osaka-r-chip)');
    expect(primaryRule).toContain('var(--glass-highlight)');
    expect(primaryRule).toContain('rgb(var(--glass-tint) / var(--glass-regular))');
    expect(primaryRule).toContain('backdrop-filter: var(--glass-blur)');
    expect(primaryRule).not.toContain('holographic');
    expect(SIDEBAR).not.toContain('OsakaHolographicCtaSurface');
  });

  it('keeps the animated edge and bloom on one shared colour token', () => {
    expect(CSS).toContain('@property --osaka-cta-edge');
    expect(CSS).toContain('@keyframes osaka-cta-edge-shift');
    expect(CSS).toContain('border-color: color-mix(in srgb, var(--osaka-cta-edge)');
    expect(CSS).toContain('0 0 8px color-mix(in srgb, var(--osaka-cta-edge)');
    expect(CSS).toContain('animation: osaka-cta-edge-shift 9s ease-in-out infinite');
    expect(CSS).toMatch(/prefers-reduced-motion:[^)]+\)[\s\S]*animation: none/);
  });
});
