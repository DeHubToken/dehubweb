// @vitest-environment node
/**
 * Which dehub.io links iOS hands to the app instead of Safari.
 *
 * The static AASA lists the specific shapes; the worker appends the profile
 * catch-all, which iOS can only express as "exclude every system route, then
 * claim the rest". Components are matched in order and the first hit decides,
 * so this runs the served file through the same first-match rule and checks
 * real URLs against it rather than asserting on the JSON's shape.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import worker from '../../CLOUDFLARE_WORKER_SEO.js';

const WELL_KNOWN = resolve(__dirname, '../../public/.well-known');

const env = {
  ASSETS: {
    fetch: async (req: Request) => {
      const name = new URL(req.url).pathname.split('/').pop()!;
      return new Response(readFileSync(resolve(WELL_KNOWN, name), 'utf8'), { status: 200 });
    },
  },
};

const serve = (path: string) => worker.fetch(new Request(`https://dehub.io${path}`), env);

type Component = { '/': string; exclude?: boolean; caseSensitive?: boolean };

/** Apple's component pattern: `*` any run of characters, `?` exactly one. */
const toRegExp = (c: Component) =>
  new RegExp(
    `^${c['/'].replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`,
    c.caseSensitive === false ? 'i' : '',
  );

let components: Component[] = [];
const opensApp = (path: string) => {
  const hit = components.find((c) => toRegExp(c).test(path));
  return !!hit && !hit.exclude;
};

describe('apple-app-site-association', () => {
  it('is served as JSON at both paths iOS asks for', async () => {
    for (const path of ['/.well-known/apple-app-site-association', '/apple-app-site-association']) {
      const res = await serve(path);
      expect(res.status, path).toBe(200);
      expect(res.headers.get('Content-Type'), path).toBe('application/json');
      const aasa = JSON.parse(await res.text());
      expect(aasa.applinks.details[0].appIDs).toEqual(['FU4BL8RC2L.io.dehub.mobile']);
      components = aasa.applinks.details[0].components;
    }
  });

  it('opens the shared post, bounty, community, store and event links in the app', () => {
    for (const path of [
      '/post/42', '/post/42/info', '/posts/42', '/posts/42/b/55', '/app/post/42',
      '/bounty/7', '/bounty/7/edit',
      '/communities/dehub', '/communities/join/abc',
      '/stores/abc123', '/events/3',
      '/stages', '/stages/12',
    ]) {
      expect(opensApp(path), path).toBe(true);
    }
  });

  it('opens a profile, by username, @handle or verified ENS name', () => {
    for (const path of ['/mal', '/@mal', '/mal.eth', '/0x3d9adf576335fcdd66bddaaed6a0ccf676498361']) {
      expect(opensApp(path), path).toBe(true);
    }
  });

  it('leaves every system route, deeper path, file and the homepage on the web', () => {
    for (const path of [
      '/', '/docs', '/Docs', '/blog', '/explore', '/shorts', '/videos', '/terms', '/privacy',
      '/communities', '/stores', '/bounty', '/posts',
      '/docs/getting-started', '/blog/some-post', '/guides/x', '/mal/videos',
      '/favicon.ico', '/robots.txt', '/sitemap.xml', '/og/dehub-social-share.png',
    ]) {
      expect(opensApp(path), path).toBe(false);
    }
  });
});

describe('assetlinks.json', () => {
  it('is served unchanged as JSON', async () => {
    const res = await serve('/.well-known/assetlinks.json');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/json');
    expect(await res.text()).toBe(readFileSync(resolve(WELL_KNOWN, 'assetlinks.json'), 'utf8'));
  });
});
