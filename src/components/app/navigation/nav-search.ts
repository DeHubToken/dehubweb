import ArrowLeftRight from "@/components/ui/cut-icons/bridge";
import Bot from "@/components/ui/cut-icons/agents";
import Crown from "@/components/ui/cut-icons/premium";
import Film from "@/components/ui/cut-icons/editor";
import ListOrdered from "@/components/ui/cut-icons/rank";
import Plug from "@/components/ui/cut-icons/connect";
import Smartphone from "@/components/ui/cut-icons/get-the-app";
import Star from "@/components/ui/cut-icons/new-members";
import Tag from "@/components/ui/cut-icons/pricing";

import Coins from "@/components/ui/cut-icons/coins";
import Gamepad2 from "@/components/ui/cut-icons/arcade";
import History from "@/components/ui/cut-icons/history";
import Music2 from "@/components/ui/cut-icons/music";
import Video from "@/components/ui/cut-icons/video";
import Packs from "@/components/ui/cut-icons/packs";
import Chat from "@/components/ui/cut-icons/chat";
import Clock from "@/components/ui/cut-icons/clock";
import Live from "@/components/ui/cut-icons/live";
import Growing from "@/components/ui/cut-icons/growing";

import type { NavItem } from '@/types/app.types';
import { NAV_LABEL_KEYS } from './SidebarNavItem';
import { isKidsModePath } from '@/constants/app.constants';
import { isKidsModeLocked } from '@/lib/kids-mode-lock';

/** Just the shape we need from react-i18next's `t`, so no version-pinned type. */
type TranslateFn = (key: string, defaultValue: string) => string;

/**
 * Menu search — shared by the desktop rail and the mobile menu sheet.
 *
 * This filters the NAVIGATION, not Riftn's content: the left panel carries 28
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
 * WHAT IS MATCHED IN WHICH LANGUAGE
 * ---------------------------------
 * Labels are matched in the language the UI is rendering AND in English, so a
 * Turkish reader can type either "ayarlar" or "settings". The big keyword
 * table below is English: it is mostly brand names and loanwords ("dm",
 * "apy", "nft", "fps") typed in English on every keyboard anyway. On top of it
 * every destination has one translated line of search words
 * (`nav.findWords.*`, NAV_FIND_WORDS), so "construir" or "バグ" finds Requests
 * the way "build" and "bug" do.
 */

/** Where the "search Riftn for …" hand-off row points. */
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
  const translated = foldOnce(t(NAV_LABEL_KEYS[item.label] || item.label, item.label));
  const english = foldOnce(item.label);
  const labels = translated === english ? [english] : [translated, english];
  const keywords = (NAV_KEYWORDS[item.label] ?? []).map(foldOnce);
  for (const word of translatedFindWords(item.label, t)) {
    if (!keywords.includes(word)) keywords.push(word);
  }

  let worst = 0;
  for (const token of tokens) {
    let tier = scoreToken(labels, keywords, token);
    // "builders", "bugs", "streaming": try the bare word before giving up.
    // Ranked just behind the same match typed exactly.
    if (tier === NO_MATCH) {
      const stem = stemOf(token);
      if (stem !== token) tier = scoreToken(labels, keywords, stem) + 0.5;
    }
    if (tier === NO_MATCH) return NO_MATCH;
    if (tier > worst) worst = tier;
  }
  return worst;
}

/**
 * A rough English stem: plurals, -ing, -ed and -er(s) off, so "builders",
 * "building" and "built-ins" all fall back to "build". Only ever a second try
 * after the word as typed found nothing, and never shorter than three letters.
 */
