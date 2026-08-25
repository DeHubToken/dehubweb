import {
  ArrowLeftRight, Bot, Coins, Crown, Film, Gamepad2, ListOrdered, Megaphone,
  Music2, Plug, Smartphone, Star, Tag, Tv, Video,
} from 'lucide-react';
import type { NavItem } from '@/types/app.types';
import { NAV_LABEL_KEYS } from './SidebarNavItem';

/** Just the shape we need from react-i18next's `t`, so no version-pinned type. */
type TranslateFn = (key: string) => string;

/**
 * Menu search — shared by the desktop rail and the mobile menu sheet.
 *
 * This filters the NAVIGATION, not DeHub's content: the left panel carries 28
 * destinations in a box about nine rows tall, and that is the problem the field
 * is there to solve. Content search stays where it already is — the right rail
 * on desktop, and the Explore page, which both surfaces hand off to when the
 * thing being looked for is not a page.
 *
 * WHY IT IS NOT A SUBSTRING FILTER
 * --------------------------------
 * The first version matched the query against each row's own label. That only
 * works for someone who already knows what the row is called, which is the one
 * user who does not need a search field. Everyone else types what they want,
 * not what we named it: "games" for the Arcade, "kings gambit" for a specific
 * game inside it, "dm" for Messages, "vote" for Governance, "apy" for Staking.
 * A label filter answers all of those with "Nothing in the menu matches", and
 * the menu genuinely does contain what they asked for.
 *
 * So three things sit on top of the label match:
 *
 *   KEYWORDS — every destination carries the words people actually use for it
 *     (NAV_KEYWORDS below). Matching one of those ranks the row below any row
 *     matched on its own name, which keeps "settings" from being outranked by
 *     the six rows that merely have "settings" among their keywords.
 *
 *   HIDDEN DESTINATIONS — real pages with no rail row (SEARCH_ONLY_ITEMS).
 *     They appear only once something is typed, so the resting menu is
 *     unchanged, and they are how "kings gambit" reaches the game itself
 *     rather than only the grid it lives on.
 *
 *   TYPO TOLERANCE — a last-resort pass within one or two edits, so "setings"
 *     and "arcde" land where they were aimed instead of on the empty state.
 *
 * WHAT STAYS IN ENGLISH, AND WHY
 * ------------------------------
 * Labels are matched in the language the UI is rendering AND in English, so a
 * Turkish reader can type either "ayarlar" or "settings". The keyword lists
 * are English only and deliberately so: they are 300-odd matching aids, not
 * copy, translating them means 110 locale files per edit, and the loanwords
 * that make up most of them ("dm", "apy", "nft", "fps") are typed in English
 * on every keyboard anyway.
 */

/** Where the "search DeHub for …" hand-off row points. */
export const exploreSearchHref = (query: string) =>
  `/app/explore?q=${encodeURIComponent(query.trim())}`;

// ---------------------------------------------------------------------------
// Folding
// ---------------------------------------------------------------------------

/**
 * Reduce a phrase to the one form everything is compared in: lower case,
 * accents dropped, every run of punctuation or whitespace collapsed to a
 * single space.
 *
 * "King's Gambit", "Kings gambit" and "KING’S  GAMBIT" all land on
 * "kings gambit", which is the entire point — nobody types the apostrophe,
 * and the ones who do are as likely to type ’ as '.
 */
function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

