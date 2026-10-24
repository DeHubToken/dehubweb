/**
 * Embeddable posts.
 *
 *   dehub.io/app/post/<id>/embed      the post as a small standalone page,
 *                                     made to sit in an iframe on any site
 *   dehub.io/api/oembed?url=<post>    oEmbed (https://oembed.com), so WordPress,
 *                                     Ghost, Notion (via Iframely), Medium
 *                                     (via Embedly) and Mastodon link cards
 *                                     turn a pasted post link into the post
 *   dehub.io/embed.js                 optional: sizes each embed to its content
 *
 * Same shapes Mastodon uses (`/@user/<id>/embed`, `/api/oembed`, `embed.js`).
 *
 * Only a post a signed-out visitor could already see is embedded in full. A
 * gated post (subscription, lock, pay-per-view, not rated safe) still renders
 * its author and a link, never its caption or media, and oEmbed answers 401
 * for it as the spec asks for a non-public resource.
 *
 * The embed page carries no UI copy at all: the author's name, their caption,
 * the media and a date the viewer's browser formats. It shows up on sites in
 * every language and has no way to know which one the reader speaks.
 */
import { rssRowIsPublic } from './rss-feeds.js';

export const EMBED_WIDTH = 550;
const MIN_WIDTH = 250;
const EMBED_HOSTS = /^(?:www\.|staging\.)?dehub\.io$/i;

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** `/app/post/<id>/embed` → the id, else null. */
export function embedRoute(pathname) {
  const m = String(pathname).match(/^\/app\/post\/([1-9]\d{0,14})\/embed\/?$/);
  return m ? m[1] : null;
}

/** The post id behind any dehub.io post URL (the shapes the worker accepts), else null. */
export function postIdFromUrl(raw) {
  let url;
  try {
    url = new URL(String(raw));
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol) || !EMBED_HOSTS.test(url.hostname)) return null;
  const m = url.pathname.match(/^\/(?:app\/)?(?:post|posts|video)\/([1-9]\d{0,14})(?:\/|$)/);
  return m ? m[1] : null;
}

function mediaKind(post) {
  const type = String(post.postType || '').toLowerCase();
  if (post.videoUrl || type === 'video' || type === 'feed-video') return 'video';
  if (post.audioUrl || type === 'feed-audio' || type === 'audio') return 'audio';
  const images = [post.imageUrl, ...(Array.isArray(post.imageUrls) ? post.imageUrls : [])];
  if (images.some((u) => typeof u === 'string' && u.trim())) return 'image';
  return 'none';
}

/**
 * The iframe size for a post: 550 wide (or `maxwidth`), tall enough for its
 * header, caption, media and footer. embed.js corrects it to the real height
 * on sites that load it; this is what everyone else gets.
 */
export function embedSize(post = {}, maxwidth, maxheight) {
  const askedWidth = Number(maxwidth) > 0 ? Number(maxwidth) : EMBED_WIDTH;
  const width = Math.round(Math.max(Math.min(askedWidth, EMBED_WIDTH), Math.min(MIN_WIDTH, askedWidth)));
  const inner = width - 32;
  const text = String(post.description || '').trim();
  const perLine = Math.max(28, Math.floor(inner / 8));
  const lines = text
    ? Math.min(8, text.split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / perLine)), 0))
    : 0;
  let height = 64 + 44 + 24 + lines * 21;
  const kind = mediaKind(post);
  if (kind === 'video') height += Math.round((inner * 9) / 16) + 12;
  else if (kind === 'image') height += Math.round(inner * 0.75) + 12;
  else if (kind === 'audio') height += 54 + 12;
  if (Number(maxheight) > 0) height = Math.min(height, Number(maxheight));
  return { width, height: Math.round(height) };
}

/** The code a site pastes: the iframe, plus the optional resizer. */
export function embedSnippet(appUrl, tokenId, { width, height } = {}) {
  const id = Number(tokenId);
  const w = Number(width) || EMBED_WIDTH;
  const h = Number(height) || 400;
  return `<iframe src="${appUrl}/app/post/${id}/embed" class="dehub-embed" style="max-width: 100%; border: 0" width="${w}" height="${h}" allowfullscreen="allowfullscreen" allow="fullscreen; picture-in-picture" loading="lazy"></iframe><script src="${appUrl}/embed.js" async="async"></script>`;
}

const LOCK_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';

