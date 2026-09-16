// @vitest-environment node
/**
 * legacy.dehub.io is the pre-2026 app. Its DNS record has been deleted, so the
 * host is NXDOMAIN — and because Search Console holds dehub.io as a domain
 * property, the ~300 of its URLs still in Google's index record a fetch
 * failure against dehub.io itself. That is where the 42 "Server error (5xx)"
 * and all 219 "Duplicate without user-selected canonical" pages in the
 * 2026-09-16 index report came from.
 *
 * Same shape as the dead dehub.net subdomains, same two-part fix: a proxied
 * placeholder record on the zone so the edge can answer at all, and the
 * mapping below. This pins the mapping half and the properties that make a
 * domain-move redirect carry its equity, plus the dehub.net behaviour it sits
 * next to, because the two branches share a hostname test.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import worker from '../../CLOUDFLARE_WORKER_SEO.js';

const ROOT = resolve(__dirname, '../..');
const WRANGLER = readFileSync(resolve(ROOT, 'wrangler.jsonc'), 'utf8');

const redirect = async (url: string) => {
  const res = await worker.fetch(new Request(url), {});
  return { status: res.status, to: res.headers.get('Location'), robots: res.headers.get('X-Robots-Tag') };
};

describe('legacy.dehub.io', () => {
  it('301s a profile to its live twin, path preserved', async () => {
    // All twelve usernames in the indexed sample resolve as real dehub.io
    // profiles, so the path-preserving redirect is what makes the move work.
    expect(await redirect('https://legacy.dehub.io/bravenomad_35a9')).toMatchObject({
      status: 301,
      to: 'https://dehub.io/bravenomad_35a9',
    });
    expect((await redirect('https://legacy.dehub.io/0x3d9adf576335fcdd66bddaaed6a0ccf676498361')).to)
      .toBe('https://dehub.io/0x3d9adf576335fcdd66bddaaed6a0ccf676498361');
  });

  it('drops the legacy query string instead of minting a duplicate per tab', async () => {
    // ?tab=user-activity, ?tab=video and ?type=latest are legacy view state
    // with no meaning on dehub.io. Carrying them through would defeat the
    // point of a redirect that exists to collapse them onto one page.
    for (const from of [
      'https://legacy.dehub.io/raw?tab=user-activity',
      'https://legacy.dehub.io/raw?tab=video',
    ]) {
      expect((await redirect(from)).to, from).toBe('https://dehub.io/raw');
    }
    expect((await redirect('https://legacy.dehub.io/?type=latest')).to).toBe('https://dehub.io/');
  });

  it('sends the retired live pages to the successor, and keeps the one that has a twin', async () => {
    // /live/<objectid> was the old livestream record; nothing on dehub.io
    // answers that shape. /stream/<id> does.
    expect((await redirect('https://legacy.dehub.io/live/67d15a36d0f2644f4db08001')).to)
      .toBe('https://dehub.io/videos');
    expect((await redirect('https://legacy.dehub.io/stream/727')).to).toBe('https://dehub.io/stream/727');
  });

  it('normalises a trailing slash rather than paying for a second hop', async () => {
    expect((await redirect('https://legacy.dehub.io/bravenomad_35a9/')).to).toBe('https://dehub.io/bravenomad_35a9');
    expect((await redirect('https://legacy.dehub.io/')).to).toBe('https://dehub.io/');
  });

  it('never stamps noindex on the redirect', async () => {
    // noindex is for mirror hosts serving duplicate content. On a domain-move
    // 301 it risks suppressing the transfer this whole branch exists to make.
    for (const from of ['https://legacy.dehub.io/raw', 'https://legacy.dehub.io/live/abc']) {
      expect((await redirect(from)).robots, from).toBeNull();
    }
  });

  it('is bound to the worker, without which the route cannot fire', () => {
    expect(WRANGLER).toContain('legacy.dehub.io/*');
  });
});

describe('the dehub.net branch it sits beside still behaves', () => {
  it('keeps the path-preserving apex redirect and the subdomain remaps', async () => {
    expect((await redirect('https://dehub.net/someuser')).to).toBe('https://dehub.io/someuser');
    expect((await redirect('https://staking.dehub.net/')).to).toBe('https://dehub.io/stake');
    expect((await redirect('https://dehub.net/web/legal/terms')).to).toBe('https://dehub.io/docs/terms');
  });

  it('keeps www.dehub.io folding onto the apex', async () => {
    expect((await redirect('https://www.dehub.io/docs')).to).toBe('https://dehub.io/docs');
  });
});