// The strings being folded are a fixed set — labels and keywords — but they are
// re-folded on every keystroke. Memoising costs one Map and takes the whole
// thing off the typing path.
const foldCache = new Map<string, string>();
function foldOnce(value: string): string {
  let folded = foldCache.get(value);
  if (folded === undefined) {
    folded = fold(value);
    foldCache.set(value, folded);
  }
  return folded;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * Match quality, lower is better. The gaps matter more than the numbers: every
 * way of matching a destination's own NAME beats every way of matching one of
 * its keywords, and a typo-corrected match always comes last.
 */
const LABEL_MATCH = 0; // + 0..3, from matchPhrase
const KEYWORD_MATCH = 10; // + 0..3
const FUZZY_LABEL = 20;
const FUZZY_KEYWORD = 21;
const NO_MATCH = Infinity;

/**
 * Where `token` sits inside `phrase`, as a rank: the whole phrase, the start of
 * it, the start of a word within it, or mid-word. Both arguments are folded.
 */
function matchPhrase(phrase: string, token: string): number {
  if (!phrase || !token) return NO_MATCH;
  if (phrase === token) return 0;
  if (phrase.startsWith(token)) return 1;
  const at = phrase.indexOf(token);
  if (at > 0) return phrase[at - 1] === ' ' ? 2 : 3;
  // "commandcentre", "featurerequests", "kingsgambit". People drop the space
  // about as often as they type it, and no amount of prefix logic finds that.
  if (phrase.includes(' ') && phrase.replace(/ /g, '').includes(token)) return 3;
  return NO_MATCH;
}

/**
 * True when `a` becomes `b` within `max` edits. Standard Levenshtein over two
 * rows, with two early exits — the length gap, and a whole row already over
 * budget — which is what keeps it cheap enough to run per keystroke across
 * every keyword in the table.
 */
function withinEdits(a: string, b: string, max: number): boolean {
  if (max <= 0) return a === b;
  if (Math.abs(a.length - b.length) > max) return false;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row: number[] = [i];
    let rowBest = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + cost);
      if (row[j] < rowBest) rowBest = row[j];
    }
    if (rowBest > max) return false;
    previous = row;
  }
  return previous[b.length] <= max;
}

/**
 * Typo budget for a token.
 *
 * Nothing under four characters is corrected. At three, one edit reaches a
 * third of the menu — "dos" would pull in Docs, DMs and Jobs alike — and short
 * tokens are usually a real prefix on the way to a longer word, which the
 * exact passes already handle.
 */
function editBudget(token: string): number {
  if (token.length < 4) return 0;
  return token.length >= 8 ? 2 : 1;
}

/** Typo pass against a phrase: the whole phrase, then each word in it. */
function fuzzyPhrase(phrase: string, token: string, budget: number): boolean {
  if (budget <= 0) return false;
  if (withinEdits(phrase, token, budget)) return true;
  return phrase
    .split(' ')
    .some((word) => word.length >= 4 && withinEdits(word, token, budget));
}

/** Best tier this destination can offer for one token of the query. */
function scoreToken(labels: string[], keywords: string[], token: string): number {
  let best = NO_MATCH;

  for (const label of labels) {
    const at = matchPhrase(label, token);
    if (at !== NO_MATCH) best = Math.min(best, LABEL_MATCH + at);
  }
  // A name match can never be beaten by a keyword, so stop looking.
  if (best !== NO_MATCH) return best;

  for (const keyword of keywords) {
    const at = matchPhrase(keyword, token);
    if (at !== NO_MATCH) best = Math.min(best, KEYWORD_MATCH + at);
  }
  if (best !== NO_MATCH) return best;

  const budget = editBudget(token);
  if (labels.some((label) => fuzzyPhrase(label, token, budget))) return FUZZY_LABEL;
  if (keywords.some((keyword) => fuzzyPhrase(keyword, token, budget))) return FUZZY_KEYWORD;
  return NO_MATCH;
}

/**
 * Score one destination against the whole query.
 *
 * Every token has to match something — "kings gambit" must not return every
 * row that happens to contain "kings" — and the destination is then ranked by
 * its WORST token, so a row that matches both words on its name outranks one
 * that matches one word on its name and the other on a keyword.
 */
function scoreItem(item: NavItem, tokens: string[], t: TranslateFn): number {
  const translated = foldOnce(t(NAV_LABEL_KEYS[item.label] || item.label));
  const english = foldOnce(item.label);
  const labels = translated === english ? [english] : [translated, english];
  const keywords = (NAV_KEYWORDS[item.label] ?? []).map(foldOnce);

  let worst = 0;
  for (const token of tokens) {
    const tier = scoreToken(labels, keywords, token);
    if (tier === NO_MATCH) return NO_MATCH;
    if (tier > worst) worst = tier;
  }
  return worst;
}

// ---------------------------------------------------------------------------
// What each destination is called when you do not know what it is called
// ---------------------------------------------------------------------------