function stemOf(token: string): string {
  const rules: Array<[RegExp, string]> = [
    [/ies$/, 'y'], [/ers$/, ''], [/ings?$/, ''], [/er$/, ''], [/ed$/, ''], [/es$/, ''], [/s$/, ''],
  ];
  for (const [suffix, replacement] of rules) {
    if (suffix.test(token)) {
      const stem = token.replace(suffix, replacement);
      if (stem.length >= 3) return stem;
    }
  }
  return token;
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
  Home: ['feed', 'timeline', 'latest', 'for you', 'following', 'posts', 'front page', 'news feed', 'start'],
  Profile: ['my profile', 'my account', 'me', 'my page', 'my posts', 'my videos', 'avatar', 'bio', 'banner', 'followers', 'following', 'edit profile'],
  Explore: ['search', 'discover', 'find', 'browse', 'look up', 'trending', 'popular', 'viral', 'hashtags', 'tags', 'people', 'users', 'creators', 'topics'],
  Prompt: ['ai', 'generate', 'make', 'ai image', 'ai video', 'image generator', 'picture', 'text to image', 'art', 'ai art', 'imagine', 'create with ai', 'credits'],
  Editor: ['edit', 'video editor', 'edit video', 'video editing', 'trim', 'cut', 'timeline', 'captions', 'subtitles', 'effects', 'clips', 'montage', 'export'],
  Creator: ['create', 'creator studio', 'studio', 'tools', 'ai tools', 'generate', 'image', 'video', 'audio', 'music', 'voiceover', 'thumbnail', 'design', '3d'],
  // Nobody types "converter" looking for this — they type the platform
  // they're bringing content over from, or what they're trying to do with it.
  Converter: ['youtube', 'yt', 'yt-dlp', 'import youtube', 'import video', 'migrate', 'migrate all', 'download', 'convert', 'tiktok', 'instagram', 'reel', 'reels', 'twitter', 'x', 'facebook', 'twitch', 'clip', 'kick', 'rumble', 'vimeo', 'dailymotion', 'reddit', 'bluesky', 'odysee', 'streamable', 'loom', 'tumblr', 'pinterest', 'snapchat', 'vk', 'rutube', 'bilibili'],
  Migrate: ['migrate all', 'import channel', 'youtube channel', 'bulk import', 'back catalogue', 'move channel', 'move my channel', 'youtube', 'yt'],
  Notifications: ['alerts', 'activity', 'mentions', 'replies', 'likes', 'bell', 'notifs', 'pings', 'updates', 'new followers', 'tips'],
  Messages: ['dm', 'dms', 'direct messages', 'message', 'chat', 'chats', 'inbox', 'conversations', 'pm', 'private message', 'text', 'group chat', 'talk', 'contact'],
  Communities: ['groups', 'group', 'community', 'rooms', 'servers', 'clubs', 'forums', 'tribes', 'members', 'channels', 'join a group'],
  Assistant: ['ai', 'chatbot', 'bot', 'ask', 'help', 'copilot', 'agent', 'gpt', 'chatgpt', 'ai chat', 'questions', 'helper'],
  Settings: [
    'preferences', 'account', 'privacy', 'security', 'password', 'language',
    'theme', 'themes', 'appearance', 'dark mode', 'light mode', 'blocked', 'block', 'mute', 'two factor', '2fa', 'authenticator',
    'notifications settings', 'email', 'phone', 'sessions', 'kids mode', 'font', 'data',
    'delete account', 'deactivate', 'options', 'config', 'setup',
  ],
  Leaderboard: ['ranking', 'rankings', 'rank', 'top', 'top creators', 'top users', 'best', 'points', 'scores', 'high score', 'league'],
  Bookmarks: ['saved', 'saves', 'bookmark', 'favourites', 'favorites', 'watch later', 'read later', 'saved posts', 'library', 'collection'],
  Command: ['command centre', 'command center', 'dashboard', 'creator studio', 'creator dashboard', 'analytics', 'earnings', 'revenue', 'income', 'payouts', 'insights', 'audience', 'growth', 'views', 'moderation', 'my stats'],
  Wallet: ['balance', 'money', 'funds', 'cash', 'pay', 'payment', 'dhb', 'rift', 'tokens', 'coins', 'crypto', 'usdc', 'eth', 'bnb', 'deposit', 'withdraw', 'send', 'receive', 'transactions', 'top up', 'address', 'swap', 'seed phrase', 'recovery phrase', 'private key'],
  Events: ['event', 'calendar', 'schedule', 'agenda', 'ama', 'meetup', 'meetups', 'upcoming', 'tickets', 'party', 'irl', 'town hall'],
  Stages: ['audio', 'spaces', 'twitter spaces', 'clubhouse', 'live audio', 'audio rooms', 'voice chat', 'talk', 'voice', 'mic', 'speak', 'panel', 'podcast', 'rooms'],
  // The page is a board where people prompt what gets built next, report bugs
  // and watch them ship, so "build" and "bug" are the words people reach for.
  'Feature Requests': [
    'requests', 'request', 'build', 'builder', 'builders', 'building', 'top builders',
    'bug', 'bugs', 'report a bug', 'bug report', 'issue', 'issues', 'broken', 'fix', 'fixes',
    'feedback', 'suggestions', 'suggest', 'idea', 'ideas', 'request a feature', 'feature',
    'prompt', 'prompts', 'shipped', 'queued', 'roadmap', 'changelog', 'improve', 'improvements',
    'vote', 'upvote', 'wishlist', 'contribute',
  ],
  Staking: ['stake', 'unstake', 'deposit', 'apy', 'apr', 'yield', 'interest', 'rewards', 'earn', 'passive income', 'profit share', 'vault', 'lock', 'pool', 'badge', 'badges', 'tier', 'tiers', 'holder'],
  SuperPowers: ['boost', 'boosts', 'second wind', 'promote', 'amplify', 'reach', 'top of feed', 'badge perks', 'perks', 'powers', 'abilities', 'unlock', 'upgrades'],
  Governance: ['vote', 'voting', 'votes', 'proposals', 'proposal', 'propose', 'dao', 'poll', 'ballot', 'referendum', 'decide', 'community vote'],
  DAO: ['treasury', 'donate', 'donation', 'contribute', 'contribution', 'fund', 'community fund', 'grants', 'pool', 'power'],
  Bounties: ['bounty', 'work', 'jobs', 'job board', 'tasks', 'task', 'gigs', 'freelance', 'hire', 'hire someone', 'earn', 'earn money', 'make money', 'paid work', 'side hustle', 'escrow', 'contracts', 'usdc'],
  // Nobody types "bounty history" — they type the thing they are chasing, which
  // is usually a payment or a job they already finished.
  'My Bounties': [
    'bounty history', 'my bounties', 'my work', 'my jobs', 'completed bounties',
    'history', 'payouts', 'paid', 'my submissions', 'my posted bounties',
    'transactions', 'escrow',
  ],
  Affiliate: ['referral', 'referrals', 'refer', 'invite', 'invite friends', 'referral link', 'ref link', 'promo code', 'commission', 'partner', 'ambassador', 'share link', 'earn'],
  Careers: ['jobs', 'job', 'career', 'hiring', 'vacancies', 'work with us', 'work at riftn', 'join the team', 'team', 'apply', 'recruitment', 'roles', 'cv', 'resume'],
  Stores: ['shop', 'shops', 'store', 'storefront', 'marketplace', 'merch', 'buy', 'sell', 'products', 'goods', 'shopping', 'ecommerce', 'orders', 'checkout'],
  // Nobody types "fractions" — they type what they are trying to do with them.
  // "shares" and "ownership" are how the docs and the marketing copy describe
  // the same thing, so both have to land here.
  Fractions: [
    'fraction', 'shares', 'ownership', 'own a post', 'co own', 'invest', 'stake in a post',
    'tokenised', 'erc1155', 'sell fractions', 'buy fractions', 'holdings', 'portfolio',
    // The NFT market is the Fractions page's NFTs tab.
    'nft', 'nfts', 'nft market', 'nft marketplace', 'buy nft', 'sell nft', 'list nft', 'collectibles',
    'opensea', 'make an offer', 'trade', 'erc721', 'art',
  ],
  // Nobody hunting a handle types "usernames" — they type the thing they want
  // to change, which is their @name, or the thing they want to do with it.
  Usernames: ['username', 'handle', 'handles', 'name', 'names', '@', 'change my name', 'rename', 'buy a name', 'sell my name', 'vanity', 'domain', 'ens'],
  // Sibling of Usernames — that one sells the handle, this one sells the whole
  // account with its followers and history. People search for the outcome
  // ("buy an account with followers"), not the noun.
  Accounts: [
    'account', 'accounts', 'buy account', 'sell account', 'sell my account',
    'account marketplace', 'aged account', 'followers', 'buy followers',
    'take over an account', 'transfer account', 'profile for sale',
  ],
  // The mini app store, which people will look for by what they want to do.
  Apps: [
    'apps', 'app store', 'mini apps', 'miniapps', 'store', 'build an app', 'make an app',
    'developer', 'developers', 'sdk', 'farcaster', 'frames', 'dapps', 'dapp', 'plugins', 'integrations', 'tools',
  ],
  // The example that started this: nobody looking for a game types "arcade".
  // The individual games are here as well as being rows of their own, so a
  // half-remembered title finds the grid even when it does not find the game.
  Arcade: [
    'games', 'game', 'play', 'gaming', 'play to earn', 'p2e', 'arcade', 'fun', 'mini games', 'minigames', 'bored',
    "king's gambit", 'chess', 'claude of duty', 'fps', 'shooter', 'jungle trail',
    'street slayer', 'beat em up', 'fighting', 'trenchstar', 'chartopia', 'trading floor',
  ],
  Glossary: ['terms', 'definitions', 'dictionary', 'jargon', 'meaning', 'what is', 'acronyms', 'abbreviations', 'words', 'explain'],
  'Compare Riftn': ['comparison', 'compare', 'vs', 'versus', 'alternative', 'alternatives', 'why riftn', 'difference', 'youtube', 'twitter', 'kick', 'twitch', 'facebook', 'instagram', 'tiktok', 'rumble', 'mastodon', 'bluesky', 'farcaster'],
  Guide: ['getting started', 'start here', 'how to', 'how does it work', 'tutorial', 'onboarding', 'walkthrough', 'learn', 'help', 'faq', 'beginner', 'basics', 'manual', 'new here'],
  Feedback: ['feedback', 'experience', 'give feedback', 'testimonial', 'review', 'rate', 'rating', 'survey', 'opinion', 'complaint'],
  Stats: ['statistics', 'analytics', 'metrics', 'live stats', 'data', 'charts', 'numbers', 'price', 'supply', 'holders', 'volume', 'market', 'burn', 'treasury'],
  Docs: ['documentation', 'help', 'api', 'whitepaper', 'developers', 'sdk', 'reference', 'brand', 'advertising', 'knowledge base', 'manual', 'tokenomics', 'faq', 'support'],
  Blog: ['news', 'articles', 'updates', 'announcements', 'press', 'releases', 'release notes', "what's new", 'changelog', 'stories'],

  // --- search-only rows ----------------------------------------------------
  Videos: ['watch', 'video feed', 'clips', 'long form', 'long videos'],
  Shorts: ['reels', 'short videos', 'vertical', 'vertical videos', 'swipe', 'feed', 'tiktok'],
  Music: ['audio', 'songs', 'song', 'tracks', 'listen', 'radio', 'playlist', 'spotify'],
  'Live TV': ['tv', 'television', 'streams', 'streaming', 'live', 'broadcast', 'channels', 'watch live', 'iptv', 'news channels', 'sports'],
  'Buy Tokens': ['buy tokens', 'buy dhb', 'buy rift', 'purchase', 'top up', 'card', 'fiat', 'on ramp', 'credit card', 'apple pay'],
  Bridge: ['cross chain', 'swap chain', 'transfer chain', 'move tokens', 'bnb', 'base', 'chains'],
  'Top 100': ['top 100', 'cryptos', 'cryptocurrencies', 'coins', 'market cap', 'prices', 'tickers'],
  'AI Agents': ['agents', 'ai agents', 'bots', 'automation', 'personas', 'autopilot'],
  Advertising: ['ads', 'ad', 'adverts', 'advertising', 'campaign', 'promote', 'boost post', 'sponsor', 'marketing', 'business'],
  Premium: ['premium', 'subscription', 'subscribe', 'upgrade', 'pro', 'membership', 'plans', 'no ads', 'ad free', 'background play', 'family plan'],
  Pricing: ['pricing', 'plans', 'cost', 'price', 'credits', 'subscription', 'how much', 'fees'],
  Creators: ['creator program', 'creator programme', 'creator fund', 'ambassadors', 'partners', 'apply as creator', 'monetise', 'monetize', 'influencer'],
  'Get the App': ['apk', 'android', 'download', 'mobile app', 'phone app', 'install', 'play store', 'ios', 'iphone', 'app store', 'testflight'],
  'Connect AI': ['mcp', 'chatgpt', 'claude', 'api', 'integration', 'connect ai', 'model context protocol'],
  Packs: ['emoji', 'emojis', 'stickers', 'sticker', 'gif', 'gifs', 'emoji packs', 'sticker packs', 'custom emoji', 'reactions'],
  'Public Chat': ['chat', 'global chat', 'chat room', 'chatroom', 'lobby', 'trollbox', 'community chat', 'talk'],
  Planned: ['scheduled', 'schedule', 'scheduled posts', 'queue', 'later', 'upcoming posts', 'calendar'],
  'Live Studio': ['go live', 'stream', 'streaming', 'obs', 'stream key', 'overlays', 'alerts', 'widgets', 'subathon', 'multistream', 'restream'],
  Launchpad: ['launch', 'launch a token', 'create coin', 'make a coin', 'memecoin', 'meme coin', 'pump', 'bonding curve', 'tokenise', 'tokenize', 'presale'],
  // Games. Their titles are the labels, so these are only the ways in that the
  // title itself does not cover.
  "God's Eye": ['globe', 'world map', '3d map', 'community map', 'social map', 'earth', 'satellite'],
  "King's Gambit": ['chess', '3d chess', 'play chess', 'online chess', 'board game', 'multiplayer'],
  'Claude of Duty': ['fps', 'shooter', 'first person', 'war', 'shooting game', 'call of duty'],
  'Jungle Trail': ['walk', 'rainforest', 'jungle', 'exploration', 'first person', 'nature'],
  'Street Slayer': ['beat em up', 'brawler', 'fighting', 'fighter', 'side scroller', 'arcade fighter'],
  Chartopia: ['trenchstar', 'trading floor', 'trading', 'charts', 'markets', 'binance', 'dexscreener', 'trenches', 'vr'],
};

