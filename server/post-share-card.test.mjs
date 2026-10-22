import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { Resvg, initWasm } from '@resvg/resvg-wasm';
import { postCardData, postCardMedia, applyPostShareImage, profileCardData, applyProfileShareImage, renderProfileCardSvg, renderPostCardSvg, plainPostText, wrapPostText, layoutPostCardCopy } from './post-share-card.js';

const post = {
  tokenId: 6501, newPostId: 1051, postType: 'feed-simple', name: ' ',
  description: 'Mobile users - did you prefer the original UIX or the new one? For home theme.',
  minterDisplayName: 'mal', mintername: 'maldoteth', createdAt: '2026-10-08T19:30:05.787Z',
  minterAvatarUrl: 'avatars/mal.jpg', streamInfo: { isLockContent: false, isPayPerView: false },
  totalVotes: { for: 95 }, reactionCounts: { like: 90 }, commentCount: 4, views: 887, totalViews: 1207,
};

test('share badges keep the exact profile still artwork', () => {
  for (const file of readdirSync(new URL('../public/brand/share-badges/', import.meta.url))) {
    const source = file === 'killer-whale.png' ? '../src/assets/badges/Killer Whale.png' : `../src/assets/badges/hover/${file}`;
    assert.deepEqual(readFileSync(new URL(`../public/brand/share-badges/${file}`, import.meta.url)), readFileSync(new URL(source, import.meta.url)), file);
  }
});

test('description-only off-chain posts render their actual text and authoritative counters', () => {
  const data = postCardData(post);
  assert.equal(data.title, '');
  assert.equal(data.body, post.description);
  assert.equal(data.author, 'mal');
  assert.deepEqual([data.likes, data.comments, data.views], [95, 4, 1207]);
  assert.equal(postCardData({ ...post, totalVotes: { for: 0 }, totalViews: 0 }).views, 0);
  assert.equal(postCardData({ ...post, totalVotes: { for: 0 } }).likes, 0);
});

test('restricted, unrated-unsafe and audio posts do not acquire a public image', () => {
  for (const patch of [
    { isHidden: true }, { isPrivate: true }, { visibility: 'private' }, { status: 'draft' },
    { isPublic: false }, { streamInfo: { isPayPerView: true } }, { streamInfo: { isLockContent: true } },
    { plansDetails: [{ id: 'paid' }] }, { streamStatus: { isLockedWithSubscription: true } },
    { postType: 'feed-audio' }, { postType: 'live' },
    { contentRating: 'mature' }, { contentRating: 'blocked' }, { contentRating: 'pending' },
    { postType: 'video', videoUrl: 'videos/6501.mp4', thumbnail_url: 'images/6501.jpg', contentRating: 'mature' },
    { community: { is_private: true } },
  ]) assert.equal(postCardData({ ...post, ...patch }), null, JSON.stringify(patch));
  assert.ok(postCardData({ ...post, contentRating: 'safe' }));
});

test('media posts carry their own poster or first image from the CDN only', () => {
  const cdn = 'https://dehubcdn.ams3.cdn.digitaloceanspaces.com';
  const video = { ...post, postType: 'video', videoUrl: 'videos/6501.mp4', description: '' };
  assert.deepEqual(postCardMedia({ ...video, thumbnail_url: 'statics/images/6501-thumb.jpg', imageUrl: 'images/other.jpg' }), { url: `${cdn}/images/6501-thumb.jpg`, video: true });
  assert.deepEqual(postCardMedia({ ...video, imageUrl: 'nfts/images/6501.jpeg' }), { url: `${cdn}/images/6501.jpeg`, video: true });
  assert.deepEqual(postCardMedia({ ...post, postType: 'feed-images', imageUrls: ['feed-images/a.png', 'feed-images/b.png'] }), { url: `${cdn}/feed-images/a.png`, video: false });
  assert.deepEqual(postCardMedia({ ...post, articleImageUrl: 'nfts/images/cover.jpg' }), { url: `${cdn}/feed-images/cover.jpg`, video: false });
  assert.equal(postCardMedia({ ...post, postType: 'feed-images', imageUrls: ['https://evil.test/a.png'] }), null);
  assert.equal(postCardMedia(post), null);
  const data = postCardData({ ...video, thumbnail_url: 'images/6501.jpg', totalTips: 1250.5 });
  assert.equal(data.media.video, true);
  assert.equal(data.tips, 1250);
  assert.equal(postCardData(video), null, 'a video without a poster keeps the page preview');
});

