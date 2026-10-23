// What the brand accounts say, built from data index.ts has already fetched.
// Nothing here touches the network or Deno, so the rules (length limits, UTM
// tags, what is never featured) are tested under plain Node in posts.test.ts.

import { CAST_MAX_BYTES, TEXT_LIMIT, clip, clipCastText } from '../_shared/social-text.ts';
import type { MediaItem } from '../_shared/zernio.ts';

export const KINDS = ['creator_of_day', 'growth_pulse', 'live_now', 'leaderboard', 'dhb_update', 'shorts_of_week'] as const;
export type Kind = typeof KINDS[number];

export const SITE = 'https://dehub.io';

/** The post share card the SEO worker renders for any post, sized for social previews. */
export const postCardImage = (tokenId: string | number) => `${SITE}/_og/post/v4/${tokenId}.png`;

/**
 * A post before it is fitted to each platform. `quote` is the only part that
 * gives way when a platform is short of room, so the credit, the numbers and
 * the link always survive.
 */
interface Person {
  username?: string;
  displayName?: string;
  followers?: number;
  isBanned?: boolean;
  banned?: boolean;
  matureAccount?: boolean;
  isMature?: boolean;
}

/** The fields this file reads from a /feed or /feed/shorts item. */
export interface ApiPost {
  tokenId?: number | string;
  name?: string;
  title?: string;
  description?: string;
  contentRating?: string;
  isHidden?: boolean;
  isDeleted?: boolean;
  isMature?: boolean;
  nsfw?: boolean;
  totalTips?: number;
  likes?: number;
  minterDisplayName?: string;
  mintername?: string;
  minterUsername?: string;
  minterUser?: Person;
  account?: Person;
  user?: Person;
}

/** A post that can be linked to. */
export type FeaturedPost = ApiPost & { tokenId: number | string };

export const hasTokenId = (p: ApiPost | null | undefined): p is FeaturedPost => p?.tokenId != null && p.tokenId !== '';

export interface Draft {
  kind: Kind;
  sourceRef: string;
  head: string;
  quote?: string;
  tail?: string;
  link: string;
  media: MediaItem[];
  scheduledFor: Date;
}

export function utmLink(url: string, platform: string, kind: Kind): string {
  const u = new URL(url);
  u.searchParams.set('utm_source', platform);
  u.searchParams.set('utm_medium', 'social');
  u.searchParams.set('utm_campaign', `autopost_${kind}`);
  return u.toString();
}

/** Plain text from a post's HTML-ish body: tags out, entities decoded, whitespace collapsed. */
export function plainText(value: unknown): string {
  return String(value ?? '').slice(0, 20000)
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>|<\/(?:p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/gi, (_m, e: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' } as Record<string, string>)[e.toLowerCase()])
    // eslint-disable-next-line no-control-regex -- stripping control characters is the point
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/[\t ]+/g, ' ').replace(/\s*\n\s*/g, ' ').trim();
}

function body(draft: Draft, quote: string): string {
  return [draft.head, quote ? `“${quote}”` : '', draft.tail ?? ''].filter(Boolean).join('\n\n');
}

/** Shrink the quote (never anything else) until `measure(text) <= limit`; drop it if it cannot fit. */
function fitQuote(draft: Draft, limit: number, measure: (s: string) => number, compose: (b: string) => string): string {
  const full = compose(body(draft, draft.quote ?? ''));
  if (measure(full) <= limit || !draft.quote) return full;
  const without = compose(body(draft, ''));
  // Room left for the quote marks, the blank lines around them and the ellipsis.
  let room = draft.quote.length - (measure(full) - limit);
  while (room > 12) {
    const text = compose(body(draft, clip(draft.quote, room)));
    if (measure(text) <= limit) return text;
    room -= Math.max(1, measure(text) - limit);
  }
  return without;
}

const bytes = (s: string) => new TextEncoder().encode(s).length;

/**
 * The text for one platform. The UTM-tagged link closes every Zernio post;
 * Farcaster carries it as an embed instead, so its text has no link.
 */
export function textFor(draft: Draft, platform: string): string {
  if (platform === 'farcaster') {
    return clipCastText(fitQuote(draft, CAST_MAX_BYTES, bytes, (b) => b), CAST_MAX_BYTES);
  }
  const link = utmLink(draft.link, platform, draft.kind);
  const compose = (b: string) => `${b}\n\n${link}`;
  const limit = TEXT_LIMIT[platform] ?? 5000;
  const text = fitQuote(draft, limit, (s) => s.length, compose);
  if (text.length <= limit) return text;
  // Head and tail alone are too long: shorten them, keep the link whole.
  return compose(clip(body(draft, ''), limit - link.length - 2));
}

export function textsFor(draft: Draft, platforms: string[]): Record<string, string> {
  return Object.fromEntries(platforms.map((p) => [p, textFor(draft, p)]));
}

/** Whether a stored (possibly hand-edited) text fits the platform it is for. */
export function fitsPlatform(platform: string, text: string): boolean {
  if (platform === 'farcaster') return bytes(text) <= CAST_MAX_BYTES;
  return text.length <= (TEXT_LIMIT[platform] ?? 5000);
}

// ── What is never featured ──────────────────────────────────────────────────

const ADULT_WORDS = /(^|[^a-z0-9])(nsfw|18\+|porn\w*|xxx|onlyfans|nudes?|hentai|r34)(?=$|[^a-z0-9])/i;

/**
 * True when a post or stream must not be promoted by the brand: rated anything
 * but safe, hidden, from a banned or adult account, or worded like adult
 * content. The public feed already leaves most of these out; this is the
 * second lock, because a brand post cannot be taken back once it is out.
 */
export function isUnfeaturable(item: ApiPost | null | undefined): boolean {
  if (!item) return true;
  const rating = item.contentRating ?? 'safe';
  if (rating !== 'safe') return true;
  if (item.isHidden || item.isDeleted || item.isMature || item.nsfw) return true;
  const people = [item.minterUser, item.account, item.user].filter((p): p is Person => !!p);
  if (people.some((p) => p.isBanned || p.banned || p.matureAccount || p.isMature)) return true;
  const words = [item.name, item.title, item.description].map(plainText).join(' ');
  return ADULT_WORDS.test(words);
}

// ── Numbers ─────────────────────────────────────────────────────────────────

export function compact(n: number): string {
  const abs = Math.abs(n);
  const fmt = (v: number, s: string) => `${v >= 100 ? Math.round(v) : Number(v.toFixed(1))}${s}`;
  if (abs >= 1e9) return fmt(n / 1e9, 'B');
  if (abs >= 1e6) return fmt(n / 1e6, 'M');
  if (abs >= 1e4) return fmt(n / 1e3, 'K');
  return Math.round(n).toLocaleString('en-US');
}

/** Two decimals from $1 up, four significant digits below. */
export function usdPrice(n: number): string {
  return n >= 1 ? `$${n.toFixed(2)}` : `$${n.toLocaleString('en-US', { maximumSignificantDigits: 4, maximumFractionDigits: 12 })}`;
}

const signed = (pct: number) => `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`;

// ── Keys and times ──────────────────────────────────────────────────────────

export const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/** ISO week, e.g. 2026-W43. */
export function weekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t.getTime() - yearStart) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/**
 * When each recurring kind goes out (UTC). `weekday` is 0 for Sunday; absent
 * means daily. Generation opens an hour before so an admin has time to review.
 */
