export const POST_CARD_VERSION = 'v3';
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

function authorIdentity(author, badges) {
  const height = 22 * .8052;
  const widths = badges.map(badge => badge.kind === 'new' ? 49 : height * (badge.bounds[2] - badge.bounds[0]) / (badge.bounds[3] - badge.bounds[1]));
  const reserved = widths.reduce((sum, width) => sum + width + 5, 0);
  const lastWidth = Math.max(65, 184 - reserved);
  const fullLines = wrapPostText(author, 22, 184, 2);
  const lines = textWidth(author, 22) <= lastWidth ? [author]
    : fullLines.length > 1 ? [fullLines[0], ...wrapPostText(author.slice(fullLines[0].length).trim(), 22, lastWidth, 1)]
    : wrapPostText(author, 22, lastWidth, 2);
  const baseline = 176 + (lines.length - 1) * 27;
  let x = 143 + textWidth(lines.at(-1) || '', 22) + 5;
  const artwork = badges.map((badge, i) => {
    const width = widths[i];
    const left = x;
    x += width + 5;
    if (badge.kind === 'new') return `<g data-profile-badge="New"><rect x="${left}" y="${baseline - 18}" width="49" height="20" rx="5" fill="#222328" stroke="#42434a"/><path transform="translate(${left + 5} ${baseline - 13}) scale(.45)" d="m10 1 3 6 6 1-4.5 4.5 1 6-5.5-3-5.5 3 1-6L1 8l6-1Z" fill="none" stroke="#bbbcc3" stroke-width="1.5"/><text x="${left + 20}" y="${baseline - 3}" font-size="12" fill="#bbbcc3">New</text></g>`;
    const [l, t, r, b] = badge.bounds;
    return `<svg data-profile-badge="${escape(badge.name)}" x="${left}" y="${baseline - height}" width="${width}" height="${height}" viewBox="${l} ${t} ${r - l} ${b - t}" overflow="visible"><image width="${badge.canvas}" height="${badge.canvas}" xlink:href="${badge.uri}"/></svg>`;
  }).join('');
  return { svg: textLines(lines, 143, 176, 22, 27, '#eeeef2') + artwork, handleY: baseline + 31 };
}

function pollLayout(poll) {
  if (!poll) return null;
  const dense = poll.options.length >= 3;
  const question = wrapPostText(poll.question, 19, 698, dense ? 2 : 3);
  const rows = poll.options.map(option => {
    const lines = wrapPostText(option.text, 17, 592, dense ? 1 : 2);
    return { ...option, lines, height: lines.length > 1 ? 54 : 36 };
  });
  const height = question.length * 25 + 13 + rows.reduce((sum, row) => sum + row.height + 7, 0) + 27;
  return { ...poll, question, rows, height };
}

/** Lay out post copy and its poll as one flow, reserving room for all results. */
export function layoutPostCardCopy(data) {
  const poll = pollLayout(data.poll);
  const top = 112;
  const gap = 24;
  const availableBottom = 510 - (poll ? poll.height + gap : 0);
  const dense = !!poll && availableBottom - top < 130;
  const titleSize = poll ? dense ? 28 : 32 : data.title.length > 140 ? 34 : 42;
  const bodySize = poll ? dense ? 23 : 30 : data.title ? 28 : data.body.length > 350 ? 30 : 36;
  const titleStep = Math.ceil(titleSize * 1.25);
  const bodyStep = Math.ceil(bodySize * 1.35);
  const bodyReserve = data.body ? bodyStep + gap : 0;
  const titleLimit = Math.max(1, Math.min(data.body ? 3 : 7, Math.floor((availableBottom - top - bodyReserve) / titleStep)));
  const titleLines = wrapPostText(data.title, titleSize, 698, titleLimit);
  const title = { lines: titleLines, size: titleSize, step: titleStep, y: top + titleSize * .8, top, bottom: top + Math.max(0, titleLines.length - 1) * titleStep + (titleLines.length ? titleSize : 0) };
  const bodyTop = titleLines.length ? title.bottom + gap : top;
  const bodyLimit = Math.max(1, Math.floor((availableBottom - bodyTop) / bodyStep));
  const bodyLines = wrapPostText(data.body, bodySize, 698, bodyLimit);
  const body = { lines: bodyLines, size: bodySize, step: bodyStep, y: bodyTop + bodySize * .8, top: bodyTop, bottom: bodyTop + Math.max(0, bodyLines.length - 1) * bodyStep + (bodyLines.length ? bodySize : 0) };
  const bottom = bodyLines.length ? body.bottom : title.bottom;
  return { title, body, poll: poll ? { ...poll, top: bottom + gap } : null, bottom, gap };
}