const EMBED_CSS = `
:root{color-scheme:dark;--bg:#0b0b0c;--fg:#f4f4f5;--muted:#a1a1aa;--line:#27272a;--well:#18181b}
@media (prefers-color-scheme:light){:root{color-scheme:light;--bg:#fff;--fg:#09090b;--muted:#52525b;--line:#e4e4e7;--well:#f4f4f5}}
*{box-sizing:border-box}html,body{margin:0;background:transparent}
body{font:15px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans",sans-serif;color:var(--fg)}
a{color:inherit;text-decoration:none}
.card{background:var(--bg);border:1px solid var(--line);border-radius:16px;padding:12px 16px;overflow:hidden}
.head{display:flex;align-items:center;gap:10px;min-height:44px}
.who{display:flex;align-items:center;gap:10px;min-width:0;flex:1}
.avatar{width:40px;height:40px;border-radius:50%;object-fit:cover;background:var(--well);flex:none}
.names{display:flex;flex-direction:column;min-width:0}
.name{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.handle{color:var(--muted);font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.brand{flex:none;display:block;width:28px;height:28px;border-radius:8px;overflow:hidden}
.brand img{width:100%;height:100%;display:block}
.text{margin:10px 0 0;white-space:pre-wrap;overflow-wrap:anywhere}
.text p{margin:0 0 8px}.text p:last-child{margin:0}
.media{margin-top:10px;border-radius:12px;overflow:hidden;background:#000}
.media video,.media img{display:block;width:100%;max-height:70vh;object-fit:contain;background:#000}
.media audio{display:block;width:100%}
.audio{background:var(--well);padding:8px}
.locked{margin-top:10px;display:flex;align-items:center;justify-content:center;gap:8px;padding:28px 0;border-radius:12px;background:var(--well);color:var(--muted)}
.foot{display:flex;align-items:center;justify-content:space-between;margin-top:10px;color:var(--muted);font-size:13px}
.foot a:hover,.who:hover .name{text-decoration:underline}
`;

const EMBED_SCRIPT = `(function(){
var t=document.querySelector('time[datetime]');
if(t){try{t.textContent=new Date(t.getAttribute('datetime')).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'})}catch(e){}}
function send(){try{parent.postMessage({type:'dehub:embed-height',height:document.documentElement.scrollHeight},'*')}catch(e){}}
addEventListener('load',send);addEventListener('resize',send);
if(window.ResizeObserver){new ResizeObserver(send).observe(document.body)}
document.querySelectorAll('video,img').forEach(function(m){m.addEventListener('loadedmetadata',send);m.addEventListener('load',send)});
})();`;

function page({ title, canonical, lang, body }) {
  return `<!DOCTYPE html>
<html lang="${esc(lang || 'und')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)}</title>
<link rel="canonical" href="${esc(canonical)}">
<style>${EMBED_CSS}</style>
</head>
<body>
${body}
<script>${EMBED_SCRIPT}</script>
</body>
</html>`;
}

