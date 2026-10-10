import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { Miniflare, WorkerResponse, convertV4MiniflareOptions, productionWorkerModules } from './worker-bundle.mjs';

const original = {
  tokenId: 6501, postType: 'feed-simple', name: ' ',
  description: 'Mobile users - did you prefer the original UIX or the new one? For home theme.',
  minterDisplayName: 'mal', mintername: 'maldoteth', createdAt: '2026-10-08T19:30:05.787Z',
  totalVotes: { for: 95 }, commentCount: 4, totalViews: 1207,
};
let post = { ...original }, requests = 0;
const mf = new Miniflare(convertV4MiniflareOptions({
  modules: await productionWorkerModules(), compatibilityDate: '2026-07-18',
  durableObjects: { EDITOR_PRESENCE: { className: 'EditorPresenceRoom', useSQLite: true } },
  serviceBindings: { ASSETS: request => {
    const path = new URL(request.url).pathname;
    assert.ok(['/brand-kit/font/exo-500.ttf', '/brand/mark-white.png'].includes(path));
    return new WorkerResponse(readFileSync(new URL(`../public${path}`, import.meta.url)), { headers: { 'Content-Type': path.endsWith('.png') ? 'image/png' : 'font/ttf' } });
  } },
  outboundService: request => {
    assert.equal(request.url, 'https://api.dehub.io/api/nft_info/6501');
    assert.equal(request.headers.get('authorization'), null);
    requests++;
    return new WorkerResponse(JSON.stringify({ result: post }), { headers: { 'Content-Type': 'application/json' } });
  },
}));

try {
  const url = 'https://dehub.io/_og/post/v1/6501.png';
  const response = await mf.dispatchFetch(url);
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(response.headers.get('Content-Type'), 'image/png');
  assert.equal(response.headers.get('X-DeHub-Post-Counts'), '95,4,1207');
  const png = Buffer.from(await response.arrayBuffer());
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
  mkdirSync('post-card-checks', { recursive: true });
  writeFileSync('post-card-checks/worker-post.png', png);
  const head = await mf.dispatchFetch(url, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal((await head.arrayBuffer()).byteLength, 0);
  assert.equal(requests, 2, 'even cached cards recheck the public record');
  post = { ...post, totalVotes: { for: 96 }, commentCount: 5, totalViews: 1210 };
  const changed = await mf.dispatchFetch(url);
  assert.equal(changed.status, 200);
  assert.equal(changed.headers.get('X-DeHub-Post-Counts'), '96,5,1210');
  assert.notEqual(changed.headers.get('ETag'), response.headers.get('ETag'));
  assert.notDeepEqual(Buffer.from(await changed.arrayBuffer()), png);
  post = { ...post, isHidden: true };
  const restricted = await mf.dispatchFetch(url);
  assert.equal(restricted.status, 404);
  assert.equal(restricted.headers.get('Cache-Control'), 'no-store');
  assert.equal(requests, 4);
  console.log('Production Worker renders PNGs, refreshes counters, serves HEAD and rejects newly hidden posts.');
} finally { await mf.dispose(); }
