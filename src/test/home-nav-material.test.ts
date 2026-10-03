import { readFileSync } from 'node:fs';
import postcss from 'postcss';
import { expect, it } from 'vitest';

it('the home capsule and bottom nav match the same liquid-glass rule', () => {
  const css = postcss.parse(readFileSync('src/styles/glass-surfaces.css', 'utf8'));
  let navRule: postcss.Rule | undefined;
  css.walkRules(rule => {
    if (rule.selector.includes('[data-feed-island-surface]') && rule.selector.includes('[data-bottom-nav] > nav')) navRule = rule;
  });
  expect(navRule).toBeDefined();
  document.documentElement.dataset.theme = 'system';
  document.body.innerHTML = '<div data-feed-island><div data-feed-island-surface></div></div><div data-bottom-nav><nav></nav></div><button>Unrelated control</button>';
  for (const node of [document.querySelector('[data-feed-island-surface]')!, document.querySelector('nav')!]) {
    expect(node.matches(navRule!.selector)).toBe(true);
  }
  expect(document.querySelector('button')!.matches(navRule!.selector)).toBe(false);
  const values = Object.fromEntries(navRule!.nodes.filter(node => node.type === 'decl').map(node => [(node as postcss.Declaration).prop, (node as postcss.Declaration).value]));
  expect(values['backdrop-filter']).toBe('var(--nav-glass-blur)');
  expect(values['-webkit-backdrop-filter']).toBe('var(--nav-glass-blur)');
  expect(values.background).toContain('var(--nav-glass-base)');
  expect(readFileSync('src/components/app/navigation/FeedIslandCapsule.tsx', 'utf8')).not.toContain('rounded-[15px]');
  document.body.innerHTML = '';
  delete document.documentElement.dataset.theme;
});