export const SLOTS: Partial<Record<Kind, { hour: number; weekday?: number }>> = {
  dhb_update: { hour: 13 },
  creator_of_day: { hour: 16 },
  growth_pulse: { hour: 15, weekday: 1 },
  leaderboard: { hour: 17, weekday: 5 },
  shorts_of_week: { hour: 18, weekday: 0 },
};

/** The slot time when `now` is inside that kind's generation window today, else null. */
export function slotFor(kind: Kind, now: Date): Date | null {
  const slot = SLOTS[kind];
  if (!slot) return null;
  if (slot.weekday !== undefined && now.getUTCDay() !== slot.weekday) return null;
  if (now.getUTCHours() < slot.hour - 1) return null;
  const at = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), slot.hour));
  return at > now ? at : now;
}

// ── Builders ────────────────────────────────────────────────────────────────

const authorOf = (p: ApiPost) =>
  plainText(p.minterDisplayName || p.minterUser?.displayName || p.mintername || p.minterUsername || p.minterUser?.username) || 'a DeHub creator';

/**
 * Creator of the day. Credit is by display name, not @handle: a DeHub username
 * written as a mention would tag whoever owns that handle on X or Threads.
 */
export function creatorOfDay(post: FeaturedPost, at: Date): Draft {
  const tips = Number(post.totalTips ?? 0);
  const likes = Number(post.likes ?? 0);
  const stats = [tips > 0 ? `${compact(tips)} DHB in tips` : '', likes > 0 ? `${compact(likes)} likes` : ''].filter(Boolean).join(' and ');
  const quote = plainText(post.name) || plainText(post.description);
  return {
    kind: 'creator_of_day',
    sourceRef: `post:${post.tokenId}`,
    head: `Creator of the day: ${authorOf(post)}`,
    quote,
    tail: stats ? `${stats} in the last 24 hours. Go show some love.` : 'Go show some love.',
    link: `${SITE}/post/${post.tokenId}`,
    media: [{ url: postCardImage(post.tokenId), type: 'image' }],
    scheduledFor: at,
  };
}

export interface UserStats {
  totals?: { total?: number };
  active?: { weekly?: number };
  newUsers?: { thisWeek?: number };
  growth?: { weekly?: number | null };
}

export function growthPulse(stats: UserStats, at: Date): Draft | null {
  const total = Number(stats.totals?.total ?? 0);
  const fresh = Number(stats.newUsers?.thisWeek ?? 0);
  const active = Number(stats.active?.weekly ?? 0);
  if (!total) return null;
  const growth = stats.growth?.weekly;
  const lines = [
    `${compact(fresh)} people joined DeHub this week.`,
    `${compact(active)} were active, and the community is now ${compact(total)} strong.`,
    typeof growth === 'number' && growth > 0 ? `That is ${signed(growth)} week on week.` : '',
  ].filter(Boolean);
  return {
    kind: 'growth_pulse',
    sourceRef: `week:${weekKey(at)}`,
    head: 'Weekly pulse',
    tail: lines.join(' '),
    link: `${SITE}/stats`,
    media: [],
    scheduledFor: at,
  };
}

