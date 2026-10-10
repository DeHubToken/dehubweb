export const POST_CARD_VERSION = 'v1';
export const POST_CARD_TTL = 300;
const ORIGIN = 'https://dehub.io';
const CDN = 'https://dehubcdn.ams3.cdn.digitaloceanspaces.com';

export function postShareImageUrl(tokenId) {
  return `${ORIGIN}/_og/post/${POST_CARD_VERSION}/${encodeURIComponent(tokenId)}.png`;
}

export function plainPostText(value) {
  return String(value ?? '').slice(0, 20000)
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>|<\/(?:p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity) => {
      const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
      if (entity[0] !== '#') return named[entity.toLowerCase()] ?? match;
      const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    })
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/[\t ]+/g, ' ').replace(/\n\s*\n/g, '\n').trim();
}

const flag = (v) => v === true || v === 1 || v === 'true';
const count = (v) => Number.isFinite(Number(v)) ? Math.max(0, Math.floor(Number(v))) : 0;

/** Only anonymous, unrestricted text is eligible for a public raster. */
export function textPostCardData(post) {
  if (!post || !/^[1-9]\d{0,14}$/.test(String(post.tokenId))) return null;
  if (!['feed-simple', 'text'].includes(post.postType)) return null;
  if (['draft', 'scheduled', 'deleted'].includes(post.status)) return null;
  if (['private', 'followers', 'subscribers', 'unlisted'].includes(post.visibility)) return null;
  if (post.isPublic === false || post.community?.is_private || post.community?.isPrivate) return null;
  for (const source of [post, post.streamInfo, post.streamStatus]) {
    if (!source) continue;
    if (['isHidden', 'isDeleted', 'isPrivate', 'is_private', 'isPayPerView', 'is_ppv', 'isLockContent',
      'isLocked', 'is_locked', 'isSubscriberOnly', 'isLockedWithPPV', 'isLockedWithHoldings',
      'isLockedWithSubscription'].some((key) => flag(source[key]))) return null;
  }
  if (post.plansDetails?.length || post.subscriberPlans?.length || post.subscriptionPlans?.length) return null;
  // A text article with its own cover keeps its existing media preview.
  if (post.imageUrl || post.videoUrl || post.audioUrl || post.imageUrls?.length || post.socialImageUrl || post.articleImageUrl) return null;
  const title = plainPostText(post.title) || plainPostText(post.name);
  const body = plainPostText(post.description);
  if (!title && !body) return null;
  const author = plainPostText(post.minterDisplayName || post.minterUser?.displayName || post.mintername || post.minterUsername || 'DeHub');
  const handle = plainPostText(post.mintername || post.minterUsername || post.minterUser?.username).replace(/^@/, '');
  const rawAvatar = post.minterAvatarUrl || post.minterUser?.avatarImageUrl || '';
  let avatar = '';
  try {
    const url = new URL(rawAvatar.replace(/^statics\//, ''), `${CDN}/`);
    if (rawAvatar && url.origin === CDN && url.pathname.startsWith('/avatars/')) avatar = url.href;
  } catch { /* Initials cover absent or invalid avatars. */ }
  return {
    tokenId: String(post.tokenId), title, body: body === title ? '' : body,
    author, handle, avatar,
    likes: count(post.totalVotes?.for ?? (Array.isArray(post.likes) ? post.likes.length : post.likes) ?? post.like_count ?? post.reactionCounts?.like),
    comments: count(post.commentCount ?? post.comment_count ?? post.comments?.length),
    views: count(post.totalViews ?? post.views ?? post.view_count),
    createdAt: post.createdAt || post.created_at || '',
  };
}

const escape = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);

export function applyTextPostImage(html, post) {
  const data = textPostCardData(post);
  if (!data) return html;
  const image = postShareImageUrl(data.tokenId);
  const tags = {
    'og:image': image, 'og:image:secure_url': image, 'og:image:type': 'image/png',
    'og:image:width': '1200', 'og:image:height': '630',
    'og:image:alt': `${data.author}: ${data.title || data.body}`.slice(0, 420),
    'twitter:card': 'summary_large_image', 'twitter:image': image,
    'twitter:image:alt': `${data.author}: ${data.title || data.body}`.slice(0, 420),
  };
  let out = html;
  for (const [name, value] of Object.entries(tags)) {
    const tag = `<meta ${name.startsWith('twitter:') ? 'name' : 'property'}="${name}" content="${escape(value)}">`;
    const re = new RegExp(`<meta (?:property|name)="${name}"[^>]*>`, 'g');
    out = re.test(out) ? out.replace(re, () => tag) : out.replace('</head>', `${tag}\n</head>`);
  }
  return out.replace(/(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/g, (whole, open, json, close) => {
    try {
      const ld = JSON.parse(json);
      const nodes = ld['@graph'] || [ld];
      for (const node of nodes) if (['Article', 'SocialMediaPosting'].includes(node['@type'])) node.image = image;
      return open + JSON.stringify(ld).replace(/</g, '\\u003c') + close;
    } catch { return whole; }
  });
}

export function formatPostCardCount(value) {
  const n = count(value);
  return n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`
    : n >= 1e3 ? `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K` : String(n);
}

// Conservative Exo advances keep text inside the panel, including long URLs.
function textWidth(text, size) {
  return Array.from(text).reduce((width, c) => width + (/[ilI.,!':;| ]/.test(c) ? .3
    : /[MW@%]/.test(c) ? .94 : c.codePointAt(0) > 0x2fff ? 1 : /[A-Z]/.test(c) ? .7 : .58) * size, 0);
}

export function wrapPostText(text, size, width, maxLines) {
  const lines = [];
  let line = '';
  for (const word of String(text).split(/(\s+)/u)) {
    if (word.includes('\n')) { if (line.trim()) lines.push(line.trim()); line = ''; continue; }
    if (!word.trim()) { if (line) line += ' '; continue; }
    if (line && textWidth(line + word, size) > width) { lines.push(line.trim()); line = ''; }
    for (const char of word) {
      if (textWidth(line + char, size) > width && line) { lines.push(line.trim()); line = ''; }
      line += char;
    }
  }
  if (line.trim()) lines.push(line.trim());
  if (lines.length > maxLines) {
    lines.length = maxLines;
    let tail = lines[maxLines - 1];
    while (tail && textWidth(tail + '…', size) > width) tail = Array.from(tail).slice(0, -1).join('');
    lines[maxLines - 1] = tail.trimEnd() + '…';
  }
  return lines;
}

function textLines(lines, x, y, size, lineHeight, color, weight = 500) {
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${color}">${lines.map((line, i) => `<tspan x="${x}" dy="${i ? lineHeight : 0}">${escape(line)}</tspan>`).join('')}</text>`;
}

/** Satin frame: the official mark, Exo, a left author rail and quiet silver waves. */
export function renderPostCardSvg(data, { logo, avatar = '' }) {
  const titleSize = data.title.length > 140 ? 34 : 42;
  const title = wrapPostText(data.title, titleSize, 698, data.body ? 3 : 7);
  const bodySize = data.title ? 28 : data.body.length > 350 ? 30 : 36;
  const bodyY = title.length ? 165 + (title.length - 1) * 52 + 70 : 178;
  const body = wrapPostText(data.body, bodySize, 698, Math.max(1, Math.floor((497 - bodyY) / (bodySize * 1.4)) + 1));
  const initials = Array.from(data.author).slice(0, 2).join('').toUpperCase();
  const date = new Date(data.createdAt);
  const dateText = Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const iconPaths = [
    '<path d="M7 10v12H2V10h5Zm0 11h13a2 2 0 0 0 2-1.6l2-9A2 2 0 0 0 22 8h-7l1-5c.2-2-2-3-3-1L7 11"/>',
    '<path d="M4 3h17a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H11l-7 5v-5a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Z"/>',
    '<path d="M1 13s4-9 12-9 12 9 12 9-4 9-12 9S1 13 1 13Z"/><circle cx="13" cy="13" r="4"/>',
  ];
  const stats = [[data.likes, 'likes'], [data.comments, 'comments'], [data.views, 'views']].map(([value, label], i) => {
    const y = 312 + i * 70;
    return `<g transform="translate(62 ${y - 23})" stroke="#c6c7cc" stroke-width="1.7" fill="none" stroke-linejoin="round" stroke-linecap="round">${iconPaths[i]}</g><text x="112" y="${y}" font-size="28" fill="#f2f2f4">${formatPostCardCount(value)}</text><text x="213" y="${y}" font-size="20" fill="#92949e">${label}</text>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x2="1" y2="1"><stop stop-color="#111214"/><stop offset=".4" stop-color="#060607"/><stop offset="1" stop-color="#0b0c0e"/></linearGradient>
    <linearGradient id="silver" x2="0" y2="1"><stop stop-color="#090a0d"/><stop offset=".2" stop-color="#6b6e79"/><stop offset=".28" stop-color="#d5d5de"/><stop offset=".35" stop-color="#222329"/><stop offset=".56" stop-color="#08090b"/><stop offset=".78" stop-color="#9d9faa"/><stop offset=".86" stop-color="#292a31"/><stop offset="1" stop-color="#08090a"/></linearGradient>
    <linearGradient id="glint"><stop stop-color="#8f769c"/><stop offset=".38" stop-color="#96949d"/><stop offset=".65" stop-color="#7dabb4"/><stop offset=".86" stop-color="#b39272"/><stop offset="1" stop-color="#73737e"/></linearGradient>
    <clipPath id="face"><rect x="60" y="151" width="66" height="66" rx="18"/></clipPath>
    <clipPath id="copy"><rect x="410" y="109" width="708" height="408"/></clipPath>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="26" y="28" width="1148" height="574" rx="25" fill="none" stroke="#777982" stroke-opacity=".46"/>
  <path d="M370 61V523M60 263H332M60 487H332" fill="none" stroke="#33353b"/>
  <image x="43" y="35" width="77" height="66" xlink:href="${logo}"/>
  <rect x="60" y="151" width="66" height="66" rx="18" fill="#25262c" stroke="#5d5f69"/>
  ${avatar ? `<image x="60" y="151" width="66" height="66" preserveAspectRatio="xMidYMid slice" clip-path="url(#face)" xlink:href="${avatar}"/>` : `<text x="93" y="193" text-anchor="middle" fill="#dedee3" font-family="Exo" font-size="23">${escape(initials)}</text>`}
  <g font-family="Exo" font-weight="500">
    ${textLines(wrapPostText(data.author, 22, 184, 2), 143, 176, 22, 27, '#eeeef2')}
    <text x="143" y="${data.author.length > 14 ? 229 : 207}" font-size="17" fill="#9698a3">${escape(wrapPostText(data.handle ? `@${data.handle}` : '', 17, 184, 1)[0] || '')}</text>
    ${stats}
    <text x="60" y="520" font-size="17" fill="#8b8e99">${escape(dateText)}</text>
    <g clip-path="url(#copy)">
      ${textLines(title, 415, 165, titleSize, 52, '#f4f4f6')}
      ${textLines(body, 415, bodyY, bodySize, bodySize * 1.4, '#c5c6ce')}
    </g>
    <text x="415" y="558" font-size="18" fill="#868993">dehub.io</text>
    <text x="1113" y="558" text-anchor="end" font-size="18" fill="#bfc1c9">Read the post ↗</text>
  </g>
  <g opacity=".52">
    <path d="M-30 572C90 655 227 568 383 593S567 638 727 595 1006 626 1230 568L1230 630H-30Z" fill="url(#silver)"/>
    <path d="M-30 574C90 657 227 570 383 595S567 640 727 597 1006 628 1230 570" fill="none" stroke="url(#glint)" stroke-width="1.4"/>
    <path d="M-30 586C130 662 235 583 379 604S580 645 735 609 1043 650 1230 582" fill="none" stroke="#9799a3" stroke-width="1" opacity=".6"/>
  </g>
  </svg>`;
}
