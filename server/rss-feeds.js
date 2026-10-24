/**
 * RSS for every profile and every hashtag.
 *
 *   dehub.io/<handle>.rss     a creator's public posts (`/@<handle>.rss` too)
 *   dehub.io/tags/<tag>.rss   every public post carrying #<tag>
 *
 * The same two shapes Mastodon serves (`/@user.rss`, `/tags/<tag>.rss`), so a
 * feed reader, a newsletter tool or somebody coming over from the fediverse
 * finds them where they already look. The page side advertises the profile
 * feed with a `<link rel="alternate">`; the tag feed has no page of its own to
 * hang one on (a hashtag is `/app?category=<tag>`, a filter on the home feed).
 *
 * Only what a signed-out visitor could already see goes out: no hidden posts,
 * nothing behind a subscription, a lock or pay-per-view, nothing rated other
 * than safe, and nothing from a private account. A feed is copied into
 * readers that never come back to ask, so anything doubtful stays out.
 *
 * The worker hands in its own helpers (`deps`) rather than this file growing
 * a second copy of the post label rules and the CDN image transform.
 */

export const RSS_FEED_SIZE = 20;
const RSS_TTL_SECONDS = 600;
const TAG_PATTERN = /^[\p{L}\p{N}_-]{1,50}$/u;

function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function xml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // Characters XML 1.0 cannot carry at all; one in a caption kills the file.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '');
}

function html(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Which feed a path asks for, or null. `isProfileSegment` is the worker's own
 * "can this be a profile?" test, so `/app.rss` or `/docs.rss` never reach the
 * API as a handle.
 */
export function rssFeedRoute(pathname, isProfileSegment) {
  const tag = String(pathname).match(/^\/tags\/([^/]+)\.rss$/i);
  if (tag) {
    const name = safeDecode(tag[1]).trim().replace(/^#/, '').toLowerCase();
    return TAG_PATTERN.test(name) ? { kind: 'tag', tag: name } : null;
  }
  const profile = String(pathname).match(/^\/@?([^/@]+)\.rss$/i);
  if (profile) {
    const handle = safeDecode(profile[1]).trim();
    if (!handle || !isProfileSegment(handle.toLowerCase())) return null;
    return { kind: 'profile', handle };
  }
  return null;
}

/** The feed URL for a profile, as the page advertises it. */
export function profileFeedUrl(appUrl, handle) {
  return `${appUrl}/${encodeURIComponent(String(handle).replace(/^@/, ''))}.rss`;
}

/** True when a feed row is something a signed-out visitor can already see. */
export function rssRowIsPublic(row) {
  if (!row || row.isHidden || row.isPrivate) return false;
  if (!Number.isFinite(Number(row.tokenId))) return false;
  if (Array.isArray(row.plansDetails) && row.plansDetails.length) return false;
  const lock = row.streamInfo || {};
  if (lock.isLockContent || lock.isPayPerView || row.is_ppv || row.is_locked) return false;
  if (row.contentRating && row.contentRating !== 'safe') return false;
  if (row.minterUser && row.minterUser.isPrivate) return false;
  return true;
}

const MEDIA_TYPES = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  m3u8: 'application/vnd.apple.mpegurl',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  wav: 'audio/wav',
};

function mediaType(url, fallback) {
  const ext = (String(url).split('?')[0].match(/\.([a-z0-9]+)$/i) || [])[1];
  return (ext && MEDIA_TYPES[ext.toLowerCase()]) || fallback;
}

function rfc822(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toUTCString();
}

/** One `<item>`. Exported for its tests. */
export function rssItemXml(row, deps) {
  const link = `${deps.appUrl}/app/post/${Number(row.tokenId)}`;
  const text = String(row.description || '').trim();
  const image = deps.imageOf(row);
  const video = row.videoUrl ? deps.mediaUrl(row.videoUrl) : '';
  const audio = row.audioUrl ? deps.mediaUrl(row.audioUrl) : '';

  const body = [
    text && text.split(/\n{2,}/).map((p) => `<p>${html(p).replace(/\n/g, '<br>')}</p>`).join(''),
    image && `<p><a href="${html(link)}"><img src="${html(image)}" alt=""></a></p>`,
  ].filter(Boolean).join('');

  const media = [];
  if (video) {
    media.push(`<media:content url="${xml(video)}" type="${mediaType(video, 'video/mp4')}" medium="video"${Number(row.videoDuration) > 0 ? ` duration="${Math.round(Number(row.videoDuration))}"` : ''}>${image ? `<media:thumbnail url="${xml(image)}"/>` : ''}</media:content>`);
  } else if (audio) {
    media.push(`<media:content url="${xml(audio)}" type="${mediaType(audio, 'audio/mpeg')}" medium="audio"/>`);
    // Podcast apps read the enclosure and nothing else.
    media.push(`<enclosure url="${xml(audio)}" type="${mediaType(audio, 'audio/mpeg')}" length="0"/>`);
  } else if (image) {
    media.push(`<media:content url="${xml(image)}" type="image/jpeg" medium="image"/>`);
  }

  const categories = (Array.isArray(row.category) ? row.category : row.category ? [row.category] : [])
    .map((c) => String(c).trim())
    .filter((c) => c && c !== 'general')
    .map((c) => `<category>${xml(c)}</category>`);

  const pubDate = rfc822(row.createdAt);
  const author = String(row.minterDisplayName || row.minterUsername || row.mintername || '').trim();
  return [
    '<item>',
    `<title>${xml(deps.labelOf(row))}</title>`,
    `<link>${xml(link)}</link>`,
    `<guid isPermaLink="true">${xml(link)}</guid>`,
    pubDate && `<pubDate>${pubDate}</pubDate>`,
    author && `<dc:creator>${xml(author)}</dc:creator>`,
    body && `<description>${xml(body)}</description>`,
    ...categories,
    ...media,
    '</item>',
  ].filter(Boolean).join('');
}

/** The whole document. Exported for its tests. */
export function rssXml({ title, link, self, description, image, rows }, deps) {
  const items = (rows || []).filter(rssRowIsPublic).slice(0, RSS_FEED_SIZE).map((row) => rssItemXml(row, deps));
  const newest = (rows || []).filter(rssRowIsPublic).map((r) => rfc822(r.createdAt)).find(Boolean);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/" xmlns:dc="http://purl.org/dc/elements/1.1/">',
    '<channel>',
    `<title>${xml(title)}</title>`,
    `<link>${xml(link)}</link>`,
    `<atom:link href="${xml(self)}" rel="self" type="application/rss+xml"/>`,
    `<description>${xml(description)}</description>`,
    newest && `<lastBuildDate>${newest}</lastBuildDate>`,
    `<ttl>${Math.round(RSS_TTL_SECONDS / 60)}</ttl>`,
    image && `<image><url>${xml(image)}</url><title>${xml(title)}</title><link>${xml(link)}</link></image>`,
    ...items,
    '</channel>',
    '</rss>',
  ].filter(Boolean).join('\n');
}