/**
 * Keyed by the label in `NAV_ITEMS` (or in `SEARCH_ONLY_ITEMS` below), so a
 * renamed row renames its keywords with it or the compiler-invisible break is
 * caught by `src/test/nav-search.test.ts`, which asserts every key here is a
 * real destination.
 *
 * These are search terms, not synonyms — a word belongs here if someone might
 * plausibly type it while looking for this page, whether or not it is what we
 * would call the page. Overlap between rows is fine and expected: "earn" is a
 * true answer for Staking, Bounties and Affiliate, and showing all three is a
 * better answer than picking one.
 */
export const NAV_KEYWORDS: Record<string, string[]> = {
  // --- rail rows -----------------------------------------------------------
  Home: ['feed', 'timeline', 'latest', 'for you', 'posts', 'front page'],
  Profile: ['my profile', 'my account', 'me', 'my posts', 'avatar', 'bio', 'followers', 'following'],
  Explore: ['search', 'discover', 'find', 'trending', 'hashtags', 'tags', 'people', 'users', 'topics'],
  Prompt: ['ai', 'generate', 'ai image', 'ai video', 'image generator', 'text to image', 'art', 'create with ai', 'credits'],
  Notifications: ['alerts', 'activity', 'mentions', 'replies', 'likes', 'bell'],
  Messages: ['dm', 'dms', 'direct messages', 'chat', 'inbox', 'conversations', 'pm'],
  Communities: ['groups', 'community', 'rooms', 'servers', 'clubs'],
  Assistant: ['ai', 'chatbot', 'bot', 'ask', 'help', 'copilot', 'agent'],
  Settings: [
    'preferences', 'account', 'privacy', 'security', 'password', 'language',
    'theme', 'appearance', 'dark mode', 'blocked', 'two factor', 'notifications settings',
    'delete account', 'options', 'config',
  ],
  Leaderboard: ['ranking', 'rankings', 'rank', 'top creators', 'top users', 'points', 'league'],
  Bookmarks: ['saved', 'saves', 'favourites', 'favorites', 'watch later', 'read later', 'saved posts'],
  Command: ['command centre', 'command center', 'dashboard', 'creator studio', 'analytics', 'earnings', 'insights', 'moderation', 'my stats'],
  Wallet: ['balance', 'funds', 'dhb', 'tokens', 'crypto', 'deposit', 'withdraw', 'send', 'receive', 'transactions', 'top up', 'address'],
  Events: ['calendar', 'schedule', 'ama', 'meetup', 'upcoming', 'town hall'],
  Stages: ['audio', 'spaces', 'live audio', 'talk', 'voice', 'mic', 'podcast', 'rooms'],
  'Feature Requests': ['feedback', 'suggestions', 'ideas', 'request a feature', 'roadmap', 'vote', 'wishlist'],
  Staking: ['stake', 'apy', 'apr', 'yield', 'rewards', 'earn', 'vault', 'lock', 'pool'],
  SuperPowers: ['boost', 'boosts', 'second wind', 'promote', 'amplify', 'reach', 'top of feed', 'badge perks', 'powers'],
  Governance: ['vote', 'voting', 'votes', 'proposals', 'dao', 'poll', 'ballot', 'referendum'],
  Bounties: ['work', 'jobs', 'tasks', 'gigs', 'freelance', 'hire', 'earn', 'escrow', 'contracts'],
  Affiliate: ['referral', 'referrals', 'refer', 'invite', 'commission', 'partner', 'share link'],
  Careers: ['jobs', 'hiring', 'vacancies', 'work with us', 'apply', 'recruitment', 'roles'],
  Stores: ['shop', 'store', 'marketplace', 'merch', 'buy', 'sell', 'products', 'ecommerce', 'orders'],
  // Nobody types "fractions" — they type what they are trying to do with them.
  // "shares" and "ownership" are how the docs and the marketing copy describe
  // the same thing, so both have to land here.
  Fractions: [
    'fraction', 'shares', 'ownership', 'own a post', 'invest', 'stake in a post',
    'tokenised', 'nft', 'erc1155', 'trade', 'sell fractions', 'buy fractions', 'holdings', 'portfolio',
  ],
  // Nobody hunting a handle types "usernames" — they type the thing they want
  // to change, which is their @name, or the thing they want to do with it.
  Usernames: ['username', 'handle', 'handles', 'name', 'names', '@', 'change my name', 'buy a name', 'sell my name', 'vanity', 'domain'],
  // Sibling of Usernames — that one sells the handle, this one sells the whole
  // account with its followers and history. People search for the outcome
  // ("buy an account with followers"), not the noun.
  Accounts: [
    'account', 'accounts', 'buy account', 'sell account', 'sell my account',
    'account marketplace', 'aged account', 'followers', 'buy followers',
    'take over an account', 'transfer account', 'profile for sale',
  ],
  // The example that started this: nobody looking for a game types "arcade".
  // The individual games are here as well as being rows of their own, so a
  // half-remembered title finds the grid even when it does not find the game.
  Arcade: [
    'games', 'game', 'play', 'gaming', 'play to earn', 'p2e', 'arcade',
    "king's gambit", 'chess', 'claude of duty', 'fps', 'shooter', 'jungle trail',
    'street slayer', 'beat em up', 'fighting', 'trenchstar', 'trading floor',
  ],
  Glossary: ['terms', 'definitions', 'dictionary', 'jargon', 'meaning', 'what is', 'acronyms'],
  Guide: ['getting started', 'how to', 'tutorial', 'onboarding', 'walkthrough', 'learn', 'help', 'new here'],
  Stats: ['analytics', 'metrics', 'live stats', 'charts', 'numbers', 'price', 'supply', 'holders', 'volume'],
  Docs: ['documentation', 'help', 'api', 'whitepaper', 'developers', 'sdk', 'reference', 'brand', 'advertising'],
  Blog: ['news', 'articles', 'updates', 'announcements', 'press', 'releases'],

  // --- search-only rows ----------------------------------------------------
  Videos: ['watch', 'video feed', 'clips', 'long form'],
  Shorts: ['reels', 'short videos', 'vertical', 'swipe', 'feed'],
  Music: ['audio', 'songs', 'tracks', 'listen', 'radio', 'playlist'],
  'Live TV': ['tv', 'streams', 'streaming', 'live', 'broadcast', 'channels', 'watch live'],
  'Buy DHB': ['buy dhb', 'buy tokens', 'purchase', 'top up', 'card', 'fiat', 'on ramp', 'credit card'],
  Bridge: ['cross chain', 'swap chain', 'transfer chain', 'bnb', 'base', 'chains'],
  'Top 100': ['top 100', 'cryptos', 'coins', 'market cap', 'prices', 'tickers'],
  'AI Agents': ['agents', 'ai agents', 'bots', 'automation', 'personas'],
  Advertising: ['ads', 'adverts', 'advertising', 'campaign', 'promote', 'sponsor', 'marketing'],
  Premium: ['premium', 'subscription', 'upgrade', 'pro', 'membership', 'plans'],
  Pricing: ['pricing', 'plans', 'cost', 'price', 'credits', 'subscription', 'how much'],
  Creators: ['creator program', 'ambassadors', 'partners', 'apply as creator'],
  'Get the App': ['apk', 'android', 'download', 'mobile app', 'install', 'play store', 'ios', 'app store'],
  'Connect AI': ['mcp', 'chatgpt', 'claude', 'api', 'integration', 'connect ai', 'model context protocol'],
  // Games. Their titles are the labels, so these are only the ways in that the
  // title itself does not cover.
  "King's Gambit": ['chess', '3d chess', 'play chess', 'online chess', 'board game', 'multiplayer'],
  'Claude of Duty': ['fps', 'shooter', 'first person', 'war', 'shooting game', 'call of duty'],
  'Jungle Trail': ['walk', 'rainforest', 'jungle', 'exploration', 'first person', 'nature'],
  'Street Slayer': ['beat em up', 'brawler', 'fighting', 'fighter', 'side scroller', 'arcade fighter'],
  Trenchstar: ['trading floor', 'trading', 'charts', 'markets', 'binance', 'dexscreener', 'trenches', 'vr'],
};

