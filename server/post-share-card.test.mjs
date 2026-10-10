import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { Resvg, initWasm } from '@resvg/resvg-wasm';
import { textPostCardData, applyTextPostImage, renderPostCardSvg, plainPostText, wrapPostText } from './post-share-card.js';

const post = {
  tokenId: 6501, newPostId: 1051, postType: 'feed-simple', name: ' ',
  description: 'Mobile users - did you prefer the original UIX or the new one? For home theme.',
  minterDisplayName: 'mal', mintername: 'maldoteth', createdAt: '2026-10-08T19:30:05.787Z',
  minterAvatarUrl: 'avatars/mal.jpg', streamInfo: { isLockContent: false, isPayPerView: false },
  totalVotes: { for: 95 }, reactionCounts: { like: 90 }, commentCount: 4, views: 887, totalViews: 1207,
};

test('description-only off-chain posts render their actual text and authoritative counters', () => {
  const data = textPostCardData(post);
  assert.equal(data.title, '');
  assert.equal(data.body, post.description);
  assert.equal(data.author, 'mal');
  assert.deepEqual([data.likes, data.comments, data.views], [95, 4, 1207]);
  assert.equal(textPostCardData({ ...post, totalVotes: { for: 0 }, totalViews: 0 }).views, 0);
  assert.equal(textPostCardData({ ...post, totalVotes: { for: 0 } }).likes, 0);
});

test('restricted content and media posts do not acquire a public text image', () => {
  for (const patch of [
    { isHidden: true }, { isPrivate: true }, { visibility: 'private' }, { status: 'draft' },
    { isPublic: false }, { streamInfo: { isPayPerView: true } }, { streamInfo: { isLockContent: true } },
    { plansDetails: [{ id: 'paid' }] }, { streamStatus: { isLockedWithSubscription: true } },
    { postType: 'video' }, { postType: 'feed-images' }, { postType: 'feed-audio' },
    { imageUrls: ['cover.jpg'] }, { articleImageUrl: 'cover.jpg' }, { socialImageUrl: 'cover.jpg' },
    { community: { is_private: true } },
  ]) assert.equal(textPostCardData({ ...post, ...patch }), null, JSON.stringify(patch));
});

test('both crawler tags and structured data select the same versioned PNG', () => {
  const html = '<head><meta property="og:image" content="avatar.jpg"><meta name="twitter:image" content="avatar.jpg"><script type="application/ld+json">{"@type":"SocialMediaPosting","image":"avatar.jpg"}</script></head>';
  const result = applyTextPostImage(html, post);
  assert.equal((result.match(/https:\/\/dehub.io\/_og\/post\/v1\/6501.png/g) || []).length, 4);
  assert.ok(result.includes('content="1200"'));
  assert.ok(result.includes('content="630"'));
  assert.ok(result.includes('summary_large_image'));
  assert.ok(!result.includes('avatar.jpg'));
  assert.equal(applyTextPostImage(html, { ...post, postType: 'video' }), html);
});

test('text is escaped and clipped without allowing image/markup injection', () => {
  assert.equal(plainPostText('<p>Hello &amp; welcome</p><script>steal()</script>'), 'Hello & welcome');
  const data = textPostCardData({ ...post, title: '<img src="x">A & B', description: '</text><image href="https://evil.test/"/>', minterAvatarUrl: 'https://evil.test/avatar.jpg' });
  assert.equal(data.avatar, '');
  const svg = renderPostCardSvg(data, { logo: '' });
  assert.ok(svg.includes('A &amp; B'));
  assert.ok(!svg.includes('evil.test'));
  const lines = wrapPostText('W'.repeat(1000), 42, 698, 3);
  assert.equal(lines.length, 3);
  assert.ok(lines[2].endsWith('…'));
});

test('renders real PNGs at 1200 by 630 using the deployed font and official mark', async () => {
  await initWasm(readFileSync(new URL('../node_modules/@resvg/resvg-wasm/index_bg.wasm', import.meta.url)));
  const logo = `data:image/png;base64,${readFileSync(new URL('../public/brand/mark-white.png', import.meta.url)).toString('base64')}`;
  const font = readFileSync(new URL('../public/brand-kit/font/exo-500.ttf', import.meta.url));
  mkdirSync('post-card-checks', { recursive: true });
  for (const [name, data] of [
    ['reported-post', textPostCardData(post)],
    ['title-and-description', textPostCardData({ ...post, title: 'The best part of building in public?', description: 'The people who turn a small idea into something bigger.' })],
    ['long-post', textPostCardData({ ...post, title: 'A long title '.repeat(30), description: 'Longer body text, with enough words to test clipping and spacing. '.repeat(50) })],
  ]) {
    const svg = renderPostCardSvg(data, { logo });
    const renderer = new Resvg(svg, { font: { fontBuffers: [font], defaultFontFamily: 'Exo' } });
    const image = renderer.render();
    try {
      const png = image.asPng();
      assert.equal(image.width, 1200);
      assert.equal(image.height, 630);
      assert.deepEqual(Array.from(png.slice(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10]);
      assert.ok(png.length > 10000 && png.length < 1_000_000);
      writeFileSync(`post-card-checks/${name}.png`, png);
    } finally { image.free(); renderer.free(); }
  }
});
