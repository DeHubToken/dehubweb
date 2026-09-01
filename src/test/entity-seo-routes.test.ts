/**
 * Per-entity crawler HTML is gated by `shouldServeSSR`, which fails closed:
 * a path it does not recognise gets the SPA shell with the homepage card and
 * a noindex, which looks exactly like having no renderer at all. That is how
 * the stage cards, then the bounty cards, then the whole off-chain post space
 * shipped broken — and how the /cinema film renderer ran zero times between
 * being written and being found here.
 *
 * Every reserved ROUTE_SEGMENT with a sub-path therefore needs an explicit
 * rule, and this file is the place that notices when a new one arrives
 * without it.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const WORKER = readFileSync(resolve(ROOT, 'CLOUDFLARE_WORKER_SEO.js'), 'utf8');

const gate = () => {
  const start = WORKER.indexOf('function shouldServeSSR');
  expect(start).toBeGreaterThan(-1);
  // The whole function, not a byte window: each new rule pushes the older
  // ones down, and a fixed slice starts failing on arrivals rather than on
  // regressions.
  return WORKER.slice(start, WORKER.indexOf('\n}\n', start));
};

describe('entity SEO routes', () => {
  it('lets a single film or series past the gate', () => {
    expect(gate()).toContain(String.raw`/^\/cinema\/(?:film|series)\/\d+\/?$/`);
  });

  /** The renderer this unlocks matches on the /app-stripped section key. */
  it('keeps the film renderer matching the shape the SPA links to', () => {
    expect(WORKER).toContain(String.raw`/^cinema\/(film|series)\/\d+$/`);
  });

  it('lets a governance proposal past the gate and renders it', () => {
    expect(gate()).toContain(String.raw`/^\/app\/governance\/[0-9a-fA-F-]{8,}\/?$/`);
    expect(WORKER).toContain('function buildProposalHtml');
    expect(WORKER).toMatch(/governance_proposals\?id=eq\./);
  });

  it('lets /app/video/<tokenId> past the gate', () => {
    expect(gate()).toContain(String.raw`/^\/app\/video\/\d+\/?$/`);
  });

  /**
   * Sub-paths with no metadata of their own fall back to their section card
   * under a noindex — better than the homepage card, and without minting an
   * indexable page per id that says the same thing as the section.
   */
  it('falls back to the section card for launchpad coins and the chess lobby', () => {
    expect(gate()).toContain(String.raw`/^\/(?:app\/)?launchpad\/[^/]+\/?$/`);
    expect(gate()).toContain(String.raw`/^\/(?:app\/)?arcade\/kings-gambit\/online\/?$/`);
    expect(WORKER).toContain('const SECTION_FALLBACKS = [');
  });

  it('accepts the /app twin of an off-chain post slug', () => {
    expect(gate()).toContain(String.raw`/^\/(?:app\/)?newpost\/\d+\/?$/`);
  });

  /**
   * `/communities/<slug>` and `/app/communities/<slug>` are both real routes,
   * but the deployed fn has no `communities` entry in its system-route list,
   * so the bare twin was read as a username and 404'd. Normalising to the
   * /app shape is the same move the post URLs make.
   */
  it('normalises the bare community twin onto the /app shape', () => {
    expect(WORKER).toContain(String.raw`/^\/communities\/([^/]+)\/?$/`);
    expect(WORKER).toContain('ssrPath = `/app/communities/${bareCommunity[1]}`');
  });
});
