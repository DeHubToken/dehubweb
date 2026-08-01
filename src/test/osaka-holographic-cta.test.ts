import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SURFACE = readFileSync(
  resolve(__dirname, '../components/app/navigation/OsakaHolographicCtaSurface.tsx'),
  'utf8',
);
const SIDEBAR = readFileSync(
  resolve(__dirname, '../components/app/navigation/DesktopSidebar.tsx'),
  'utf8',
);
const CSS = readFileSync(resolve(__dirname, '../styles/osaka-theme.css'), 'utf8');

describe('Osaka primary CTA material', () => {
  it('renders a lazy Three.js holographic slab only for Osaka', () => {
    expect(SURFACE).toContain("import('three')");
    expect(SURFACE).toContain('new THREE.WebGLRenderer');
    expect(SURFACE).toContain('new THREE.BoxGeometry');
    expect(SURFACE).toContain('new THREE.ShaderMaterial');
    expect(SURFACE).toContain('prefers-reduced-motion: reduce');
    expect(SURFACE).toContain('releaseContext(renderer)');
    expect(SIDEBAR).toContain('<OsakaHolographicCtaSurface');
    expect(SIDEBAR).toContain("active={theme === 'osaka'}");
  });

  it('keeps the neon on a thin universal-radius edge', () => {
    const primaryRule = CSS.slice(
      CSS.indexOf("html[data-theme='osaka'] [data-primary-cta] {"),
      CSS.indexOf("html[data-theme='osaka'] [data-primary-cta]:hover"),
    );
    expect(primaryRule).toContain('border-radius: var(--osaka-r-chip)');
    expect(primaryRule).toContain('border-color: rgb(var(--osaka-neon) / 0.78)');
    expect(primaryRule).toContain('rgb(var(--osaka-void) / 0.94)');
    expect(primaryRule).toContain('color: rgb(var(--osaka-mist))');
    expect(primaryRule).not.toContain('rgb(var(--osaka-neon) / 0.95) 0%');
    expect(primaryRule).not.toContain('border-color: transparent');
  });
});
