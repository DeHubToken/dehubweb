// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { pruneLocaleVersions } from '../../scripts/locale-retention.mjs';
import { serveLocaleAsset } from '../../server/locale-assets.js';

it('retains two generations and leaves unrelated directories intact', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'locale-retention-'));
  try {
    const directory = path.join(root, 'public/locale-pages');
    for (const name of ['aaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbb', 'cccccccccccccccc', 'manual']) fs.mkdirSync(path.join(directory, name), { recursive: true });
    pruneLocaleVersions(root, 'cccccccccccccccc', 'bbbbbbbbbbbbbbbb');
    expect(fs.readdirSync(directory).sort()).toEqual(['bbbbbbbbbbbbbbbb', 'cccccccccccccccc', 'current.json', 'manual']);
    expect(() => pruneLocaleVersions(root, '../outside')).toThrow();
  } finally { fs.rmSync(root, { recursive: true }); }
});

it('serves current translations to a client holding a retired version URL', async () => {
  const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
  const fetch = vi.fn(async (request: Request | URL) => {
    const pathname = new URL(request instanceof Request ? request.url : request).pathname;
    if (pathname.endsWith('/current.json')) return json({ version: 'bbbbbbbbbbbbbbbb' });
    if (pathname === '/locale-pages/bbbbbbbbbbbbbbbb/es/docs.json') return json({ title: 'Documentación' });
    // Static hosting sometimes gives missing assets the SPA's 200 HTML fallback.
    return new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } });
  });
  const response = await serveLocaleAsset(new Request('https://dehub.io/locale-pages/aaaaaaaaaaaaaaaa/es/docs.json'), { ASSETS: { fetch } });
  expect(await response.json()).toEqual({ title: 'Documentación' });
  expect(response.headers.get('Cache-Control')).not.toContain('immutable');
  expect(response.headers.get('X-Locale-Version')).toBe('bbbbbbbbbbbbbbbb');
});
