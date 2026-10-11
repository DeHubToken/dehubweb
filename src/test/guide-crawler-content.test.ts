/**
 * public/guide-content/<slug>.json is what crawlers read for a standalone
 * guide: the React page rendered to plain HTML by
 * scripts/generate-guide-content.mjs. The build regenerates it, but the
 * committed copy is what anything reading the repo sees, so this renders the
 * page the same way and fails when the file is behind it — run
 * `node scripts/generate-guide-content.mjs` after editing a guide.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { GUIDE_CONTENT_PAGES, guideFragment, wordCount } from '../../scripts/generate-guide-content.mjs';
import BestDecentralizedStreaming from '@/pages/BestDecentralizedStreaming';

// SEOHead writes <head> tags in an effect, which a static render never runs.
vi.mock('@/components/SEOHead', () => ({ SEOHead: () => null }));
vi.mock('@/hooks/usePublicPageLocale', () => ({ usePublicPageLocale: () => ({ localized: false }) }));

const ROOT = resolve(__dirname, '../..');
const PAGES: Record<string, ComponentType> = {
  'best-decentralized-streaming-apps': BestDecentralizedStreaming,
};

describe('guide crawler content', () => {
  it('covers every guide the generator knows', () => {
    expect(Object.keys(PAGES).sort()).toEqual(Object.keys(GUIDE_CONTENT_PAGES).sort());
  });

  it.each(Object.keys(PAGES))('%s matches its React page', (slug) => {
    const markup = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(PAGES[slug])));
    const committed = JSON.parse(readFileSync(resolve(ROOT, `public/guide-content/${slug}.json`), 'utf8'));
    const html = guideFragment(markup);
    expect(committed.html).toBe(html);
    expect(committed.wordCount).toBe(wordCount(html));
  });

  it('is clean semantic HTML: one h1, absolute links, no styling', () => {
    const { html } = JSON.parse(
      readFileSync(resolve(ROOT, 'public/guide-content/best-decentralized-streaming-apps.json'), 'utf8'),
    );
    expect(html.match(/<h1>/g)).toHaveLength(1);
    expect(html).not.toMatch(/\sclass=|\sstyle=|<div|aria-label="Breadcrumb"/);
    expect(html).not.toMatch(/(?:href|src)="\//);
    expect(html).toContain('<h2>Which one should you pick?</h2>');
  });
});