test('mature posts and unreadable records share the brand card without their video', () => {
  const html = '<head><meta property="og:image" content="https://cdn/images/6501.jpg"><meta property="og:video" content="https://cdn/videos/6501.mp4"><meta name="twitter:image" content="https://cdn/images/6501.jpg"></head>';
  for (const record of [{ ...post, postType: 'video', contentRating: 'mature' }, null]) {
    const result = applyPostShareImage(html, record);
    assert.equal((result.match(/https:\/\/dehub.io\/og\/dehub-social-share.png/g) || []).length, 3);
    assert.ok(!result.includes('6501.jpg') && !result.includes('og:video'));
    assert.ok(result.includes('summary_large_image') && result.includes('content="630"'));
  }
  const media = applyPostShareImage(html, { ...post, postType: 'video', videoUrl: 'videos/6501.mp4', thumbnail_url: 'images/6501.jpg' });
  assert.equal((media.match(/https:\/\/dehub.io\/_og\/post\/v4\/6501.png/g) || []).length, 3);
  assert.ok(media.includes('og:video'), 'a safe video keeps og:video for players that use it');
});

test('both crawler tags and structured data select the same versioned PNG', () => {
  const html = '<head><meta property="og:image" content="avatar.jpg"><meta name="twitter:image" content="avatar.jpg"><script type="application/ld+json">{"@type":"SocialMediaPosting","image":"avatar.jpg"}</script></head>';
  const result = applyPostShareImage(html, post);
  assert.equal((result.match(/https:\/\/dehub.io\/_og\/post\/v4\/6501.png/g) || []).length, 4);
  assert.ok(result.includes('content="1200"'));
  assert.ok(result.includes('content="630"'));
  assert.ok(result.includes('summary_large_image'));
  assert.ok(!result.includes('avatar.jpg'));
  assert.equal(applyPostShareImage(html, { ...post, postType: 'feed-audio' }), html);
});

test('text is escaped and clipped without allowing image/markup injection', () => {
  assert.equal(plainPostText('<p>Hello &amp; welcome</p><script>steal()</script>'), 'Hello & welcome');
  const data = postCardData({ ...post, title: '<img src="x">A & B', description: '</text><image href="https://evil.test/"/>', minterAvatarUrl: 'https://evil.test/avatar.jpg' });
  assert.equal(data.avatar, '');
  const svg = renderPostCardSvg(data, { logo: '' });
  assert.ok(svg.includes('A &amp; B'));
  assert.ok(!svg.includes('evil.test'));
  const lines = wrapPostText('W'.repeat(1000), 42, 698, 3);
  assert.equal(lines.length, 3);
  assert.ok(lines[2].endsWith('…'));
});

const closedPoll = {
  question: "Don't use your alts, our AI has already connected accounts using same IP, device or patterns so I will know!",
  ended: true, totalVotes: 123,
  options: [
    { index: 0, text: 'New full width media', percent: 45, winner: false },
    { index: 1, text: 'Old bento boxes version (still visible on other themes)', percent: 55, winner: true },
  ],
};

test('post text and polls flow together without a bottom-anchored gap or overlap', () => {
  for (const title of ['', 'A short title', 'A long title '.repeat(30)]) {
    for (const body of ['Short body.', post.description, 'Long body text '.repeat(70)]) {
      for (const options of [closedPoll.options, Array.from({ length: 4 }, (_, index) => ({ index, text: 'W'.repeat(60), percent: 25, winner: true }))]) {
        const layout = layoutPostCardCopy({ title, body, poll: { ...closedPoll, question: 'Long poll question '.repeat(12), options } });
        assert.equal(layout.poll.top - layout.body.bottom, 24);
        if (title) assert.equal(layout.body.top - layout.title.bottom, 24);
        assert.ok(layout.poll.top + layout.poll.height <= 488, `results enter the footer space for ${title.length}/${body.length}/${options.length}`);
      }
    }
  }
  const short = layoutPostCardCopy({ title: '', body: 'One line', poll: closedPoll });
  assert.ok(short.poll.top < 190, 'a short post must not leave a blank middle before its poll');
});