function renderPoll(poll) {
  if (!poll) return '';
  let y = poll.top + poll.question.length * 25 + 13;
  const rows = poll.rows.map((row, index) => {
    const top = y;
    y += row.height + 7;
    const barWidth = poll.ended ? Math.max(0, Math.min(698, 698 * row.percent / 100)) : 0;
    const check = row.winner ? `<path d="m0 5 4 4 8-8" transform="translate(428 ${top + 12})" fill="none" stroke="#f1f1f4" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>` : '';
    return `<g data-poll-option="${row.index}" data-winner="${row.winner}"><defs><clipPath id="poll-${index}"><rect x="415" y="${top}" width="698" height="${row.height}" rx="7"/></clipPath></defs><rect x="415" y="${top}" width="698" height="${row.height}" rx="7" fill="#15161a" stroke="#2a2b31"/>${barWidth ? `<rect x="415" y="${top}" width="${barWidth}" height="${row.height}" fill="${row.winner ? '#5f6066' : '#34353c'}" clip-path="url(#poll-${index})"/>` : ''}${check}${textLines(row.lines, row.winner ? 451 : 430, top + 24, 17, 21, '#e4e4e9')}${poll.ended ? `<text x="1099" y="${top + 24}" text-anchor="end" font-size="17" fill="#e4e4e9">${row.percent}%</text>` : ''}</g>`;
  }).join('');
  const label = poll.ended ? `Closed · ${poll.totalVotes} ${poll.totalVotes === 1 ? 'vote' : 'votes'}` : 'Poll open · Vote on DeHub';
  return `<g data-poll-state="${poll.ended ? 'closed' : 'open'}">${textLines(poll.question, 415, poll.top + 19, 19, 25, '#d9dae0')}${rows}<text x="415" y="${y + 17}" font-size="15" fill="#92959f">${escape(label)}</text></g>`;
}

/** A continuous chrome frame around the post, with the actual profile artwork. */
export function renderPostCardSvg(data, { logo, avatar = '', chrome = '', badges = [] }) {
  const { title, body, poll } = layoutPostCardCopy(data);
  const identity = authorIdentity(data.author, badges);
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
    <linearGradient id="seam" gradientUnits="userSpaceOnUse" x1="370" y1="112" x2="370" y2="510"><stop stop-color="#c8c9ce" stop-opacity="0"/><stop offset=".12" stop-color="#71737d" stop-opacity=".12"/><stop offset=".4" stop-color="#aeb0b8" stop-opacity=".42"/><stop offset=".62" stop-color="#757781" stop-opacity=".3"/><stop offset=".88" stop-color="#53555c" stop-opacity=".12"/><stop offset="1" stop-color="#b5b7be" stop-opacity="0"/></linearGradient>
    <clipPath id="face"><rect x="60" y="151" width="66" height="66" rx="18"/></clipPath>
    <clipPath id="copy"><rect x="410" y="109" width="708" height="408"/></clipPath>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  ${chrome ? `<image data-brand-artwork="integrated-chrome-edge" x="0" y="0" width="1200" height="630" xlink:href="${chrome}" opacity=".72"/>` : ''}
  <path d="M370 112C363 184 363 234 370 303S377 433 370 510" fill="none" stroke="url(#seam)" stroke-width="1.3" stroke-linecap="round"/>
  <path d="M60 263H332M60 487H332" fill="none" stroke="#33353b"/>
  <image x="43" y="59" width="77" height="66" xlink:href="${logo}"/>
  <rect x="60" y="151" width="66" height="66" rx="18" fill="#25262c" stroke="#5d5f69"/>
  ${avatar ? `<image x="60" y="151" width="66" height="66" preserveAspectRatio="xMidYMid slice" clip-path="url(#face)" xlink:href="${avatar}"/>` : `<text x="93" y="193" text-anchor="middle" fill="#dedee3" font-family="Exo" font-size="23">${escape(initials)}</text>`}
  <g font-family="Exo" font-weight="500">
    ${identity.svg}
    <text x="143" y="${identity.handleY}" font-size="17" fill="#9698a3">${escape(wrapPostText(data.handle ? `@${data.handle}` : '', 17, 184, 1)[0] || '')}</text>
    ${stats}
    <text x="60" y="520" font-size="17" fill="#8b8e99">${escape(dateText)}</text>
    <g clip-path="url(#copy)">
      ${textLines(title.lines, 415, title.y, title.size, title.step, '#f4f4f6')}
      ${textLines(body.lines, 415, body.y, body.size, body.step, '#c5c6ce')}
      ${renderPoll(poll)}
    </g>
    <text x="415" y="558" font-size="18" fill="#868993">dehub.io</text>
    <text x="1088" y="558" text-anchor="end" font-size="18" fill="#bfc1c9">Read the post</text>
    <path d="M1100 557l12-12m-12 0h12v12" fill="none" stroke="#bfc1c9" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  </svg>`;
}
