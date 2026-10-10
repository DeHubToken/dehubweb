import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { Miniflare, WorkerResponse, convertV4MiniflareOptions, productionWorkerModules } from './worker-bundle.mjs';

const original = {
  tokenId: 6501, postType: 'feed-simple', name: ' ',
  description: 'Mobile users - did you prefer the original UIX or the new one? For home theme.',
  minterDisplayName: 'mal', mintername: 'maldoteth', createdAt: '2026-10-08T19:30:05.787Z',
  minterAvatarUrl: 'avatars/mal.jpg',
  totalVotes: { for: 95 }, commentCount: 4, totalViews: 1207,
};
let post = { ...original }, requests = 0;
let profile = { username: 'maldoteth', displayName: 'mal', address: '0x9324840523a5d17dd12a2f11a9472e5a199c1937', badgeBalance: 46707 };
let poll = { tokenId: 6501, question: "Don't use your alts, our AI has already connected accounts using same IP, device or patterns so I will know!", isActive: true, isExpired: true, expiresAt: '2026-10-09T19:30:05.887Z', totalVotes: 123, options: [
  { index: 0, text: 'New full width media', voteCount: 55 },
  { index: 1, text: 'Old bento boxes version (still visible on other themes)', voteCount: 68 },
] };
let progress = { totalStreams: 0, selectedBadgeId: null, cards: [] };
const initialPoll = structuredClone(poll);
let newMember = false;
let failDetails = false;
const outboundUrls = [];
const mf = new Miniflare(convertV4MiniflareOptions({
  modules: await productionWorkerModules(), compatibilityDate: '2026-07-18',
  durableObjects: { EDITOR_PRESENCE: { className: 'EditorPresenceRoom', useSQLite: true } },
  serviceBindings: { ASSETS: request => {
    const path = decodeURIComponent(new URL(request.url).pathname);
    assert.ok(['/brand-kit/font/exo-500.ttf', '/brand/mark-white.png', '/brand/chrome-wave.png'].includes(path) || /^\/brand\/share-badges\/[a-z-]+\.png$/.test(path));
    return new WorkerResponse(readFileSync(new URL(`../public${path}`, import.meta.url)), { headers: { 'Content-Type': path.endsWith('.png') ? 'image/png' : 'font/ttf' } });
  } },
  outboundService: request => {
    outboundUrls.push(request.url);
    const pathname = new URL(request.url).pathname;
    const json = value => new WorkerResponse(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
    if (pathname === '/functions/v1/get-dhb-price') return json({ prices: { DHB: .001 } });
    if (pathname === '/rest/v1/new_members') {
      assert.equal(request.headers.get('x-wallet-address'), null, 'roster read must respect anonymous opt-outs');
      return json(newMember ? [{ joined_at: new Date().toISOString() }] : []);
    }
    if (pathname === '/api/account_info/maldoteth') return failDetails ? new WorkerResponse('Unavailable', { status: 503 }) : json({ status: true, result: profile });
    if (pathname === '/api/poll/6501') return json({ status: true, result: poll });
    if (pathname.startsWith('/api/live/creator/')) return json(progress);
    if (new URL(request.url).pathname.startsWith('/avatars/')) {
      assert.equal(new URL(request.url).origin, 'https://dehubcdn.ams3.digitaloceanspaces.com');
      if (request.url.endsWith('/missing.jpg')) return new WorkerResponse('Missing avatar', { status: 404 });
      if (request.url.endsWith('/redirect.jpg')) return new WorkerResponse(null, { status: 302, headers: { Location: 'https://example.com/private-avatar' } });
      return new WorkerResponse(readFileSync(new URL('../public/brand/mark-white.png', import.meta.url)), { headers: { 'Content-Type': 'image/png' } });
    }
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
  assert.equal(response.headers.get('X-DeHub-Post-Avatar'), 'image');
  assert.equal(response.headers.get('X-DeHub-Post-Badges'), 'Megalodon');
  assert.equal(response.headers.get('X-DeHub-Post-Poll'), 'closed');
  assert.equal(response.headers.get('X-DeHub-Poll-Votes'), '123');
  assert.equal(response.headers.get('X-DeHub-Share-Artwork'), 'store-chrome-wave');
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
  post = { ...original, minterAvatarUrl: 'avatars/missing.jpg' };
  const missingAvatar = await mf.dispatchFetch(url);
  assert.equal(missingAvatar.status, 200);
  assert.equal(missingAvatar.headers.get('X-DeHub-Post-Avatar'), 'initials');
  assert.notDeepEqual(Buffer.from(await missingAvatar.arrayBuffer()), png);
  post = { ...original, minterAvatarUrl: 'avatars/redirect.jpg' };
  const redirectedAvatar = await mf.dispatchFetch(url);
  assert.equal(redirectedAvatar.status, 200);
  assert.equal(redirectedAvatar.headers.get('X-DeHub-Post-Avatar'), 'initials');
  assert.ok(!outboundUrls.includes('https://example.com/private-avatar'), 'avatar redirects must not be followed');
  post = { ...original };
  profile = { ...profile, hideBadgeAndBalance: true };
  const hiddenBadge = await mf.dispatchFetch(url);
  assert.equal(hiddenBadge.headers.get('X-DeHub-Post-Badges'), '');
  assert.notEqual(hiddenBadge.headers.get('ETag'), response.headers.get('ETag'));
  profile = { ...profile, hideBadgeAndBalance: false, displayName: 'Alexandria Montgomery-Wellington' };
  progress = { totalStreams: 1, selectedBadgeId: 'first-light', cards: [{ id: 'first-light', earnedAt: '2026-10-01' }] };
  newMember = true;
  poll = { ...initialPoll, question: 'Which way should we take the next version of the home feed? Tell us what matters most.', options: Array.from({ length: 4 }, (_, i) => ({ index: i, text: 'A longer option for the home feed with room for all four votes', voteCount: i + 1 })), totalVotes: 10 };
  const longIdentity = await mf.dispatchFetch(url);
  assert.equal(longIdentity.status, 200);
  assert.equal(longIdentity.headers.get('X-DeHub-Post-Badges'), 'Megalodon,first-light,New');
  writeFileSync('post-card-checks/long-name-multiple-badges-four-options.png', Buffer.from(await longIdentity.arrayBuffer()));
  profile = { ...profile, displayName: 'mal' };
  newMember = false;
  progress = { totalStreams: 0, selectedBadgeId: null, cards: [] };
  poll = { ...initialPoll, isExpired: false, expiresAt: '2099-01-01' };
  const open = await mf.dispatchFetch(url);
  assert.equal(open.headers.get('X-DeHub-Post-Poll'), 'open');
  assert.equal(open.headers.get('X-DeHub-Poll-Votes'), '');
  writeFileSync('post-card-checks/open-poll.png', Buffer.from(await open.arrayBuffer()));
  poll = { ...initialPoll, isActive: false, totalVotes: 0, options: initialPoll.options.map(o => ({ ...o, voteCount: 0 })) };
  const empty = await mf.dispatchFetch(url);
  assert.equal(empty.headers.get('X-DeHub-Poll-Votes'), '0');
  writeFileSync('post-card-checks/zero-vote-poll.png', Buffer.from(await empty.arrayBuffer()));
  poll = { ...initialPoll, totalVotes: 2, options: initialPoll.options.map(o => ({ ...o, voteCount: 1 })) };
  const tied = await mf.dispatchFetch(url);
  writeFileSync('post-card-checks/tied-poll.png', Buffer.from(await tied.arrayBuffer()));
  failDetails = true;
  const unavailable = await mf.dispatchFetch(url);
  assert.equal(unavailable.headers.get('Cache-Control'), 'no-store');
  assert.equal(unavailable.headers.get('X-DeHub-Post-Badges'), '');
  console.log('Production Worker preserves public gating and avatars; refreshes badges, poll closure and counts; renders long names, four choices, ties and empty polls.');
} finally { await mf.dispose(); }
