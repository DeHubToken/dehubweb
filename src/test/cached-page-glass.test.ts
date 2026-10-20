import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/components/app/PersistentPageCache.tsx'), 'utf8');

describe('cached route glass lifecycle', () => {
  it('retires every hidden route surface without a collapsed paint subtree', () => {
    const wrapper = source.slice(source.indexOf('data-cached-page={config.key}'), source.indexOf('<ErrorBoundary compact'));
    expect(wrapper).toMatch(/shouldStayVisible\s*\? undefined/);
    expect(wrapper).toContain(": { display: 'none' as const }");
    expect(wrapper).not.toMatch(/config\.key ===|contentVisibility|visibility:|height:|position:/);
  });

  it('keeps cached content mounted and the feed visible underneath post overlays', () => {
    expect(source).toContain('const shouldStayVisible = isActive || forceVisible');
    expect(source).toContain('<CachedPageActiveContext.Provider value={shouldStayVisible}>');
    expect(source).toContain('<Component />');
    expect(source).not.toMatch(/(?:isActive|shouldStayVisible)\s*&&\s*<Component/);
  });
});