// ---------------------------------------------------------------------------
// Destinations that are not on the menu
// ---------------------------------------------------------------------------

/**
 * Real, public, linked pages that have no row in the rail — either because the
 * rail is already 28 rows long, or because they are reached from inside another
 * page (Bridge from the wallet, Top 100 from the leaderboard, a game from the
 * Arcade grid).
 *
 * They are invisible until something is typed, so the resting menu is exactly
 * what it was; searching is the only thing that reveals them. That makes the
 * field a way to reach the whole app rather than a filter on nine rows.
 *
 * Two rules for anything added here. It must be a page a signed-out or ordinary
 * signed-in visitor is meant to reach — `/admin` and the deliberately unlisted
 * `/app/pair` are not — and its path must be a real route in `App.tsx`, because
 * nothing else checks: an unrouted path renders a row that lands on the 404.
 *
 * The games are duplicated from `config/arcade-games.ts` on purpose. That
 * registry pulls in the GPU probe, and this module is imported by AppSidebar,
 * which is eager — importing it here would fold the whole arcade registry into
 * the entry chunk that `scripts/check-entry-bundle.mjs` guards. The copy is
 * held honest by `src/test/nav-search.test.ts`, which fails if the registry
 * gains a game that has no row here.
 */
export const SEARCH_ONLY_ITEMS: readonly NavItem[] = [
  { icon: Video, label: 'Videos', path: '/videos' },
  { icon: Film, label: 'Shorts', path: '/shorts' },
  { icon: Music2, label: 'Music', path: '/music' },
  { icon: Tv, label: 'Live TV', path: '/tv' },
  { icon: Coins, label: 'Buy DHB', path: '/app/buy' },
  { icon: ArrowLeftRight, label: 'Bridge', path: '/app/bridge' },
  { icon: ListOrdered, label: 'Top 100', path: '/app/top-100' },
  { icon: Bot, label: 'AI Agents', path: '/app/agents' },
  { icon: Megaphone, label: 'Advertising', path: '/app/ads' },
  { icon: Crown, label: 'Premium', path: '/premium' },
  { icon: Tag, label: 'Pricing', path: '/pricing' },
  { icon: Star, label: 'Creators', path: '/creators' },
  { icon: Smartphone, label: 'Get the App', path: '/apk' },
  { icon: Plug, label: 'Connect AI', path: '/connect' },
  { icon: Gamepad2, label: "King's Gambit", path: '/arcade/kings-gambit' },
  { icon: Gamepad2, label: 'Claude of Duty', path: '/arcade/claude-of-duty' },
  { icon: Gamepad2, label: 'Jungle Trail', path: '/arcade/jungle-trail' },
  { icon: Gamepad2, label: 'Street Slayer', path: '/arcade/street-slayer' },
  { icon: Gamepad2, label: 'Trenchstar', path: '/arcade/trenchstar' },
];

