import { readFileSync } from 'node:fs';
import postcss from 'postcss';
import { expect, it } from 'vitest';

it('the home capsule and bottom nav share a stable nav material', () => {
  const css = postcss.parse(readFileSync('src/styles/glass-surfaces.css', 'utf8'));
  let navRule: postcss.Rule | undefined;
  css.walkRules(rule => {
    if (rule.selector.includes('[data-feed-island-surface]') && rule.selector.includes('[data-bottom-nav] > nav')) navRule = rule;
  });
  expect(navRule).toBeDefined();
  // CI's jsdom selector engine cannot evaluate nested :is/:not groups.
  // Parse the shared surface list with PostCSS instead of treating jsdom as
  // a CSS engine; the browser material declarations remain the same rule.
  const surfaces = navRule!.selector.match(/\n\s*:is\(([\s\S]*)\):not\(#_\):not\(#_\)$/)![1];
  const selectors = postcss.list.comma(surfaces);
  expect(selectors).toContain('[data-feed-island-surface]');
  expect(selectors).toContain('[data-bottom-nav] > nav');
  // Page islands already carry a stationary backdrop. Painting this material
  // on their parent as well creates two blur textures and a horizontal seam.
  expect(selectors).toContain('[data-feed-nav-outer] > [data-page-bento]:not([data-bento-flat]):not(:has(> [data-nav-glass-backdrop]))');
  expect(selectors.some(selector => selector.includes('button'))).toBe(false);
  const values = Object.fromEntries(navRule!.nodes.filter(node => node.type === 'decl').map(node => [(node as postcss.Declaration).prop, (node as postcss.Declaration).value]));
  expect(values['backdrop-filter']).toBe('none');
  expect(values['-webkit-backdrop-filter']).toBe('none');
  expect(values.background).toContain('var(--nav-glass-base)');
  expect(readFileSync('src/components/app/navigation/FeedIslandCapsule.tsx', 'utf8')).not.toContain('rounded-[15px]');
});