test('renders real PNGs at 1200 by 630 using the deployed font and official mark', async () => {
  await initWasm(readFileSync(new URL('../node_modules/@resvg/resvg-wasm/index_bg.wasm', import.meta.url)));
  const logo = `data:image/png;base64,${readFileSync(new URL('../public/brand/mark-white.png', import.meta.url)).toString('base64')}`;
  const chrome = `data:image/png;base64,${readFileSync(new URL('../public/brand/share-chrome-edge.png', import.meta.url)).toString('base64')}`;
  const font = readFileSync(new URL('../public/brand-kit/font/exo-500.ttf', import.meta.url));
  const photo = `data:image/jpeg;base64,${readFileSync(new URL('../public/og/apps.jpg', import.meta.url)).toString('base64')}`;
  mkdirSync('post-card-checks', { recursive: true });
  for (const [name, data] of [
    ['reported-post', postCardData(post)],
    ['title-and-description', postCardData({ ...post, title: 'The best part of building in public?', description: 'The people who turn a small idea into something bigger.' })],
    ['long-post', postCardData({ ...post, title: 'A long title '.repeat(30), description: 'Longer body text, with enough words to test clipping and spacing. '.repeat(50) })],
    ['concluded-poll-flow', { ...postCardData(post), poll: closedPoll }],
    ['title-description-poll-flow', { ...postCardData({ ...post, title: 'Your home feed, your choice.' }), poll: closedPoll }],
    ['video-post', postCardData({ ...post, postType: 'video', videoUrl: 'videos/6501.mp4', thumbnail_url: 'images/6501.jpg', totalTips: 4200 })],
    ['image-post-no-caption', postCardData({ ...post, postType: 'feed-images', description: '', imageUrls: ['feed-images/a.jpg'] })],
  ]) {
    const svg = renderPostCardSvg(data, { logo, chrome, media: data.media ? photo : '' });
    if (data.media) assert.ok(svg.includes(`data-media="${data.media.video ? 'video-poster' : 'image'}"`));
    assert.ok(svg.includes('data-brand-artwork="integrated-chrome-edge"'));
    assert.ok(!svg.includes('chrome-mask'));
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

test('profiles share a rendered card with their name, handle and followers', async () => {
  const account = { username: 'mal.eth', displayName: 'mal', avatarImageUrl: 'statics/avatars/0xabc.jpg', followers: 1520, uploads: 34, address: '0xabc' };
  const data = profileCardData(account);
  assert.deepEqual(data, { handle: 'mal.eth', avatar: 'https://dehubcdn.ams3.cdn.digitaloceanspaces.com/avatars/0xabc.jpg', name: 'mal', followers: 1520, posts: 34 });
  assert.equal(profileCardData({ ...account, hideFollowers: true }).followers, null);
  for (const patch of [{ isBanned: true }, { username: '' }, { username: '../x' }]) assert.equal(profileCardData({ ...account, ...patch }), null);
  const html = '<head><meta property="og:image" content="avatar.jpg"><meta name="twitter:card" content="summary"></head>';
  const tagged = applyProfileShareImage(html, account);
  assert.equal((tagged.match(/https:\/\/dehub.io\/_og\/profile\/v1\/mal.eth.png/g) || []).length, 3);
  assert.ok(tagged.includes('summary_large_image') && tagged.includes('content="1200"') && !tagged.includes('avatar.jpg'));
  assert.equal(applyProfileShareImage(html, null), html);
  await initWasm(readFileSync(new URL('../node_modules/@resvg/resvg-wasm/index_bg.wasm', import.meta.url))).catch(() => {});
  const logo = `data:image/png;base64,${readFileSync(new URL('../public/brand/mark-white.png', import.meta.url)).toString('base64')}`;
  const chrome = `data:image/png;base64,${readFileSync(new URL('../public/brand/share-chrome-edge.png', import.meta.url)).toString('base64')}`;
  const font = readFileSync(new URL('../public/brand-kit/font/exo-500.ttf', import.meta.url));
  for (const [name, card] of [['profile', data], ['profile-long-name', { ...data, name: 'Alexandria Montgomery-Wellington of the Northern Reaches', followers: null }]]) {
    const renderer = new Resvg(renderProfileCardSvg(card, { logo, chrome, avatar: logo }), { font: { fontBuffers: [font], defaultFontFamily: 'Exo' } });
    const image = renderer.render();
    try {
      assert.equal(image.width, 1200);
      assert.equal(image.height, 630);
      mkdirSync('post-card-checks', { recursive: true });
      writeFileSync(`post-card-checks/${name}.png`, image.asPng());
    } finally { image.free(); renderer.free(); }
  }
});