export interface LiveStreamRow {
  _id?: string;
  tokenId?: number;
  title?: string;
  status?: string;
  startedAt?: string;
  account?: Person;
}

export function liveStream(stream: LiveStreamRow, at: Date): Draft {
  const who = plainText(stream.account?.displayName || stream.account?.username) || 'A DeHub creator';
  const link = stream.tokenId ? `${SITE}/post/${stream.tokenId}` : stream.account?.username ? `${SITE}/${stream.account.username}` : `${SITE}/videos`;
  return {
    kind: 'live_now',
    sourceRef: `stream:${stream._id ?? stream.tokenId}`,
    head: `${who} is live on DeHub right now.`,
    quote: plainText(stream.title),
    tail: 'Tune in, chat and tip.',
    link,
    media: stream.tokenId ? [{ url: postCardImage(stream.tokenId), type: 'image' }] : [],
    scheduledFor: at,
  };
}

export interface StageRow {
  id: string;
  short_id?: number | null;
  title: string;
  host_username?: string | null;
  status: string;
  scheduled_at?: string | null;
  listener_count?: number;
}

export function stage(row: StageRow, at: Date): Draft {
  const host = plainText(row.host_username) || 'A DeHub host';
  const soon = row.status === 'scheduled';
  return {
    kind: 'live_now',
    sourceRef: `stage:${row.id}`,
    head: soon ? `Starting soon on DeHub Stages, hosted by ${host}:` : `Live now on DeHub Stages, hosted by ${host}:`,
    quote: plainText(row.title),
    tail: soon ? 'Pull up a chair.' : `${compact(row.listener_count ?? 0)} listening. Pull up a chair.`,
    link: row.short_id != null ? `${SITE}/stages/${row.short_id}` : `${SITE}/stage/${row.id}`,
    media: [],
    scheduledFor: at,
  };
}

export interface BoardEntry {
  account: string;
  username?: string;
  userDisplayName?: string;
  delta?: number;
  hideBadgeAndBalance?: boolean;
}

function podium(entries: BoardEntry[]): string {
  return entries
    .filter((e) => !e.hideBadgeAndBalance && (e.delta ?? 0) > 0 && (e.userDisplayName || e.username))
    .slice(0, 3)
    .map((e, i) => `${i + 1}. ${plainText(e.userDisplayName || e.username)} (${compact(e.delta ?? 0)} DHB)`)
    .join('\n');
}

export function leaderboard(received: BoardEntry[], sent: BoardEntry[], at: Date): Draft | null {
  const creators = podium(received);
  const tippers = podium(sent);
  if (!creators && !tippers) return null;
  return {
    kind: 'leaderboard',
    sourceRef: `week:${weekKey(at)}`,
    head: 'This week on the DeHub leaderboard',
    tail: [creators ? `Most tipped creators\n${creators}` : '', tippers ? `Biggest tippers\n${tippers}` : ''].filter(Boolean).join('\n\n'),
    link: `${SITE}/leaderboard`,
    media: [],
    scheduledFor: at,
  };
}

export interface DhbMarket { priceUsd: number; change24h?: number | null; volume24h?: number | null; liquidityUsd?: number | null }

export function dhbUpdate(m: DhbMarket, at: Date): Draft | null {
  if (!(m.priceUsd > 0)) return null;
  const facts = [
    `DHB is at ${usdPrice(m.priceUsd)}${typeof m.change24h === 'number' ? ` (${signed(m.change24h)} in 24h)` : ''}.`,
    m.volume24h ? `24h volume $${compact(m.volume24h)}` : '',
    m.liquidityUsd ? `liquidity $${compact(m.liquidityUsd)}` : '',
  ].filter(Boolean);
  const [lead, ...rest] = facts;
  return {
    kind: 'dhb_update',
    sourceRef: `day:${dayKey(at)}`,
    head: 'DHB daily',
    tail: rest.length ? `${lead} ${rest.join(', ').replace(/^./, (c) => c.toUpperCase())}.` : lead,
    link: `${SITE}/buy`,
    media: [],
    scheduledFor: at,
  };
}

export function shortsOfWeek(shorts: ApiPost[], at: Date): Draft | null {
  const picks = shorts.filter(hasTokenId).filter((s) => !isUnfeaturable(s)).slice(0, 3);
  if (!picks.length) return null;
  const list = picks.map((s, i) => `${i + 1}. ${authorOf(s)}${plainText(s.name) ? `: ${clip(plainText(s.name), 60)}` : ''}`).join('\n');
  return {
    kind: 'shorts_of_week',
    sourceRef: `week:${weekKey(at)}`,
    head: 'Shorts of the week',
    tail: list,
    link: `${SITE}/post/${picks[0].tokenId}`,
    media: [{ url: postCardImage(picks[0].tokenId), type: 'image' }],
    scheduledFor: at,
  };
}