/**
 * The same idea in the reader's own language. Each destination has one
 * translated line of comma-separated search words (`nav.findWords.<id>` in
 * every locale), so someone typing in Spanish, Hindi or Japanese finds a page
 * by what it does, not only by its translated name. `nav` is in the core
 * language pack, so these arrive with the menu itself and typing never fetches
 * anything. The English table above stays the richer one: brand names and
 * shorthands that every keyboard types in English anyway.
 */
export const NAV_FIND_WORDS: Record<string, string> = {
  Home: 'home', Profile: 'profile', Explore: 'explore', Prompt: 'prompt', Editor: 'editor',
  Creator: 'creator', Converter: 'converter', Migrate: 'migrate', Notifications: 'notifications',
  Messages: 'messages', Communities: 'communities', Assistant: 'assistant', Settings: 'settings',
  Leaderboard: 'leaderboard', Bookmarks: 'bookmarks', Command: 'command', Wallet: 'wallet',
  Events: 'events', Stages: 'stages', 'Feature Requests': 'featureRequests', Feedback: 'feedback',
  Staking: 'staking', SuperPowers: 'superpowers', Governance: 'governance', DAO: 'dao',
  Bounties: 'bounties', 'My Bounties': 'myBounties', Affiliate: 'affiliate', Careers: 'careers',
  Stores: 'stores', Fractions: 'fractions', Usernames: 'usernames', Accounts: 'accounts', Apps: 'apps',
  Arcade: 'arcade', Glossary: 'glossary', 'Compare Riftn': 'compare', Guide: 'guide', Stats: 'stats',
  Docs: 'docs', Blog: 'blog', Videos: 'videos', Shorts: 'shorts', Music: 'music', 'Live TV': 'liveTv',
  'Buy Tokens': 'buyTokens', Bridge: 'bridge', 'Top 100': 'top100', 'AI Agents': 'agents',
  Advertising: 'advertising', Premium: 'premium', Pricing: 'pricing', Creators: 'creators',
  'Get the App': 'getTheApp', 'Connect AI': 'connectAi', Packs: 'packs', 'Public Chat': 'publicChat',
  Planned: 'planned', 'Live Studio': 'liveStudio', Launchpad: 'launchpad',
};

