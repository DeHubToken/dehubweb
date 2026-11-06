// @vitest-environment node
/** riftn.com certificate checks reach the standby server's challenge folder. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../../CLOUDFLARE_WORKER_SEO.js';

afterEach(() => vi.unstubAllGlobals());

describe('standby certificate challenge', () => {
  it('passes riftn.com challenges to the server', async () => {
    const seen: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => { seen.push(String(url)); return new Response('token.key'); });
    const res = await worker.fetch(new Request('https://riftn.com/.well-known/acme-challenge/abcdefghijklmnop_-12'), {});
    expect(await res.text()).toBe('token.key');
    expect(seen).toEqual(['http://dehub.io/.well-known/acme-challenge/abcdefghijklmnop_-12']);
  });

  it('ignores other hosts and odd tokens', async () => {
    const seen: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => { seen.push(String(url)); return new Response(''); });
    for (const url of [
      'https://staging.dehub.io/.well-known/acme-challenge/abcdefghijklmnop',
      'https://riftn.com/.well-known/acme-challenge/../../etc/passwd',
      'https://riftn.com/.well-known/acme-challenge/short',
    ]) {
      try { await worker.fetch(new Request(url), {}); } catch { /* falls through to bindings */ }
    }
    expect(seen.filter((u) => u.startsWith('http://dehub.io/.well-known/acme-challenge/'))).toEqual([]);
  });
});
