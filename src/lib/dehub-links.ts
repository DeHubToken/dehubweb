/**
 * DeHub Entity Links
 * ==================
 * One parser for every in-app URL that deserves to render as a card instead of
 * as a link: posts, profiles, communities, community invites, stores, store
 * listings and events.
 *
 * Before this module the same job was done by three separate pairs of
 * `hasXLink`/`extractX` helpers living next to their own embed components, each
 * with its own regex. They disagreed, and every surface picked a different
 * subset of them — which is why a store link carded up in the feed but arrived
 * as a bare URL in a DM, and why an event link never carded anywhere except the
 * composer. Detection now happens once, here, and the surfaces only choose
 * where to put the result.
 *
 * Two rules this module exists to enforce:
 *
 * 1. **Host is checked.** The old helpers matched a path substring anywhere in
 *    the text, so `evil.example/app/post/1` rendered as one of our post cards.
 *    A card is a statement that the content is ours; only our own hosts (and
 *    host-less paths, which can only be ours) get one.
 *
 * 2. **The link is kept.** `path` is the URL as written, not one rebuilt from
 *    the parsed ids, so a link carrying `?comment=` or pointing at `/info`
 *    still lands where it pointed even though the card is chosen by `kind`.
 */

export type DehubLinkKind =
  | 'post'
  | 'profile'
  | 'community'
  | 'communityInvite'
  | 'store'
  | 'listing'
  | 'event'
  | 'stage';

export interface DehubLinkMatch {
  kind: DehubLinkKind;
  /** The exact substring matched in the source text — strip by this, not by a rebuilt URL. */
  raw: string;
  /** In-app path (pathname + search) to navigate to, exactly as the link pointed. */
  path: string;
  tokenId?: string;
  username?: string;
  slug?: string;
  code?: string;
  storeId?: string;
  listingId?: string;
  eventNumber?: string;
  stageId?: string;
  /** Set when the link used the short form (/stages/7) instead of the uuid. */
  stageShortId?: string;
}

// ── Hosts ───────────────────────────────────────────────────────────────────

/**
 * Hosts whose links are ours. `*.dehub.io` covers the legacy host and the
 * per-username profile subdomains; the preview hosts are here because a link
 * copied out of a Cloudflare preview build is still a DeHub link, and silently
 * refusing to card it during testing reads as the feature being broken.
 */
function isDehubHost(host: string): boolean {
  const h = host.toLowerCase().replace(/:\d+$/, '');
  if (h === 'localhost' || h === '127.0.0.1') return true;
  if (h === 'dehub.io' || h.endsWith('.dehub.io')) return true;
  if (h === 'dehub.app' || h.endsWith('.dehub.app')) return true;
  if (h === 'dehub.net' || h.endsWith('.dehub.net')) return true;
  if (h.endsWith('.pages.dev') || h.endsWith('.workers.dev')) return true;
  if (typeof window !== 'undefined' && h === window.location.hostname.toLowerCase()) return true;
  return false;
}

/**
 * Single-segment paths that belong to a route, not to a person.
 *
 * `/:username` is the last route in the table, so every one of these would
 * otherwise parse as a profile — and a profile card that resolves to nothing is
 * worse than the link it replaced. Kept in sync with the top-level routes in
 * App.tsx; a name missing from here costs a fallback chip, not a broken page.
 */
const RESERVED_ROOT_SEGMENTS = new Set([
  'app', 'admin', 'affiliate', 'agents', 'arcade', 'assistant', 'auth', 'blog',
  'bridge', 'communities', 'connect', 'creator', 'creators', 'delete-account',
  'docs', 'dpay', 'editor', 'events', 'explore', 'features', 'governance',
  'guide', 'guides', 'jobs', 'launchpad', 'leaderboard', 'mcp', 'mobile-preview',
  'music', 'premium', 'pricing', 'prompt', 'r', 'radio', 'robots.txt', 'shorts',
  'sitemap.xml', 'skill.md', 'stage', 'stages', 'stake', 'stats', 'stores',
  'top-100', 'tv', 'videos', 'work',
]);

// ── Tokenising ──────────────────────────────────────────────────────────────

