import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import postcss from 'postcss';

const css = postcss.parse(readFileSync('src/index.css', 'utf8'));
const rules: postcss.Rule[] = [];
css.walkRules(rule => { if (rule.selector.includes('[data-image-card]')) rules.push(rule); });
const has = (rule: postcss.Rule, prop: string, value: string) => rule.nodes.some(node => node.type === 'decl' && node.prop === prop && node.value === value);

describe('first mobile photo with the real carousel wrapper', () => {
  it('removes the old capsule clearance and moves identity below the wrapped public image', () => {
    // DOM observed on production: ImageCarousel is wrapped in data-no-swipe.
    // A direct [data-image-media] > [data-media-full] relationship never exists
    // for public images, even though it exists on some gated image branches.
    document.documentElement.dataset.theme = 'system';
    document.body.innerHTML = '<div data-feed-root><div data-feed-item data-cinematic="image" data-cinematic-first><div data-image-card><div data-card-head="plain">Author</div><div data-image-media><div data-no-swipe><div data-media-full>Photo</div></div></div><div data-card-info>Caption</div></div></div></div>';
    const first = document.querySelector('[data-feed-item]')!;
    const head = document.querySelector('[data-card-head]')!;
    const media = document.querySelector('[data-image-media]')!;
    const clearance = rules.find(rule => has(rule, 'padding-top', '0'))!;
    expect(first.matches(clearance.selector)).toBe(true);
    expect(media.matches(rules.find(rule => has(rule, 'grid-row', '1'))!.selector)).toBe(true);
    expect(head.matches(rules.find(rule => has(rule, 'grid-row', '2'))!.selector)).toBe(true);
    expect((clearance.parent as postcss.AtRule).params).toBe('(max-width: 639px)');
    first.removeAttribute('data-cinematic-first');
    expect(first.matches(clearance.selector)).toBe(false);
    first.setAttribute('data-cinematic-first', '');
    media.innerHTML = '<div role="alert">Mature content warning</div>';
    expect(first.matches(clearance.selector)).toBe(false);
    document.body.innerHTML = '';
    delete document.documentElement.dataset.theme;
  });
});