/** The embed page for one post record. Exported for its tests. */
export function renderEmbedPage(record, deps) {
  const id = Number(record.tokenId);
  const postUrl = `${deps.appUrl}/app/post/${id}`;
  const user = record.minterUser || {};
  const handle = String(record.mintername || record.minterUsername || user.username || '').replace(/^@/, '');
  const name = String(record.minterDisplayName || user.displayName || handle).trim();
  const profileUrl = handle ? `${deps.appUrl}/${encodeURIComponent(handle)}` : postUrl;
  const avatarPath = record.minterAvatarUrl || user.avatarImageUrl;
  const avatar = avatarPath ? deps.imageOf({ imageUrl: avatarPath }) : `${deps.appUrl}/default-icon.png`;
  const isPublic = rssRowIsPublic(record);

  const head = `<header class="head">
<a class="who" href="${esc(profileUrl)}" target="_blank" rel="noopener"><img class="avatar" src="${esc(avatar)}" alt="" width="40" height="40"><span class="names"><span class="name">${esc(name)}</span>${handle ? `<span class="handle">@${esc(handle)}</span>` : ''}</span></a>
<a class="brand" href="${esc(postUrl)}" target="_blank" rel="noopener" aria-label="DeHub"><img src="${deps.appUrl}/dehub-icon.png" alt="DeHub" width="28" height="28"></a>
</header>`;

  let content = '';
  if (!isPublic) {
    content = `<a class="locked" href="${esc(postUrl)}" target="_blank" rel="noopener">${LOCK_ICON}</a>`;
  } else {
    const text = String(record.description || '').trim();
    if (text) {
      content += `<div class="text">${text.split(/\n{2,}/).map((p) => `<p>${esc(p)}</p>`).join('')}</div>`;
    } else {
      const label = deps.labelOf(record);
      if (label && !/^Post #\d+$/.test(label)) content += `<div class="text"><p>${esc(label)}</p></div>`;
    }
    const image = deps.imageOf(record);
    const kind = mediaKind(record);
    if (kind === 'video' && record.videoUrl) {
      content += `<div class="media"><video controls playsinline preload="metadata"${image ? ` poster="${esc(image)}"` : ''} src="${esc(deps.mediaUrl(record.videoUrl))}"></video></div>`;
    } else if (kind === 'audio' && record.audioUrl) {
      content += `<div class="media audio"><audio controls preload="metadata" src="${esc(deps.mediaUrl(record.audioUrl))}"></audio></div>`;
    } else if (image) {
      content += `<a class="media" href="${esc(postUrl)}" target="_blank" rel="noopener"><img src="${esc(image)}" alt="" loading="lazy"></a>`;
    }
  }

  const created = new Date(record.createdAt);
  const date = Number.isNaN(created.getTime())
    ? ''
    : `<a href="${esc(postUrl)}" target="_blank" rel="noopener"><time datetime="${created.toISOString()}">${created.toISOString().slice(0, 10)}</time></a>`;
  const foot = `<footer class="foot">${date}<a href="${esc(deps.appUrl)}" target="_blank" rel="noopener">dehub.io</a></footer>`;

  const lang = /^[a-z]{2,3}$/.test(String(record.detectedLanguage || '')) && record.detectedLanguage !== 'und'
    ? record.detectedLanguage
    : 'und';
  return page({
    title: `${deps.labelOf(record)} — ${name} on DeHub`,
    canonical: postUrl,
    lang,
    body: `<article class="card">${head}${content}${foot}</article>`,
  });
}

const FRAMEABLE = {
  // Any site may frame the embed page; that is its whole purpose.
  'Content-Security-Policy': 'frame-ancestors *',
  'X-Robots-Tag': 'noindex',
};

/** GET /app/post/<id>/embed */
export async function handleEmbedPage(request, tokenId, deps) {
  const record = await deps.fetchPost(tokenId);
  if (!record || record.isHidden || !Number.isFinite(Number(record.tokenId))) {
    return new Response(page({
      title: 'DeHub',
      canonical: deps.appUrl,
      lang: 'und',
      body: `<article class="card"><a class="locked" href="${esc(deps.appUrl)}" target="_blank" rel="noopener"><img src="${deps.appUrl}/dehub-icon.png" alt="DeHub" width="28" height="28"></a></article>`,
    }), {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=60', ...FRAMEABLE },
    });
  }
  return new Response(renderEmbedPage(record, deps), {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300', ...FRAMEABLE },
  });
}

function json(status, body) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': status === 200 ? 'public, max-age=3600' : 'public, max-age=60',
    },
  });
}

/** GET /api/oembed?url=<post url>[&maxwidth=&maxheight=&format=json] */
export async function handleOembed(request, deps) {
  const params = new URL(request.url).searchParams;
  const format = params.get('format');
  if (format && format !== 'json') return json(501, { error: 'Only format=json is supported' });
  const id = postIdFromUrl(params.get('url'));
  if (!id) return json(404, { error: 'Not a DeHub post URL' });
  const record = await deps.fetchPost(id);
  if (!record || record.isHidden) return json(404, { error: 'No such post' });
  if (!rssRowIsPublic(record)) return json(401, { error: 'This post is not public' });

  const size = embedSize(record, params.get('maxwidth'), params.get('maxheight'));
  const handle = String(record.mintername || record.minterUsername || (record.minterUser && record.minterUser.username) || '').replace(/^@/, '');
  const name = String(record.minterDisplayName || (record.minterUser && record.minterUser.displayName) || handle).trim();
  return json(200, {
    version: '1.0',
    type: mediaKind(record) === 'video' ? 'video' : 'rich',
    provider_name: 'DeHub',
    provider_url: deps.appUrl,
    title: deps.labelOf(record),
    ...(name ? { author_name: name } : {}),
    ...(handle ? { author_url: `${deps.appUrl}/${encodeURIComponent(handle)}` } : {}),
    html: embedSnippet(deps.appUrl, id, size),
    width: size.width,
    height: size.height,
    cache_age: 3600,
  });
}

/** The discovery tag a post page carries, or '' for a post that cannot be embedded. */
export function oembedLinkTag(appUrl, record) {
  if (!record || !rssRowIsPublic(record)) return '';
  const postUrl = `${appUrl}/app/post/${Number(record.tokenId)}`;
  return `<link rel="alternate" type="application/json+oembed" href="${esc(`${appUrl}/api/oembed?url=${encodeURIComponent(postUrl)}&format=json`)}">`;
}