// ---------------------------------------------------------------------------
// The filter itself
// ---------------------------------------------------------------------------

interface Ranked {
  item: NavItem;
  tier: number;
  /** Menu order. Search-only rows are offset so they lose every equal tie. */
  order: number;
}

/**
 * Filter and rank the menu for `query`. An empty query returns `items`
 * untouched and by identity, so the resting menu is not re-created on every
 * render of a surface that is not searching.
 */
export function filterNavItems(items: NavItem[], query: string, t: TranslateFn): NavItem[] {
  const folded = fold(query);
  const tokens = folded.split(' ').filter(Boolean);
  if (!tokens.length) return items;

  const pool: Array<{ item: NavItem; order: number }> = items.map((item, order) => ({ item, order }));

  // One character is a keystroke on the way to a word, not a decision to go
  // looking for a page that is not on the menu — so the hidden destinations
  // stay hidden until there is something to go on. Anything already on the
  // menu is skipped by both path and label: the rows are keyed on label, so a
  // duplicate of either is a React key collision, not just a repeated row.
  if (folded.length >= 2) {
    const onMenu = new Set(items.flatMap((item) => [item.path, item.label]));
    SEARCH_ONLY_ITEMS.forEach((item, index) => {
      if (!onMenu.has(item.path) && !onMenu.has(item.label)) {
        pool.push({ item, order: 1000 + index });
      }
    });
  }

  const ranked: Ranked[] = [];
  for (const entry of pool) {
    const tier = scoreItem(entry.item, tokens, t);
    if (tier !== NO_MATCH) ranked.push({ item: entry.item, tier, order: entry.order });
  }

  return ranked
    .sort((a, b) => a.tier - b.tier || a.order - b.order)
    .map((entry) => entry.item);
}