/** Commas in every script a translation came back in, plus semicolons. */
const WORD_LIST_SEPARATOR = /[,،、，;；؛]/;

/** The translated search words for one destination, folded; empty when missing. */
function translatedFindWords(label: string, t: TranslateFn): string[] {
  const id = NAV_FIND_WORDS[label];
  if (!id) return [];
  const key = `nav.findWords.${id}`;
  const line = t(key, '');
  // A missing key comes back empty, or as the key itself, or humanised.
  if (!line || line === key || !WORD_LIST_SEPARATOR.test(line)) return [];
  return line.split(WORD_LIST_SEPARATOR).map(foldOnce).filter(Boolean);
}

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
  { icon: Video, label: "Videos", path: '/videos' },
  { icon: Film, label: "Shorts", path: '/shorts' },
  { icon: Music2, label: "Music", path: '/music' },
  { icon: Coins, label: "Buy Tokens", path: '/app/buy' },
  { icon: ArrowLeftRight, label: "Bridge", path: '/app/bridge' },
  { icon: ListOrdered, label: "Top 100", path: '/app/top-100' },
  { icon: Bot, label: "AI Agents", path: '/app/agents' },
  { icon: History, label: "My Bounties", path: '/work/history' },
  { icon: Crown, label: "Premium", path: '/premium' },
  { icon: Tag, label: "Pricing", path: '/pricing' },
  { icon: Star, label: "Creators", path: '/creators' },
  { icon: Smartphone, label: "Get the App", path: '/apk' },
  { icon: Plug, label: "Connect AI", path: '/connect' },
  { icon: Packs, label: "Packs", path: '/packs' },
  { icon: Chat, label: "Public Chat", path: '/chat' },
  { icon: Clock, label: "Planned", path: '/planned' },
  { icon: Live, label: "Live Studio", path: '/live-studio' },
  { icon: Growing, label: "Launchpad", path: '/launchpad' },
  { icon: Gamepad2, label: "God's Eye", path: '/arcade/gods-eye' },
  { icon: Gamepad2, label: "King's Gambit", path: '/arcade/kings-gambit' },
  { icon: Gamepad2, label: "Claude of Duty", path: '/arcade/claude-of-duty' },
  { icon: Gamepad2, label: "Jungle Trail", path: '/arcade/jungle-trail' },
  { icon: Gamepad2, label: "Street Slayer", path: '/arcade/street-slayer' },
  { icon: Gamepad2, label: "Chartopia", path: '/arcade/trenchstar' },
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
const OWNER_ONLY_PATHS = new Set(['/app/agents']);
// One filtered copy per source list, so an empty query keeps returning the same
// array and the rail does not remount its rows on every render.
const withoutOwnerOnly = new WeakMap<NavItem[], NavItem[]>();
function publicItems(items: NavItem[]): NavItem[] {
  let out = withoutOwnerOnly.get(items);
  if (!out) {
    out = items.some(item => OWNER_ONLY_PATHS.has(item.path)) ? items.filter(item => !OWNER_ONLY_PATHS.has(item.path)) : items;
    withoutOwnerOnly.set(items, out);
  }
  return out;
}