function textResponse(status, body, extra = {}) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Robots-Tag': 'noindex', 'Cache-Control': 'no-store', ...extra },
  });
}

async function buildFeed(route, deps) {
  if (route.kind === 'tag') {
    const rows = await deps.fetchRows(`category=${encodeURIComponent(route.tag)}`, RSS_FEED_SIZE * 2);
    if (!rows) return null;
    const link = `${deps.appUrl}/app?category=${encodeURIComponent(route.tag)}`;
    return rssXml({
      title: `#${route.tag} on DeHub`,
      link,
      self: `${deps.appUrl}/tags/${encodeURIComponent(route.tag)}.rss`,
      description: `Public posts tagged #${route.tag} on DeHub.`,
      rows,
    }, deps);
  }

  const account = await deps.fetchAccount(route.handle);
  if (!account) return 404;
  if (account.isPrivate) return 404;
  const handle = String(account.username || route.handle).replace(/^@/, '');
  const address = String(account.address || '').toLowerCase();
  const rows = await deps.fetchRows(`minter=${encodeURIComponent(address)}`, RSS_FEED_SIZE * 2);
  if (!rows) return null;
  const name = String(account.displayName || '').trim() || handle;
  const about = String(account.aboutMe || '').replace(/\s+/g, ' ').trim();
  return rssXml({
    title: name === handle ? `@${handle} on DeHub` : `${name} (@${handle}) on DeHub`,
    link: `${deps.appUrl}/${encodeURIComponent(handle)}`,
    self: profileFeedUrl(deps.appUrl, handle),
    description: about || `Public posts from ${name} on DeHub.`,
    image: account.avatarImageUrl ? deps.imageOf({ imageUrl: account.avatarImageUrl }) : '',
    rows,
  }, deps);
}

/**
 * Answers a feed request. Built feeds sit in the edge cache for ten minutes:
 * a popular feed is polled by every reader subscribed to it, and each build
 * costs two API reads.
 */
export async function handleRssFeed(request, ctx, route, deps) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return textResponse(405, 'Method not allowed', { Allow: 'GET, HEAD' });
  }
  const cache = typeof caches !== 'undefined' && caches.default ? caches.default : null;
  const key = new Request(new URL(request.url).origin + new URL(request.url).pathname, { method: 'GET' });
  if (cache) {
    const hit = await cache.match(key);
    if (hit) return hit;
  }

  const body = await buildFeed(route, deps);
  if (body === 404) return textResponse(404, 'No such feed');
  if (body === null) return textResponse(503, 'Feed temporarily unavailable', { 'Retry-After': '300' });

  const response = new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': `public, max-age=${RSS_TTL_SECONDS}`,
      'Access-Control-Allow-Origin': '*',
      'X-Robots-Tag': 'noindex',
    },
  });
  if (cache) ctx.waitUntil(cache.put(key, response.clone()));
  return response;
}
