/**
 * A post is addressed four ways and every one of them is a share link someone
 * can paste into Telegram:
 *
 *   /app/post/<tokenId>   the canonical shape, and the only one the deployed
 *                         ssr-seo function has ever rendered
 *   /post/<tokenId>       the bare twin, still in the wild
 *   /posts/<n>[/b[/<id>]] the short shape and the author thread
 *   /newpost/<n>          an off-chain post's own slug — since minting became
 *                         optional this is what most new posts hand out
 *
 * Three of the four unfurled as the homepage card, because the worker's
 * shouldServeSSR gate fails closed and `newpost`/`posts` are reserved
 * ROUTE_SEGMENTS, and because the fn only knows the /app twin. Nothing here is
 * visible to the compiler: it is a gate in a worker, a route table in App.tsx
 * and a reserved-word list that cannot see each other.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RESERVED_USERNAMES } from '@/lib/reserved-usernames';

const ROOT = resolve(__dirname, '../..');
const WORKER = readFileSync(resolve(ROOT, 'CLOUDFLARE_WORKER_SEO.js'), 'utf8');
const APP_TSX = readFileSync(resolve(ROOT, 'src/App.tsx'), 'utf8');

const gate = () => {
  const start = WORKER.indexOf('function shouldServeSSR');
  expect(start).toBeGreaterThan(-1);
  // The whole function, not a byte window: each new rule pushes the older
  // ones down, and a fixed slice starts failing on arrivals rather than on
  // regressions.
  return WORKER.slice(start, WORKER.indexOf('\n}\n', start));
};

describe('post share URLs', () => {
  it('reserves the segments so no account can shadow them', () => {
    for (const word of ['post', 'posts', 'newpost']) {
      expect(RESERVED_USERNAMES.has(word)).toBe(true);
    }
  });

  it('routes every shape in the SPA', () => {
    expect(APP_TSX).toContain('path="/newpost/:n"');
    expect(APP_TSX).toContain('path="/posts/:postId"');
    expect(APP_TSX).toContain('path="/posts/:postId/b"');
    expect(APP_TSX).toContain('path="/posts/:postId/b/:commentId"');
  });

  /**
   * The one that has bitten three times now — stages, then bounties, then
   * these. A missing rule here is indistinguishable from having no renderer at
   * all: the SPA shell goes out with the homepage card and a noindex.
   */
  it('lets the off-chain slug and the short shapes past the SSR gate', () => {
    expect(gate()).toContain(String.raw`/^\/(?:app\/)?newpost\/\d+\/?$/`);
    expect(gate()).toContain(String.raw`/^\/posts\/\d+(?:\/b(?:\/[^/]+)?)?\/?$/`);
  });

  /**
   * The deployed fn renders /app/post/<tokenId> and nothing else, so the
   * proxy path — not the request path — is what decides whether a card comes
   * back. Bare /post/<id> was 404ing for exactly this reason, and it is the
   * canonical URL the worker itself writes for post pages.
   */
  it('normalises every shape onto /app/post/<tokenId> before proxying', () => {
    expect(WORKER).toContain('let ssrPath = pathname;');
    expect(WORKER).toContain('encodeURIComponent(ssrPath)');
    expect(WORKER).toContain(String.raw`/^\/(?:app\/)?newpost\/(\d+)\/?$/`);
    expect(WORKER).toContain(String.raw`/^\/posts\/(\d+)(?:\/b(?:\/[^/]+)?)?\/?$/`);
    expect(WORKER).toContain(String.raw`/^\/post\/(\d+)\/?$/`);
    // /app/video/<tokenId> renders SinglePostPage and parseDehubLink reads it
    // as a post, so it is a fifth spelling of the same page.
    expect(WORKER).toContain(String.raw`/^\/app\/video\/(\d+)\/?$/`);
  });

  it('resolves the slug through the API that owns the mapping', () => {
    expect(WORKER).toContain('async function resolveNewPostTokenId');
    expect(WORKER).toMatch(/api\.dehub\.io\/api\/newpost\//);
  });

  /**
   * isEntityRoute decides whether a generic response from the fn becomes a
   * 404 and whether the per-route OG card is allowed to overwrite the post's
   * own image. It has to read the normalised path, or a /newpost miss would
   * be served 200 with the homepage card — the exact bug being fixed.
   */
  it('classifies the normalised path as an entity route', () => {
    expect(WORKER).toContain("ssrPath.includes('/post/')");
    // Unanchored: /newpost/<n> and its /app twin both have to count.
    expect(WORKER).toContain("pathname.includes('newpost/')");
  });
});