export function filterNavItems(items: NavItem[], query: string, t: TranslateFn, agentsAllowed = false): NavItem[] {
  // Kids Mode first, before the search does anything at all.
  //
  // Both sidebars go through here, so this is the one place that has to know
  // — and doing it before the query is applied means the hidden destinations
  // below (SEARCH_ONLY_ITEMS) cannot be typed back into view either, which is
  // exactly the hole a filter applied afterwards would leave.
  // Owner-only rollouts (agents) stay out of everyone else's menu and search.
  const rolloutItems = agentsAllowed ? items : publicItems(items);
  const allowed = isKidsModeLocked() ? rolloutItems.filter(item => isKidsModePath(item.path)) : rolloutItems;

  const folded = fold(query);
  const tokens = folded.split(' ').filter(Boolean);
  if (!tokens.length) return allowed;

  if (isKidsModeLocked()) {
    // Ranked the same way, just without the SEARCH_ONLY_ITEMS pool below —
    // everything in it is off the allowlist by definition.
    return allowed
      .map((item, order) => ({ item, tier: scoreItem(item, tokens, t), order }))
      .filter(entry => entry.tier !== NO_MATCH)
      .sort((a, b) => a.tier - b.tier || a.order - b.order)
      .map(entry => entry.item);
  }

  const pool: Array<{ item: NavItem; order: number }> = allowed.map((item, order) => ({ item, order }));

  // One character is a keystroke on the way to a word, not a decision to go
  // looking for a page that is not on the menu — so the hidden destinations
  // stay hidden until there is something to go on. Anything already on the
  // menu is skipped by both path and label: the rows are keyed on label, so a
  // duplicate of either is a React key collision, not just a repeated row.
  if (folded.length >= 2) {
    const onMenu = new Set(items.flatMap((item) => [item.path, item.label]));
    SEARCH_ONLY_ITEMS.forEach((item, index) => {
      if (item.path === '/app/agents' && !agentsAllowed) return;
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