// Host-qualified URLs, with or without a scheme: dehub.io/app/post/1
const ABSOLUTE_URL_RE = /(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?\/[^\s<>"'`]*/gi;
// Bare in-app paths, which can only be ours: /app/post/1
// `stage` sits alongside the /app prefix rather than under it because the
// invite route is top-level — App.tsx routes /stage/:id, not /app/stage/:id.
// The optional `s` also admits the short share form, /stages/7.
const BARE_PATH_RE = /\/(?:app|communities|stages?)\/[^\s<>"'`]*/gi;

// A URL at the end of a sentence carries the punctuation with it.
const TRAILING_PUNCTUATION_RE = /[.,;:!?)\]}>"']+$/;

function trimTrailingPunctuation(token: string): string {
  // A closing paren that has a matching opener inside the URL belongs to it.
  let out = token;
  for (;;) {
    const trimmed = out.replace(TRAILING_PUNCTUATION_RE, '');
    if (trimmed === out) return out;
    if (
      trimmed.length < out.length &&
      out.endsWith(')') &&
      (out.match(/\(/g)?.length ?? 0) > (out.match(/\)/g)?.length ?? 0) - 1 &&
      out.includes('(')
    ) {
      return out;
    }
    out = trimmed;
  }
}

// ── Parsing ─────────────────────────────────────────────────────────────────

/**
 * Parse a single URL (or bare path) into the entity it points at.
 * Returns null for anything that is not a DeHub entity link.
 */
export function parseDehubLink(input: string): DehubLinkMatch | null {
  if (!input) return null;
  const raw = trimTrailingPunctuation(input.trim());
  if (!raw) return null;

  let pathname: string;
  let search: string;

  if (raw.startsWith('/')) {
    const [p, q = ''] = raw.split('?');
    pathname = p;
    search = q ? `?${q}` : '';
  } else {
    let parsed: URL;
    try {
      parsed = new URL(raw.match(/^https?:\/\//i) ? raw : `https://${raw}`);
    } catch {
      return null;
    }
    if (!isDehubHost(parsed.host)) return null;
    pathname = parsed.pathname;
    search = parsed.search;
  }

  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return null;

  const path = `${pathname}${search}`;
  const base = { raw, path } as const;

  // Both /app/communities/... and /communities/... are live routes; the second
  // is what the marketing side of the site links to, and it used to card up
  // nowhere because every regex hard-coded the /app prefix.
  const scoped = segments[0] === 'app' ? segments.slice(1) : segments;
  const isAppScoped = segments[0] === 'app';

  // ── /app/post/:tokenId, /app/video/:tokenId ──
  if (isAppScoped && (scoped[0] === 'post' || scoped[0] === 'video') && scoped[1]) {
    if (!/^\d+$/.test(scoped[1])) return null;
    return { ...base, kind: 'post', tokenId: scoped[1] };
  }

  // ── communities/join/:code (invite) — must precede the slug form ──
  if (scoped[0] === 'communities' && scoped[1] === 'join' && scoped[2]) {
    return { ...base, kind: 'communityInvite', code: scoped[2] };
  }

  // ── communities/:slug ──
  if (scoped[0] === 'communities' && scoped[1]) {
    if (!/^[a-zA-Z0-9_-]+$/.test(scoped[1])) return null;
    return { ...base, kind: 'community', slug: scoped[1] };
  }

  // ── /app/stores/:storeId  (+ ?listing=<id>) ──
  if (isAppScoped && scoped[0] === 'stores' && scoped[1]) {
    const storeId = scoped[1];
    if (!/^[a-fA-F0-9-]{8,}$/.test(storeId)) return null;
    const listingId = new URLSearchParams(search).get('listing');
    if (listingId && /^[a-fA-F0-9-]{8,}$/.test(listingId)) {
      return { ...base, kind: 'listing', storeId, listingId };
    }
    return { ...base, kind: 'store', storeId };
  }

  // ── /app/events/:eventNumber ──
  if (isAppScoped && scoped[0] === 'events' && scoped[1]) {
    if (!/^\d+$/.test(scoped[1])) return null;
    return { ...base, kind: 'event', eventNumber: scoped[1] };
  }

  // ── /stage/:id — the invite / announcement link ──
  //
  // Deliberately not app-scoped: the route is top-level. Accepted either way
  // so a hand-typed /app/stage/... still cards up rather than falling through
  // to the profile branch.
  if (scoped[0] === 'stage' && scoped[1]) {
    if (!/^[a-fA-F0-9-]{8,}$/.test(scoped[1])) return null;
    return { ...base, kind: 'stage', stageId: scoped[1] };
  }

  // ── /stages/:n — the short share form of the same link ──
  //
  // Only the numeric shape: bare /stages is the hub page, and anything else
  // under it has no route.
  if (scoped[0] === 'stages' && scoped[1]) {
    if (!/^\d+$/.test(scoped[1])) return null;
    return { ...base, kind: 'stage', stageShortId: scoped[1] };
  }

  // ── /:username ──
  //
  // Host-qualified links only. A bare "/foo" in a sentence is far more likely
  // to be a path fragment somebody typed than a profile link, and guessing
  // wrong there costs a card on every stray slash in the feed.
  if (!raw.startsWith('/') && segments.length === 1) {
    const username = decodeURIComponent(segments[0]).replace(/^@/, '');
    if (!username || RESERVED_ROOT_SEGMENTS.has(username.toLowerCase())) return null;
    if (!/^[a-zA-Z0-9_.-]{2,40}$/.test(username)) return null;
    return { ...base, kind: 'profile', username };
  }

  return null;
}

// ── Scanning free text ──────────────────────────────────────────────────────

/** Every DeHub entity link in a block of text, in the order they appear. */
export function findDehubLinks(text?: string | null): DehubLinkMatch[] {
  if (!text) return [];

  const matches: DehubLinkMatch[] = [];
  const claimed: Array<[number, number]> = [];
  const isClaimed = (start: number) => claimed.some(([s, e]) => start >= s && start < e);

  // Pass 1 — whole URLs. The span is claimed whether or not it parsed, which is
  // the point: a URL on somebody else's host has already been judged, and the
  // host check only holds if the bare-path pass cannot then match the
  // `/app/post/1` sitting inside `https://example.com/app/post/1` and card it
  // as ours. Claiming only successes let exactly that through.
  ABSOLUTE_URL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ABSOLUTE_URL_RE.exec(text)) !== null) {
    if (isClaimed(m.index)) continue;
    const parsed = parseDehubLink(m[0]);
    if (parsed) matches.push(parsed);
    claimed.push([m.index, m.index + m[0].length]);
  }

  // Pass 2 — bare in-app paths, which can only be ours. Anything inside a URL
  // pass 1 already saw is skipped.
  BARE_PATH_RE.lastIndex = 0;
  while ((m = BARE_PATH_RE.exec(text)) !== null) {
    if (isClaimed(m.index)) continue;
    const parsed = parseDehubLink(m[0]);
    if (parsed) {
      matches.push(parsed);
      claimed.push([m.index, m.index + parsed.raw.length]);
    }
  }

  // Restore source order — the two passes run separately.
  return matches.sort((a, b) => text.indexOf(a.raw) - text.indexOf(b.raw));
}

/** The first DeHub entity link in a block of text, if any. */
export function findDehubLink(text?: string | null): DehubLinkMatch | null {
  return findDehubLinks(text)[0] ?? null;
}

export function hasDehubLink(text?: string | null): boolean {
  return findDehubLinks(text).length > 0;
}

/**
 * Remove specific matched URLs from text for display, because a card replaced
 * them. Display only — never send the result back to an API, or editing a post
 * would silently drop the link out of the stored body.
 *
 * Takes the matches rather than re-scanning, so a surface that caps how many
 * cards it renders strips exactly the links it carded and leaves the rest as
 * readable text.
 */
export function stripDehubLinkMatches(text: string | null | undefined, matches: DehubLinkMatch[]): string {
  if (!text) return text ?? '';
  let out = text;
  for (const match of matches) {
    out = out.split(match.raw).join('');
  }
  return out
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Remove every DeHub entity URL from text for display. */
export function stripDehubLinks(text?: string | null): string {
  if (!text) return text ?? '';
  return stripDehubLinkMatches(text, findDehubLinks(text));
}

// ── Building ────────────────────────────────────────────────────────────────

/**
 * Absolute origin for a shared link. Uses the current origin so a link copied
 * on a preview build stays on that build, and falls back to production when
 * there is no window (SSR, tests).
 */
export function shareOrigin(): string {
  return typeof window !== 'undefined' ? window.location.origin : 'https://dehub.io';
}

export const dehubLinkFor = {
  post: (tokenId: string | number) => `${shareOrigin()}/app/post/${tokenId}`,
  comment: (tokenId: string | number, commentId: string | number) =>
    `${shareOrigin()}/app/post/${tokenId}?comment=${encodeURIComponent(String(commentId))}`,
  profile: (username: string) => `${shareOrigin()}/${encodeURIComponent(username)}`,
  community: (slug: string) => `${shareOrigin()}/app/communities/${encodeURIComponent(slug)}`,
  communityInvite: (code: string) => `${shareOrigin()}/app/communities/join/${encodeURIComponent(code)}`,
  store: (storeId: string) => `${shareOrigin()}/app/stores/${storeId}`,
  listing: (storeId: string, listingId: string) =>
    `${shareOrigin()}/app/stores/${storeId}?listing=${listingId}`,
  event: (eventNumber: string | number) => `${shareOrigin()}/app/events/${eventNumber}`,
  /**
   * Prefers the short numeric form when the row carries one; the uuid form
   * stays valid for links already in the wild.
   */
  stage: (stage: string | { id: string; short_id?: number | null }) => {
    if (typeof stage === 'string') return `${shareOrigin()}/stage/${encodeURIComponent(stage)}`;
    return stage.short_id != null
      ? `${shareOrigin()}/stages/${stage.short_id}`
      : `${shareOrigin()}/stage/${encodeURIComponent(stage.id)}`;
  },
};

/** Human label for a link kind — used by share sheets and fallback chips. */
export function dehubLinkLabel(kind: DehubLinkKind): string {
  switch (kind) {
    case 'post': return 'post';
    case 'profile': return 'profile';
    case 'community': return 'community';
    case 'communityInvite': return 'community invite';
    case 'store': return 'store';
    case 'listing': return 'item';
    case 'event': return 'event';
    case 'stage': return 'stage';
  }
}
