import { handleWorkReceipt } from './server/work-receipts.ts';
import { handleEditorPresence } from './server/editor-presence.ts';
import { applyTextPostImage } from './server/post-share-card.js';
export { EditorPresenceRoom } from './server/editor-presence.ts';

/**
 * Cloudflare Worker for DeHub Dynamic SEO/SSR
 *
 * CANONICAL implementation (retired the previous edge-function setup when the
 * site moved to Cloudflare in July 2026). Static assets come from the
 * ASSETS binding in wrangler.jsonc (with SPA fallback); same-origin asset
 * JSON (blog manifest/content, docs content) is read via the ASSETS binding
 * so the worker never re-enters itself.
 *
 * Serves pre-rendered HTML with OG meta tags to social crawlers (bots) for:
 *   - Root /
 *   - /app/post/:id
 *   - /app/communities/:slug
 *   - /:username (profile pages)
 *
 * Regular browsers always fall through to the React SPA.
 * Serving SSR HTML to browsers caused an infinite reload loop because the
 * embedded `window.location.href` redirect pointed back to the same URL.
 */

// Shared with the app (src/lib/reserved-usernames.js is plain JS so wrangler's
// esbuild can bundle it here and vite can bundle it there). SYSTEM_ROUTES below
// is derived from it — see the comment there.
import { ROUTE_SEGMENTS, WORKER_ASSET_ROUTES } from './src/lib/reserved-usernames.js';
import { CONSOLIDATED_GUIDES, MILESTONE_REDIRECTS, RETIRED_GUIDES } from './src/lib/blog-redirects.js';

/**
 * `/mal.eth` — a verified ENS handle standing in for a username.
 *
 * Every "is this a profile?" test in this file used to reject any first
 * segment containing a dot, and rightly: a dot almost always means a file, and
 * SSR-ing `/favicon.ico` as a profile would have been absurd. But that made a
 * `.eth` handle unshareable — `dehub.io/mal.eth` returned the SPA shell, so a
 * crawler saw the generic homepage card where a profile should be, while
 * `dehub.io/mal` rendered correctly. That was measured against production, not
 * guessed.
 *
 * So the dot test now has one carve-out, and it is deliberately the whole of
 * it: `.eth` is a namespace nothing in `public/` uses and nothing ever will.
 * Any other extension keeps the old behaviour untouched.
 *
 * Deliberately loose about what precedes the suffix. ENS names may be
 * non-ASCII, and by the time a name reaches here it is percent-encoded — a
 * charset regex would reject exactly the names that most need the SSR path.
 * A name nobody holds still 404s, because the profile branch checks the API.
 */
export function isEnsHandle(segment) {
  return typeof segment === 'string' && segment.length > 4 && segment.toLowerCase().endsWith('.eth');
}

/** The first path segment, normalised the way the profile tests want it. */
export function firstSegmentOf(pathname) {
  return pathname.replace(/^\/+/, '').split('/')[0].toLowerCase().replace('@', '');
}

/**
 * True when a first segment can be a profile: not a route, not a file.
 *
 * Exported alongside the two above so the contract is tested rather than
 * restated — four separate places in this file decide "is this a profile?",
 * and they drifted apart once already.
 */
export function couldBeProfileSegment(segment, systemRoutes) {
  if (!segment || systemRoutes.has(segment)) return false;
  return !segment.includes('.') || isEnsHandle(segment);
}

/**
 * True when a path names a file rather than a page: its last segment ends in
 * a known file extension, or it walks into a dotfile or dot-directory other
 * than /.well-known/. A known list rather than "anything after a dot", because
 * slugs and handles can carry a dot and must still reach the SPA; .html is
 * left out because a real HTML file and the SPA fallback look the same.
 */
const FILE_EXTENSION = /\.(?:php\d?|phtml|aspx?|jsp|cgi|env|ini|cfg|conf|config|ya?ml|toml|sql|bak|old|orig|swp|log|txt|md|csv|json|xml|rss|atom|js|mjs|cjs|map|ts|css|pdf|docx?|xlsx?|pptx?|zip|gz|tgz|tar|rar|7z|exe|dmg|apk|ipa|png|jpe?g|gif|webp|avif|svg|ico|bmp|mp3|mp4|m4a|mov|webm|ogg|opus|wav|woff2?|ttf|otf|eot|wasm|webmanifest|glb|fbx)$/i;
export function isFilePath(pathname) {
  const segments = String(pathname).split('/').filter(Boolean);
  if (!segments.length) return false;
  if (segments.some((s, i) => s.startsWith('.') && !(i === 0 && s === '.well-known' && segments.length > 1))) {
    return true;
  }
  return FILE_EXTENSION.test(segments[segments.length - 1]);
}

/**
 * The SPA shell under a noindex, saying so in both places. index.html carries
 * `<meta name="robots" content="index, follow">` for the pages that are meant
 * to rank, so a shell sent with an `X-Robots-Tag: noindex` header contradicted
 * itself; the meta now agrees with the header.
 */
async function noindexShell(resp) {
  const type = (resp.headers.get('Content-Type') || '').toLowerCase();
  let out;
  if (resp.status === 200 && type.startsWith('text/html')) {
    const html = (await resp.text()).replace(
      /<meta name="robots" content="[^"]*"\s*\/?>/i,
      '<meta name="robots" content="noindex, follow">',
    );
    out = new Response(html, resp);
    out.headers.delete('Content-Length');
  } else {
    out = new Response(resp.body, resp);
  }
  out.headers.set('X-Robots-Tag', 'noindex, follow');
  return out;
}

const SUPABASE_FN_BASE = 'https://aigxuutjaqsywioxjefr.supabase.co/functions/v1';
const SUPABASE_FUNCTION_URL = `${SUPABASE_FN_BASE}/ssr-seo`;
const APP_URL = 'https://dehub.io';
// Organization.logo. Google wants a square mark of at least 112px, crawlable,
// and uses it as-is in the knowledge panel. The old value was a 1200x630 JPEG
// share banner on the Supabase host, which it had to crop into a square.
const ORG_LOGO = { '@type': 'ImageObject', url: `${APP_URL}/icon-512.png`, width: 512, height: 512 };
const BLOG_SHARE_IMAGE_BASE = 'https://aigxuutjaqsywioxjefr.supabase.co/functions/v1/blog-share-image';
// og:locale for every edge-rendered page. One constant, emitted through
// ogLocaleTag(), so a localised variant has exactly one tag to swap.
const OG_LOCALE = 'en_US';
// Share card for every edge-rendered page. The logo is a small square, so
// `summary_large_image` cards rendered it as a thumbnail rather than a banner;
// this is the 1200x630 the format actually wants. Served from public/ (and so
// from the ASSETS binding) on purpose — the previous per-route cards pointed at
// Legacy CDN paths (`/__l5e/assets-v1/...`) that nothing serves since the
// Cloudflare migration, and the SPA catch-all answered them 200 text/html, so
// crawlers downloaded the React shell where a PNG should be and drew no image.
const SHARE_IMAGE = `${APP_URL}/og/dehub-social-share.png`;

/** Search Console property ownership. Must stay identical to the tag in
 *  index.html — the two are the same claim served to different user agents,
 *  and Google removes access to a property it can no longer verify. */
const GOOGLE_SITE_VERIFICATION = 'fCbsM2lCr6JdQuMh1uHAHwzbLC1OoXzvK-VKFnkbZnQ';


// Per-route share cards, rendered from the banner kit into public/og/ and
// served by the ASSETS binding. Key = the canonical route path without its
// leading slash; 'home' and 'fallback' are the two pages with no route of
// their own. Before this, every /docs page, every product page and the blog
// index shared one card, so a feed full of DeHub links showed one repeated
// image. Anything absent here still falls back to SHARE_IMAGE, so adding a
// route without its card is safe.
const OG_CARD_ROUTES = new Set([
  'arcade/gods-eye',
  'home', 'fallback', 'blog', 'docs',
  'docs/overview', 'docs/dapps', 'docs/games', 'docs/token/overview',
  'docs/token/economics', 'docs/token/stake', 'docs/token/utility', 'docs/token/where-to-buy',
  'docs/token/governance', 'docs/token/bridge', 'docs/roadmap', 'docs/faq',
  'docs/team', 'docs/contact', 'docs/privacy', 'docs/terms',
  'docs/terms-of-service', 'docs/advertising', 'docs/security', 'docs/featured-in',
  'docs/brand-assets', 'docs/brand-guidelines', 'docs/donate', 'explore',
  'videos', 'shorts', 'guides/best-decentralized-social-media', 'guides/best-web3-social-media-dapps',
  'guides/best-decentralized-streaming-apps',
  'connect', 'connect/chatgpt', 'connect/claude', 'communities',
  'stages', 'guide', 'features', 'pricing', 'depin',
  'builder', 'creator', 'editor', 'prompt', 'work',
  'affiliate', 'premium', 'governance', 'leaderboard', 'dao', 'packs',
  'top-100', 'music', 'tv', 'cinema',
  'glossary', 'bridge', 'agents', 'assistant',
  'creators', 'jobs', 'apk', 'admin-manual',
  'raffle', 'stake', 'usernames',
  'arcade', 'arcade/kings-gambit', 'arcade/claude-of-duty', 'arcade/jungle-trail',
  'arcade/street-slayer',
  'arcade/trenchstar',
  'apps', 'apps/dev',
  // App surfaces that had no card of their own and unfurled as the homepage.
  // `superpowers` art was rendered when the page shipped and was never added
  // here, so the file has been sitting in public/og unreferenced.
  'superpowers', 'converter', 'launchpad', 'stats',
  'accounts', 'fractions', 'stores', 'events',
  'migrate-youtube',
  // Public app pages that unfurled as the homepage: the SPA had SEO for them,
  // the edge did not, so crawlers got the shell under a noindex.
  'dex', 'ads', 'buy',
]);

/** A route's own share card, or the shared one when it has none. */
function shareImage(key) {
  return OG_CARD_ROUTES.has(key) ? `${APP_URL}/og/${key.replace(/\//g, '-')}.jpg` : SHARE_IMAGE;
}

/** og:image + twitter block. Every card is a 1200x630 banner, so the size
 *  hints and `summary_large_image` are unconditional — Facebook defers the
 *  preview until it has scraped an image whose dimensions it wasn't told, and
 *  `summary` renders a banner as a cropped thumbnail. */
function shareMetaTags(key, alt) {
  const img = shareImage(key);
  return `<meta property="og:image" content="${img}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${escHtml(alt)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${img}">`;
}

/** The og:locale tag. Pages default to OG_LOCALE; a translated variant
 *  replaces this one tag rather than adding a second. */
function ogLocaleTag(locale = OG_LOCALE) {
  return `<meta property="og:locale" content="${locale}">`;
}

/** twitter:title + twitter:description, the pair X reads before it falls back
 *  to og:. Every page that emits og:title/og:description emits these too. */
function twitterTextTags(title, description) {
  return `<meta name="twitter:title" content="${escHtml(title)}">
<meta name="twitter:description" content="${escHtml(description)}">`;
}

/**
 * BreadcrumbList for a trail of `{ name, url }`, root first. The last entry is
 * the page itself. Positions count from 1 and every `item` is absolute, which
 * is what Google validates; the node carries no @context so it can sit inside
 * an @graph as well as stand alone (breadcrumbScript).
 */
function breadcrumbLd(trail) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((crumb, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: crumb.name,
      item: absolutize(crumb.url),
    })),
  };
}

function breadcrumbScript(trail) {
  return `<script type="application/ld+json">${jsonLdScript({ '@context': 'https://schema.org', ...breadcrumbLd(trail) })}</script>`;
}

const HOME_CRUMB = { name: 'DeHub', url: `${APP_URL}/` };

/**
 * The trail an entity page already draws as `<a>` links (`DeHub › Stores`),
 * read back into crumbs so the visible breadcrumb and the BreadcrumbList can't
 * disagree. The page itself is appended by the caller.
 */
function crumbsFromHtml(html) {
  const decode = (s) => String(s).replace(/&(?:amp|quot|lt|gt|#39);/g, (e) => HTML_ENTITIES[e]);
  return [...String(html || '').matchAll(/<a href="([^"]+)">([^<]*)<\/a>/g)].map((m) => {
    const url = decode(m[1]);
    return { name: decode(m[2]), url: url === APP_URL ? `${APP_URL}/` : url };
  });
}

// One canonical brand identity. Keep in sync with the Organization JSON-LD in
// index.html and src/pages/Index.tsx. The deployed Supabase fn still emits a
// dead sameAs (@DeHubApp does not exist), so the homepage handler below
// rewrites it until the fn is redeployed.
const ORG_SAME_AS = [
  'https://www.wikidata.org/wiki/Q140518527',
  'https://x.com/dehub_official',
  'https://github.com/DeHubToken',
  'https://www.linkedin.com/company/dehub-dao',
  'https://t.me/dehub_dhb',
  'https://play.google.com/store/apps/details?id=io.dehub.mobile',
  // Instagram and TikTok as recorded on the Wikidata item (P2003, P7085). The
  // CoinGecko coin page is gone: it now redirects to CoinGecko's home page,
  // which says nothing about who DeHub is.
  'https://www.instagram.com/dehub_official/',
  'https://www.tiktok.com/@dehub_official',
  'https://coinmarketcap.com/currencies/dehub/',
];
const ORG_JSONLD = {
  '@type': 'Organization',
  name: 'DeHub',
  url: APP_URL,
  logo: ORG_LOGO,
  description: 'DeHub is an open source, user owned and censorship resistant social media protocol giving you all the features incumbents refused to.',
  sameAs: ORG_SAME_AS,
};
// Browser SPA <title> in index.html — bot HTML must carry the same string so
// the two variants never diverge (cloaking-suspicion surface).
const HOME_TITLE = 'DeHub — Open Source, User Owned Social Media';
const HOME_TITLE_LEGACY = 'DeHub — Open Source, User Owned & Censorship Resistant Media';
// Browser SPA <meta name="description"> in index.html, for the same reason.
const HOME_DESCRIPTION = 'DeHub is an open source, user owned and censorship resistant social media protocol giving you all the features incumbents refused to.';

// Signed-out introduction on "/". MIRRORS src/components/app/HomeIntro.tsx —
// keep the prose identical in both, or the bot and browser variants diverge and
// this becomes the cloaking surface the HOME_TITLE comment above guards against.
// HomeIntro renders for signed-out visitors only; Googlebot is signed out, so
// what it reads here is what a signed-out human reads in the SPA.
//
// Why it exists: dehub.net 301s into "/", and a 301 only carries a ranking if
// the destination can hold the query. The old marketing site explained DeHub in
// prose; the feed it redirects into gave crawlers ~149 words of nav plus scraped
// post titles, so the brand term had nothing to land on. "DeHub" is also a
// contested string (DePaul's student portal, deHUB Access, Rowan's DEHub), and
// entity establishment has to happen in crawlable body copy.
const HOME_INTRO_LINKS = [
  // Docs lead, guides follow — see the LINKS comment in HomeIntro.tsx. Both
  // lists must stay identical; this is the copy crawlers actually get.
  ['/docs/overview', 'DeHub overview'],
  ['/docs/faq', 'Frequently asked questions'],
  ['/guides/what-is-watch-to-earn', 'What is watch-to-earn?'],
  ['/guides/tokenized-subscriptions-explained', 'Tokenised subscriptions'],
];

// Story slides — mirror SLIDES in src/components/app/HomeIntro.tsx, which in
// turn mirror the mobile app's screens/auth/OnboardingScreen.tsx. All three are
// always mounted in the SPA (stacked and cross-faded, never conditionally
// rendered), so all three belong here too.
const HOME_INTRO_SLIDES = [
  ['Censorship resistant media for the next generation', 'Instantly monetize, never get deplatformed, keep up to 99% of revenue and create free from censorship or platform manipulation.'],
  ['No bias or centralized authority', 'No algorithms that favor one side of the argument. Everyone is amplified equally and fairly with open source code.'],
  ['You will own everything and be happy', 'The ownership economy means your data, assets and audience are yours forever. Even the DeHub network is owned by its users, you.'],
];

// Outlets that have covered DeHub — mirrors PRESS in HomeIntro.tsx, where they
// render as a wordmark marquee under the entity copy. Worth emitting at the
// edge rather than leaving to the SPA: naming four established publishers in
// crawlable body copy is corroboration for a contested brand string, which is
// the same job the disambiguation sentence below is doing. Like the panel
// itself, this links INWARD to /docs/featured-in — that page holds the outbound
// article links, so the home page spends none of its own equity on them.
const HOME_INTRO_PRESS = ['US Weekly', 'Yahoo Finance', 'Entrepreneur', 'Investing.com'];

const HOME_INTRO_HTML = `<section style="max-width:600px;margin:24px auto;text-align:left"><!--hl-body-->
<h2 style="font-size:16px">Welcome to DeHub — the open-source, user-owned social platform</h2>
${HOME_INTRO_SLIDES.map(([h, p]) => `<h3 style="font-size:14px">${h}</h3>\n<p>${p}</p>`).join('\n')}
<p>DeHub is a decentralised social network and mobile app, in development since 2021, where posts can be minted on-chain and creators keep their audience, their content and their revenue. It combines a chronological feed, live streaming, end-to-end encrypted messaging, user-run communities, a multi-chain wallet and watch-to-earn rewards paid in tokens. If you arrived looking for a different DeHub, this is not DePaul University&rsquo;s student portal, Rowan&rsquo;s DEHub or the deHUB Access door-entry app.</p>
<p><a href="${APP_URL}/docs">Read the docs</a></p>
<p>Featured in ${HOME_INTRO_PRESS.join(', ')}. <a href="${APP_URL}/docs/featured-in">DeHub press coverage</a></p>
<nav aria-label="Learn more about DeHub"><ul style="list-style:none;padding:0;margin:0">${
  HOME_INTRO_LINKS.map(([href, label]) =>
    `<li style="margin:6px 0"><a href="${APP_URL}${href}">${label}</a></li>`
  ).join('')
}</ul></nav>
<!--/hl-body--></section>`;

// Standalone hand-built React guide pages under /guides/ that are NOT manifest
// blog posts. Served meta directly at the edge — the deployed Supabase fn's
// STATIC_ROUTES allowlist is stale and 404s the newer one.
//
// The article itself comes from public/guide-content/<slug>.json, rendered
// from the React page by scripts/generate-guide-content.mjs (and held to it by
// guide-crawler-content.test.ts). Crawlers used to get `bodyHtml` alone: a
// 328-word summary of a ~1,500-word page, which is what Google ranked. It is
// now only the fallback for a failed asset fetch.
//
// best-decentralized-social-media and best-web3-social-media-dapps used to live
// here too. Both were thin rivals of the flagship blog post on the same query
// and now 301 to it — see CONSOLIDATED_GUIDES in src/lib/blog-redirects.js.
const GUIDE_PAGES = {
  // Titles/descriptions mirror the React pages' own SEOHead strings — the two
  // UA variants must never diverge, and body claims must not exceed what the
  // human-visible page actually states. Dates are the React page's first and
  // latest commits.
  'best-decentralized-streaming-apps': {
    title: 'Best Decentralized Streaming Apps 2026 — DeHub Guide',
    description: 'The decentralized streaming apps you can actually watch on in 2026 — DeHub, Streamplace, Odysee, 3Speak, zap.stream and Audius. Not infrastructure, not dead platforms: real apps, compared.',
    datePublished: '2026-09-13',
    dateModified: '2026-09-29',
    bodyHtml: `<p>Most "decentralized streaming" lists open with Theta and Livepeer. Neither is a streaming app — they are decentralized delivery and transcoding networks that sit underneath other products, and you cannot open either one and watch anything. Most of those lists also still feature DLive, which <strong>shut down in April 2026</strong>. This guide covers six apps that have a front door, an audience and a pulse.</p>
<h2>The six</h2>
<ul>
<li><strong>DeHub</strong> — user-owned media platform on Base, BNB, Robinhood Chain and Solana. Live video, uploads, audio and shorts in one app, with voice changers, a sound-effects board, camera looks and screen share built into the browser broadcaster. Tips settle on-chain as they are sent: no follower threshold, no payout cycle, spendable immediately.</li>
<li><strong>Streamplace</strong> — open-source live video for the AT Protocol, so your Bluesky handle is your streaming identity. Very early, and no creator payments yet.</li>
<li><strong>Odysee</strong> — the largest audience here, built on the LBRY protocol. Video-first, with livestreaming as a supplement to uploads.</li>
<li><strong>3Speak</strong> — video and live on the Hive blockchain, where creator rewards are paid by the chain rather than by advertisers.</li>
<li><strong>zap.stream</strong> — Nostr live streaming paid in Bitcoin over Lightning. Tips go straight to the creator; broadcasting costs sats per minute.</li>
<li><strong>Audius</strong> — decentralized music streaming on Solana, and the largest user base of any app in this category.</li>
</ul>
<h2>How to choose</h2>
<p>If you want reach today, Odysee. If you already have a Bluesky following, Streamplace. If you want to be paid in Bitcoin, zap.stream. If you make music, Audius. If you want <strong>live streaming with ownership and monetization that works from your first viewer</strong>, that is the gap DeHub is built to fill — and it is the only one of the six that ships live production tools rather than leaving you to assemble them.</p>
<p><a href="${APP_URL}/">Try DeHub free</a>.</p>`,
  },
};

// Docs pages: per-route meta + (where extracted) full text from
// public/docs-content/<route>.json, generated at build from
// dehub-docs-content.txt. Bots used to get the raw SPA shell (homepage meta,
// no canonical) for the entire /docs section.
const DOCS_PAGES = {
  'overview': { title: 'DeHub Docs — Overview', description: 'What DeHub is and how the user-owned, censorship-resistant media platform works: on-chain content, DePIN infrastructure and creator monetization.' },
  'dapps': { title: "DeHub dApps — The Complete Ecosystem", description: "DeHub's decentralized apps: streaming, feed, messaging, communities, wallet and more — how they fit together in one user-owned ecosystem." },
  'games': { title: 'DeHub Games — Play & Win On-Chain', description: "DeHub's gaming arm: the arcade and Last Chad Standing, the MMA battle-royale fighter built with top UFC stars." },
  'token/overview': { title: 'Currency Overview — DeHub Docs', description: 'How DeHub tokens work in-app: tipping, unlocking content, rewards, AI credits, profit share and the $0.001 in-app peg.' },
  'token/economics': { title: 'DeHub tokens Economics — DeHub Docs', description: 'Token economics: the 8 billion supply, how it is distributed, and the fully-diluted-from-TGE model with no emissions.' },
  'token/stake': { title: 'Staking tokens — DeHub Docs', description: 'How tokens staking works: rewards, mechanics and what staking unlocks across DeHub.' },
  'roadmap': { title: 'DeHub Roadmap — DeHub Docs', description: "Where DeHub is headed: shipped milestones and what's next across the app, token and games." },
  'faq': { title: 'DeHub FAQ — Frequently Asked Questions', description: 'Answers to the most common questions about DeHub, DeHub tokens, staking, governance and the platform.' },
  'team': { title: 'DeHub Team — DeHub Docs', description: 'The founders and team behind DeHub: backgrounds across social media, gaming, entertainment and Web3.' },
  'contact': { title: 'Contact DeHub — DeHub Docs', description: 'How to reach the DeHub team: support, partnerships, press and community channels.' },
  'privacy': { title: 'Privacy Policy — DeHub', description: "DeHub's privacy policy: what data the platform handles and how." },
  'terms': { title: 'Legal Disclaimer & Terms — DeHub', description: "DeHub's legal disclaimer and terms of use." },
  'advertising': { title: 'Advertising on DeHub — POVR Ad Tech', description: "DeHub's proof-of-view-and-rank (POVR) ad tech: on-chain verified audiences and revenue sharing for creators and holders." },
  'security': { title: 'Security at DeHub — DeHub Docs', description: "The Certik audit of DeHub's smart contracts and how to report vulnerabilities to the team." },
  // These ten are in sitemap-static.xml but had no entry here, so bots got the
  // raw SPA shell — the homepage title/description with no canonical. Ten of
  // the twenty-eight docs URLs we submit were presenting to Google as homepage
  // duplicates, which is what poisoned the /docs cluster. Every entry here now
  // has a hand-kept public/docs-content JSON mirroring its React page; the
  // description-only body in buildDocsHtml is only the fallback for a failed
  // fetch. docs-content-coverage.test.ts fails if an entry lands without one.
  'token/utility': { title: 'DeHub tokens Utility & Holder Benefits — DeHub Docs', description: 'What holding tokens unlocks: governance rights, staking rewards, moderation power and marketplace perks across DeHub.' },
  'token/where-to-buy': { title: 'Where to Buy Tokens — DeHub Docs', description: 'Where to buy DeHub tokens: Uniswap on Base, PancakeSwap on BNB Chain, listed CEX venues and direct in-app purchase.' },
  'token/governance': { title: 'DeHub Governance — Voting & Proposals', description: 'How DeHub governance works: proposals, burn-to-vote mechanics, whale prevention and how holders steer the platform.' },
  'token/bridge': { title: 'Bridge tokens Between BASE & BNB — DeHub Docs', description: 'How to move tokens between the BASE and BNB networks with the manual DeHub bridge, and what to expect while it processes.' },
  'featured-in': { title: 'DeHub in the Press — Featured In', description: 'Press and media coverage of DeHub, including US Weekly, Yahoo Finance, Entrepreneur and Investing.com.' },
  'brand-assets': { title: 'DeHub Brand Assets — Logos & Downloads', description: 'Official DeHub brand assets: logos, icons, graphics and marketing materials available to download.' },
  'brand-guidelines': { title: 'DeHub Brand Guidelines', description: 'How to use the DeHub brand: identity, logo usage, colour and design standards.' },
  'donate': { title: 'Donate to DeHub', description: 'Support DeHub development through community donations and contributions.' },
  'terms-of-service': { title: 'Terms of Service — DeHub', description: "DeHub's terms of service: the agreement, user responsibilities and platform rules." },
  // Linked from the docs sidebar (DocsLayout) on every docs page, and missing
  // here, so every crawler following that link got a 404. No card of its own
  // in public/og yet, so it borrows the docs section's.
  'guidelines': { title: 'Community Guidelines — DeHub', description: 'What is and is not allowed on DeHub, how to report content, what happens after a report and how to appeal a moderation decision.', og: 'docs' },
};

/** Legacy and typo'd /docs slugs Google still holds. `quick-start` (the real
 *  route is /docs/quickstart) was serving 200 + homepage meta as a soft-404;
 *  depin / e2e-encryption / ai-toolkits were standalone pages until the July
 *  2026 restructure folded them into the /docs/dapps pillar. The SPA router
 *  redirects all four identically (see DocsSurface), so these 301s match what
 *  a human gets — no cloaking. */
/** /docs routes that render a "Coming Soon" placeholder in the SPA (see
 *  DocsSurface). They're content-free, so they must never enter the index —
 *  but /docs/quickstart links to /docs/best-practices, so a 404 would surface
 *  as a broken internal link in Search Console. noindex, follow is the honest
 *  answer: the page really does exist, it just has nothing to rank.
 *
 *  quickstart / installation / endpoints sit here too: their pages are
 *  developer-doc drafts still carrying template boilerplate (yourplatform.com
 *  hosts, /api/v1 placeholder endpoints), while their old meta sold them as
 *  real user-onboarding / API-reference pages — the worst kind of mismatch to
 *  index. They come back out (with DOCS_PAGES entries and sitemap rows) when
 *  the real developer docs land. */
const DOCS_COMING_SOON = new Set([
  'website', 'app', 'dehub', 'x', 'instagram', 'architecture', 'configuration',
  'data-models', 'auth', 'webhooks', 'best-practices', 'troubleshooting', 'examples',
  'quickstart', 'installation', 'endpoints',
]);

const DOCS_REDIRECTS = {
  'quick-start': '/docs/quickstart',
  'depin': '/docs/dapps#depin',
  'e2e-encryption': '/docs/dapps#encryption',
  'ai-toolkits': '/docs/dapps#ai-suite',
  'token': '/docs/token/overview',
};

const _docsContentCache = new Map();
async function getDocsContent(request, env, route) {
  if (_docsContentCache.has(route)) return _docsContentCache.get(route);
  let content = null;
  try {
    const res = await env.ASSETS.fetch(new URL(`/docs-content/${route.replace(/\//g, '-')}.json`, request.url), { headers: { Accept: 'application/json' } });
    if (res.ok) content = await res.json();
  } catch (e) {
    console.error('[Edge] docs content fetch failed', route, e);
  }
  if (content) _docsContentCache.set(route, content); // never cache failures
  return content;
}

/**
 * FAQPage markup for /docs/faq, so the answers can win a rich result.
 *
 * Built by pairing each `<h2>` with the `<p>` that follows it in the docs
 * content — the same question/answer pairs the page renders, rather than a
 * second hand-maintained copy that would drift the moment a question is added.
 * It has to live here and not in the React page: react-helmet's client output
 * never reaches a crawler, and every JSON-LD block dehub.io actually serves
 * comes from this worker.
 *
 * Returns '' when the shape is not a Q/A list, so a content change can only
 * cost the rich result, never emit malformed markup.
 */
function faqJsonLd(contentHtml) {
  if (!contentHtml) return '';
  const strip = (s) => s.replace(/<[^>]+>/g, '').trim();
  const pairs = [];
  const re = /<h2>([\s\S]*?)<\/h2>\s*<p>([\s\S]*?)<\/p>/g;
  let m;
  while ((m = re.exec(contentHtml)) !== null) {
    const name = strip(m[1]);
    const text = strip(m[2]);
    if (name && text) pairs.push({ '@type': 'Question', name, acceptedAnswer: { '@type': 'Answer', text } });
  }
  if (pairs.length < 3) return '';
  return `\n<script type="application/ld+json">${jsonLdScript({
    '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: pairs,
  })}</script>`;
}

function buildDocsHtml(route, meta, contentHtml) {
  const canonicalUrl = `${APP_URL}/docs/${route}`;
  const body = contentHtml || `<p>${escHtml(meta.description)}</p><p><a class="dh-cta" href="${appHref(canonicalUrl)}" rel="nofollow">Open this page in the DeHub docs</a>.</p>`;
  const nav = Object.entries(DOCS_PAGES).slice(0, 12).map(([r, m]) =>
    `<li><a href="${APP_URL}/docs/${r}">${escHtml(m.title.replace(/ — DeHub( Docs)?$/, ''))}</a></li>`).join('');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escHtml(meta.title)}</title>
<meta name="description" content="${escHtml(meta.description)}">
<link rel="canonical" href="${canonicalUrl}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="DeHub">
${ogLocaleTag()}
<meta property="og:url" content="${canonicalUrl}">
<meta property="og:title" content="${escHtml(meta.title)}">
<meta property="og:description" content="${escHtml(meta.description)}">
${twitterTextTags(meta.title, meta.description)}
${shareMetaTags(meta.og || `docs/${route}`, meta.title)}
<meta name="twitter:site" content="@dehub_official">
<script type="application/ld+json">${jsonLdScript({
  '@context': 'https://schema.org', '@type': 'TechArticle',
  headline: meta.title, description: meta.description,
  image: shareImage(meta.og || `docs/${route}`),
  author: { '@type': 'Organization', name: 'DeHub', url: APP_URL },
  publisher: ORG_JSONLD, mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
})}</script>${route === 'faq' ? faqJsonLd(contentHtml) : ''}
${breadcrumbScript([HOME_CRUMB, { name: 'Docs', url: `${APP_URL}/docs` }, { name: meta.title.replace(/ — DeHub( Docs)?$/, ''), url: canonicalUrl }])}
</head>
<body>
<p><a href="${APP_URL}/">DeHub</a> › <a href="${APP_URL}/docs">Docs</a></p>
<article><h1>${escHtml(meta.title.replace(/ — DeHub( Docs)?$/, ''))}</h1>
${body}</article>
<nav aria-label="DeHub documentation"><h2>More documentation</h2><ul>${nav}</ul></nav>
<p><a href="${APP_URL}/docs/blog">DeHub Blog</a> · <a href="${APP_URL}/">dehub.io home</a></p>
</body>
</html>`;
}

const DOCS_INDEX_DESCRIPTION = 'Official DeHub documentation: platform overview, dApps, token economics, staking, games, roadmap, FAQ and more.';

function buildDocsIndexHtml() {
  const canonicalUrl = `${APP_URL}/docs`;
  const items = Object.entries(DOCS_PAGES).map(([r, m]) =>
    `<li style="margin:10px 0"><a href="${APP_URL}/docs/${r}">${escHtml(m.title.replace(/ — DeHub( Docs)?$/, ''))}</a><br><small>${escHtml(m.description)}</small></li>`).join('');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>DeHub Documentation — Guides, Token, dApps &amp; FAQ</title>
<meta name="description" content="${DOCS_INDEX_DESCRIPTION}">
<link rel="canonical" href="${canonicalUrl}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="DeHub">
${ogLocaleTag()}
<meta property="og:url" content="${canonicalUrl}">
<meta property="og:title" content="DeHub Documentation">
<meta property="og:description" content="${DOCS_INDEX_DESCRIPTION}">
${twitterTextTags('DeHub Documentation', DOCS_INDEX_DESCRIPTION)}
${shareMetaTags('docs', 'DeHub Documentation')}
<meta name="twitter:site" content="@dehub_official">
<script type="application/ld+json">${jsonLdScript({
  '@context': 'https://schema.org', '@type': 'CollectionPage',
  name: 'DeHub Documentation', url: canonicalUrl,
  description: DOCS_INDEX_DESCRIPTION,
  image: shareImage('docs'),
  publisher: ORG_JSONLD,
  hasPart: Object.entries(DOCS_PAGES).map(([r, m]) => ({ '@type': 'TechArticle', headline: m.title, url: `${APP_URL}/docs/${r}` })),
})}</script>
${breadcrumbScript([HOME_CRUMB, { name: 'Docs', url: canonicalUrl }])}
</head>
<body>
<p><a href="${APP_URL}/">DeHub</a> › Docs</p>
<h1>DeHub Documentation</h1>
<!--hl-body--><ul style="list-style:none;padding:0">${items}</ul><!--/hl-body-->
<p><a href="${APP_URL}/docs/blog">DeHub Blog</a> · <a href="${APP_URL}/">dehub.io home</a></p>
</body>
</html>`;
}

function escHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Serialise a value for a <script type="application/ld+json"> body.
 *
 * JSON.stringify escapes what JSON needs and nothing else, so a `</script>`
 * inside any string comes out verbatim and closes the element early —
 * everything after it is then parsed as markup, in <head>, on a dehub.io URL.
 * Every entity card puts a user-editable string in here (a store name, a
 * listing or event or stage or bounty title, a proposal author), so this is
 * reachable by anyone who can name something.
 *
 * `<` is the only character that has to go: escaping it kills `</script>` and
 * `<!--` together. < is valid JSON and parses back to the same string, so
 * consumers see the original text. Ampersand and quote need no treatment
 * inside a script element — it has no entity parsing.
 */
function jsonLdScript(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function absolutize(url) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `${APP_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}

/**
 * A blog post's share card. The renderer answers a 0.5–0.85 MB PNG in up to
 * 1.7 s on every uncached scrape, and scrapers time out on that. The card is
 * served through the image transform instead — 1200x630 JPEG, cached at the
 * edge — reading the render via the same-zone relay (ogSourceResponse), since
 * the transform refuses the Supabase origin. The slug is the whole address:
 * the relay rebuilds the renderer URL from the manifest, so the transform
 * never has to carry a query string.
 */
function buildBlogShareImage(post) {
  return `${IMAGE_TRANSFORM_BASE}${CARD_COVER}/${APP_URL}${OG_SOURCE_PREFIX}blog/${encodeURIComponent(post.slug)}`;
}

/** The renderer URL behind a post's card (see buildBlogShareImage). */
function blogShareSourceUrl(post) {
  const p = new URLSearchParams();
  p.set('slug', post.slug);
  p.set('title', (post.title || '').slice(0, 240));
  if (post.author) p.set('author', String(post.author).slice(0, 60));
  if (post.publishedAt) {
    try {
      const d = new Date(post.publishedAt);
      p.set('date', d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }));
    } catch {}
  }
  const banner = absolutize(post.bannerImage);
  if (banner) p.set('banner', banner);
  p.set('width', '1200');
  p.set('height', '630');
  p.set('format', 'png');
  return `${BLOG_SHARE_IMAGE_BASE}?${p.toString()}`;
}

let _blogManifestCache = null;
let _blogManifestFetchedAt = 0;
async function getBlogManifest(request, env) {
  const now = Date.now();
  if (_blogManifestCache && now - _blogManifestFetchedAt < 5 * 60 * 1000) {
    return _blogManifestCache;
  }
  try {
    const res = await env.ASSETS.fetch(new URL('/blog-manifest.json', request.url), { headers: { Accept: 'application/json' } });
    if (res.ok) {
      const data = await res.json();
      const map = new Map();
      for (const p of data) map.set(p.slug, p);
      _blogManifestCache = map;
      _blogManifestFetchedAt = now;
      return map;
    }
  } catch (e) {
    console.error('[Edge] blog manifest fetch failed', e);
  }
  return _blogManifestCache || new Map();
}

/** Per-post article bodies rendered to HTML at build time by
 *  scripts/generate-blog-manifest.mjs into public/blog-content/<slug>.json.
 *  Without the body, bots only saw an OG stub — Google can't rank text it
 *  never receives. Small in-isolate cache; misses degrade to excerpt-only. */
const _blogContentCache = new Map();
async function getBlogContent(request, env, slug) {
  if (_blogContentCache.has(slug)) return _blogContentCache.get(slug);
  let content = null;
  try {
    const res = await env.ASSETS.fetch(new URL(`/blog-content/${slug}.json`, request.url), { headers: { Accept: 'application/json' } });
    if (res.ok) content = await res.json();
  } catch (e) {
    console.error('[Edge] blog content fetch failed', slug, e);
  }
  if (_blogContentCache.size > 200) _blogContentCache.clear();
  // Never cache a miss: a transient fetch failure would otherwise pin the
  // excerpt-only stub for this slug for the isolate's whole lifetime.
  if (content) _blogContentCache.set(slug, content);
  return content;
}

function relatedPostsHtml(manifest, currentSlug, limit = 4) {
  const others = [...manifest.values()]
    .filter((p) => p.slug !== currentSlug)
    .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
    .slice(0, limit);
  if (!others.length) return '';
  const items = others.map((p) =>
    `<li><a href="${APP_URL}/guides/${encodeURIComponent(p.slug)}">${escHtml(p.title)}</a></li>`).join('');
  return `<nav aria-label="More from the DeHub blog"><h2>More from the DeHub Blog</h2><ul>${items}</ul></nav>`;
}

/**
 * Article.author for a manifest post. Every post so far is bylined "DeHub
 * Team" or "DeHub" — the company, not a person — and Google reads a Person
 * named "DeHub Team" as a made-up author. A real name, when a post has one,
 * stays a Person.
 */
const BRAND_BYLINES = new Set(['', 'dehub', 'dehub team']);
function blogAuthorLd(author) {
  const name = String(author || '').replace(/\s+/g, ' ').trim();
  return BRAND_BYLINES.has(name.toLowerCase())
    ? { '@type': 'Organization', name: 'DeHub', url: APP_URL }
    : { '@type': 'Person', name };
}

function buildBlogHtml(post, canonicalUrl, contentHtml, manifest) {
  const image = buildBlogShareImage(post);
  const title = post.seoTitle || `${post.title} — DeHub Blog`;
  const description = (post.seoDescription || post.excerpt || `${post.title} — read on DeHub.`).slice(0, 280);
  const published = post.publishedAt || '';
  const modified = post.updatedAt || published;
  const banner = absolutize(post.bannerImage);
  const body = contentHtml
    ? contentHtml
    : `<p>${escHtml(post.excerpt || '')}</p><p><a href="${escHtml(canonicalUrl)}">Read the full post on DeHub</a></p>`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        headline: post.title,
        description,
        image: banner ? [banner, image] : [image],
        ...(published ? { datePublished: published, dateModified: modified } : {}),
        author: blogAuthorLd(post.author),
        publisher: ORG_JSONLD,
        mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
      },
      breadcrumbLd([HOME_CRUMB, { name: 'Blog', url: `${APP_URL}/docs/blog` }, { name: post.title, url: canonicalUrl }]),
    ],
  };
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escHtml(title)}</title>
<meta name="description" content="${escHtml(description)}">
<link rel="canonical" href="${escHtml(canonicalUrl)}">
<link rel="alternate" type="application/rss+xml" title="DeHub Blog RSS Feed" href="${APP_URL}/rss.xml">
<meta property="og:type" content="article">
<meta property="og:site_name" content="DeHub">
${ogLocaleTag()}
<meta property="og:url" content="${escHtml(canonicalUrl)}">
<meta property="og:title" content="${escHtml(title)}">
<meta property="og:description" content="${escHtml(description)}">
<meta property="og:image" content="${escHtml(image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${escHtml(post.title)}">
<meta property="article:published_time" content="${escHtml(published)}">
<meta property="article:modified_time" content="${escHtml(modified)}">
<meta property="article:author" content="${escHtml(post.author || 'DeHub Team')}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escHtml(title)}">
<meta name="twitter:description" content="${escHtml(description)}">
<meta name="twitter:image" content="${escHtml(image)}">
<meta name="twitter:site" content="@dehub_official">
<script type="application/ld+json">${jsonLdScript(jsonLd)}</script>
</head>
<body>
<p><a href="${APP_URL}/">DeHub</a> › <a href="${APP_URL}/docs/blog">Blog</a></p>
<article>
<h1>${escHtml(post.title)}</h1>
<p><em>By ${escHtml(post.author || 'DeHub Team')}${published ? ` — ${escHtml(published.slice(0, 10))}` : ''}</em></p>
${banner ? `<img src="${escHtml(banner)}" alt="${escHtml(post.bannerImageAlt || post.title)}" style="max-width:100%">` : ''}
${body}
</article>
${manifest ? relatedPostsHtml(manifest, post.slug) : ''}
<p><a href="${APP_URL}/docs/blog">← All DeHub blog posts</a> · <a href="${APP_URL}/">dehub.io home</a></p>
</body>
</html>`;
}

function buildBlogIndexHtml(manifest) {
  const posts = [...manifest.values()]
    .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
  const canonicalUrl = `${APP_URL}/docs/blog`;
  // Standalone pillar guides first — they were sitemap-only orphans linked
  // from nowhere, which suppresses their ranking.
  const guideItems = Object.entries(GUIDE_PAGES).map(([slug, m]) =>
    `<li style="margin:14px 0"><a href="${APP_URL}/guides/${slug}">${escHtml(m.title)}</a><br><small>${escHtml(m.description.slice(0, 200))}</small></li>`).join('');
  const items = guideItems + posts.map((p) => {
    const date = (p.publishedAt || '').slice(0, 10);
    return `<li style="margin:14px 0"><a href="${APP_URL}/guides/${encodeURIComponent(p.slug)}">${escHtml(p.title)}</a>${date ? ` <small>(${date})</small>` : ''}<br><small>${escHtml((p.excerpt || '').slice(0, 200))}</small></li>`;
  }).join('');
  const blogDescription = 'News, product updates and Web3 guides from DeHub — the open source, user-owned social platform.';
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'DeHub Blog',
    description: blogDescription,
    url: canonicalUrl,
    image: shareImage('blog'),
    publisher: ORG_JSONLD,
  };
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>DeHub Blog — News, Guides &amp; Product Updates</title>
<meta name="description" content="${escHtml(blogDescription)} ${posts.length} posts and counting.">
<link rel="canonical" href="${canonicalUrl}">
<link rel="alternate" type="application/rss+xml" title="DeHub Blog RSS Feed" href="${APP_URL}/rss.xml">
<meta property="og:type" content="website">
<meta property="og:site_name" content="DeHub">
${ogLocaleTag()}
<meta property="og:url" content="${canonicalUrl}">
<meta property="og:title" content="DeHub Blog — News, Guides &amp; Product Updates">
<meta property="og:description" content="${escHtml(blogDescription)}">
${twitterTextTags('DeHub Blog — News, Guides & Product Updates', blogDescription)}
${shareMetaTags('blog', 'DeHub Blog — news, guides and product updates')}
<meta name="twitter:site" content="@dehub_official">
<script type="application/ld+json">${jsonLdScript(jsonLd)}</script>
${breadcrumbScript([HOME_CRUMB, { name: 'Blog', url: canonicalUrl }])}
</head>
<body>
<p><a href="${APP_URL}/">DeHub</a> › Blog</p>
<h1>DeHub Blog</h1>
<ul style="list-style:none;padding:0">${items}</ul>
<p><a href="${APP_URL}/">dehub.io home</a></p>
</body>
</html>`;
}

// Primary site sections — the crawlable, indexable pages we want Google to
// surface as SITELINKS under the dehub.io result. Sitelinks are chosen
// algorithmically from a site's strongest internal-link targets; profile pages
// were winning by sheer volume (thousands in the sitemap) because nothing in
// the bot HTML pointed crawlers at these sections. This nav is injected on the
// homepage AND every section page so the internal-link graph consistently
// promotes them. Each path is a real SPA route + a sitemap-static.xml entry.
const PRIMARY_NAV = [
  { path: '/', label: 'Home Feed' },
  { path: '/explore', label: 'Explore' },
  { path: '/videos', label: 'Video Feed' },
  { path: '/shorts', label: 'Shorts' },
  { path: '/music', label: 'Music' },
  { path: '/tv', label: 'DeHub TV' },
];

function primaryNavHtml(currentPath = '') {
  const items = PRIMARY_NAV.map((n) =>
    n.path === currentPath
      ? `<li style="margin:6px 0"><strong>${escHtml(n.label)}</strong></li>`
      : `<li style="margin:6px 0"><a href="${APP_URL}${n.path}">${escHtml(n.label)}</a></li>`
  ).join('');
  return `<nav aria-label="DeHub sections"><h2 style="font-size:16px">Explore DeHub</h2><ul style="list-style:none;padding:0;margin:0">${items}</ul></nav>`;
}

// Feed section pages (/explore, /videos, /shorts). These are real SPA routes
// that open the corresponding feed; bots get a self-contained page built here.
// Like /guides and /docs, they're rendered entirely at the edge — the deployed
// Supabase fn's STATIC_ROUTES allowlist doesn't know them, so proxying would
// yield its generic homepage fallback (a soft-duplicate).
const SECTION_PAGES = {
  explore: {
    title: 'Explore DeHub — Trending Creators, Videos & Communities',
    heading: 'Explore DeHub',
    description: 'Discover what’s trending on DeHub: top creators, videos, music, live streams and communities on the open-source, user-owned social platform.',
    intro: 'Find trending creators, videos, shorts, music and communities across DeHub — the open source, user-owned social platform where posts can be minted on-chain and creators earn natively.',
    bodyHtml: `<ul>
<li><a href="${APP_URL}/videos">Video Feed</a> — the latest on-chain videos from creators.</li>
<li><a href="${APP_URL}/shorts">Shorts</a> — a vertical, swipeable short-form feed.</li>
<li><a href="${APP_URL}/music">Music</a> — tracks and audio from DeHub artists.</li>
<li><a href="${APP_URL}/tv">DeHub TV</a> — lean-back, continuous video.</li>
<li><a href="${APP_URL}/stages">Stages</a> — live audio rooms, with recordings kept afterwards.</li>
<li><a href="${APP_URL}/communities">Communities</a> — public groups around a topic, each with its own feed.</li>
</ul>
<h2>How the feed works</h2>
<p>Explore is the whole network in one place: every public post, in the order it was made, with no ranking layer deciding what you see. Filter it by format — video, shorts, images, audio, text — or by the hashtag a post was filed under, and follow the creators whose work you want in your own home feed.</p>
<p>Posts can be minted on-chain when they are published, which gives the creator a permanent, portable record of the work and lets it be sold, tipped or collected in tokens. Minting is optional; a post that is not minted is still a normal post. Reactions, comments, reposts and tips all count toward a creator's standing on the network, and that standing is what unlocks badges and their perks.</p>
<p>You can read all of it signed out. Signing in — with an email, a social account, a passkey or a wallet — gives you a wallet of your own with gas sponsored, so following, reacting and tipping cost nothing to start.</p>`,
  },
  videos: {
    title: 'Video Feed — Watch On-Chain Videos on DeHub',
    heading: 'DeHub Video Feed',
    description: 'Watch the latest on-chain videos from creators on DeHub: long-form uploads with pay-per-view, token-gated content and ad-revenue sharing on the user-owned video platform.',
    intro: 'Watch the newest videos from DeHub creators — long-form uploads that can be minted on-chain, with pay-per-view, token-gated posts and ad-revenue sharing built in. No platform owns your reach; you do.',
    bodyHtml: `<p>DeHub’s video feed is chronological and creator-owned. Sign in with email or a social account, get a sponsored-gas wallet automatically, and start watching or uploading in minutes.</p>
<h2>What you can do with a video here</h2>
<p>Upload once and choose how it earns. A video can be free to everyone, pay-per-view in tokens, or unlocked only for the holders of a badge or a subscription plan — and the same upload can be tipped by anyone who watches it. Views, reactions and comments are counted on the post itself, and the creator keeps the record whatever happens to the platform.</p>
<p>Videos are transcoded for playback on the web and in the Android and iOS apps, with captions and a transcript generated for the ones that have speech. Clips under a minute also appear in <a href="${APP_URL}/shorts">Shorts</a>; longer ones can be watched in picture-in-picture while you keep scrolling, or on <a href="${APP_URL}/tv">DeHub TV</a> as a continuous lean-back channel.</p>`,
  },
  shorts: {
    title: 'Shorts — Short-Form Videos on DeHub',
    heading: 'DeHub Shorts',
    description: 'Scroll the latest short-form videos on DeHub: a vertical, swipeable shorts feed on the open-source, user-owned social platform where creators own their content.',
    intro: 'Scroll a vertical feed of short-form videos from DeHub creators — quick, swipeable clips on the user-owned social platform. Shorts can be minted on-chain, so creators keep ownership and earn natively.',
    bodyHtml: `<p>Shorts sit alongside the full <a href="${APP_URL}/videos">video feed</a> and <a href="${APP_URL}/music">music</a> on DeHub — one open, censorship-resistant home for every format.</p>
<h2>What counts as a short</h2>
<p>A short is any video under a minute. There is no separate upload path and no separate account: a clip posted to the video feed that runs under sixty seconds is a short, and it appears in both places. That keeps a creator's catalogue in one profile whatever the length of the work.</p>
<p>The lane plays full-screen and vertical, one clip at a time, and swiping moves to the next. Tap to pause, hold to scrub, and react, comment or tip without leaving the player. Shorts earn the same way every post on DeHub does — tips, pay-per-view and badge-gated access are all available to a sixty-second clip — and every view and reaction is counted on the post itself rather than in a feed that can be switched off.</p>`,
  },
};

function buildSectionHtml(key, meta) {
  const canonicalUrl = `${APP_URL}/${key}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: meta.title,
    description: meta.description,
    url: canonicalUrl,
    isPartOf: { '@type': 'WebSite', name: 'DeHub', url: APP_URL },
    publisher: ORG_JSONLD,
  };
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escHtml(meta.title)}</title>
<meta name="description" content="${escHtml(meta.description)}">
<link rel="canonical" href="${canonicalUrl}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="DeHub">
${ogLocaleTag()}
<meta property="og:url" content="${canonicalUrl}">
<meta property="og:title" content="${escHtml(meta.title)}">
<meta property="og:description" content="${escHtml(meta.description)}">
${twitterTextTags(meta.title, meta.description)}
${shareMetaTags(key, meta.title)}
<meta name="twitter:site" content="@dehub_official">
<script type="application/ld+json">${jsonLdScript(jsonLd)}</script>
${breadcrumbScript([HOME_CRUMB, { name: meta.heading, url: canonicalUrl }])}
</head>
<body>
<p><a href="${APP_URL}/">DeHub</a> › ${escHtml(meta.heading)}</p>
<h1>${escHtml(meta.heading)}</h1>
<p>${escHtml(meta.intro)}</p>
${meta.bodyHtml || ''}
${primaryNavHtml(`/${key}`)}
<p style="margin-top:24px"><a class="dh-cta" href="${appHref(canonicalUrl)}" rel="nofollow">Open ${escHtml(meta.heading)} on DeHub</a></p>
</body>
</html>`;
}

/** The VideoGame JSON-LD ArcadeGamePage writes for the same URL, so the two
 *  UA variants describe one entity. `image` is the capture, as in the SPA.
 *  All six games carry it or none would: it used to be God's Eye alone.
 *  VideoGame on its own is plain schema, not Google's Software App rich
 *  result — that needs a SoftwareApplication co-type plus a rating or review,
 *  which a free browser game with no reviews cannot honestly supply — so it
 *  is never reported as an invalid item. Never co-type it. */
function arcadeGameLd(art) {
  return {
    jsonLdType: 'VideoGame',
    jsonLdExtra: {
      image: `${APP_URL}${art}`,
      applicationCategory: 'Game',
      gamePlatform: 'Web browser',
      operatingSystem: 'Any',
      playMode: 'SinglePlayer',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    },
  };
}

// Newer public marketing routes, rendered entirely at the edge. The deployed
// Supabase fn's STATIC_ROUTES predates them, so proxying answered 404 — and the
// worker passed that through, hard-404ing real pages (/connect, /pricing,
// /communities, /stages, /guide) to every crawler while humans saw the React
// page. Titles and descriptions mirror each page's SPA SEOHead strings exactly
// so the two UA variants never diverge.
const MARKETING_PAGES = {
  'dex': {
    title: 'DEX — Trade tokens at your price',
    description: 'Set your token buy or sell price with a Uniswap v4 limit order on Base or BNB Chain. Live order book, market depth and one shared USD price.',
    heading: 'DeHub DEX',
    bodyHtml: `<p>Trade tokens at the price you choose. Place a buy or sell as a Uniswap v4 limit order on Base or BNB Chain and it fills when the market reaches it — no watching the chart, no slippage past your number.</p>
<p>The terminal shows the live order book, market depth and one shared USD price.</p>
<p><a href="${APP_URL}/dex">Open the DEX</a> or <a href="${APP_URL}/docs/token/where-to-buy">see where else to get tokens</a>.</p>`,
  },
  'ads': {
    title: 'Ads Manager | DeHub',
    description: 'Launch POVR ad campaigns on DeHub: proof-of-view-and-rank advertising that targets verified badge holders, with campaigns paid in tokens.',
    heading: 'DeHub Ads Manager',
    bodyHtml: `<p>Run ad campaigns on DeHub with POVR — proof-of-view-and-rank. Campaigns target verified badge holders rather than anonymous impressions, and are paid in tokens.</p>
<p>Create a campaign, choose who it reaches and follow its results from one dashboard.</p>
<p><a href="${APP_URL}/ads">Open Ads Manager</a> or <a href="${APP_URL}/docs/advertising">read how POVR works</a>.</p>`,
  },
  'buy': {
    title: 'Buy — Purchase Crypto on DeHub',
    description: 'Buy tokens and other cryptocurrencies directly on DeHub with your credit card. Fast checkout, multiple chains supported.',
    heading: 'Buy Crypto on DeHub',
    bodyHtml: `<p>Buy tokens and other cryptocurrencies directly on DeHub with a credit card, delivered straight to your wallet. Checkout supports multiple chains, so you can buy on the network you already use.</p>
<p><a href="${APP_URL}/buy">Buy crypto</a>, <a href="${APP_URL}/dex">trade tokens at your price</a> or <a href="${APP_URL}/docs/token/where-to-buy">see where else to get tokens</a>.</p>`,
  },
  'builder': {
    title: 'Builder — Build Apps with AI on DeHub',
    description: 'Tell @assistant what you want in your DeHub messages. It builds the app, hosts it and sends you a link anyone can open.',
    heading: 'DeHub Builder',
    bodyHtml: `<p>DeHub Builder turns a sentence into a working mini app. Message @assistant with what you want; it writes the app, hosts it on DeHub and sends the link back in the same chat — nothing to install, deploy or configure.</p>
<h2>It stays a conversation</h2>
<p>An app is never finished at the first attempt. Reply in the chat for another screen, a different colour or a new feature and the build updates in place, so the link you already shared shows the latest version. Every build lives in your messages.</p>
<h2>Shareable by default</h2>
<p>Finished apps render straight from a dehub.io link in any browser, which means they can be posted anywhere on DeHub or sent to somebody who has never opened it before.</p>
<p>Building needs a free DeHub account — sign in with an email or social login and a sponsored-gas wallet is created for you. How many apps you can build at once depends on your DeHub plan.</p>`,
  },
  'depin': {
    title: 'DePin | Community-Powered Media Infrastructure | DeHub',
    description: 'DeHub DePin lets people contribute storage, bandwidth and compute to help host, transcode and deliver media through a resilient network.',
    heading: 'DeHub DePin',
    bodyHtml: `<p>DePin is DeHub's community-powered media infrastructure, now in development. Operators will be able to set limits for spare storage, bandwidth and compute while DeHub coordinates useful hosting, transcoding and delivery work.</p>
<h2>Designed for nodes to go offline</h2>
<p>Community nodes never hold the only copy. DeHub origin storage remains the source of truth, online replicas serve available segments, and playback falls back to origin automatically when peers leave.</p>
<h2>Protected content stays encrypted</h2>
<p>Protected media can be stored as encrypted segments. Node operators do not receive playback keys simply because they host data. Public content remains publicly viewable through DeHub.</p>
<h2>Variable, revenue-funded rewards</h2>
<p>Verified contribution may receive a share of a platform-revenue-funded pool after an epoch closes. There is no fixed rate, minimum return, APY or guaranteed reward, and contribution records are not a promise of payment. Running a node creates electricity, bandwidth and hardware costs that may exceed any reward. Any future tokens settlement would occur on Base and remain subject to eligibility, network rules and applicable law.</p>
<p>The node client is not available yet. DePin will launch in controlled phases, beginning with delivery and adaptive video infrastructure.</p>`,
  },
  'connect': {
    title: 'Connect DeHub to your AI assistant',
    description: 'Connect ChatGPT, Claude, or any MCP-compatible assistant to DeHub with a single URL.',
    heading: 'Connect DeHub to your AI assistant',
    bodyHtml: `<p>DeHub ships a Model Context Protocol (MCP) server, so any MCP-compatible AI assistant can browse public DeHub posts, search topics and look up creator profiles.</p>
<ul>
<li><a href="${APP_URL}/connect/chatgpt">DeHub for ChatGPT</a> — add the connector to ChatGPT in one click.</li>
<li><a href="${APP_URL}/connect/claude">DeHub for Claude</a> — add the connector to Claude in one click.</li>
<li><a href="${APP_URL}/skill.md">skill.md</a> — the agent-readable spec for the DeHub MCP API.</li>
</ul>`,
  },
  'connect/chatgpt': {
    title: 'DeHub for ChatGPT — Use DeHub inside ChatGPT (MCP Connector)',
    description: 'Add DeHub to ChatGPT in one click. Browse posts, look up profiles and pull trending topics from the DeHub decentralized social network directly inside ChatGPT.',
    heading: 'Use DeHub inside ChatGPT',
    bodyHtml: `<ol>
<li><strong>Open the DeHub connector in ChatGPT</strong> — ChatGPT jumps straight to the DeHub connector inside Settings → Connectors.</li>
<li><strong>Enable the connector</strong> — toggle DeHub on and approve access so ChatGPT can read public posts, profiles and trending topics.</li>
<li><strong>Start a new chat</strong> — mention DeHub in your prompt and ChatGPT calls the connector automatically.</li>
</ol>
<h2>FAQ</h2>
<p><strong>Is it free?</strong> The DeHub app is free to add; you need a ChatGPT plan that supports connectors (Plus, Pro, Team or Enterprise).</p>
<p><strong>What can it do?</strong> Browse public DeHub posts, search topics and look up creator profiles via MCP. It does not post on your behalf.</p>
<p><strong>Do I need a DeHub account?</strong> No — reading public content works without one.</p>`,
  },
  'connect/claude': {
    title: 'DeHub for Claude — Use DeHub inside Claude (MCP Connector)',
    description: 'Add DeHub to Claude in one click. Browse posts, look up profiles and pull trending topics from the DeHub decentralized social network directly inside Claude.',
    heading: 'Use DeHub inside Claude',
    bodyHtml: `<ol>
<li><strong>Open the DeHub connector in Claude</strong> — Claude opens directly on the DeHub connector inside Settings → Connectors.</li>
<li><strong>Enable the connector</strong> — turn DeHub on and approve access so Claude can browse public posts, profiles and trending topics.</li>
<li><strong>Start a chat</strong> — mention DeHub in your message and Claude calls the connector automatically.</li>
</ol>
<h2>FAQ</h2>
<p><strong>Is it free?</strong> The connector is free to add; you need a Claude plan that supports custom connectors (Pro, Team or Enterprise).</p>
<p><strong>What can it do?</strong> Browse public DeHub posts, search topics and look up creator profiles via MCP. It does not post on your behalf.</p>
<p><strong>Do I need a DeHub account?</strong> No — reading public content works without one.</p>`,
  },
  'pricing': {
    title: 'Pricing — DeHub Creator Studio',
    description: 'DeHub Creator Studio pricing in GBP. Ultra, Team and Scale plans with monthly credits for AI image, video, music and poster generation.',
    heading: 'DeHub Creator Studio Pricing',
    bodyHtml: `<ul>
<li><strong>Ultra</strong> — £99/mo billed annually (£129 month-to-month): 3,500 credits/mo and access to all models including Seedance 2.0 and Nano Banana Pro.</li>
<li><strong>Team</strong> — £65/seat/mo billed annually (£79 month-to-month): 2,500 shared credits/mo, 2–9 seats, shared workspace and priority support.</li>
<li><strong>Scale</strong> — £150/seat/mo billed annually (£215 month-to-month): 15,000 credits/mo, 5–15 seats, SSO, priority queue and admin controls.</li>
</ul>
<p>Looking for the DeHub Extra social membership instead? <a href="${APP_URL}/premium">See Premium</a>.</p>`,
  },
  'communities': {
    title: 'Communities — Find Your People on DeHub',
    description: 'Discover DeHub communities: join public groups, follow the topics you care about and build your own community on the decentralized, user-owned social platform.',
    heading: 'DeHub Communities',
    bodyHtml: `<p>Communities are public groups on DeHub — join the ones that match your interests, follow their feeds, or create your own and grow it with posts, events and stages.</p>
<h2>How a community works</h2>
<p>Every community has a feed of its own, a member list, and a page at its own address that anyone can read without an account. Members post into it the same way they post anywhere on DeHub — video, shorts, images, audio or text — and the community's feed is those posts in the order they were made. Joining one adds its posts to your home feed; leaving removes them. Nothing is hidden behind an algorithm.</p>
<p>A community can host live audio <a href="${APP_URL}/stages">Stages</a> and schedule events, and the people who run it can pin posts, set rules and moderate what appears. Creating one takes a name, a description and a picture; anyone with an account can do it, and there is no cap on how many you can join or run.</p>
<p><a href="${APP_URL}/communities">Browse communities on DeHub</a>.</p>`,
  },
  'stages': {
    title: 'Stages — Live Audio Rooms on DeHub',
    description: 'Join live audio Stages, listen back to recorded conversations, and go live with your own room on DeHub — the decentralized, open source social platform.',
    heading: 'DeHub Stages',
    bodyHtml: `<p>Stages are live audio rooms on DeHub: join a conversation as a listener, come up on stage to speak, or host your own room. Finished stages stay available as recordings.</p>
<h2>Live, then kept</h2>
<p>A Stage has a host, speakers and an audience. Listeners can raise a hand to be brought up to speak, the host can share a screen or play audio into the room, and anyone can tip a speaker in tokens while they talk. Rooms can be scheduled ahead of time with a reminder and a short link to share, or opened on the spot.</p>
<p>When a Stage ends its recording is kept at the same address, seekable, with live captions carried over as a transcript that can be read or searched. So a Stage is a conversation while it happens and a page afterwards — one that a search engine, a link preview and a listener who missed it all get the same way.</p>
<p><a href="${APP_URL}/stages">See live and recorded Stages</a>.</p>`,
  },
  // The Arcade. Titles and descriptions mirror the SPA's SEOHead strings so
  // the bot and human variants never diverge, and each game gets its own page
  // rather than being folded into the grid: they are separately linkable, they
  // are what somebody actually searches for, and one shared page for all of
  // them would be a soft duplicate of every one.
  'arcade': {
    // Not the SPA's `Arcade | DeHub`: fourteen characters with no word anyone
    // searches for, over a description Google cut at 160. The ?hl= variants
    // keep their seo-i18n rows until the locale keys are rewritten to match.
    title: 'DeHub Arcade — Free Browser Games, No Download',
    description: 'Free browser games on DeHub: cinematic 3D chess, a procedurally generated shooter, a rainforest walk, a neon-street brawler and a walkable trading floor.',
    heading: 'DeHub Arcade',
    bodyHtml: `<p>A collection of DeHub built and open sourced games, worlds or experiences. They run in the browser tab — nothing to install, nothing to buy, all served from DeHub itself.</p>
<ul>
<li><a href="${APP_URL}/arcade/gods-eye">God's Eye</a> — a live spatial-intelligence globe where you can find the DeHub community across a 3D Earth.</li>
<li><a href="${APP_URL}/arcade/kings-gambit">King's Gambit</a> — cinematic 3D chess with three rigged civilisations, four battlegrounds and three engine strengths.</li>
<li><a href="${APP_URL}/arcade/claude-of-duty">Claude of Duty</a> — a first-person shooter that generates every mesh, texture and sound on your machine as it loads.</li>
<li><a href="${APP_URL}/arcade/jungle-trail">Jungle Trail</a> — a walk through a procedurally generated rainforest, with no score and no timer.</li>
<li><a href="${APP_URL}/arcade/street-slayer">Street Slayer</a> — a side-scrolling beat 'em up down a neon-lit street, built for DeHub rather than found.</li>
<li><a href="${APP_URL}/arcade/trenchstar">Chartopia</a> — a trading floor you can walk, built out of forty live market screens.</li>
</ul>`,
  },
  // The mini app store and its developer page. Individual apps are not
  // listed here: they live in the registry, and until the SSR function learns
  // them a shared /apps/<slug> link falls back to the store's card.
  'apps': {
    title: 'DeHub Apps — mini apps for DeHub',
    description: 'Mini apps built for DeHub by anyone: games, tools and more that open inside DeHub, already signed in, with sharing back to the feed.',
    heading: 'DeHub Apps',
    bodyHtml: `<p>Mini apps are web apps that open inside DeHub. You arrive already signed in, and anything worth sharing goes straight back to the feed. Every app shows its real web address, so you always know who you are dealing with.</p>
<p><a href="${APP_URL}/apps">Browse the apps</a> or <a href="${APP_URL}/apps/dev">build one</a>.</p>`,
  },
  'apps/dev': {
    title: 'Build a DeHub mini app',
    description: 'Build a mini app for DeHub: one script tag, sign in with DeHub, share to the feed. Check your manifest and preview your app in the real host.',
    heading: 'Build a DeHub mini app',
    bodyHtml: `<p>A DeHub mini app is any website plus one script tag. Add a manifest at /.well-known/dehub.json — or keep your Farcaster manifest, which DeHub reads as it is — and your app opens inside DeHub with the user already signed in.</p>
<p><a href="${APP_URL}/apps/dev">Check your manifest and launch your app</a>.</p>`,
  },
  'arcade/gods-eye': {
    title: "God's Eye | DeHub Arcade",
    description: 'Explore a live spatial-intelligence globe and, if you choose, place a deliberately approximate version of yourself among the DeHub community.',
    heading: "God's Eye — Find The DeHub Community On A Living 3D Earth",
    ...arcadeGameLd('/arcade/gods-eye.jpg'),
    bodyHtml: `<p>A live spatial-intelligence globe in the browser tab: flights, satellites, earthquakes and street traffic drawn over a 3D Earth you can spin, zoom and fly down into.</p>
<p>It is also the DeHub community on a map. Opting in places a deliberately approximate version of you on the globe — never your exact location — so you can see who else is out there. Nothing is placed until you choose to.</p>
<p>Built on the open-source <a href="https://github.com/bilawalsidhu/gods-eye-view" rel="nofollow">God's Eye View</a> (MIT). Needs a browser with WebGL 2 and hardware acceleration switched on.</p>
<p><a href="${APP_URL}/arcade/gods-eye">Open the globe</a> or <a href="${APP_URL}/arcade">see the whole arcade</a>.</p>`,
  },
  'arcade/kings-gambit': {
    title: "King's Gambit | DeHub Arcade",
    description: "Play King's Gambit on DeHub — cinematic 3D chess where three rigged civilisations march, strike and fall across a marble board. Free, in your browser, no install.",
    heading: "King's Gambit — Cinematic 3D Chess",
    ...arcadeGameLd('/arcade/kings-gambit.webp'),
    bodyHtml: `<p>Chess with an army behind every piece. Three rigged civilisations — the Ivory Kingdom, the Sun Empire and the Grande Armée — march, strike and fall across a marble board in four battlegrounds.</p>
<p>Full rules including castling, en passant and promotion; three engine strengths; a two-player hotseat; and an AI vs AI mode you can just sit and watch.</p>
<p><a href="${APP_URL}/arcade/kings-gambit">Play King's Gambit</a> or <a href="${APP_URL}/arcade">see the whole arcade</a>.</p>`,
  },
  'arcade/claude-of-duty': {
    title: 'Claude of Duty | DeHub Arcade',
    description: 'Play Claude of Duty on DeHub — a browser first-person shooter that ships no art at all and generates every mesh, texture and sound on your machine. Free, no install.',
    heading: 'Claude of Duty — A Browser FPS With No Assets',
    ...arcadeGameLd('/arcade/claude-of-duty.webp'),
    bodyHtml: `<p>A first-person shooter that ships no art at all: every mesh, texture and sound is generated in JavaScript on your machine while the level loads.</p>
<p>It is also hidden inside the War theme, where an arrow key offers to deploy you.</p>
<p><a href="${APP_URL}/arcade/claude-of-duty">Play Claude of Duty</a> or <a href="${APP_URL}/arcade">see the whole arcade</a>.</p>`,
  },
  'arcade/jungle-trail': {
    title: 'Jungle Trail | DeHub Arcade',
    description: 'Walk Jungle Trail on DeHub — a first-person walk through a procedurally generated rainforest with weather and a day cycle. No score, no timer, no install.',
    heading: 'Jungle Trail — A Procedural Rainforest Walk',
    ...arcadeGameLd('/arcade/jungle-trail.webp'),
    bodyHtml: `<p>A first-person walk through a procedurally generated rainforest — a hundred thousand plants, weather and a day cycle, all grown on your machine before the first frame. No score, no timer, nothing to beat.</p>
<p>It is also hidden inside the Jungle theme, where the background you are already looking at pushes forward and becomes the game.</p>
<p><a href="${APP_URL}/arcade/jungle-trail">Walk the trail</a> or <a href="${APP_URL}/arcade">see the whole arcade</a>.</p>`,
  },
  'arcade/street-slayer': {
    title: 'Street Slayer | DeHub Arcade',
    description: "Play Street Slayer on DeHub — a side-scrolling beat 'em up down a neon-lit street, with three fighters and a boss. Free, in your browser, no install.",
    heading: "Street Slayer — A Neon-Street Beat 'Em Up",
    ...arcadeGameLd('/arcade/street-slayer.webp'),
    bodyHtml: `<p>A side-scrolling beat 'em up down a neon-lit street: pick one of three fighters — Mike, Indi or Lerone — then punch, kick and throw your way through everything the block sends at you.</p>
<p>The only game in the arcade that was not found: it was commissioned for DeHub and built by Studio Shook Pixel, so it exists nowhere else. Arrows or WASD to move, Z to jump, four attack keys, and a full set of on-screen controls on a touchscreen.</p>
<p><a href="${APP_URL}/arcade/street-slayer">Play Street Slayer</a> or <a href="${APP_URL}/arcade">see the whole arcade</a>.</p>`,
  },
  'arcade/trenchstar': {
    title: 'Chartopia | DeHub Arcade',
    description: 'The mother of all arenas. Trade like a time traveller with dozens of screens. Enjoy live feeds from Binance, Dexscreener or any thing you want from videos, to browser tabs and all between.',
    heading: 'Chartopia — A Trading Floor Built Out Of Live Markets',
    ...arcadeGameLd('/arcade/trenchstar.webp'),
    bodyHtml: `<p>The mother of all arenas. Trade like a time traveller with dozens of screens. Enjoy live feeds from Binance, Dexscreener or any thing you want from videos, to browser tabs and all between.</p>
<p>Drag any screen to move it, drop it on another to swap them, and put a chart, a heatmap, a live web page or your own tab on any panel. Pick a character and walk the floor, or stay at the desk and fly the camera.</p>
<p><a href="${APP_URL}/arcade/trenchstar">Take the desk</a> or <a href="${APP_URL}/arcade">see the whole arcade</a>.</p>`,
  },
  'guide': {
    title: 'DeHub Guide — Visual Walkthrough of the App',
    description: 'A visual walkthrough of DeHub: feeds, messaging, wallet, staking, governance and more. See every screen and learn how the decentralized social platform works.',
    heading: 'DeHub Guide',
    bodyHtml: `<p>A screen-by-screen walkthrough of the DeHub app: the home feed, video and shorts, messaging, the wallet, staking, governance and the creator tools.</p>
<h2>What the guide covers</h2>
<p>It starts where a new account starts: signing in with an email, a social account, a passkey or a wallet, and the wallet DeHub creates for you with gas sponsored so the first follow, reaction and tip cost nothing. From there it walks the home feed and its filters, the video, shorts and music lanes, and the post composer — including what minting a post on-chain does and why it is optional.</p>
<p>The second half is the parts people ask about: direct messages and group chats, live audio Stages, the wallet and how tokens moves in and out of it, staking for a badge and what each badge unlocks, and the governance page where token holders vote on what gets built. Each screen is shown as it looks in the app, with the controls labelled.</p>
<p><a href="${APP_URL}/guide">Open the full visual guide</a> or start with the <a href="${APP_URL}/docs">documentation</a>.</p>`,
  },
  // Direct APK download. The file itself is a GitHub release asset (~205 MB,
  // well past the 25 MiB per-file ceiling on Workers static assets), reached
  // through `releases/latest/download/dehub.apk` so a new upload needs no
  // deploy. Version and size are the SPA's fallback strings — the live page
  // reads both from the releases API, but a crawler runs no JS, so these are
  // what a share card and a search result will carry.
  'apk': {
    title: 'Download the DeHub APK — Latest Android Build',
    description: 'Skip the stores and get the latest version of DeHub right here. Direct APK download for Android — open source, user-owned social media, no store account needed.',
    heading: 'Download the DeHub APK',
    // A WebPage about the app, not a SoftwareApplication: Google's Software
    // App result requires an aggregateRating or review, the APK has neither,
    // and without one Search Console lists the page as an invalid item.
    jsonLdExtra: {
      alternateName: 'DeHub APK',
      significantLink: 'https://github.com/DeHubToken/dehub-mobile/releases/latest/download/dehub.apk',
      about: { '@type': 'Thing', name: 'DeHub for Android', sameAs: 'https://play.google.com/store/apps/details?id=io.dehub.mobile' },
    },
    bodyHtml: `<p>Skip the stores and get the latest version of DeHub right here — straight from us, no store account and no waiting on a review queue.</p>
<p><a href="https://github.com/DeHubToken/dehub-mobile/releases/latest/download/dehub.apk">Download the DeHub APK</a> — Android 8 and up. Allow installs from your browser when Android asks.</p>
<p>Prefer the store? DeHub is also <a href="https://play.google.com/store/apps/details?id=io.dehub.mobile">on Google Play</a>.</p>`,
  },

  // The moderation handbook, published. The page itself is an iframe around a
  // static document, so a crawler running no JS sees an empty shell — the copy
  // below is the only thing a search result or an unfurl will ever carry, and
  // it is deliberately the three golden rules rather than a summary of the
  // page, because those are the part anyone linking to it is arguing about.
  'admin-manual': {
    title: 'The DeHub Moderation Handbook',
    description: 'The rules our moderators work to, published in full. Only malicious actors get banned, adult content is marked mature rather than deleted, and everything else is left to the community.',
    heading: 'The DeHub Moderation Handbook',
    jsonLdType: 'TechArticle',
    jsonLdExtra: {
      inLanguage: 'en',
      isAccessibleForFree: true,
      about: 'Content moderation policy',
    },
    bodyHtml: `<p>DeHub is community owned and community run, so the rules its moderators work to are not an internal document. This is the handbook they read and sign before they can moderate anything, published in full.</p>
<p>Three golden rules outrank everything else in it:</p>
<ol>
<li>Only malicious actors get banned — people gaming the system or scamming users. Being disliked, wrong or unpopular is not a ban.</li>
<li>Adult or extreme content is marked mature, not deleted. It stays on the creator's profile; it just does not greet a stranger on the home page.</li>
<li>The only thing deleted without hesitation is child sexual abuse material. Everything else is left to community moderation.</li>
</ol>
<p><a href="${APP_URL}/admin-manual">Read the full handbook</a>.</p>`,
  },

  // The rest of SSR_STATIC_ROUTES, moved here from the Supabase fn's own
  // STATIC_ROUTES map. The fn deploys on its own track (`supabase functions
  // deploy ssr-seo`), not with the Cloudflare build, so edits to it sat unshipped
  // — /features kept serving a product-tour blurb for weeks after the copy was
  // corrected in the repo, because only the merge happened. Rendered here, the
  // copy ships with the worker and can never drift from what was merged.
  //
  // Titles and descriptions are lifted from each page's SPA SEOHead so the two
  // UA variants match. They did not before: /music billed itself as "DeHub Music
  // — Web3 Songs & Radio" to crawlers and "Music — Listen & Discover on DeHub"
  // to people, and /jobs, /bridge, /glossary and /top-100 diverged the same way.
  // /creator, /prompt, /affiliate and /premium have no SEOHead of their own yet,
  // so those four keep the fn's wording until the pages grow one.
  'features': {
    title: 'Feature Requests & Bug Reporting — DeHub',
    description: "Submit feature requests, report bugs, and vote on community ideas to shape DeHub's roadmap. Track open, in-progress, and shipped features.",
    heading: 'DeHub Feature Requests & Bug Reporting',
    bodyHtml: `<p>The DeHub Features page is a community board: submit new feature ideas, report bugs, and vote on suggestions to help shape the roadmap.</p>
<ul>
<li><strong>Submit ideas &amp; bug reports</strong> — suggest features or report bugs with device details and attachments.</li>
<li><strong>Community voting</strong> — vote on requests to help prioritise what gets built next.</li>
<li><strong>Transparent roadmap</strong> — track requests across Open, Shipping and Shipped.</li>
<li><strong>Discussion</strong> — comment on requests and work through them with the community and the core team.</li>
</ul>`,
  },
  'creator': {
    title: 'DeHub Creator — Image, Video, Audio & 3D Studio',
    description: 'Create images, videos, audio and 3D assets. See the price before generating, save to your private library, and edit in your browser.',
    heading: 'DeHub Creator Studio',
    bodyHtml: `<p>Choose image, video, audio or 3D, enter a prompt and optionally attach reference media. Paid generations show a server quote and use tokens per job. Existing unspent payment receipts are reused before requesting another transfer.</p>
<ul>
<li>Image generation with Nano Banana, Gemini, FLUX and other available models.</li>
<li>Video generation with Kling, Veo, Seedance and other available models.</li>
<li>Music, speech, sound effects, dubbing and transcription through ElevenLabs. Music is paid; other audio tools require sign-in and have usage limits.</li>
<li>A private generation library shared with mobile, Creator Flow workflows, and an in-browser timeline editor.</li>
</ul>
<p>Choose a model in <a href="${APP_URL}/creator">Creator</a> to see its current per-job price before paying. A confirmed failed render restores its receipt amount for reuse; this is not an on-chain refund transfer.</p>`,
  },
  'editor': {
    title: 'DeHub Editor — In-Browser Video Editor',
    description: 'Cut, trim, and export videos in your browser. Multi-track timeline, audio waveforms, effects, and one-click publish to DeHub.',
    heading: 'DeHub Video Editor',
    bodyHtml: `<p>The DeHub Video Editor is a multi-track timeline that runs entirely in the browser. Import clips from your device or the Creator Studio, add music, subtitles, transitions and text, then publish to the feed as a video post or Short.</p>
<ul>
<li>Multi-track timeline with drag-and-drop trimming and audio waveforms.</li>
<li>Effects, transitions and adjustable colour filters.</li>
<li>Auto-generated subtitles with translation to 90+ languages.</li>
<li>Export to 1080p and publish in one click.</li>
</ul>`,
  },
  'prompt': {
    title: 'DeHub Prompt — Personalize Your Feed',
    description: 'Tell DeHub what you want to see and shape a feed that actually matches your taste. Prompt-powered personalization for Web3 social.',
    heading: 'DeHub Prompt',
    bodyHtml: `<p>DeHub Prompt lets you type what you want to see — topics, creators, moods, chains — and reshapes the home feed in real time. Save prompts as tabs, switch between them, and refine as your interests change. No opaque algorithm, no engagement traps.</p>`,
  },
  'work': {
    title: 'Bounties — Post & Hunt Paid Tasks | DeHub',
    description: 'Browse open bounties on DeHub: social media tasks, clipping bounties and fixed-price contracts. Claim a bounty as a hunter and get paid in tokens or USDC.',
    heading: 'DeHub Work — Bounties',
    bodyHtml: `<p>DeHub Work is an on-chain marketplace for creator jobs. Post a bounty with a budget and criteria, receive submissions from creators worldwide, then release payment through the DeHubWork escrow contract on Base. Disputes are handled by community moderators.</p>
<ul>
<li><strong>Clipping</strong> — pay per verified view for short clips of streams or long-form video.</li>
<li><strong>Social tasks</strong> — pay for high-quality engagement across posts.</li>
<li><strong>Fixed-price contracts</strong> — hire creators for logos, video, translation and community work.</li>
</ul>`,
  },
  'usernames': {
    title: 'Username Marketplace — Buy & Sell DeHub Handles for tokens',
    description: 'Browse DeHub usernames for sale and buy one with tokens. Short, numeric and original handles, transferred on-chain the moment payment clears — or list your own.',
    heading: 'DeHub Username Marketplace',
    bodyHtml: `<p>Every DeHub profile lives at <strong>dehub.io/yourname</strong>, and there is only ever one of each. The username marketplace is where those handles change hands: search what is for sale, pay the holder directly in tokens, and the name moves to your account as soon as the transfer is confirmed on-chain.</p>
<h2>Buying a handle</h2>
<p>The asking price is quoted by DeHub, not by the browser, and the payment goes wallet-to-wallet — DeHub takes no cut and never holds your funds. Search a name you want and DeHub also tells you whether it is simply unclaimed, in which case you can take it for free instead of buying it.</p>
<h2>Selling yours</h2>
<p>You can list the handle you are currently using, at any price in tokens. You choose the name you move to before listing, so the swap is instant and settled the moment a buyer pays. Your posts, followers and wallet stay exactly where they are — only the handle moves.</p>`,
  },
  'affiliate': {
    title: 'DeHub Affiliate — Earn 20% Revenue Share',
    description: 'Refer creators to DeHub and earn 20% of the revenue they generate, plus 5% from second-tier invites. Transparent on-chain payouts.',
    heading: 'DeHub Affiliate Program',
    bodyHtml: `<p>Every DeHub user gets a personal referral link. When someone signs up through it and spends on Creator Studio credits, premium subscriptions or ads, you earn <strong>20% of that revenue</strong> for the lifetime of the account. Second-tier invites earn another <strong>5%</strong>. Payouts are made in tokens and are visible on-chain.</p>`,
  },
  'premium': {
    title: 'DeHub Extra — Premium Membership',
    description: 'Unlock DeHub Extra: bigger uploads, priority AI credits, exclusive drops and creator perks across DeHub.',
    heading: 'DeHub Extra',
    bodyHtml: `<ul>
<li>Larger video and image upload limits.</li>
<li>Priority AI credits and faster queue times in the Creator Studio.</li>
<li>Extra bookmark folders, saved prompts and profile customisation.</li>
<li>Exclusive drops, badges and community events.</li>
</ul>
<p>DeHub Extra is billed monthly and unlocks across the whole network — social, video, music and TV. For Creator Studio plans instead, see <a href="${APP_URL}/pricing">pricing</a>.</p>`,
  },
  'dao': {
    title: 'DAO Treasury — Fund DeHub and Earn a Say',
    description: 'The DeHub DAO treasury: one wallet anyone can send tokens to. See its live balance, who has contributed, and the share of the pool each contributor holds when the DAO decides how it is spent.',
    heading: 'DeHub DAO Treasury',
    bodyHtml: `<p>The DAO treasury is a single wallet that anyone can send tokens to, from inside the app or from any exchange or wallet. Its balance and every contribution are read straight from the Base and BNB chains, so nothing on this page depends on a database.</p>
<p>Each contributor holds a share of the pool equal to what they put in. That share is the weight their vote carries when the DAO decides how the treasury is spent — see <a href="${APP_URL}/governance">governance</a> for the proposals.</p>`,
  },
  'governance': {
    title: 'Governance — Vote on Community Proposals',
    description: "Participate in decentralized governance on DeHub. Submit proposals, vote with your staking badge weight, and shape the platform's future.",
    heading: 'DeHub Governance',
    bodyHtml: `<p>Token holders shape the DeHub roadmap. Any staker can open a proposal — new features, moderation rules, treasury spend or partnerships — and the community votes with staked token weight. Results are tallied on-chain and executed by the core team on approved proposals.</p>`,
  },
  'packs': {
    title: 'Emoji, Sticker & GIF Packs — DeHub',
    description: 'Custom emoji, sticker and GIF packs made by DeHub badge holders. Add any pack to your picker and use it in chats, comments and reactions.',
    heading: 'Emoji, Sticker & GIF Packs',
    bodyHtml: `<p>Packs are custom emoji, stickers and GIFs published by DeHub badge holders. Anyone can add a pack to their picker and use it in chats, comments and reactions. Staking for a badge unlocks creating your own: a Crab badge runs one pack of each kind, and every tier up to Megalodon adds more packs and more room in each.</p>
<p>Share a pack with its link and anyone who opens it can add it in one tap. <a href="${APP_URL}/stake">Get a badge</a> to start your own.</p>`,
  },
  'leaderboard': {
    title: 'Leaderboard — Top Creators & Earners',
    description: "See who's leading on DeHub. Track top holders, biggest tippers, most followed creators, and trending accounts across all time periods.",
    heading: 'DeHub Leaderboard',
    bodyHtml: `<p>The leaderboard ranks DeHub's biggest creators, tippers and token stakers across BNB Chain and Base. Snapshots are taken daily, and the top ranks unlock silhouette badges, profile overlays and larger platform rewards.</p>`,
  },
  'top-100': {
    title: 'Top Assets — Live Prices for Stocks, Commodities & Crypto',
    description: 'Track live prices for gold, silver, oil, Tesla, Apple, Bitcoin, stocks, commodities and thousands of crypto assets on DeHub.',
    heading: 'Top Assets on DeHub',
    bodyHtml: `<p>Track live prices, 24h volume and sparkline charts for thousands of assets — crypto, equities and commodities — without leaving DeHub. Open any ticker for the full chart, add it to a watchlist, or share it straight to the feed as a post.</p>`,
  },
  'music': {
    title: 'Music — Listen & Discover on DeHub',
    description: 'Stream music, discover new artists, listen to live radio and watch music videos on DeHub — the decentralized open source media platform.',
    heading: 'DeHub Music',
    bodyHtml: `<p>DeHub Music hosts songs from independent Web3 artists — stream them free, tip in tokens, or collect a token-gated release. Build playlists, watch music videos, or tune into a 24/7 community radio station. Every play, tip and follow is recorded on-chain.</p>
<h2>For listeners</h2>
<p>Tracks play in a persistent player that keeps going while you browse the rest of DeHub, with a visualiser and a queue. Follow an artist to get their releases in your home feed, tip a track you like straight from the player, and add it to a playlist of your own. The radio channel plays continuously from the catalogue.</p>
<h2>For artists</h2>
<p>An audio post is a normal DeHub post: upload the track, add artwork and a description, and decide whether it is free, tipped, pay-per-play, or unlocked for badge holders and subscribers. Minting it on-chain gives you a permanent record of the release that you own wherever the platform goes. Plays, reactions and comments count on the post and toward your badge standing, like every other format here.</p>`,
  },
  'tv': {
    title: 'Live TV — Free Channels From Around the World',
    description: 'Watch free live TV channels from around the world on DeHub. News, sports, entertainment and more — streamed in the browser, no subscription needed.',
    heading: 'DeHub TV',
    bodyHtml: `<p>DeHub TV streams free live channels from around the world — news, sports and entertainment — alongside creator streams and curated shows. Picture-in-picture keeps playback going while you scroll, and you can tip in tokens straight from the player.</p>
<h2>What is on</h2>
<p>The guide is grouped by country and by genre — news, sport, film, music, kids, documentary — and every channel is a free, publicly available stream that plays in the browser with no account and no subscription. Creators who go live on DeHub appear alongside them, so a live stream from someone you follow sits in the same guide as a national broadcaster.</p>
<p>Playback works on the web and in the apps, with the player able to detach into a corner while you read the feed. A live creator stream can be tipped in tokens from the player, and it is kept afterwards as a normal video post on the creator's profile, with the chat that ran beside it.</p>`,
  },
  // Title and description are copied verbatim from CinemaPage's SEOHead — see
  // the note above MARKETING_PAGES about the two UA variants never diverging.
  'cinema': {
    title: 'Cinema | Where to Stream, Rent or Buy Any Film | DeHub',
    description: 'Find out where to stream, rent or buy any film or series, with live prices for your country. DeHub Cinema covers every major service in 140+ countries.',
    heading: 'DeHub Cinema',
    bodyHtml: `<p>Search any film or series and DeHub Cinema shows every legal way to watch it where you are — what it streams on, what a rental costs, and what it costs to own. Prices come back in your own currency.</p>
<h2>Rights are per country</h2>
<p>The same film can be included with a subscription in one country, a paid rental in another, and unavailable in a third. Cinema asks per territory rather than showing one global answer, so switching country re-checks availability and price.</p>`,
  },
  'glossary': {
    title: 'Glossary — Icons, Features & Web3 Terms',
    description: "Learn what every icon, button and feature means on DeHub. A complete guide to the platform's UI, Web3 terms, staking badges and more.",
    heading: 'DeHub Glossary',
    bodyHtml: `<p>Plain-English definitions for everything you meet on DeHub — every icon and button in the interface, plus the Web3 vocabulary behind them: wallets, gas, staking badges, bridges, escrow, on-chain tipping and DeHub tokens. Written for creators, not engineers.</p>`,
  },
  'bridge': {
    title: 'Bridge — Transfer tokens Cross-Chain',
    description: 'Bridge your tokens between Base and BNB Chain seamlessly on DeHub. Fast, secure cross-chain transfers with live transaction tracking.',
    heading: 'DeHub Bridge',
    bodyHtml: `<p>The DeHub Bridge moves tokens between BNB Chain and Base from inside the platform wallet, with live transaction tracking. Balances round down to two decimals to match on-chain settlement, and every transfer is verified before your balance updates.</p>`,
  },
  'agents': {
    title: 'AI Agents — Build & Manage Bots',
    description: 'Create and manage AI-powered agents on DeHub. Automate posting, engage with your audience, and integrate with the DeHub API.',
    heading: 'DeHub Agents',
    bodyHtml: `<p>DeHub Agents are configurable AI assistants that post on a schedule, reply to comments, moderate your community, curate feeds and report on growth. Start from a pre-built agent or build your own against the DeHub MCP server and API.</p>
<p>See <a href="${APP_URL}/connect">Connect</a> to wire DeHub into ChatGPT or Claude.</p>`,
  },
  'assistant': {
    title: 'AI Assistant — Chat, Generate Images & Video',
    description: "Chat with DeHub's AI assistant. Generate images, create videos, get web search results, and explore AI capabilities — all in one place.",
    heading: 'DeHub Assistant',
    bodyHtml: `<p>The DeHub Assistant is a chat interface into the whole Creator Studio. Ask it to draft a post, generate an image or video, translate captions, search the web or explain how DeHub tokens work — then publish the result without leaving the conversation.</p>`,
  },
  'creators': {
    title: 'Become a Creator',
    description: 'Apply to become a creator on DeHub — the open source, censorship resistant media platform.',
    heading: 'Become a DeHub Creator',
    bodyHtml: `<p>Apply for a creator account on DeHub and unlock uploads, monetization and the Creator Studio. Creators earn through pay-per-view, token-gated posts, tradable subscriptions, tips and ad-revenue sharing — all settled on-chain.</p>`,
  },
  'stake': {
    title: 'Stake tokens — Earn Rewards on DeHub',
    description: 'Stake tokens from the DeHub wallet to earn a share of a revenue-funded reward pool. Positions open and settle on-chain, with no lock-in.',
    heading: 'Stake tokens',
    bodyHtml: `<p>Staking puts a token balance to work inside DeHub. Positions are opened from the platform wallet, held on-chain, and rewards accrue from a pool funded by platform activity rather than by minting new supply.</p>
<h2>How staking works</h2>
<p>Choose an amount and confirm the transaction; the position then appears in your wallet. Rewards accumulate per epoch and can be claimed at any time, and unstaking returns the principal in full once the position closes.</p>
<h2>Rates are variable</h2>
<p>The rate depends on total staked supply and on platform revenue for the period. There is no fixed APY, no minimum return and no guarantee, and staking carries the ordinary risks of holding a volatile asset.</p>`,
  },
  'raffle': {
    title: 'Prize Draws — Win tokens, Hardware and NFTs on DeHub',
    description: 'DeHub prize draws hand out tokens, hardware and NFT prizes to the community. Entries are earned by taking part, and every winner is drawn on-chain.',
    heading: 'DeHub Prize Draws',
    bodyHtml: `<p>Prize draws are DeHub's recurring community raffles. Each draw opens with a stated prize, a stated closing time and a stated entry route, then picks its winner from the entry list on-chain, so the result can be checked by anyone.</p>
<h2>Earning entries</h2>
<p>Entries come from taking part rather than from paying to play. Posting, staking tokens, playing arcade titles and joining stages all count towards a draw when it names them. Some draws also accept a token ticket; where they do, the ticket price and the per-wallet cap are published with the draw.</p>
<h2>How a winner is picked</h2>
<p>When a draw closes the entry list is snapshotted and the winning index is drawn from an on-chain source of randomness. The transaction, the snapshot and the winning entry are published together, so nobody has to take the result on trust.</p>
<h2>Claiming a prize</h2>
<p>Winners are notified in-app and have 14 days to claim. Token prizes settle to the winner's DeHub wallet on Base; physical prizes are arranged with the team directly. Draws are void where local law prohibits them, and DeHub staff are not eligible.</p>`,
  },
  'jobs': {
    title: 'Careers — Join the DeHub Team',
    description: 'Join the team building the future of decentralized media. Explore open positions at DeHub and help shape Web3 social.',
    heading: 'Careers at DeHub',
    bodyHtml: `<p>DeHub is a small, distributed team building a decentralized creator network. Open roles span engineering, design, growth, community and moderation. If you care about Web3 and creator tools, we want to hear from you.</p>
<h2>How we work</h2>
<p>The whole product is open source, and the team works in the open too: changes ship through public pull requests, the roadmap is voted on by token holders through <a href="${APP_URL}/governance">governance</a>, and feature requests come from the people using the app. We are remote by default, across time zones, and we hire for people who can own a problem end to end rather than for a job title.</p>
<p>Engineering roles cover the web app, the Android and iOS apps, the API and the on-chain contracts. Design, growth and community roles work directly with creators on the network. Every role is paid, and part of the compensation can be taken in tokens for those who want it.</p>
<p>Looking for paid work rather than a role? See <a href="${APP_URL}/work">DeHub bounties</a> — scoped tasks with a budget attached, open to anyone, paid on delivery.</p>`,
  },

  // --- app surfaces that had no crawler copy at all --------------------------
  // Each of these is a real page with its own SEOHead in the SPA, so browsers
  // saw the right title and crawlers saw the homepage. Copy is taken from the
  // page's own SEOHead so the two variants cannot drift, per the rule the
  // /music, /jobs and /bridge divergence taught. `path` used to be set on the
  // three that lived only under /app; all three answer at the bare URL now, so
  // the default canonical (`/<key>`) is the right one and the overrides are out.
  'superpowers': {
    title: 'SuperPowers — Spend Your DeHub Badge on Reach',
    description: 'Badge holders get boosts every fortnight: twelve powers across thirteen tiers, with a larger allowance at every rung.',
    heading: 'DeHub SuperPowers',
    bodyHtml: `<p>A DeHub staking badge is not only the art beside your name. Each tier carries powers, and the first of them is reach: a boost that lifts one of your posts into the slot at the top of the home feed.</p>
<h2>Refilled, not bought</h2>
<p>Boosts arrive with the badge and refill every fortnight. They are earned by staking rather than sold, so the top of the feed cannot simply be paid for.</p>
<h2>Thirteen rungs</h2>
<p>Powers unlock one per tier across the thirteen badges, and higher rungs both hold more boosts and hold them for longer. See <a href="${APP_URL}/stake">staking</a> for how a badge is earned.</p>`,
  },
  'converter': {
    title: 'Converter — import a video to DeHub',
    description: 'Paste a link from YouTube, TikTok, Instagram, X, Twitch, Vimeo and more, and publish it as a DeHub post. The video is fetched, transcoded and posted to your feed with its title and thumbnail.',
    heading: 'Import a video',
    bodyHtml: `<p>Paste a link and DeHub fetches the video, transcodes it and publishes it as a post on your profile — title and thumbnail carried across.</p>
<h2>Twenty-one places to import from</h2>
<p>YouTube, TikTok, Instagram, X, Facebook, Twitch, Kick, Rumble, Vimeo, Dailymotion, Reddit, Bluesky, Odysee, Streamable, Loom, Tumblr, Pinterest, Snapchat, VK, Rutube and Bilibili.</p>
<h2>Your back catalogue, in one place</h2>
<p>Imports run in a queue, so a batch can be started and left alone. Each finished import becomes an ordinary DeHub post: it can be minted, tipped, fractionalised and monetised like anything else you upload.</p>
<p>Importing needs a DeHub account and applies to videos you have the right to publish.</p>`,
  },
  'migrate-youtube': {
    title: 'Migrate all — bring a whole profile to DeHub',
    description: 'Bulk-import a whole channel or profile to DeHub in one batch — YouTube, TikTok, Vimeo, SoundCloud and more. Pick what to bring, edit the titles, pay once.',
    heading: 'Bring a whole profile over',
    bodyHtml: `<p>Paste a channel or profile address and DeHub lists its public uploads. Choose what to bring across, retitle anything you want to read differently, and pay once for the batch — then close the tab while it runs.</p>
<h2>One payment, not one per video</h2>
<p>The whole batch is priced before it starts and every video is cheaper than the one before it. Anything already on your profile is skipped and never charged twice, and a video that cannot be imported has its share credited back toward the next migration.</p>
<h2>Edit before it publishes</h2>
<p>Each video in the picker carries its own title and description, so a back catalogue does not have to arrive worded the way another platform worded it. What you review is what publishes, hours later, when the job reaches it.</p>
<h2>Not just YouTube</h2>
<p>The same batch importer reads TikTok, Vimeo, SoundCloud, Dailymotion, Rumble and the rest of the sources behind the <a href="${APP_URL}/converter">single-video converter</a>.</p>
<p>Migrating needs a DeHub account and applies to videos you have the right to publish.</p>`,
  },
  'launchpad': {
    // The page ships `noindex` in its own SEOHead; the crawler variant has to
    // say the same thing or the two describe the same URL differently.
    noindex: true,
    title: 'Launchpad — DeHub',
    description: 'Tokenise a business on the DeHub launchpad: browse live coins or create your own.',
    heading: 'DeHub Launchpad',
    bodyHtml: `<p>The launchpad is where a business, project or creator issues a coin on DeHub. Live launches are listed with their activity, and creating one runs from the same page.</p>
<p>Coins are speculative assets and can lose their value entirely. Nothing here is investment advice.</p>`,
  },
  'stats': {
    title: 'Live Site Stats — DeHub Visitors and Members in Real Time',
    description: "Live numbers for dehub.io: visitors measured at Cloudflare's edge, and DeHub's own member counts — total members, daily, weekly and monthly active users, new signups and growth, published straight from the platform database.",
    heading: 'DeHub Live Stats',
    bodyHtml: `<p>Visitor numbers come from Cloudflare's own analytics for this zone, counted at the edge before a request reaches the app. They are not a client-side counter the page could inflate, and they are not a number anyone typed.</p>
<h2>Members as well as traffic</h2>
<p>Alongside traffic the page publishes DeHub's own community figures — total members, daily, weekly and monthly active users, new signups and growth — read straight from the platform database.</p>`,
  },
  'accounts': {
    title: 'Account Marketplace — DeHub',
    description: 'Buy and sell established DeHub accounts for tokens. Browse accounts by followers, uploads and age — the handle, posts, followers and badge entitlements all transfer, and payment goes straight to the seller.',
    heading: 'DeHub Account Marketplace',
    bodyHtml: `<p>An established DeHub account can be sold whole. Listings are browsable by follower count, uploads and account age, and what transfers is everything the account is: the handle, the posts, the followers and the badge entitlements.</p>
<h2>Settled on-chain</h2>
<p>Payment is in tokens and goes straight to the seller — DeHub does not hold the funds. See the <a href="${APP_URL}/usernames">username market</a> for selling a handle alone rather than a whole account.</p>`,
  },
  'fractions': {
    title: 'Fractions | DeHub',
    description: 'Buy and sell fractions of DeHub posts. A minted post is 1000 on-chain fractions — own a slice of a video, track, or image and trade it in tokens.',
    heading: 'DeHub Fractions',
    bodyHtml: `<p>Every DeHub upload is divisible into 1000 on-chain fractions. A creator can sell part of a post and keep the rest, and anyone else can buy a slice of a video, track or image and hold it like any other asset.</p>
<h2>An open order book</h2>
<p>Fractions trade in tokens against open orders, so a holder can exit without asking the creator's permission and a buyer can build a position over time.</p>
<p>Fractions are speculative and their value can fall to nothing. Nothing here is investment advice.</p>`,
  },
  'stores': {
    title: 'Stores | DeHub',
    description: 'Browse and sell items on the DeHub peer-to-peer marketplace. Trade digital goods, merch, art, and services using tokens.',
    heading: 'DeHub Stores',
    bodyHtml: `<p>Stores are creator-run shops on DeHub. Anyone can open one and list digital goods, merch, art or services, priced in tokens and paid peer to peer.</p>
<h2>The shop is part of the profile</h2>
<p>A store sits beside the creator's posts rather than off on another site, so the audience that already follows the work is the audience that sees what is for sale.</p>`,
  },
  'events': {
    // EventsPage ships `noindex`; the crawler variant matches it.
    noindex: true,
    title: 'Events — Meetups & Community Events on DeHub',
    description: 'Browse upcoming DeHub community events, RSVP to meetups and host your own events on the decentralized, user-owned social platform.',
    heading: 'DeHub Events',
    bodyHtml: `<p>Events are community meetups, AMAs and calls listed on DeHub. Browse what is coming up, RSVP to anything open, and host your own — each event gets its own page and share card.</p>`,
  },
};

function buildMarketingHtml(key, meta) {
  // `path` for the pages that live only under /app: `/${key}` would name a URL
  // the router has no route for, and a canonical pointing at a page that does
  // not exist is worse than none.
  const canonicalUrl = `${APP_URL}${meta.path || `/${key}`}`;
  // Pages the SPA marks noindex in their own SEOHead must say the same here,
  // or bot and browser describe one URL two different ways. The card still
  // matters: a noindexed page is still pasted into chats.
  const robots = meta.noindex ? '<meta name="robots" content="noindex, follow">\n' : '';
  // A page whose subject is a *thing* rather than a document can name its own
  // schema type (`meta.jsonLdType` + `jsonLdExtra`); everything else stays a
  // plain WebPage. Must mirror the type the SPA writes for the same route, or
  // the two UA variants describe the same URL as two different entities.
  // Never a SoftwareApplication/WebApplication/MobileApplication: Google
  // reports those as invalid without a rating or review, and none of these
  // pages has one to give (see arcadeGameLd for VideoGame).
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': meta.jsonLdType || 'WebPage',
    name: meta.title,
    description: meta.description,
    url: canonicalUrl,
    ...(meta.jsonLdExtra || {}),
    isPartOf: { '@type': 'WebSite', name: 'DeHub', url: APP_URL },
    publisher: ORG_JSONLD,
  };
  // Home › [parent section] › page. `arcade/gods-eye` sits under the arcade,
  // `connect/claude` under /connect; a parent with no page of its own is
  // skipped rather than linked to a URL that has nothing at it.
  const shortName = (m) => m.heading.split(' — ')[0];
  const parentKey = key.includes('/') ? key.slice(0, key.lastIndexOf('/')) : '';
  const parent = parentKey && Object.hasOwn(MARKETING_PAGES, parentKey) ? MARKETING_PAGES[parentKey] : null;
  const trail = [
    HOME_CRUMB,
    ...(parent ? [{ name: shortName(parent), url: `${APP_URL}${parent.path || `/${parentKey}`}` }] : []),
    { name: shortName(meta), url: canonicalUrl },
  ];
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escHtml(meta.title)}</title>
<meta name="description" content="${escHtml(meta.description)}">
${robots}<link rel="canonical" href="${canonicalUrl}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="DeHub">
${ogLocaleTag()}
<meta property="og:url" content="${canonicalUrl}">
<meta property="og:title" content="${escHtml(meta.title)}">
<meta property="og:description" content="${escHtml(meta.description)}">
${twitterTextTags(meta.title, meta.description)}
${shareMetaTags(key, meta.title)}
<meta name="twitter:site" content="@dehub_official">
<script type="application/ld+json">${jsonLdScript(jsonLd)}</script>
${breadcrumbScript(trail)}
</head>
<body>
<p><a href="${APP_URL}/">DeHub</a> › ${escHtml(meta.heading)}</p>
<h1>${escHtml(meta.heading)}</h1>
<!--hl-body-->${meta.bodyHtml || `<p>${escHtml(meta.description)}</p>`}<!--/hl-body-->
${primaryNavHtml()}
<p style="margin-top:24px"><a class="dh-cta" href="${appHref(canonicalUrl)}" rel="nofollow">Open ${escHtml(meta.heading)} on DeHub</a></p>
</body>
</html>`;
}

// ==========================================================================
// Stores, shop items and events — edge-rendered crawler HTML
// ==========================================================================
// These three route families used to fall straight through to the SPA, so a
// shop item posted to X, WhatsApp or Telegram unfurled as the DeHub homepage:
// same title, same description, same generic card for every item in every
// store. They are rendered here rather than added to the ssr-seo function
// because the function only moves on a manual `supabase functions deploy`
// that nobody runs, while this worker ships with the Cloudflare build.
//
// The data comes straight from PostgREST with the publishable anon key (the
// same values that ship in the browser bundle). All three tables are readable
// by `anon` — `stores`, `store_listings` and `community_events` each carry a
// SELECT policy with a `true` predicate — so no privileged key is involved and
// a crawler sees exactly what a signed-out visitor would.
const SUPABASE_REST_BASE = 'https://aigxuutjaqsywioxjefr.supabase.co/rest/v1';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpZ3h1dXRqYXFzeXdpb3hqZWZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MzY0MzIsImV4cCI6MjA4MzIxMjQzMn0.hjMx0kShuJlaZ26UoG7RFGu3OC_aLR0C1Sf1qdk3x0I';

/** Every row of a PostgREST select, or null. Never throws. */
let shareBadgePrice;
async function fetchShareBadgePrice() {
  if (shareBadgePrice && shareBadgePrice.expires > Date.now()) return shareBadgePrice.value;
  const response = await fetch(`${SUPABASE_FN_BASE}/get-dhb-price`, {
    signal: AbortSignal.timeout(3000), redirect: 'manual', headers: { apikey: SUPABASE_ANON_KEY },
  });
  if (!response.ok) return null;
  const value = await response.json();
  shareBadgePrice = { value, expires: Date.now() + 300000 };
  return value;
}

async function supabaseRows(query) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(`${SUPABASE_REST_BASE}/${query}`, {
      signal: controller.signal,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Accept: 'application/json',
      },
    });
    if (!res.ok) return null;
    const rows = await res.json();
    return Array.isArray(rows) ? rows : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * First row of a PostgREST select, `null` when the select matched nothing, or
 * `undefined` when PostgREST could not be read (error status, timeout, bad
 * JSON). Never throws.
 *
 * The two misses mean opposite things to a crawler: no row is a real 404, an
 * unreadable table is "try again later". Callers that only care whether they
 * got a row can keep treating both as falsy.
 */
async function supabaseLookup(query) {
  const rows = await supabaseRows(query);
  if (rows === null) return undefined;
  return rows[0] || null;
}

/** First row of a PostgREST select, or null. Never throws. */
async function supabaseRow(query) {
  const controller = new AbortController();
  // Short: a crawler that waits is a crawler that gives up and re-queues the
  // scrape hours later. Missing the row costs the generic card, not the page.
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(`${SUPABASE_REST_BASE}/${query}`, {
      signal: controller.signal,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Accept: 'application/json',
      },
    });
    if (!res.ok) return null;
    const rows = await res.json();
    return Array.isArray(rows) ? rows[0] || null : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * og:image for an entity that has a picture of its own.
 *
 * A store banner or a photo of a jacket is whatever shape the seller uploaded,
 * so its size can only be declared once it has been made 1200x630: pictures
 * on the CDN or in Supabase storage go through the image transform
 * (shareCardImage) and are declared at that size. Anything else — a token
 * logo on somebody's own host — goes out undeclared, because claiming
 * 1200x630 for a square photo gets it letterboxed or cropped by the scraper.
 */
function entityImageMetaTags(imageUrl, alt) {
  if (!imageUrl) return shareMetaTags('fallback', alt);
  const card = shareCardImage(imageUrl);
  const img = escHtml(card || imageUrl);
  const size = card
    ? `\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">`
    : '';
  return `<meta property="og:image" content="${img}">${size}
<meta property="og:image:alt" content="${escHtml(alt)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${img}">`;
}

/**
 * `noindex` is not the same as "do not render". A private event or a sold item
 * still needs its OG tags, because somebody deliberately sharing that link into
 * a group chat should see what they shared — it is the search index it does not
 * belong in.
 */
function entityHtml({ canonicalUrl, title, description, image, jsonLd, breadcrumb, heading, bodyHtml, ogType = 'website', noindex = false }) {
  // Every title here is `${name} — DeHub <section>` with `name` straight out
  // of a user-editable column, so it inherits that column's newlines and
  // length. Callers already cap the description; capping both in one place is
  // what makes that true of the next renderer too. The looser title cap is on
  // purpose — these end in a brand suffix, and cutting at TITLE_MAX would eat
  // the suffix rather than the name, which reads worse than a title Google
  // truncates for itself. It exists to catch the pathological case only.
  title = truncate(title, ENTITY_TITLE_MAX);
  description = truncate(description, DESCRIPTION_MAX);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escHtml(title)}</title>
<meta name="description" content="${escHtml(description)}">
${noindex ? '<meta name="robots" content="noindex, follow">' : ''}
<link rel="canonical" href="${escHtml(canonicalUrl)}">
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="DeHub">
${ogLocaleTag()}
<meta property="og:url" content="${escHtml(canonicalUrl)}">
<meta property="og:title" content="${escHtml(title)}">
<meta property="og:description" content="${escHtml(description)}">
${twitterTextTags(title, description)}
${entityImageMetaTags(image, title)}
<meta name="twitter:site" content="@dehub_official">
<script type="application/ld+json">${jsonLdScript(jsonLd)}</script>
${breadcrumbScript([...crumbsFromHtml(breadcrumb), { name: truncate(heading, 110), url: canonicalUrl }])}
</head>
<body>
<p>${breadcrumb}</p>
<h1>${escHtml(heading)}</h1>
${image ? `<img src="${escHtml(image)}" alt="${escHtml(heading)}" style="max-width:100%">` : ''}
${bodyHtml}
<p style="margin-top:24px"><a class="dh-cta" href="${escHtml(appHref(canonicalUrl))}" rel="nofollow">Open on DeHub</a></p>
</body>
</html>`;
}

function truncate(text, max) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * truncate() for text a person reads as a headline: cut at the last word
 * boundary that fits, never inside a word, and never leave a separator
 * hanging off the end. A single unbroken token longer than a third of the
 * room is cut where it stands — dropping it would leave next to nothing.
 */
function clipAtWord(text, max) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const room = t.slice(0, max - 1);
  // `room` may already end exactly on a word; only back off when it does not.
  const space = t[room.length] === ' ' ? room.length : room.lastIndexOf(' ');
  const cut = space > max / 3 ? room.slice(0, space) : room;
  return `${cut.replace(/[\s|—–\-:·,;&]+$/u, '')}…`;
}

/** A closing ` | DeHub`, ` — DeHub Guide`, ` - DeHub Docs`, ` | DeHub 2025 Roadmap` clause. */
const BRAND_SUFFIX = /\s+[|—–-]\s+[^|—–]*\bDeHub\b[^|—–]*$/;

/**
 * Fit a <title> into `max` characters the way a person would shorten it.
 *
 * Titles here are written to rank and most end in a brand clause, so the old
 * mid-word cut ate the suffix first and left the fragment on screen: the
 * 2026-09-29 crawl found ~45 of 126 blog titles ending `| De…`, `| DeHub
 * 2025…` or `Pla…`. The brand clause is the cheapest thing to lose — the
 * result already says dehub.io — so it goes first; only a title still too
 * long without it is cut, at a word boundary.
 */
function clampTitle(text, max) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const bare = t.replace(BRAND_SUFFIX, '');
  if (bare && bare.length <= max) return bare;
  return clipAtWord(bare || t, max);
}

/** Longest <title> Google will render before it writes its own. Applied to
 *  post text, which is a snippet with no brand suffix to protect. */
const TITLE_MAX = 70;
/** Guard for `${name} — DeHub <section>` titles: pathological lengths only. */
const ENTITY_TITLE_MAX = 110;
/** Matches the cap the entity renderers below already pass to truncate(). */
const DESCRIPTION_MAX = 200;

/**
 * Whitespace-collapse and cap a string the deployed ssr-seo fn already escaped.
 *
 * That fn escapes exactly `"`, `<` and `>` and nothing else, so decoding those
 * three, truncating, then re-escaping them is lossless — and it is the only way
 * to cut safely, since slicing the escaped form can land inside a `&quot;` and
 * emit `&qu…`.
 */
function reclamp(escaped, max, cut = truncate) {
  const plain = String(escaped)
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
  return cut(plain, max)
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * The deployed fn interpolates raw post text and profile bios straight into
 * <title> and the meta content attributes, with no whitespace collapsing and
 * no length cap. A post has no title of its own, so its body text *is* the
 * title there: /app/post/3809 shipped 137 characters of a multi-paragraph
 * Turkish post as its <title>, /app/post/4676 shipped four lines of hashtags,
 * and bios ran to ~300 characters in the description. Embedded newlines in an
 * attribute value are legal but every consumer renders them differently.
 *
 * Repairing it here rather than in the fn is deliberate: that fn only moves on
 * a manual `supabase functions deploy` nobody runs, so every other correction
 * in this proxy branch is a rewrite too.
 */
function normalizeProxiedMeta(html) {
  return html
    .replace(/(<title>)([^<]*)(<\/title>)/i, (m, a, v, b) => `${a}${reclamp(v, TITLE_MAX, clampTitle)}${b}`)
    .replace(
      /(<meta (?:property|name)="(?:og:title|twitter:title|og:image:alt|twitter:image:alt)" content=")([^"]*)(">)/g,
      (m, a, v, b) => `${a}${reclamp(v, TITLE_MAX, clampTitle)}${b}`,
    )
    .replace(
      /(<meta (?:property|name)="(?:description|og:description|twitter:description)" content=")([^"]*)(">)/g,
      (m, a, v, b) => `${a}${reclamp(v, DESCRIPTION_MAX)}${b}`,
    );
}

/**
 * The deployed fn describes a post with its body text and a profile with its
 * bio — sound, except that neither is required. A post with no body (every
 * plain video upload, most photo posts) gets
 * `Post by <author> on DeHub — join the decentralized creator network.`, so
 * one account's whole back-catalogue carries an identical description: the
 * 2026-09-02 sitemap crawl found 128 of 400 posts sharing theirs, 33 of them
 * one author's. A profile with no bio gets `Connect with <name> on DeHub…`,
 * which collides whenever two accounts share a display name, and a
 * five-character bio ("DHB ❤") ships as the whole description.
 *
 * These rewrite that templated copy into something specific to the page —
 * the post's own title, format, author and topics; the profile's handle —
 * and leave a real body or a real bio alone. Same deploy-track reasoning as
 * normalizeProxiedMeta above: the fn does not move, so the fix is a rewrite.
 * Pure string functions, tested in src/test/proxied-meta-enrichment.test.ts.
 */
const POST_DESCRIPTION_TEMPLATE = /Post by (.+?) on DeHub — join the decentralized creator network\./;
const PROFILE_DESCRIPTION_TEMPLATE = /Connect with (.+?) on DeHub, the open source alternative to legacy media\./;
/** A bio shorter than this says nothing about the page on its own. */
const PROFILE_DESCRIPTION_MIN = 40;
/** What the composer stores for an upload with no caption. */
const UNTITLED_POST_TITLES = new Set(['', 'untitled']);

/**
 * A title that identifies nothing.
 *
 * `UNTITLED_POST_TITLES` only ever caught the two strings the composer writes
 * itself, but a caption the *phone* wrote is no better: a census of all 3,256
 * sitemap posts on 2026-09-13 found 368 whose whole `<title>` and `<h1>` was a
 * camera filename (`VID-20220824-WA0031.mp4`, `trim.5576BE10-….MOV`), an emoji
 * reaction (`😂`, `👑`), a placeholder (`test`), or one or two characters. Those
 * are indexed exactly as written, and they collide with every sibling doing the
 * same — `test` alone was 24 posts.
 *
 * Deliberately narrow. A short title someone actually chose is left to the
 * suffix path below; only a string that could describe any post at all is
 * replaced outright.
 */
const FILENAME_TITLE = /(?:\.(?:mp4|mov|m4v|avi|webm|mkv|jpe?g|png|gif|heic|webp|mp3|wav|m4a)$)|^(?:vid|img|pxl|trim|dsc|gopr|screenshot|whatsapp|snapchat)[-_. ]?\d/i;
// Only strings that express no intent at all. `Hello` and `Hi` are greetings
// somebody chose to type — they collide, but the suffix path disambiguates
// them without throwing away what was written.
const PLACEHOLDER_TITLE = /^(?:test|testing|asdf|a+|untitled|new post|post|abc|123|\.+)$/i;
function titleSaysNothing(title) {
  const t = String(title || '').trim();
  if (UNTITLED_POST_TITLES.has(t.toLowerCase())) return true;
  if (FILENAME_TITLE.test(t) || PLACEHOLDER_TITLE.test(t)) return true;
  // Emoji and punctuation carry no query a crawler can match.
  const letters = t.replace(/[^\p{L}\p{N}]/gu, '');
  return letters.length < 3;
}

/** What the deployed fn titles a post that has no title of its own. */
const FN_FALLBACK_TITLE = /^Post #\d+ by .+ on DeHub$/;
/** A caption standing in for a title: long enough to say what the post is. */
const POST_CAPTION_TITLE_MAX = 60;

/**
 * A post's caption, when it has one worth titling the page with. The record
 * is the source; without one, the fn's meta description is the caption
 * unless it is the fn's per-author template. Links are dropped (a URL is
 * not a title) and a caption that is itself only emoji or a filename counts
 * as none.
 */
function postCaption(html, nft, templated) {
  let text = nft && typeof nft.description === 'string' ? nft.description : '';
  if (!text && !nft && !templated) {
    const meta = html.match(/<meta name="description" content="([^"]*)">/);
    text = meta ? decodeFnText(meta[1]) : '';
  }
  text = text.replace(/https?:\/\/\S+/g, ' ').replace(/\s+/g, ' ').trim();
  return titleSaysNothing(text) ? '' : text;
}

/** The fn escapes exactly `"`, `<`, `>` in attributes and JSON.stringifies
 *  its JSON-LD; both decode to the same plain text. */
function decodeFnText(s) {
  return String(s || '')
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

function escFnAttr(s) {
  return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escJsonText(s) {
  return JSON.stringify(String(s)).slice(1, -1);
}

/** [noun, verb] for a post's format; the og:video sniff covers a missing record. */
function postKind(nft, html) {
  const type = String((nft && nft.postType) || '').toLowerCase();
  if (type === 'video' || type === 'feed-video') return ['video', 'Watch'];
  if (type === 'feed-audio') return ['audio post', 'Listen to'];
  if (type === 'feed-images' || type === 'feed-image') return ['photo post', 'See'];
  if (type) return ['post', 'Read'];
  return /property="og:video"/.test(html) ? ['video', 'Watch'] : ['post', 'Read'];
}

/**
 * The author, from wherever this page happens to carry one.
 *
 * The description template is the cheapest source but only a bodyless post has
 * one, and the title work below runs on every post. `nft` is the record the
 * post branch already fetched; the JSON-LD is the last resort.
 */
function postAuthor(html, nft, templated) {
  const fromTemplate = templated ? decodeFnText(templated[1]).replace(/\s+/g, ' ').trim() : '';
  if (fromTemplate) return fromTemplate;
  // nft_info names its author minterDisplayName / mintername; the feed rows
  // and older fixtures use displayName / username.
  const fromRecord = String(
    (nft && (nft.minterDisplayName || nft.displayName || nft.mintername || nft.username)) || '',
  ).replace(/\s+/g, ' ').trim();
  if (fromRecord) return fromRecord;
  const ld = html.match(/"author":\{"@type":"Person","name":"((?:[^"\\]|\\.)*)"/);
  return ld ? decodeFnText(ld[1]).replace(/\s+/g, ' ').trim() : '';
}

/**
 * Swap a post's title everywhere the fn wrote it.
 *
 * Nine places, and they have to move together or the tab, the share card, the
 * heading and the structured data describe one page four different ways. The
 * `<h1>` and the image `alt` are in that list: they were missed when only the
 * "Untitled" case was handled, so a retitled page still shouted the filename at
 * the top of its own body.
 */
function replacePostTitle(html, oldTitle, newTitle) {
  const attr = escFnAttr(newTitle);
  let out = html
    .replace(/(<title>)[^<]*(<\/title>)/i, (m, a, b) => `${a}${attr}${b}`)
    .replace(
      /(<meta (?:property|name)="(?:og:title|twitter:title|og:image:alt|twitter:image:alt)" content=")[^"]*(">)/g,
      (m, a, b) => `${a}${attr}${b}`,
    )
    .replace(/(<h1[^>]*>)[^<]*(<\/h1>)/i, (m, a, b) => `${a}${attr}${b}`);
  const oldAttr = escFnAttr(oldTitle);
  if (oldAttr) out = out.split(` alt="${oldAttr}"`).join(` alt="${attr}"`);
  const oldJson = escJsonText(oldTitle);
  const newJson = escJsonText(newTitle);
  out = out.split(`"headline":"${oldJson}"`).join(`"headline":"${newJson}"`);
  if (oldJson) {
    // `"name"` is the VideoObject's title, and also the Person's name in the
    // author node. A post titled with its author's own name — seven posts are
    // called `DeHub` — would otherwise get its author renamed to the branded
    // title. Skip the one that follows a Person type.
    const needle = `"name":"${oldJson}"`;
    out = out
      .split(needle)
      .reduce((acc, part, i) =>
        i === 0 ? part : `${acc}${acc.endsWith('"@type":"Person",') ? needle : `"name":"${newJson}"`}${part}`);
  }
  return out;
}

function enrichPostMeta(html, postId, nft) {
  const templated = html.match(POST_DESCRIPTION_TEMPLATE);
  // Two different things. `authorName` is empty when the page genuinely does
  // not say who wrote it, and a title must never claim otherwise — `Stream —
  // a post by someone on DeHub` is three identical titles again, with a lie
  // added. `author` keeps the old wording for the description, where the
  // template being present guarantees a real name anyway.
  const authorName = postAuthor(html, nft, templated);
  const author = authorName || 'someone';
  const titleTag = html.match(/<title>([^<]*)<\/title>/i);
  const title = decodeFnText(titleTag ? titleTag[1] : '').replace(/\s+/g, ' ').trim();
  const [kind, verb] = postKind(nft, html);
  const topics = (Array.isArray(nft && nft.category) ? nft.category : [])
    .map((c) => String(c || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 5);
  // The fn's own stand-in for a post with no title — `Post #3419 by Sultan on
  // DeHub` — is a title that says nothing too, it just has letters in it. When
  // either kind sits on a post that does carry a caption, the caption's
  // opening words are the better title: /app/post/3419 has 140 characters
  // about a watercolour of a Royal Haveli and was indexed as a post number.
  const placeholder = titleSaysNothing(title) || FN_FALLBACK_TITLE.test(title);
  const caption = placeholder ? postCaption(html, nft, templated) : '';
  const chosen = caption ? clipAtWord(caption, POST_CAPTION_TITLE_MAX) : title;
  const untitled = placeholder && !caption;
  let out = html;

  if (untitled) {
    // A caption the composer or the phone wrote, not one anybody chose, so
    // three of those from one account are three identical <title>s. The fn's
    // own fallback shape, with the id keeping siblings apart.
    const named = `${kind.charAt(0).toUpperCase()}${kind.slice(1)} #${postId}`;
    out = replacePostTitle(out, title, authorName ? `${named} by ${authorName} on DeHub` : `${named} on DeHub`);
  } else if (authorName) {
    // A real but short title — `Fun`, `stream`, `DeHub` — is a weak result on
    // its own and collides with everyone else who typed it: `stream` was 30
    // posts, `Promote DeHub` 14. Name the author and the format rather than
    // discard what they wrote. Longer titles are distinctive already and are
    // left exactly as they are, which is also what keeps this inside
    // TITLE_MAX: the suffix is only applied when the result still fits, and
    // the shorter form is tried before giving up.
    const article = `a${/^[aeiou]/i.test(kind) ? 'n' : ''} ${kind}`;
    const suffixed = [`${chosen} — ${article} by ${authorName} on DeHub`, `${chosen} — ${authorName} on DeHub`].find(
      (candidate) => candidate.length <= TITLE_MAX,
    );
    // A title that already carries the brand needs no branding, and one that
    // already has an em-dash clause reads badly with a second one bolted on
    // (`A — B — davyJones on DeHub`). Both are distinctive enough as they are.
    const alreadyShaped = /\bon DeHub\b/i.test(chosen) || chosen.includes(' — ');
    const next = suffixed && !alreadyShaped ? suffixed : chosen;
    if (next !== title) out = replacePostTitle(out, title, next);
  } else if (chosen !== title) {
    out = replacePostTitle(out, title, chosen);
  }

  // The description rewrite below only has something to rewrite when the fn
  // fell back to its per-author template, i.e. the post carries no body text.
  // A real body is better copy than anything built here, so it is left alone.
  if (!templated) return out;

  const lead = untitled
    ? `${verb} ${kind} #${postId} by ${author} on DeHub`
    : `${verb} "${chosen}" — a${/^[aeiou]/i.test(kind) ? 'n' : ''} ${kind} by ${author} on DeHub`;
  const topicsText = topics.length ? ` Topics: ${topics.join(', ')}.` : '';
  const description = truncate(`${lead}, the open source, user-owned social network.${topicsText}`, DESCRIPTION_MAX);
  const attrDesc = escFnAttr(description);
  const jsonDesc = escJsonText(description);
  return out
    .replace(
      /(content=")Post by .+? on DeHub — join the decentralized creator network\.(")/g,
      (m, a, b) => `${a}${attrDesc}${b}`,
    )
    .replace(
      /("description":")Post by .+? on DeHub — join the decentralized creator network\.(")/g,
      (m, a, b) => `${a}${jsonDesc}${b}`,
    )
    // The fn writes that same sentence a third time, as the page's only
    // paragraph, and the two rewrites above are both attribute-scoped — so the
    // meta was specific while the prose a crawler actually reads stayed
    // identical across every bodyless post. 6 of 20 sampled posts carried it on
    // 2026-09-16, which matches the 32% the description census found, and those
    // are the same pages sitting in "Crawled - currently not indexed".
    .replace(
      /(<p>)Post by .+? on DeHub — join the decentralized creator network\.(<\/p>)/g,
      (m, a, b) => `${a}${attrDesc}${b}`,
    );
}

/**
 * `Display Name (@handle) on DeHub` in place of the handle-only title.
 *
 * The title rewrite in the proxy branch turns the fn's CTA into `@handle on
 * DeHub — posts, videos & profile`, which never contains the name people
 * actually search for: /c0chraniz3r is Jesse Cochran, and nothing on the
 * page's title, heading or card said so. The name comes off the fn's own
 * Person JSON-LD, or the account record when the caller has it. A name that
 * is just the handle again adds nothing and the old title stays.
 */
function profileTitle(html, handle, displayName) {
  const ld = html.match(/"@type":"Person","name":"((?:[^"\\]|\\.)*)"/);
  const name = String(displayName || (ld ? decodeFnText(ld[1]) : '')).replace(/\s+/g, ' ').trim();
  if (!name || name.replace(/^@/, '').toLowerCase() === handle.toLowerCase()) return html;
  const title = escFnAttr(clampTitle(`${name} (@${handle}) on DeHub`, TITLE_MAX));
  const current = new RegExp(`@${handle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} on DeHub — posts, videos &amp; profile`, 'gi');
  return html.replace(current, title);
}

function enrichProfileMeta(html, username, displayName) {
  const handle = String(username || '').replace(/^@/, '').trim();
  if (!handle) return html;
  html = profileTitle(html, handle, displayName);
  const templated = html.match(PROFILE_DESCRIPTION_TEMPLATE);
  let description;
  if (templated) {
    const name = decodeFnText(templated[1]).replace(/\s+/g, ' ').trim();
    const who = name && name.toLowerCase() !== handle.toLowerCase() ? `${name} (@${handle})` : `@${handle}`;
    description = `Connect with ${who} on DeHub — posts, videos, music and live streams on the open source, user-owned social network.`;
  } else {
    const current = html.match(/<meta name="description" content="([^"]*)">/);
    if (!current) return html;
    const bio = decodeFnText(current[1]).replace(/\s+/g, ' ').trim();
    if (bio.length >= PROFILE_DESCRIPTION_MIN) return html;
    description = bio
      ? `${bio} — @${handle} on DeHub, the open source, user-owned social network.`
      : `@${handle} on DeHub — posts, videos, music and live streams on the open source, user-owned social network.`;
  }
  const attr = escFnAttr(truncate(description, DESCRIPTION_MAX));
  const out = html.replace(
    /(<meta (?:property|name)="(?:description|og:description|twitter:description)" content=")[^"]*(">)/g,
    (m, a, b) => `${a}${attr}${b}`,
  );
  // Same attribute-only blind spot as enrichPostMeta: the fn also writes the
  // template into the body, where it was the whole of the page's prose on every
  // bio-less profile. Only the template is replaced — a bio someone wrote is
  // their own words and stays, even when it is short enough for the meta above
  // to have padded it.
  if (!templated) return out;
  return out.replace(
    /(<p>)Connect with .+? on DeHub, the open source alternative to legacy media\.(<\/p>)/g,
    (m, a, b) => `${a}${attr}${b}`,
  );
}

/** The post record behind /app/post/<tokenId>, for the two fields the fn's
 *  HTML does not carry (format, topics). Null on any failure — the rewrite
 *  still runs on what the HTML holds. */
/**
 * Content for the crawler pages, read from the same public API the app uses.
 *
 * The 2026-09-13 Googlebot crawl found every profile, post and bounty page
 * under 200 words — 3,683 of 3,861 sitemap URLs, median 66 — and the six
 * category pages at 73–99. A crawler page was the title, the caption and the
 * nav; nothing else on it existed for Google to read. These put the page's
 * own substance into the HTML: the latest posts on a feed page, a creator's
 * recent posts on their profile, the comments and the author's other work on
 * a post. Every fetch is bounded and fails to an empty string, so a slow API
 * costs the section, never the page. Pure string functions below the fetch,
 * tested in src/test/crawler-page-content.test.ts.
 */
/**
 * Localised crawler pages — ?hl=<code> — and the hreflang cluster that ties
 * each one to its siblings.
 *
 * ?hl= rather than a path prefix because four locale codes — de, ha, no, uk
 * — are registered usernames whose profiles live at /de, /ha, /no and /uk.
 * A query parameter is a distinct URL to a crawler, cannot collide with a
 * route, and needs nothing changed in the router.
 *
 * A language is served only where the page is translated through and
 * through: title, description, heading AND body. The first version sent 17
 * routes out in 44–83 languages with the body left in English — about 1,100
 * URLs Google reads as English duplicates (it detects language from the
 * visible text, not from lang= or hreflang), 95 of them with a "translated"
 * title identical to the English one. public/seo-i18n.json
 * (scripts/build-seo-i18n.mjs) now carries only the languages real visitors
 * use, each with a body; any other ?hl= is not a page and 301s to the bare
 * URL. ?hl=en is the bare page and redirects to it too.
 */
let seoI18nPromise = null;
function seoI18nTable(env, requestUrl) {
  if (!seoI18nPromise) {
    seoI18nPromise = env.ASSETS.fetch(new URL('/seo-i18n.json', requestUrl), { headers: { Accept: 'application/json' } })
      .then((res) => (res.ok ? res.json() : {}))
      .catch(() => {
        seoI18nPromise = null;
        return {};
      });
  }
  return seoI18nPromise;
}

/** The hl the request asked for, or '' — two lowercase letters, nothing else. */
function requestedLocale(url) {
  const raw = String(url.searchParams.get('hl') || '').toLowerCase();
  return /^[a-z]{2}$/.test(raw) ? raw : '';
}

function localizedUrl(route, lang) {
  return lang && lang !== 'en' ? `${APP_URL}${route}?hl=${lang}` : `${APP_URL}${route}`;
}

/**
 * The languages besides English a route is really served in: a title that is
 * not the English one, and a translated body to go under it. Anything short
 * of that is the English page again under another URL.
 */
function servedLocales(route, table) {
  const langs = (table && table[route]) || {};
  const en = langs.en;
  return Object.keys(langs)
    .filter((l) => {
      const t = langs[l];
      return l !== 'en' && /^[a-z]{2}$/.test(l) && t && t.title && t.body && (!en || t.title !== en.title);
    })
    .sort();
}

/** One <link rel="alternate"> per served language, English as the bare URL, plus x-default. */
function hreflangLinks(route, table) {
  const langs = servedLocales(route, table);
  if (!langs.length) return '';
  return [...langs, 'en']
    .sort()
    .map((l) => `<link rel="alternate" hreflang="${l}" href="${localizedUrl(route, l)}">`)
    .concat(`<link rel="alternate" hreflang="x-default" href="${localizedUrl(route, 'en')}">`)
    .join('\n');
}

/**
 * Where a crawler asking for ?hl= goes instead, or null when the request is
 * for a page that exists. hl=en, a language the route is not served in,
 * anything that is not a language code, and every ?hl= on a noindex page all
 * land on the bare URL — the one page they would otherwise duplicate.
 */
function unservedLocaleRedirect(url, route, table, noindex) {
  if (!url.searchParams.has('hl')) return null;
  const hl = requestedLocale(url);
  if (hl && !noindex && servedLocales(route, table).includes(hl)) return null;
  return localizedUrl(route, 'en');
}

/** og:locale values, in the territory form Facebook's own locale list uses. */
const OG_LOCALES = { en: 'en_US', ar: 'ar_AR', es: 'es_ES', fr: 'fr_FR', nl: 'nl_NL', tr: 'tr_TR' };
function ogLocale(lang) {
  return OG_LOCALES[lang] || `${lang}_${lang.toUpperCase()}`;
}
const RTL_LOCALES = new Set(['ar', 'fa', 'he', 'ur']);

/**
 * og:locale for `lang` and og:locale:alternate for every other served
 * language. Rewrites the og:locale the page already carries (ogLocaleTag)
 * rather than adding a second one.
 */
function withOgLocale(html, lang, langs) {
  const tags = [
    ogLocaleTag(ogLocale(lang)),
    ...langs.filter((l) => l !== lang).map((l) => `<meta property="og:locale:alternate" content="${ogLocale(l)}">`),
  ].join('\n');
  const out = html.replace(/<meta property="og:locale:alternate" content="[^"]*">\n?/g, '');
  return /<meta property="og:locale" content="[^"]*">/.test(out)
    ? out.replace(/<meta property="og:locale" content="[^"]*">/, () => tags)
    : out.replace('</head>', () => `${tags}\n</head>`);
}

const NOINDEX_META = /<meta name="robots" content="[^"]*noindex/i;

/** A string as it appears inside jsonLdScript output. */
function jsonLdText(s) {
  return JSON.stringify(String(s)).slice(1, -1).replace(/</g, '\\u003c');
}

/**
 * The page in `hl`, or the English page carrying its cluster.
 *
 * A route served in no other language comes back untouched, and so does a
 * noindex page — annotating a page Google is told to drop only spends the
 * annotation. The bare page gains the cluster and keeps its own canonical. A
 * translated page swaps the title, description, share-card text, heading,
 * breadcrumb, JSON-LD name and description, and the body between the
 * <!--hl-body--> markers its builder put around it; it declares its language
 * (and direction) and is canonical to its own ?hl= URL — every variant
 * self-canonical, every variant naming all the others, the only shape Google
 * honours.
 */
function localizePage(html, route, hl, table) {
  const langs = servedLocales(route, table);
  if (!langs.length || NOINDEX_META.test(html)) return html;
  const t = hl && langs.includes(hl) ? table[route][hl] : null;
  let out = html.replace('</head>', () => `${hreflangLinks(route, table)}\n</head>`);
  out = withOgLocale(out, t ? hl : 'en', ['en', ...langs]);
  if (!t) return out;
  const en = table[route].en || {};
  const title = escHtml(t.title);
  const description = escHtml(t.description);
  const heading = escHtml(t.h1 || t.title);
  const self = localizedUrl(route, hl);
  const englishHeading = (out.match(/<h1[^>]*>([^<]*)<\/h1>/i) || [])[1];
  // JSON-LD names the page by the strings the page itself carried, which are
  // not always the locale file's English row, so both are swapped.
  const unescaped = (s) => String(s || '')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const jsonLdSwaps = [
    [en.title, t.title],
    [unescaped((out.match(/<title>([^<]*)<\/title>/i) || [])[1]), t.title],
    [en.description, t.description],
    [unescaped((out.match(/<meta name="description" content="([^"]*)">/i) || [])[1]), t.description],
  ].filter(([from]) => from);
  out = out
    .replace(/<html lang="[^"]*"(?: dir="[^"]*")?/i, `<html lang="${hl}"${RTL_LOCALES.has(hl) ? ' dir="rtl"' : ''}`)
    .replace(/(<title>)[^<]*(<\/title>)/i, (m, a, b) => `${a}${title}${b}`)
    .replace(/(<meta (?:property|name)="(?:og:title|twitter:title)" content=")[^"]*(">)/g, (m, a, b) => `${a}${title}${b}`)
    .replace(
      /(<meta (?:property|name)="(?:description|og:description|twitter:description)" content=")[^"]*(">)/g,
      (m, a, b) => `${a}${description}${b}`,
    )
    .replace(/(<link rel="canonical" href=")[^"]*(">)/i, (m, a, b) => `${a}${self}${b}`)
    .replace(/(<meta property="og:url" content=")[^"]*(">)/i, (m, a, b) => `${a}${self}${b}`)
    .replace(/(<meta name="twitter:url" content=")[^"]*(">)/i, (m, a, b) => `${a}${self}${b}`)
    .replace(/(<h1[^>]*>)[^<]*(<\/h1>)/i, (m, a, b) => `${a}${heading}${b}`)
    .replace(/<!--hl-body-->[\s\S]*?<!--\/hl-body-->/, () => `<!--hl-body-->${t.body}<!--/hl-body-->`)
    .replace(/(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/g, (m, a, json, b) => {
      let next = json;
      for (const [from, to] of jsonLdSwaps) next = next.split(`"${jsonLdText(from)}"`).join(`"${jsonLdText(to)}"`);
      return `${a}${next}${b}`;
    });
  // The breadcrumb repeats the heading. A page whose opening paragraph is not
  // its builder's own (the homepage's comes from the ssr-seo function) carries
  // a translation of it as `lede`.
  if (englishHeading) out = out.split(`› ${englishHeading}</p>`).join(`› ${heading}</p>`);
  if (t.lede) out = out.replace(/(<\/h1>\s*)<p>[^<]*<\/p>/i, (m, a) => `${a}<p>${escHtml(t.lede)}</p>`);
  return out;
}

const DEHUB_API = 'https://api.dehub.io/api';
async function fetchFeedRows(query, limit = 12) {
  return (await fetchFeedRowsOrNull(query, limit)) || [];
}

/** fetchFeedRows, but null when the API did not answer — so "no posts" and
 *  "could not ask" stay two different things where that decides indexing. */
async function fetchFeedRowsOrNull(query, limit = 12) {
  try {
    const res = await fetch(
      `${DEHUB_API}/feed?limit=${limit}&status=minted&sortBy=createdAt&sortOrder=desc&${query}`,
      { signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return null;
    const json = await res.json();
    return Array.isArray(json?.result) ? json.result : null;
  } catch {
    return null;
  }
}

/** The account behind a handle (address, displayName, uploads), or null on any failure. */
async function fetchAccountInfo(handle) {
  try {
    const res = await fetch(`${DEHUB_API}/account_info/${encodeURIComponent(handle)}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const account = data && typeof data.result === 'object' ? data.result : data;
    return account && typeof account.address === 'string' ? account : null;
  } catch {
    return null;
  }
}

/** Adds (or tightens) a page's robots meta to `noindex, follow`. */
function noindexPage(html) {
  if (/<meta name="robots"[^>]*>/i.test(html)) {
    return html.replace(/<meta name="robots"[^>]*>/i, '<meta name="robots" content="noindex, follow">');
  }
  return html.replace('</head>', '<meta name="robots" content="noindex, follow"></head>');
}

/**
 * A profile with no post a signed-out visitor can see is a name and an
 * avatar: in the 2026-09-29 sample those pages were 48–68 words of template,
 * and they are what a thin-content judgement is made of. The profile
 * sitemap already leaves them out (the API only lists accounts with a
 * visible post); this keeps a crawler that arrives by a link from indexing
 * one either. Only a definite zero counts — an API that did not answer
 * leaves the page as it was.
 */
function profileHasNoPosts(account, rows) {
  if (!account) return false;
  if (Number(account.uploads) === 0) return true;
  return Array.isArray(rows) && rows.length === 0;
}

/** What a feed row is called in a list: its title, else its caption's opening
 *  words (same rule as the post page's own title), else its id. */
function postLabel(row) {
  const name = String(row.name || '').replace(/\s+/g, ' ').trim();
  if (!titleSaysNothing(name)) return truncate(name, 90);
  const caption = postCaption('', row, false);
  return caption ? clipAtWord(caption, POST_CAPTION_TITLE_MAX) : `Post #${Number(row.tokenId)}`;
}

function postListHtml(heading, rows, { author = true } = {}) {
  const items = (Array.isArray(rows) ? rows : [])
    .filter((r) => r && Number.isFinite(Number(r.tokenId)))
    .map((r) => {
      const who = author ? String(r.displayName || r.username || '').replace(/\s+/g, ' ').trim() : '';
      const views = Number(r.totalViews) || 0;
      const tail = [who && `by ${escHtml(who)}`, views > 0 && `${views.toLocaleString('en-US')} views`]
        .filter(Boolean)
        .join(' · ');
      return `<li><a href="${APP_URL}/app/post/${Number(r.tokenId)}">${escHtml(postLabel(r))}</a>${tail ? ` — ${tail}` : ''}</li>`;
    });
  if (!items.length) return '';
  return `<section class="dh-list"><h2>${escHtml(heading)}</h2><ul>${items.join('')}</ul></section>`;
}

/** The shorts lane is a duration cut on videos, not a post type — same rule as the SPA. */
function shortsOf(rows, max = 12) {
  return (Array.isArray(rows) ? rows : [])
    .filter((r) => {
      const d = Number(r && r.videoDuration);
      return d > 0 && d <= 60;
    })
    .slice(0, max);
}

async function sectionLiveHtml(key) {
  if (key === 'videos') return postListHtml('Latest videos', await fetchFeedRows('postType=video'));
  if (key === 'shorts') return postListHtml('Latest shorts', shortsOf(await fetchFeedRows('postType=video', 100)));
  if (key === 'explore') return postListHtml('Latest on DeHub', await fetchFeedRows(''));
  if (key === 'music') return postListHtml('Latest tracks', await fetchFeedRows('postType=feed-audio'));
  return '';
}

function commentsHtml(record) {
  const list = Array.isArray(record && record.comments) ? record.comments : [];
  const items = list
    .filter((c) => c && String(c.content || '').trim())
    .slice(0, 20)
    .map((c) => {
      const who = String(
        (c.user && (c.user.displayName || c.user.username)) || (c.writor && c.writor.username) || '',
      ).replace(/\s+/g, ' ').trim();
      return `<li>${who ? `<strong>${escHtml(who)}</strong>: ` : ''}${escHtml(truncate(c.content, 300))}</li>`;
    });
  if (!items.length) return '';
  const n = Number(record.commentCount) || list.length;
  const heading = n === 1 ? '1 comment' : `${n.toLocaleString('en-US')} comments`;
  return `<section class="dh-list"><h2>${heading}</h2><ul>${items.join('')}</ul></section>`;
}

function postFactsHtml(record) {
  if (!record) return '';
  const facts = [];
  const views = Number(record.totalViews) || 0;
  const likes = Number(record.reactionCounts && record.reactionCounts.like) || (typeof record.like === 'number' ? record.like : 0);
  const seconds = Number(record.videoDuration) || 0;
  if (views) facts.push(`${views.toLocaleString('en-US')} views`);
  if (likes) facts.push(`${likes.toLocaleString('en-US')} likes`);
  if (seconds > 0) facts.push(`${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`);
  const topics = (Array.isArray(record.category) ? record.category : [])
    .map((c) => String(c || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 6);
  const line = facts.length ? `<p>${escHtml(facts.join(' · '))}</p>` : '';
  const tags = topics.length ? `<p>Topics: ${topics.map((t) => escHtml(t)).join(', ')}</p>` : '';
  return line + tags;
}

/**
 * A crawlable link from a post to its author. The fn's post page named the
 * author only in text and JSON-LD, so no post linked to any profile: profiles
 * were reachable by crawling only from the homepage's latest ten and from
 * each other. `isProfile` is the router's own test, so a handle that is also
 * a route (`admin`, `explore`) never becomes a link to the wrong page.
 */
function injectPostByline(html, record, isProfile) {
  const username = String((record && (record.mintername || record.username)) || '').trim().replace(/^@+/, '');
  if (!username || !isProfile(username.toLowerCase())) return html;
  const name = String((record && (record.minterDisplayName || record.displayName)) || '').replace(/\s+/g, ' ').trim();
  const label = name && name.toLowerCase() !== username.toLowerCase() ? `${name} (@${username})` : `@${username}`;
  const byline = `<p class="dh-byline">By <a href="${APP_URL}/${encodeURIComponent(username)}">${escHtml(label)}</a></p>`;
  return html.replace(/<\/h1>/i, `</h1>\n    ${byline}`);
}

/** Seconds as an ISO 8601 duration (`PT1H1M18S`), or '' when unknown. */
function isoDuration(seconds) {
  const total = Math.round(Number(seconds));
  if (!(total > 0)) return '';
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `PT${h ? `${h}H` : ''}${m ? `${m}M` : ''}${s ? `${s}S` : ''}`;
}

/** The post's video file on the CDN: the record's own path, else the fn's og:video. */
function postVideoUrl(html, record) {
  const raw = String((record && record.videoUrl) || '').trim();
  if (raw) return /^https?:\/\//i.test(raw) ? raw : `${CDN_ORIGIN}/${raw.replace(/^\/+/, '')}`;
  const og = html.match(/<meta property="og:video(?::secure_url)?" content="([^"]+)">/);
  return og ? decodeFnText(og[1]) : '';
}

/**
 * A video post as a watch page. The fn rendered the thumbnail as an <img>
 * and nothing else, so Google's video indexing found no video on the page;
 * and its VideoObject pointed embedUrl at the post page itself (not a
 * player) and fell back to "now" for uploadDate, so every crawl of an old
 * video called it new. This puts a real <video> where the thumbnail was
 * (the thumbnail stays inside it, for anything that cannot play video), and
 * rewrites the VideoObject from the post record: the file, its real upload
 * date, its length.
 */
function enrichVideoPost(html, record) {
  if (postKind(record, html)[0] !== 'video') return html;
  const media = postVideoUrl(html, record);
  if (!media) return html;
  const poster = (html.match(/<meta property="og:image" content="([^"]*)">/) || [])[1] || '';
  const type = /\.webm(?:$|\?)/i.test(media) ? 'video/webm' : 'video/mp4';
  const player = (fallback) =>
    `<video controls preload="none"${poster ? ` poster="${poster}"` : ''}><source src="${escFnAttr(media)}" type="${type}">${fallback}</video>`;
  let out = html.replace(/(<\/h1>[\s\S]*?)(<img\b[^>]*>)/i, (m, before, img) => `${before}${player(img)}`);
  if (out === html) out = html.replace(/<\/h1>/i, `</h1>\n    ${player('')}`);

  return rewriteJsonLd(out, (data) => {
    const nodes = Array.isArray(data['@graph']) ? data['@graph'] : [data];
    const video = nodes.find((n) => n && n['@type'] === 'VideoObject');
    if (!video) return null;
    const article = nodes.find((n) => n && n['@type'] === 'Article');
    video.contentUrl = media;
    delete video.embedUrl;
    const uploaded = (record && record.createdAt) || (article && article.datePublished);
    if (uploaded) video.uploadDate = uploaded;
    if (!video.thumbnailUrl && poster) video.thumbnailUrl = decodeFnText(poster);
    if (!video.name && article && article.headline) video.name = article.headline;
    if (!video.description && video.name) video.description = video.name;
    const duration = isoDuration(record && record.videoDuration);
    if (duration) video.duration = duration;
    return data;
  });
}

/** Puts crawler content ahead of a page's "Open on DeHub" call to action, or at the end of the body. */
function injectBeforeCta(html, sectionHtml) {
  if (!sectionHtml) return html;
  const cta = html.search(/<p[^>]*><a class="dh-cta"/);
  if (cta > -1) return `${html.slice(0, cta)}${sectionHtml}\n    ${html.slice(cta)}`;
  return html.replace('</body>', `${sectionHtml}</body>`);
}

/** The wallet a proxied profile page belongs to, read off its own avatar URL. */
function profileAddressOf(html) {
  const m = String(html).match(/\/avatars\/(0x[0-9a-fA-F]{40})\b/);
  return m ? m[1].toLowerCase() : '';
}

async function fetchPostRecord(tokenId) {
  try {
    const res = await fetch(`https://api.dehub.io/api/nft_info/${encodeURIComponent(tokenId)}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.result || (data?.tokenId ? data : null);
  } catch {
    return null;
  }
}

/**
 * Share images the deployed fn advertises that do not resolve to an image.
 * A sweep of all 2,000 sitemap posts on 2026-09-02 found 434 (22%) whose
 * og:image was one of three things:
 *
 * - 336 pointed at `<cdn>/nfts/images/<id>.<ext>`, which the CDN answers
 *   403 (AccessDenied is its "missing key"). The API still carries that
 *   path in `imageUrl`, but every one of those files now lives at
 *   `<cdn>/images/<id>.<ext>` — 336 of 336 checked.
 * - 57 resolved, but as `application/octet-stream`: avatars saved with an
 *   `.octet-stream` extension, and `.jpg` uploads whose object has no
 *   content type. Crawlers that trust the header draw nothing.
 * - 39 text posts pointed at the fn's own text-card renderer
 *   (`/functions/v1/og-image?post_id=`), which 302s to the 200-square logo
 *   on every call now.
 *
 * Repairs, in that order: move the legacy path; route every CDN image through
 * Cloudflare's image transform on this zone, which re-encodes to JPEG with a
 * real content type (and sizes avatars to the 400×400 the fn declares); and
 * swap the dead renderer for the brand card. Only image contexts are touched —
 * og:video and the mp4 behind it stay as they are — and only the CDN host is
 * transformed, since the transform refuses the Supabase origin.
 */
const CDN_ORIGIN = 'https://dehubcdn.ams3.cdn.digitaloceanspaces.com';
const IMAGE_TRANSFORM_BASE = `${APP_URL}/cdn-cgi/image/`;

function transformedImageUrl(url) {
  if (!url.startsWith(`${CDN_ORIGIN}/`)) return url;
  const options = url.startsWith(`${CDN_ORIGIN}/avatars/`)
    ? 'format=jpeg,width=400,height=400,fit=cover'
    : 'format=jpeg,width=1200,fit=scale-down';
  return `${IMAGE_TRANSFORM_BASE}${options}/${url}`;
}

/**
 * Share cards made true 1200x630.
 *
 * A declared og:image size has to be the real one — communities declared
 * 400x400 for avatars that are 500x500 or 1536x1024, and Facebook and X
 * crop or letterbox by what they are told — and a card should not be a
 * 2 MB PNG (the /stages/1 cover was 2.2 MB, two community avatars 1.9 MB).
 * Routing the picture through the image transform fixes both at once: the
 * output is 1200x630 JPEG whatever went in, cached at the edge. Avatars are
 * padded onto black (as profileBannerCard does) so a face is not cropped
 * to a strip; everything else is cover-cropped, which is what the platforms
 * would do to it anyway.
 *
 * The transform accepts the CDN directly but refuses the Supabase origin, so
 * Supabase-hosted pictures are read through the same-zone relay under
 * OG_SOURCE_PREFIX (ogSourceResponse). Returns null for any other host: its
 * size cannot be known without fetching it, so it goes out undeclared.
 */
const SUPABASE_STORAGE_PUBLIC = 'https://aigxuutjaqsywioxjefr.supabase.co/storage/v1/object/public';
const OG_SOURCE_PREFIX = '/_og/';
const CARD_COVER = 'fit=cover,width=1200,height=630,format=jpeg,quality=80';
const CARD_PAD = 'fit=pad,width=1200,height=630,background=%23000000,format=jpeg,quality=80';

function shareCardImage(url) {
  if (!url) return null;
  // Already a 1200x630 card: one of ours, or one this function made.
  if (url.startsWith(`${APP_URL}/og/`) || url === SHARE_IMAGE) return url;
  if (url.startsWith(`${IMAGE_TRANSFORM_BASE}fit=`)) return url;
  // Undo an earlier transform (the fn's avatar crop, repairProxiedImages'
  // scale-down) so the card is cut from the original.
  const src = url.replace(/^https:\/\/dehub\.io\/cdn-cgi\/image\/[^/]+\//, '');
  let source = null;
  if (src.startsWith(`${CDN_ORIGIN}/`)) source = src;
  else if (src.startsWith(`${SUPABASE_STORAGE_PUBLIC}/`)) {
    source = `${APP_URL}${OG_SOURCE_PREFIX}storage/${src.slice(SUPABASE_STORAGE_PUBLIC.length + 1)}`;
  }
  if (!source) return null;
  const options = /\/avatars?[/_.-]/i.test(src) ? CARD_PAD : CARD_COVER;
  return `${IMAGE_TRANSFORM_BASE}${options}/${source}`;
}

/**
 * Point a proxied page's og:image/twitter:image at its shareCardImage and
 * declare what that now is. A picture on a host the transform can't reach
 * keeps its URL and loses any size the fn claimed for it.
 */
function cardProxiedImage(html) {
  const m = html.match(/<meta property="og:image" content="([^"]*)">/);
  if (!m) return html;
  const card = shareCardImage(m[1].replace(/&amp;/g, '&'));
  if (!card) {
    return html.replace(/<meta property="og:image:(?:width|height)" content="[^"]*">\s*/g, '');
  }
  const attr = card.replace(/&/g, '&amp;');
  let out = html
    .replace(/(<meta (?:property="og:image(?::secure_url)?"|name="twitter:image") content=")[^"]*(">)/g, (x, a, b) => `${a}${attr}${b}`)
    .replace(/(<meta property="og:image:type" content=")[^"]*(">)/g, `$1${/\.png$/.test(card) ? 'image/png' : 'image/jpeg'}$2`)
    .replace(/(<meta name="twitter:card" content=")[^"]*(">)/g, '$1summary_large_image$2');
  if (/og:image:width/.test(out)) {
    out = out
      .replace(/(<meta property="og:image:width" content=")[^"]*(">)/g, '$11200$2')
      .replace(/(<meta property="og:image:height" content=")[^"]*(">)/g, '$1630$2');
  } else {
    out = out.replace(/(<meta property="og:image" content="[^"]*">)/, '$1\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">');
  }
  if (!/name="twitter:image"/.test(out)) {
    out = out.replace('</head>', `<meta name="twitter:image" content="${attr}"></head>`);
  }
  return out;
}

/**
 * X's player card needs an HTTPS page that plays the video in an iframe; the
 * fn pointed twitter:player (and :stream) at the raw MP4 — 112 MB for one
 * post — which X rejects, so the card failed outright. There is no embeddable
 * player route, so a video post shares as a large image card of its poster.
 * og:video stays: Facebook and most other scrapers do play the file.
 */
function dropTwitterPlayer(html) {
  return html
    .replace(/<meta name="twitter:player(?::[a-z_:]+)?" content="[^"]*">\s*/g, '')
    .replace(/(<meta name="twitter:card" content=")player(">)/g, '$1summary_large_image$2');
}

/**
 * Structured data on the fn's pages, rewritten in place: each JSON-LD block is
 * parsed, handed to `edit`, and re-serialised when `edit` returns a value. A
 * block that does not parse, or that `edit` declines, is left byte-for-byte.
 */
function rewriteJsonLd(html, edit) {
  return html.replace(/(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/g, (m, open, body, close) => {
    let value;
    try {
      value = JSON.parse(body);
    } catch {
      return m;
    }
    const next = value && typeof value === 'object' ? edit(value) : null;
    return next ? `${open}${jsonLdScript(next)}${close}` : m;
  });
}

/**
 * A profile as ProfilePage { mainEntity: Person }, the shape Google reads for
 * profile pages. The fn wrote a bare Person whose only sameAs was its own URL,
 * which tells a consumer nothing; that link is dropped and any real external
 * one kept. The @handle rides as alternateName, the site-unique identifier.
 */
function profilePageLd(value, handle) {
  if (value['@type'] !== 'Person') return null;
  const { '@context': _context, '@type': _type, sameAs, ...person } = value;
  const external = [].concat(sameAs || []).filter(
    (u) => typeof u === 'string' && u !== person.url && !u.startsWith(`${APP_URL}/`),
  );
  return {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    ...(person.url ? { url: person.url } : {}),
    mainEntity: {
      '@type': 'Person',
      ...person,
      ...(handle ? { alternateName: `@${handle}` } : {}),
      ...(external.length ? { sameAs: external } : {}),
    },
  };
}

/**
 * A post as SocialMediaPosting, Google's type for user posts on a social
 * platform, in place of the fn's Article. Article fields carry over; the
 * author gains the profile URL Google recommends; the post's own text, like
 * and comment counts come off the record the post branch already fetched. A
 * video's VideoObject is nested as `video` exactly as the fn wrote it.
 */
function socialPostingLd(value, record) {
  const nodes = Array.isArray(value['@graph']) ? value['@graph'] : [value];
  const article = nodes.find((n) => n && n['@type'] === 'Article');
  if (!article) return null;
  const videoNode = nodes.find((n) => n && n['@type'] === 'VideoObject');
  const { '@context': _context, '@type': _type, author, ...fields } = article;
  // nft_info calls the author's handle `mintername`; `username` never arrives.
  const username = String((record && (record.mintername || record.username)) || '').trim();
  const text = String((record && record.description) || '').trim();
  const posting = {
    '@context': 'https://schema.org',
    '@type': 'SocialMediaPosting',
    ...fields,
    ...(author ? { author: { ...author, ...(username ? { url: `${APP_URL}/${encodeURIComponent(username)}` } : {}) } } : {}),
    ...(text ? { text } : {}),
  };
  if (record) {
    const likes = Number(record.reactionCounts && record.reactionCounts.like) || (typeof record.like === 'number' ? record.like : 0);
    const comments = Number(record.commentCount) || (Array.isArray(record.comments) ? record.comments.length : 0);
    posting.commentCount = comments;
    posting.interactionStatistic = [
      { '@type': 'InteractionCounter', interactionType: 'https://schema.org/LikeAction', userInteractionCount: likes },
      { '@type': 'InteractionCounter', interactionType: 'https://schema.org/CommentAction', userInteractionCount: comments },
    ];
  }
  if (videoNode) {
    const { '@context': _videoContext, ...video } = videoNode;
    posting.video = video;
  }
  return posting;
}

/**
 * A community as a CollectionPage — the page of its posts — rather than the
 * fn's Organization. An Organization named after the community collided with
 * the brand: the community called "dehub" was marked up as an Organization
 * named "DeHub", a second, rival brand entity on dehub.io.
 */
function communityPageLd(value) {
  if (value['@type'] !== 'Organization') return null;
  const { '@context': _context, '@type': _type, name, sameAs: _sameAs, logo: _logo, ...fields } = value;
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: name ? `${name} — community on DeHub` : 'Community on DeHub',
    ...fields,
    isPartOf: { '@type': 'WebSite', name: 'DeHub', url: APP_URL },
  };
}

/**
 * The homepage's WebSite and Organization nodes. The WebSite node's
 * SearchAction (the sitelinks search box) is a feature Google retired in
 * 2024, and it aimed at a noindex URL; the Organization's logo was the share
 * banner. Name, url and alternateName are kept.
 */
function homeJsonLd(value) {
  const nodes = Array.isArray(value['@graph']) ? value['@graph'] : [value];
  let changed = false;
  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue;
    if (node['@type'] === 'WebSite' && node.potentialAction) {
      delete node.potentialAction;
      changed = true;
    }
    if (node['@type'] === 'Organization') {
      node.logo = ORG_LOGO;
      changed = true;
    }
  }
  return changed ? value : null;
}

/**
 * The same-zone relay shareCardImage and buildBlogShareImage read through:
 *
 *   /_og/storage/<bucket>/<path>  → a public Supabase storage object
 *   /_og/blog/<slug>              → that post's blog-share-image render
 *
 * Only an image is passed on — never SVG, never HTML — with nosniff and a
 * locked-down CSP, so a public bucket that holds pages (Builder apps live in
 * one) can't be served as a document from dehub.io through here.
 */
async function ogSourceResponse(request, env, pathname) {
  const notFound = () => new Response('Not found', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Robots-Tag': 'noindex' },
  });
  const rest = pathname.slice(OG_SOURCE_PREFIX.length);
  if (/\.\.|%2e|%2f|%5c|\\/i.test(rest)) return notFound();
  let upstream = null;
  const blog = rest.match(/^blog\/([^/]+)$/);
  if (blog) {
    const post = (await getBlogManifest(request, env)).get(decodeURIComponent(blog[1]));
    if (post) upstream = blogShareSourceUrl(post);
  } else if (/^storage\/[a-z0-9_-]+\/.+/i.test(rest)) {
    upstream = `${SUPABASE_STORAGE_PUBLIC}/${rest.slice('storage/'.length)}`;
  }
  if (!upstream) return notFound();
  try {
    const res = await fetch(upstream, { signal: AbortSignal.timeout(10000) });
    const type = (res.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
    if (!res.ok || !type.startsWith('image/') || type.includes('svg')) return notFound();
    return new Response(res.body, {
      status: 200,
      headers: {
        'Content-Type': type,
        'Cache-Control': 'public, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'",
        'X-Robots-Tag': 'noindex',
      },
    });
  } catch {
    return new Response('Upstream unavailable', { status: 502, headers: { 'X-Robots-Tag': 'noindex' } });
  }
}

function repairProxiedImages(html) {
  let out = html.split(`${CDN_ORIGIN}/nfts/images/`).join(`${CDN_ORIGIN}/images/`);

  const deadCard = /\/functions\/v1\/og-image\?/;
  let transformed = false;
  const swap = (value) => {
    if (deadCard.test(value)) return SHARE_IMAGE;
    const next = transformedImageUrl(value);
    if (next !== value) transformed = true;
    return next;
  };
  out = out
    .replace(
      /(<meta (?:property="og:image(?::secure_url)?"|name="twitter:image") content=")([^"]*)(">)/g,
      (m, a, v, b) => `${a}${swap(v)}${b}`,
    )
    .replace(/("(?:image|thumbnailUrl)":")([^"\\]*)(")/g, (m, a, v, b) => `${a}${swap(v)}${b}`);

  if (transformed) {
    out = out.replace(/(<meta property="og:image:type" content=")[^"]*(">)/g, (m, a, b) => `${a}image/jpeg${b}`);
  }
  if (deadCard.test(html)) {
    // The brand card is 1200×630; the fn declared the renderer's card and a
    // summary_large_image, so only the dimensions and type need saying.
    out = out
      .replace(/(<meta property="og:image:width" content=")[^"]*(">)/g, (m, a, b) => `${a}1200${b}`)
      .replace(/(<meta property="og:image:height" content=")[^"]*(">)/g, (m, a, b) => `${a}630${b}`)
      .replace(/(<meta property="og:image:type" content=")[^"]*(">)/g, (m, a, b) => `${a}image/png${b}`)
      .replace(/(<meta name="twitter:card" content=")[^"]*(">)/g, (m, a, b) => `${a}summary_large_image${b}`);
  }
  return out;
}

/**
 * Profile share card as a 1200x630 banner. The fn advertises the avatar as a
 * 400-square `summary` card, and X draws that as an empty grey tile in the
 * composer and timeline even though it fetches the image fine. Pad the avatar
 * onto a black 1200x630 frame with the same image transform and declare a
 * large card, so a shared profile unfurls with the person's picture.
 */
function profileBannerCard(html) {
  const m = html.match(/<meta property="og:image" content="([^"]*)">/);
  if (!m) return html;
  const src = m[1].replace(/^https:\/\/dehub\.io\/cdn-cgi\/image\/[^/]+\//, '');
  if (!src.startsWith(`${CDN_ORIGIN}/avatars/`)) return html;
  const card = `${IMAGE_TRANSFORM_BASE}format=jpeg,width=1200,height=630,fit=pad,background=%23000000/${src}`;
  let out = html
    .replace(/(<meta (?:property="og:image(?::secure_url)?"|name="twitter:image") content=")[^"]*(">)/g, `$1${card}$2`)
    .replace(/(<meta property="og:image:width" content=")[^"]*(">)/g, '$11200$2')
    .replace(/(<meta property="og:image:height" content=")[^"]*(">)/g, '$1630$2')
    .replace(/(<meta property="og:image:type" content=")[^"]*(">)/g, '$1image/jpeg$2')
    .replace(/(<meta name="twitter:card" content=")[^"]*(">)/g, '$1summary_large_image$2');
  if (!/name="twitter:image"/.test(out)) {
    out = out.replace('</head>', `<meta name="twitter:image" content="${card}"></head>`);
  }
  return out;
}

/**
 * A profile with no avatar gets the fn's fallback share image, the DeHub logo
 * file, declared 200×200 with a `summary` card. The file is a 1200×630
 * banner: scrapers that trust the hint crop it to a square thumbnail, and 7
 * of 38 sampled profiles unfurled that way. Say what the file actually is.
 * (Posts and communities go through cardProxiedImage, which re-cuts it.)
 */
const FN_FALLBACK_LOGO = `${SUPABASE_STORAGE_PUBLIC}/logo/new_logo_Dehub.jpg`;
function logoCardDimensions(html) {
  const m = html.match(/<meta property="og:image" content="([^"]*)">/);
  if (!m || m[1] !== FN_FALLBACK_LOGO) return html;
  let out = html
    .replace(/(<meta property="og:image:width" content=")[^"]*(">)/g, '$11200$2')
    .replace(/(<meta property="og:image:height" content=")[^"]*(">)/g, '$1630$2')
    .replace(/(<meta name="twitter:card" content=")[^"]*(">)/g, '$1summary_large_image$2');
  if (!/property="og:image:width"/.test(out)) {
    out = out.replace('</head>', '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"></head>');
  }
  return out;
}

/**
 * The fn titles a community `Join <name>'s community on DeHub today`, which
 * reads `Join DeHub Whales's community` for any name ending in s. English
 * drops the second s there.
 */
function fixCommunityPossessive(html) {
  return html.replace(/Join ([^<"]+?)'s community on DeHub today/g, (m, name) =>
    /s$/i.test(name) ? `Join ${name}' community on DeHub today` : m);
}

/**
 * A name that is a test or a placeholder, not a thing anyone would search
 * for: `Test Event For Aaron`, a store called `2L`. titleSaysNothing covers
 * filenames and one-word placeholders; this adds the words people type when
 * they are trying a feature out.
 */
const TEST_ENTITY_NAME = /\b(?:test(?:ing)?|asdf|lorem ipsum|placeholder|dummy)\b/i;
/** Below this much description, an entity with no picture has nothing to index. */
const ENTITY_MIN_DESCRIPTION = 40;

/**
 * Store, listing, event and community pages whose content is a test or next
 * to nothing — `i sell dehub` at $50,000 with no image, a store described as
 * `Create`. They stay shareable (the OG tags are untouched); they just are
 * not offered to the index, where each one is a thin page counted against
 * the site. Pass the raw columns, not the renderers' generated fallbacks.
 */
function entityLooksThin({ name, description, image }) {
  const n = String(name || '').replace(/\s+/g, ' ').trim();
  if (titleSaysNothing(n) || TEST_ENTITY_NAME.test(n)) return true;
  const d = String(description || '').replace(/\s+/g, ' ').trim();
  return d.length < ENTITY_MIN_DESCRIPTION && !image;
}

function buildStoreHtml(store) {
  const canonicalUrl = `${APP_URL}/stores/${store.id}`;
  const name = store.name || 'Store';
  const title = `${name} — DeHub Stores`;
  const description = truncate(
    store.description || `Shop ${name} on DeHub. Peer-to-peer commerce paid in tokens or USDC.`,
    200,
  );
  const image = absolutize(store.banner_url || store.avatar_url);
  return entityHtml({
    canonicalUrl,
    title,
    description,
    image,
    ogType: 'profile',
    noindex: entityLooksThin({ name: store.name, description: store.description, image }),
    heading: name,
    breadcrumb: `<a href="${APP_URL}">DeHub</a> › <a href="${APP_URL}/stores">Stores</a>`,
    bodyHtml: `<p>${escHtml(description)}</p>`,
    // OnlineStore, not Store: Store is a LocalBusiness, and Google reports a
    // LocalBusiness without a street address as an error. These shops have no
    // premises; OnlineStore is the Organization subtype for exactly that.
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'OnlineStore',
      name,
      description,
      url: canonicalUrl,
      ...(image ? { image } : {}),
      parentOrganization: ORG_JSONLD,
    },
  });
}

function buildListingHtml(listing) {
  const storeId = listing.store_id;
  const canonicalUrl = `${APP_URL}/stores/${storeId}?listing=${listing.id}`;
  const name = listing.title || 'Item';
  const storeName = (listing.stores && listing.stores.name) || 'a DeHub store';
  const price = Number(listing.price) || 0;
  const currency = (listing.currency || 'USD').toUpperCase();
  const title = `${name} — ${storeName} on DeHub`;
  const description = truncate(
    listing.description || `${name} from ${storeName}, on DeHub. Paid in tokens or USDC.`,
    200,
  );
  const images = Array.isArray(listing.images) ? listing.images : [];
  const image = absolutize(images[0]);
  const inStock = listing.stock_quantity === null || Number(listing.stock_quantity) > 0;

  return entityHtml({
    canonicalUrl,
    title,
    description,
    image,
    ogType: 'product',
    // A sold or withdrawn item is not something to leave in the index; the
    // link still unfurls for anyone who shares it.
    noindex: listing.status !== 'active' || entityLooksThin({ name: listing.title, description: listing.description, image }),
    heading: name,
    breadcrumb: `<a href="${APP_URL}">DeHub</a> › <a href="${APP_URL}/stores/${escHtml(storeId)}">${escHtml(storeName)}</a>`,
    bodyHtml: `<p>${escHtml(description)}</p>
<p><strong>${price.toLocaleString('en-US', { style: 'currency', currency: currency === 'DHB' ? 'USD' : currency })}</strong>${listing.is_digital ? ' · digital' : ''}${inStock ? '' : ' · sold out'}</p>`,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name,
      description,
      ...(image ? { image } : {}),
      ...(listing.category ? { category: listing.category } : {}),
      offers: {
        '@type': 'Offer',
        url: canonicalUrl,
        price: String(price),
        // DHB-denominated listings are still priced in USD in this column;
        // schema.org wants a currency code it recognises.
        priceCurrency: currency === 'DHB' ? 'USD' : currency,
        availability: inStock
          ? 'https://schema.org/InStock'
          : 'https://schema.org/OutOfStock',
        seller: { '@type': 'Organization', name: storeName },
      },
    },
  });
}

/** The account that created an event, as the Person hosting it. */
function eventOrganizerLd(event) {
  const username = String(event.creator_username || '').trim();
  if (username) return { '@type': 'Person', name: `@${username}`, url: `${APP_URL}/${encodeURIComponent(username)}` };
  const wallet = String(event.creator_wallet_address || '');
  return wallet ? { '@type': 'Person', name: `${wallet.slice(0, 6)}...${wallet.slice(-4)}` } : ORG_JSONLD;
}

function buildEventHtml(event) {
  const canonicalUrl = `${APP_URL}/app/events/${event.event_number}`;
  const name = event.title || 'Event';
  const title = `${name} — DeHub Events`;
  const startsAt = event.starts_at || '';
  const when = startsAt ? new Date(startsAt).toUTCString() : '';
  const description = truncate(
    event.description || `${name} on DeHub${event.location ? ` · ${event.location}` : ''}${when ? ` · ${when}` : ''}`,
    200,
  );
  const image = absolutize(event.cover_image_url);

  return entityHtml({
    canonicalUrl,
    title,
    description,
    image,
    ogType: 'article',
    // A private event is shareable by whoever holds the link, not crawlable.
    noindex: !!event.is_private || entityLooksThin({ name: event.title, description: event.description, image }),
    heading: name,
    breadcrumb: `<a href="${APP_URL}">DeHub</a> › <a href="${APP_URL}/app/events">Events</a>`,
    bodyHtml: `<p>${escHtml(description)}</p>
${when ? `<p><strong>${escHtml(when)}</strong></p>` : ''}
${event.location ? `<p>${escHtml(event.location)}</p>` : ''}
<p>${Number(event.going_count) || 0} going · ${Number(event.interested_count) || 0} interested</p>`,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Event',
      name,
      description,
      url: canonicalUrl,
      ...(startsAt ? { startDate: startsAt } : {}),
      ...(event.ends_at ? { endDate: event.ends_at } : {}),
      ...(image ? { image } : {}),
      eventAttendanceMode: event.location
        ? 'https://schema.org/OfflineEventAttendanceMode'
        : 'https://schema.org/OnlineEventAttendanceMode',
      // No cancellation or postponement is recorded, so a listed event is a
      // scheduled one.
      eventStatus: 'https://schema.org/EventScheduled',
      // location is required on every Event. An online one happens on its own
      // DeHub page, which is what VirtualLocation names; a typed-in place is
      // the only address there is, so it is the address.
      location: event.location
        ? { '@type': 'Place', name: event.location, address: event.location }
        : { '@type': 'VirtualLocation', url: canonicalUrl },
      // Whoever created the event hosts it; DeHub only lists it.
      organizer: eventOrganizerLd(event),
    },
  });
}

/**
 * Host avatar as an absolute URL. audio_spaces.host_avatar stores whatever the
 * API handed the client — usually the relative "statics/avatars/0x….png" —
 * and avatar files are served by the CDN, not api.dehub.io (which 404s them).
 * Mirrors the client's buildAvatarSourceUrl, minus the cache-bust it can't
 * compute here.
 */
const DEHUB_CDN_BASE = 'https://dehubcdn.ams3.cdn.digitaloceanspaces.com/';
function stageHostAvatarUrl(stage) {
  const p = stage.host_avatar || '';
  if (!p) return null;
  if (p.startsWith('http')) return p;
  const path = p.startsWith('statics/') ? p.slice('statics/'.length) : p;
  return path.includes('/') ? `${DEHUB_CDN_BASE}${path}` : null;
}

const DEX_POOL_CHAIN_NAMES = { base: 'Base', ethereum: 'Ethereum', robinhood: 'Robinhood Chain', solana: 'Solana' };

function buildDexPoolHtml(pool) {
  const chain = DEX_POOL_CHAIN_NAMES[pool.chain] || pool.chain;
  const canonicalUrl = `${APP_URL}/dex/${pool.chain}/${pool.token_address}`;
  const pair = `${pool.symbol}/USD`;
  const title = `${pair} — ${pool.name} on the DeHub DEX`;
  const description = truncate(`Trade ${pool.name} (${pool.symbol}) on ${chain}: live order book, limit orders and instant buys and sells on the DeHub DEX.`, 200);
  return entityHtml({
    canonicalUrl,
    title,
    description,
    image: pool.image_url,
    heading: `${pair} · ${chain}`,
    breadcrumb: `<a href="${APP_URL}">DeHub</a> › <a href="${APP_URL}/dex">DEX</a>`,
    bodyHtml: `<p>${escHtml(description)}</p>
<p>Token contract: <code>${escHtml(pool.token_address)}</code></p>`,
    // WebPage, not WebApplication: see buildMarketingHtml — an app type with
    // no rating is an invalid Software App item.
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: title,
      description,
      url: canonicalUrl,
      ...(pool.image_url ? { image: pool.image_url } : {}),
      about: { '@type': 'Thing', name: `${pool.name} (${pool.symbol})`, identifier: pool.token_address },
      isPartOf: { '@type': 'WebSite', name: 'DeHub', url: APP_URL },
    },
  });
}

function buildStageHtml(stage) {
  const canonicalUrl = stage.short_id != null
    ? `${APP_URL}/stages/${stage.short_id}`
    : `${APP_URL}/stage/${stage.id}`;
  const host = stage.host_username ? `@${stage.host_username}` : 'a DeHub host';
  const isLive = stage.status === 'live';
  const isScheduled = stage.status === 'scheduled';
  const name = stage.title || 'Live Stage';
  const title = isScheduled
    ? `${name} — Upcoming Stage on DeHub`
    : isLive
      ? `${name} — Live now on DeHub`
      : `${name} — Stage on DeHub`;
  const when = isScheduled && stage.scheduled_at ? new Date(stage.scheduled_at).toUTCString() : '';
  const description = truncate(
    stage.description ||
      (isScheduled
        ? `Live audio Stage hosted by ${host} on DeHub${when ? ` · ${when}` : ''}. Set a reminder or add it to your calendar.`
        : isLive
          ? `Live audio Stage hosted by ${host} on DeHub — listen in now, no account needed.`
          : `A recorded audio Stage hosted by ${host} on DeHub.`),
    200,
  );
  // The share image is the stage's own cover when the host set one; failing
  // that, the host's profile picture — a face beats a generic banner.
  const image = stage.cover_image_url || stageHostAvatarUrl(stage);
  const startsAt = stage.scheduled_at || stage.started_at || '';

  return entityHtml({
    canonicalUrl,
    title,
    description,
    image,
    ogType: 'website',
    // A finished stage is shareable by whoever holds the link, not crawlable.
    noindex: stage.status === 'ended',
    heading: name,
    breadcrumb: `<a href="${APP_URL}">DeHub</a> › <a href="${APP_URL}/stages">Stages</a>`,
    bodyHtml: `<p>${escHtml(description)}</p>
${when ? `<p><strong>${escHtml(when)}</strong></p>` : ''}
<p>Hosted by ${escHtml(host)}</p>`,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'BroadcastEvent',
      name,
      description,
      url: canonicalUrl,
      isLiveBroadcast: isLive,
      ...(startsAt ? { startDate: startsAt } : {}),
      ...(stage.ended_at ? { endDate: stage.ended_at } : {}),
      ...(image ? { image } : {}),
      publishedOn: { '@type': 'BroadcastService', name: 'DeHub Stages', url: `${APP_URL}/stages` },
    },
  });
}

/**
 * A single mini app, /apps/<slug>.
 *
 * Only live apps are readable with the anon key (RLS), so a suspended or
 * rejected app falls through to the store card. Unlisted apps render but are
 * noindex, matching the SPA: they open from a link, they are not in the store.
 * Title and description mirror MiniAppPage's SEOHead.
 */
function buildMiniAppHtml(app) {
  const canonicalUrl = `${APP_URL}/apps/${app.slug}`;
  const name = app.name || 'Mini app';
  const description = truncate(
    app.description || app.subtitle || `${name} is a mini app on DeHub. Open it inside DeHub, already signed in.`,
    200,
  );
  const manifest = app.manifest && typeof app.manifest === 'object' ? app.manifest : {};
  const image = absolutize(manifest.ogImageUrl) || shareImage('apps');
  // WebPage, not SoftwareApplication: a listed app has no ratings to give,
  // and Google reports a Software App item without one as invalid.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name,
    description,
    url: canonicalUrl,
    ...(app.icon_url ? { image: absolutize(app.icon_url) } : {}),
    isPartOf: { '@type': 'WebSite', name: 'DeHub', url: APP_URL },
  };
  return entityHtml({
    canonicalUrl,
    title: `${name} — DeHub Apps`,
    description,
    image,
    jsonLd,
    ogType: 'website',
    noindex: app.tier === 'unlisted',
    heading: name,
    breadcrumb: `<a href="${APP_URL}">DeHub</a> › <a href="${APP_URL}/apps">Apps</a>`,
    bodyHtml: `<p>${escHtml(description)}</p>
<p>Runs at <strong>${escHtml(app.domain)}</strong>${app.category ? ` · ${escHtml(String(app.category).replace(/-/g, ' '))}` : ''}</p>
<p><a href="${canonicalUrl}">Open ${escHtml(name)} in DeHub</a> or <a href="${APP_URL}/apps">browse the other apps</a>.</p>`,
  });
}

/**
 * A shared Builder app, /builder/preview/<id>. The SPA renders the generated
 * index.html from public storage in a sandboxed frame; there is no row with a
 * name or a description, so the app's own <title> and meta description are
 * the only words that say what it is. Always noindex, here and in the SPA
 * (BuilderPreviewPage): a preview is somebody's generated app, not a page of
 * ours to rank. It still needs a card of its own — it is a link people send.
 */
const BUILDER_PREVIEW_ID = /^\/builder\/preview\/([A-Za-z0-9_-]{6,64})\/?$/;

async function fetchBuilderAppMeta(id) {
  try {
    const res = await fetch(`${SUPABASE_STORAGE_PUBLIC}/builder-apps/${id}/index.html`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 65536);
    const decode = (s) => String(s || '').replace(/&(?:amp|quot|lt|gt|#39);/g, (e) => HTML_ENTITIES[e]).replace(/\s+/g, ' ').trim();
    const title = decode((html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1]);
    const description = decode((html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i) || [])[1]);
    return { title, description };
  } catch {
    return null;
  }
}

function buildBuilderPreviewHtml(id, appMeta) {
  const canonicalUrl = `${APP_URL}/builder/preview/${id}`;
  const name = truncate((appMeta && appMeta.title) || '', 80);
  const description = truncate(
    (appMeta && appMeta.description) || (name ? `${name} — an app built on DeHub Builder.` : 'An app built on DeHub Builder.'),
    200,
  );
  return entityHtml({
    canonicalUrl,
    title: name ? `${name} — Built with DeHub Builder` : 'Built with DeHub Builder',
    description,
    image: shareImage('builder'),
    noindex: true,
    heading: name || 'Built with DeHub Builder',
    breadcrumb: `<a href="${APP_URL}">DeHub</a> › <a href="${APP_URL}/builder">Builder</a>`,
    bodyHtml: `<p>${escHtml(description)}</p>
<p><a href="${APP_URL}/builder">Build your own with DeHub Builder</a>.</p>`,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: name || 'Built with DeHub Builder',
      description,
      url: canonicalUrl,
      isPartOf: { '@type': 'WebSite', name: 'DeHub', url: APP_URL },
    },
  });
}

/**
 * A single bounty, /bounty/<job_number>.
 *
 * Before this existed the whole space was invisible: `work` is a reserved
 * ROUTE_SEGMENT, so shouldServeSSR's profile fall-through rejected
 * /work/<uuid>, and every bounty link anyone shared unfurled as the homepage
 * card under an `X-Robots-Tag: noindex`. Same failure the stages had — the gate
 * has to learn the route as well as the renderer.
 *
 * Title, description and indexability mirror src/features/work/seo.ts, which is
 * what the SPA writes for the same URL. Change one, change the other: bot copy
 * that has drifted from browser copy is what cloaking looks like from outside.
 */
function bountyMetaDescription(job) {
  const budget = Number(job.total_budget).toLocaleString('en-US', { maximumFractionDigits: 4 });
  return truncate(
    job.description ||
      `A ${job.job_type} bounty on DeHub paying ${budget} ${job.currency}. Claim it, submit your proof and get paid from escrow.`,
    200,
  );
}

/** Live bounties are indexable; finished ones are dead listings. So is one
 *  still marked open whose deadline has passed: nobody can act on it. */
export function isBountyIndexable(job, now = Date.now()) {
  if (job.status !== 'open' && job.status !== 'in_progress') return false;
  const deadline = job.deadline ? Date.parse(job.deadline) : NaN;
  return !(Number.isFinite(deadline) && deadline <= now);
}

/** The poster's full brief as paragraphs, or the meta description when there is none. */
function bountyBriefHtml(brief, fallback) {
  const paragraphs = String(brief || '')
    .replace(/\r/g, '')
    .split(/\n{2,}|\n(?=[-*•]\s)/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  if (!paragraphs.length) return `<p>${escHtml(fallback)}</p>`;
  return paragraphs.map((p) => `<p>${escHtml(p)}</p>`).join('\n');
}

function buildBountyHtml(job) {
  const canonicalUrl = `${APP_URL}/bounty/${job.job_number}`;
  const name = job.title || 'Bounty';
  const title = `${name} — DeHub Bounties`;
  const description = bountyMetaDescription(job);
  // The poster's own cover art when there is one; otherwise the board's card,
  // which at least says "bounty" rather than showing the generic DeHub banner.
  const image = absolutize(job.cover_image_url) || shareImage('work');
  const budget = Number(job.total_budget).toLocaleString('en-US', { maximumFractionDigits: 4 });

  // Deliberately NOT schema.org/JobPosting, which is the obvious fit and the
  // wrong one. Google's JobPosting rich result requires a real hiringOrganization
  // and either a jobLocation or an applicantLocationRequirements country; a
  // bounty has an anonymous wallet address for a poster and no geography at all,
  // so every one of those fields would have to be invented. Inventing them is
  // what earns a structured-data manual action. `Offer` carries the same facts
  // — price, currency, what is on offer, when it closes — truthfully, and
  // schema.org explicitly allows a crypto ticker in priceCurrency.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Offer',
    name,
    description,
    url: canonicalUrl,
    price: Number(job.total_budget),
    priceCurrency: job.currency,
    availability: job.status === 'open'
      ? 'https://schema.org/InStock'
      : job.status === 'in_progress'
        ? 'https://schema.org/LimitedAvailability'
        : 'https://schema.org/SoldOut',
    ...(job.created_at ? { validFrom: job.created_at } : {}),
    ...(job.deadline ? { availabilityEnds: job.deadline } : {}),
    ...(image ? { image } : {}),
    itemOffered: { '@type': 'Service', name, ...(job.platform ? { serviceType: job.platform } : {}) },
    offeredBy: ORG_JSONLD,
  };

  const deadline = job.deadline ? new Date(job.deadline).toUTCString() : '';
  return entityHtml({
    canonicalUrl,
    title,
    description,
    image,
    jsonLd,
    ogType: 'website',
    noindex: !isBountyIndexable(job),
    heading: name,
    breadcrumb: `<a href="${APP_URL}">DeHub</a> › <a href="${APP_URL}/work">Bounties</a>`,
    // The whole brief, not the 200-character meta cut of it: the crawl found
    // every bounty page at ~76 words, which was that cut plus the facts line.
    bodyHtml: `${bountyBriefHtml(job.description, description)}
<p><strong>${escHtml(budget)} ${escHtml(job.currency)}</strong> · ${escHtml(job.job_type)}${job.platform ? ` · ${escHtml(job.platform)}` : ''} · ${escHtml(String(job.status).replace(/_/g, ' '))}</p>
${Array.isArray(job.tags) && job.tags.length ? `<p>Tags: ${job.tags.slice(0, 10).map((t) => escHtml(String(t))).join(', ')}</p>` : ''}
${deadline ? `<p>Closes ${escHtml(deadline)}</p>` : ''}
<p>${Number(job.units_approved) || 0} of ${Number(job.max_units) || 0} slots filled · ${Number(job.application_count) || 0} applicants${Number(job.view_count) ? ` · ${Number(job.view_count).toLocaleString('en-US')} views` : ''}</p>
<h2>How a DeHub bounty works</h2>
<p>A bounty is a scoped task with a budget attached, posted by a DeHub account and open to anyone. The poster funds it up front and the money is held in escrow; a worker applies, does the work, submits it, and is paid in ${escHtml(!job.currency || job.currency === 'DHB' ? 'tokens' : job.currency)} on approval${Number(job.price_per_unit) > 0 ? ` — ${escHtml(Number(job.price_per_unit).toLocaleString('en-US', { maximumFractionDigits: 4 }))} ${escHtml(job.currency === 'DHB' ? 'tokens' : job.currency || '')} per completed unit, up to ${Number(job.max_units) || 0} on this one` : ''}. Disputes go to the platform, and an unfilled bounty returns its funds to the poster when it closes. The open board is at <a href="${APP_URL}/work">dehub.io/work</a>.</p>`,
  });
}

/**
 * A shared Creator Flow, /creator/flow/<id>. The row's cover_url is the first
 * finished still in the graph; a flow that has not rendered anything yet
 * falls back to the creator card, which is still the page's subject.
 */
function buildCreatorFlowHtml(flow) {
  const canonicalUrl = `${APP_URL}/creator/flow/${flow.id}`;
  const name = flow.name || 'Creator Flow';
  const nodeCount = Number(flow.node_count) || 0;
  const description = truncate(
    `${name} — a shared AI generation flow on DeHub with ${nodeCount} node${nodeCount === 1 ? '' : 's'}. Open a copy in Creator Flow to run it with your own prompts and references.`,
    200,
  );
  return entityHtml({
    canonicalUrl,
    title: `${name} — DeHub Creator Flow`,
    description,
    image: absolutize(flow.cover_url) || shareImage('creator'),
    ogType: 'article',
    heading: name,
    breadcrumb: `<a href="${APP_URL}">DeHub</a> › <a href="${APP_URL}/creator">Creator</a> › <a href="${APP_URL}/creator/flow">Flow</a>`,
    bodyHtml: `<p>${escHtml(description)}</p>
<p><a class="dh-cta" href="${appHref(canonicalUrl)}" rel="nofollow">Open this flow</a> · <a href="${APP_URL}/creator/flow">Build your own</a></p>`,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'CreativeWork',
      name,
      description,
      url: canonicalUrl,
      ...(flow.created_at ? { dateCreated: flow.created_at } : {}),
      ...(flow.updated_at ? { dateModified: flow.updated_at } : {}),
      // A WebPage: a nested SoftwareApplication is still a Software App item
      // to Google, and invalid without a rating.
      isPartOf: { '@type': 'WebPage', name: 'DeHub Creator Flow', url: `${APP_URL}/creator/flow` },
    },
  });
}

/**
 * A single creator pack, /packs/<slug>. The pack's cover is its first item,
 * which is exactly the art a share card should show.
 */
function buildCreatorPackHtml(pack) {
  const canonicalUrl = `${APP_URL}/packs/${pack.slug}`;
  const name = pack.name || 'Pack';
  const kind = pack.kind === 'emoji' ? 'emoji pack' : pack.kind === 'sticker' ? 'sticker pack' : 'GIF pack';
  const count = Number(pack.item_count) || 0;
  const description = `${name} — a DeHub ${kind} with ${count} item${count === 1 ? '' : 's'}. Add it to your picker and use it in chats, comments and reactions.`;
  return entityHtml({
    canonicalUrl,
    title: `${name} — DeHub ${kind}`,
    description,
    image: pack.cover_url || shareImage('packs'),
    heading: name,
    breadcrumb: `<a href="${APP_URL}">DeHub</a> › <a href="${APP_URL}/packs">Packs</a>`,
    bodyHtml: `<p>${escHtml(description)}</p>
<p><a class="dh-cta" href="${appHref(canonicalUrl)}" rel="nofollow">Add this pack</a> · <a href="${APP_URL}/packs">Browse packs</a></p>`,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'ImageGallery',
      name,
      description,
      url: canonicalUrl,
      ...(pack.cover_url ? { image: pack.cover_url } : {}),
      numberOfItems: count,
      ...(pack.created_at ? { dateCreated: pack.created_at } : {}),
    },
  });
}

/**
 * A single DAO proposal, /app/governance/<uuid>. Proposals carry no art of
 * their own, so the governance card stands in — that is still the page's
 * subject, unlike the homepage card it was getting.
 */
function buildProposalHtml(proposal) {
  const canonicalUrl = `${APP_URL}/app/governance/${proposal.id}`;
  const name = proposal.title || 'Proposal';
  const author = proposal.author_username
    ? `@${proposal.author_username}`
    : `${String(proposal.author_wallet_address || '').slice(0, 6)}...${String(proposal.author_wallet_address || '').slice(-4)}`;
  const status = String(proposal.status || 'open').replace(/_/g, ' ');
  const votes = Number(proposal.vote_count) || 0;
  const description = truncate(
    proposal.description || `${name} — a governance proposal on DeHub, ${status}, with ${votes} votes.`,
    200,
  );
  return entityHtml({
    canonicalUrl,
    title: `${name} — DeHub Governance`,
    description,
    image: shareImage('governance'),
    ogType: 'article',
    heading: name,
    breadcrumb: `<a href="${APP_URL}">DeHub</a> › <a href="${APP_URL}/governance">Governance</a>`,
    bodyHtml: `<p>${escHtml(description)}</p>
<p><strong>${escHtml(status)}</strong> · ${votes} votes · ${Number(proposal.comment_count) || 0} comments · proposed by ${escHtml(author)}</p>`,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'DiscussionForumPosting',
      headline: name,
      text: description,
      url: canonicalUrl,
      datePublished: proposal.created_at,
      ...(proposal.updated_at ? { dateModified: proposal.updated_at } : {}),
      author: { '@type': 'Person', name: author },
      commentCount: Number(proposal.comment_count) || 0,
      interactionStatistic: {
        '@type': 'InteractionCounter',
        interactionType: 'https://schema.org/LikeAction',
        userInteractionCount: votes,
      },
    },
  });
}

/**
 * A single request or bug report on the community board, /features?feature=<id>
 * (also reachable as /app/features?...). FeaturesPage never mints a per-request
 * URL of its own — `?feature=<id>` is read purely client-side to scrollIntoView
 * the card by its DOM id (`#feature-<id>`) — so every deep link into the board,
 * no matter which request or whose reply someone was looking at when they
 * copied the address bar, unfurled as the one static `features` MARKETING_PAGES
 * card below. Read straight from PostgREST, same as stores/events/stages/
 * bounties above: ssr-seo has never heard of this table either.
 */
function buildFeatureRequestHtml(feature) {
  const canonicalUrl = `${APP_URL}/features?feature=${feature.id}`;
  const name = feature.title || 'Feature Request';
  const title = `${name} — DeHub Feature Requests`;
  const description = truncate(
    feature.description || 'A community feature request or bug report on the DeHub roadmap board.',
    200,
  );
  const image = absolutize(feature.image_url) || shareImage('features');
  const authorName = feature.author_username
    ? `@${feature.author_username}`
    : `${feature.author_wallet_address.slice(0, 6)}...${feature.author_wallet_address.slice(-4)}`;
  const status = String(feature.status || 'open').replace(/_/g, ' ');
  const category = String(feature.category || 'other').replace(/_/g, ' ');

  return entityHtml({
    canonicalUrl,
    title,
    description,
    image,
    ogType: 'article',
    // A declined report is a dead end, same treatment as a sold listing or a
    // finished bounty: shareable by whoever holds the link, not crawlable.
    noindex: feature.status === 'declined',
    heading: name,
    breadcrumb: `<a href="${APP_URL}">DeHub</a> › <a href="${APP_URL}/features">Feature Requests</a>`,
    bodyHtml: `<p>${escHtml(description)}</p>
<p><strong>${escHtml(status)}</strong> · ${escHtml(category)}</p>
<p>${Number(feature.vote_count) || 0} votes · ${Number(feature.comment_count) || 0} comments · posted by ${escHtml(authorName)}</p>`,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'DiscussionForumPosting',
      headline: name,
      text: description,
      url: canonicalUrl,
      datePublished: feature.created_at,
      ...(feature.updated_at ? { dateModified: feature.updated_at } : {}),
      ...(image ? { image } : {}),
      author: { '@type': 'Person', name: authorName },
      commentCount: Number(feature.comment_count) || 0,
      interactionStatistic: {
        '@type': 'InteractionCounter',
        interactionType: 'https://schema.org/LikeAction',
        userInteractionCount: Number(feature.vote_count) || 0,
      },
    },
  });
}

/** The full guide article, pre-rendered from its React page into
 *  public/guide-content/<slug>.json. Same caching rules as getDocsContent. */
const _guideContentCache = new Map();
async function getGuideContent(request, env, slug) {
  if (_guideContentCache.has(slug)) return _guideContentCache.get(slug);
  let content = null;
  try {
    const res = await env.ASSETS.fetch(new URL(`/guide-content/${slug}.json`, request.url), { headers: { Accept: 'application/json' } });
    if (res.ok) content = await res.json();
  } catch (e) {
    console.error('[Edge] guide content fetch failed', slug, e);
  }
  if (content) _guideContentCache.set(slug, content); // never cache failures
  return content;
}

function buildGuidePageHtml(slug, meta, contentHtml) {
  const canonicalUrl = `${APP_URL}/guides/${slug}`;
  // The rendered article carries its own <h1>; the fallback summary does not.
  const article = contentHtml || `<h1>${escHtml(meta.title)}</h1>
${meta.bodyHtml || `<p>${escHtml(meta.description)}</p>`}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escHtml(meta.title)}</title>
<meta name="description" content="${escHtml(meta.description)}">
<link rel="canonical" href="${canonicalUrl}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="DeHub">
${ogLocaleTag()}
<meta property="og:url" content="${canonicalUrl}">
<meta property="og:title" content="${escHtml(meta.title)}">
<meta property="og:description" content="${escHtml(meta.description)}">
${twitterTextTags(meta.title, meta.description)}
${shareMetaTags(`guides/${slug}`, meta.title)}
<meta name="twitter:site" content="@dehub_official">
<script type="application/ld+json">${jsonLdScript({
  '@context': 'https://schema.org', '@type': 'Article',
  headline: meta.title, description: meta.description,
  // The route's own share card, and the organisation as author: the guide
  // has no byline, and inventing a Person for it would be a false claim.
  image: shareImage(`guides/${slug}`),
  ...(meta.datePublished ? { datePublished: meta.datePublished } : {}),
  ...(meta.dateModified || meta.datePublished ? { dateModified: meta.dateModified || meta.datePublished } : {}),
  author: { '@type': 'Organization', name: 'DeHub', url: APP_URL },
  publisher: ORG_JSONLD, mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
})}</script>
${breadcrumbScript([HOME_CRUMB, { name: 'Blog', url: `${APP_URL}/docs/blog` }, { name: meta.title.replace(/ — DeHub Guide$/, ''), url: canonicalUrl }])}
</head>
<body>
<p><a href="${APP_URL}/">DeHub</a> › <a href="${APP_URL}/docs/blog">Blog</a></p>
<article>${article}</article>
<p><a href="${APP_URL}/docs/blog">← All DeHub blog posts</a> · <a href="${APP_URL}/">dehub.io home</a></p>
</body>
</html>`;
}


/** Minimal OG HTML served to bots when SSR times out or fails.
 *  Prevents them from caching the generic React SPA index.html,
 *  which has no post-specific image and causes the 2-3 hour re-scrape delay.
 */
function buildFallbackHtml(pathname, canonicalUrl) {
  const postMatch = pathname.match(/\/post\/(\d+)/);
  const postId = postMatch ? postMatch[1] : null;
  const title = postId
    ? `Post #${postId} on DeHub`
    : 'DeHub — Open Source, User Owned & Censorship Resistant Media';
  const description = 'Open source, user owned and censorship resistant media.';
  const image = shareImage('fallback');
  // Canonical must never echo mirror hostnames or query strings.
  const url = `${APP_URL}${canonicalizePath(pathname)}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <meta name="description" content="${description}">
${canonicalizePath(pathname) === '/' ? `  <meta name="google-site-verification" content="${GOOGLE_SITE_VERIFICATION}">\n` : ''}  <meta property="og:type" content="website">
  <meta property="og:url" content="${url}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${image}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${image}">
  <meta name="twitter:site" content="@dehub_official">
  <link rel="canonical" href="${url}">
</head>
<body>
  <p><a href="${url}">${title}</a></p>
</body>
</html>`;
}

/**
 * First path segments that are NOT usernames. Read from the same list the app
 * refuses to hand out at signup, so the two can no longer disagree.
 *
 * This used to be a hand-kept array here, and every entry below the original
 * dozen was added reactively after a real route shipped and got read as a
 * profile: /stats, then a batch of seven (/connect looked like @connect), then
 * /apk (the download lander answered "Join @apk" to every unfurl), then /blog
 * (a user had registered that handle), then /arcade. Each of those was the same
 * bug arriving again because adding a route and reserving its name were two
 * separate manual steps in two separate files. Now they are one list: add a
 * top-level route, add it to src/lib/reserved-usernames.js, and both the signup
 * guard and this renderer pick it up together.
 */
const SYSTEM_ROUTES = new Set([
  ...ROUTE_SEGMENTS,
  ...WORKER_ASSET_ROUTES,
]);


// `bot|crawl|spider` covers the crawlers that announce themselves. It does NOT
// cover Google's own non-Googlebot tooling (Google-InspectionTool backs Search
// Console's URL Inspection; GoogleOther backs assorted product checks including
// the OAuth app-verification homepage fetch) nor plain HTTP clients. Those all
// fell through to the SPA shell — an empty <div id="root"> — which is why OAuth
// verification reported dehub.io as unresponsive in July 2026.
//
// Deliberately excludes headless-browser UAs: those execute JS and are better
// served the real SPA. Every UA added here is a non-rendering fetcher, so the
// prerendered HTML is strictly more than it could otherwise see.
//
// The link-preview fetchers on the second line name no bot at all: Bluesky's
// Cardyb, Mastodon before 4.2 (`http.rb/… (Mastodon/…)`), Teams/Skype,
// Embedly, Iframely, VK, Google Chat's snippet fetcher, and the user-triggered
// AI fetchers (the `*-User/1.0` agents, matched on `-user/`). Each of them unfurled
// every DeHub link as the homepage card. Naver's Yeti and Yahoo's Slurp are
// search crawlers that do not run the SPA.
const BOT_UA_PATTERN = /bot|crawl|spider|facebook|twitter|linkedin|whatsapp|telegram|slack|discord|facebot|oggrabber|google-inspectiontool|googleother|apis-google|feedfetcher|curl|wget|python-requests|python-urllib|axios|node-fetch|got |okhttp|go-http-client|java\/|libwww-perl|ruby|postmanruntime|insomnia|httpie|cardyb|bluesky|mastodon|http\.rb|skypeuripreview|embedly|iframely|vkshare|yeti|slurp|-user\/|google \(\+https/i;

// Search engines, as opposed to link previewers. When the data behind a page
// cannot be read, a search engine should be told to come back (503) rather
// than shown a thin stand-in it might index; a previewer only ever wants a
// card, and a stand-in card beats a failed unfurl.
const SEARCH_BOT_UA_PATTERN = /googlebot|google-inspectiontool|googleother|storebot-google|adsbot-google|bingbot|msnbot|bingpreview|applebot|duckduckbot|duckassistbot|yandex|baiduspider|petalbot|seznambot|qwantbot|yeti|slurp|gptbot|oai-searchbot|claudebot|claude-searchbot|perplexitybot|ccbot|amazonbot|bytespider|ahrefsbot|semrushbot|mj12bot|dotbot/i;

export function isSearchBotUa(ua) {
  return SEARCH_BOT_UA_PATTERN.test(ua || '');
}

// A link-preview crawler and a social app's in-app browser are not the same
// thing, and the brand words above cannot tell them apart. "Twitter for
// iPhone/10.31", "LinkedInApp" and "WhatsApp/2.24.1.75 A" each sit at the end
// of an ordinary WebView user agent belonging to a PERSON who tapped a shared
// link — and they matched `twitter`, `linkedin` and `whatsapp`, so everyone
// arriving from those apps was served the prerendered crawler page instead of
// DeHub. The only control on that page is a link back to its own URL, which is
// classified the same way and answers with the same page — the reported
// "View on DeHub does nothing". It covered every shared post, profile, doc and
// referral landing, which is the whole point of sharing a link.
//
// The tell is the rendering engine. A fetcher either omits it entirely
// (`Twitterbot/1.0`, `WhatsApp/2.23.20.0 A`, `facebookexternalhit/1.1`) or
// declares itself behind `compatible;` (`Mozilla/5.0 (compatible;
// LinkedInBot/1.0)`, Googlebot, Google-InspectionTool, Discordbot). A WebView
// sends the real AppleWebKit/Gecko token and never says `compatible;`.
//
// Anything that still names itself a crawler inside a browser-shaped UA
// (Applebot, Chrome-Lighthouse, SkypeUriPreview) stays on the bot side.
// Google Chat's fetcher is the one of those that wears a full Chrome UA with
// no `compatible;`, so its signature is listed here too.
const CRAWLER_TOKEN_PATTERN = /\b(?:bot|crawler|spider|scraper)\b|(?:bot|crawler|spider)[/-]|externalhit|externalagent|externalfetcher|oggrabber|lighthouse|inspectiontool|preview|cardyb|embedly|iframely|vkshare|-user\/|google \(\+https/i;

function looksLikeRenderingBrowser(ua) {
  if (!/AppleWebKit\/[\d.]|Gecko\/\d/i.test(ua)) return false;
  if (/compatible[;)]/i.test(ua)) return false;
  return !CRAWLER_TOKEN_PATTERN.test(ua);
}

export function isCrawlerUa(ua) {
  return BOT_UA_PATTERN.test(ua) && !looksLikeRenderingBrowser(ua);
}

// The escape hatch out of a prerendered page. Every self-referencing CTA in
// crawler HTML ("View on DeHub", "Open X on DeHub") points at the page's own
// URL, so without a marker the link re-requests that URL, is judged the same
// way and renders the same page again. `?app=1` forces the React SPA for any
// user agent, and its response carries a noindex so the query-string twin
// never enters the index.
const APP_ESCAPE_PARAM = 'app';

/**
 * Every prerendered page is DeHub's front door. It is what a crawler indexes,
 * what a preview card is built from, and what anyone lands on when a link is
 * opened somewhere an ordinary browser is not. For years it was raw markup —
 * pale-green links on black, a #00ff00 "View on DeHub" button, sans-serif —
 * which looked nothing at all like the product it was advertising.
 *
 * This is the app's own design system (the rule block at the top of
 * src/index.css: black / white / zinc only, Exo, liquid glass, no coloured
 * accents) reduced to one inline stylesheet. Inline on purpose — a crawler
 * fetches one document and the page has to render from it alone, so a
 * stylesheet request is a request that may never be made.
 *
 * It reaches every prerendered response through guard(), including the pages
 * proxied from the ssr-seo function: that function deploys on its own track
 * and cannot be relied on to change, so its markup is restyled here instead.
 */
const PRERENDER_STYLE = `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Exo:wght@400;700;900&display=swap"><style>
:root{--dh-bg:#000;--dh-panel:#131316;--dh-line:rgba(255,255,255,.12);--dh-fg:#fff;--dh-muted:#a1a1aa;--dh-dim:#71717a}
*{box-sizing:border-box}
body{margin:0;background:var(--dh-bg);color:var(--dh-fg);font-family:'Exo','Apple Color Emoji','Noto Color Emoji','Segoe UI Emoji',system-ui,-apple-system,'Segoe UI',sans-serif;line-height:1.65;-webkit-font-smoothing:antialiased;overflow-wrap:break-word}
.dh-head{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 20px;border-bottom:1px solid var(--dh-line);background:rgba(0,0,0,.72);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px)}
.dh-head img{height:26px;width:auto;display:block;border:0;border-radius:0;margin:0}
.dh-head a{border:0}
.dh-open{font-size:13px;font-weight:700;padding:7px 15px;border-radius:999px;background:rgba(255,255,255,.08);border:1px solid var(--dh-line);color:#fff;white-space:nowrap}
.dh-open:hover{background:rgba(255,255,255,.16)}
.dh-main{max-width:760px;margin:0 auto;padding:36px 20px 52px}
h1{font-size:34px;line-height:1.16;font-weight:900;letter-spacing:-.01em;margin:0 0 14px}
h2{font-size:20px;font-weight:700;margin:34px 0 12px}
h3{font-size:16px;font-weight:700;margin:24px 0 8px}
p,li{color:var(--dh-muted)}
p{margin:0 0 14px}
strong{color:#fff}
a{color:#fff;text-decoration:none;border-bottom:1px solid rgba(255,255,255,.28)}
a:hover{border-bottom-color:#fff}
img{max-width:100%;height:auto;display:block;border-radius:16px;border:1px solid var(--dh-line);margin:22px 0}
.dh-cta{display:inline-block;margin:12px 0 6px;padding:11px 24px;border-radius:10px;background:#fff;color:#000;font-weight:700;border:0}
.dh-cta:hover{background:#e4e4e7;border:0}
nav{margin:34px 0 0;display:flex;flex-wrap:wrap;gap:8px}
nav h2{flex:0 0 100%;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--dh-dim);margin:0}
nav ul{flex:0 0 100%;list-style:none;padding:0;margin:0;display:flex;flex-wrap:wrap;gap:8px}
nav li{margin:0}
nav a,nav strong{display:inline-block;padding:7px 14px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid var(--dh-line);color:var(--dh-muted);font-size:13px;font-weight:400}
nav a:hover{background:rgba(255,255,255,.12);color:#fff;border-color:rgba(255,255,255,.3)}
nav strong{background:rgba(255,255,255,.14);border-color:rgba(255,255,255,.3);color:#fff}
section{margin:34px 0 0}
section h2{font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--dh-dim);margin:0 0 12px}
section ul{list-style:none;padding:0;margin:0}
section li{padding:12px 16px;margin:0 0 8px;background:var(--dh-panel);border:1px solid var(--dh-line);border-radius:12px}
section li a{border:0;font-weight:700}
code{background:rgba(255,255,255,.07);border:1px solid var(--dh-line);border-radius:6px;padding:1px 6px;font-size:.92em}
table{width:100%;border-collapse:collapse;margin:18px 0}
td,th{border:1px solid var(--dh-line);padding:9px 11px;text-align:left}
th{color:#fff;font-weight:700}
.dh-foot{border-top:1px solid var(--dh-line);padding:24px 20px 30px;color:var(--dh-dim);font-size:13px;text-align:center}
.dh-foot a{color:var(--dh-muted);border:0}
.dh-foot a:hover{color:#fff}
@media(max-width:600px){h1{font-size:27px}.dh-main{padding:26px 16px 40px}}
</style>`;

// Site-wide links on every crawler page point at canonical URLs: /app/explore
// canonicalises to /explore and /guides 301s to /docs/blog, so linking either
// spent a hop or a duplicate on every page.
const PRERENDER_HEADER = `<header class="dh-head"><a href="${APP_URL}/"><img src="${APP_URL}/dehub-header-logo.png" alt="DeHub" width="270" height="81"></a><a class="dh-open" href="${APP_URL}/explore">Open DeHub</a></header><main class="dh-main">`;

const PRERENDER_FOOTER = `</main><footer class="dh-foot">DeHub — open source, user owned and censorship resistant media.<br><a href="${APP_URL}/docs">Docs</a> · <a href="${APP_URL}/docs/blog">Blog</a> · <a href="${APP_URL}/explore">Explore</a></footer>`;

/**
 * The other half of the problem: every builder in this file, and the ssr-seo
 * function, carries its own hardcoded inline colours, and each one outranks the
 * sheet above. They are dropped wholesale so a single stylesheet owns the page.
 * Scoped outside script and style blocks, where the same characters could
 * belong to content rather than to an element.
 */
function stripInlineStyles(html) {
  return html
    .split(/(<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>)/i)
    .map((part, i) => (i % 2 ? part : part.replace(/\sstyle="[^"]*"/gi, '')))
    .join('');
}

/**
 * The head boilerplate every crawler page needs, applied at the one point
 * they all pass through.
 *
 * The proxied post and profile pages arrive with a viewport meta and titles
 * already clamped by normalizeProxiedMeta. The pages built at the edge —
 * guides, docs, blog, marketing, stores, stages, bounties — return before that
 * runs and carried neither: the 2026-09-13 crawl found 177 of 178 static pages
 * with no viewport, so mobile-first indexing lays them out at desktop width,
 * and 65 titles of 71–110 characters, all on the pages written to rank, which
 * Google cuts off. One place, both fixed. Idempotent for the pages that
 * already had them: a present viewport is left alone and a title inside the
 * limit is byte-identical on the way out.
 */
const VIEWPORT_META = '<meta name="viewport" content="width=device-width, initial-scale=1">';
const HTML_ENTITIES = { '&amp;': '&', '&quot;': '"', '&lt;': '<', '&gt;': '>', '&#39;': "'" };
function clampEscapedTitle(escaped, max) {
  const plain = String(escaped).replace(/&(?:amp|quot|lt|gt|#39);/g, (e) => HTML_ENTITIES[e]);
  if (plain.length <= max) return escaped;
  return escHtml(clampTitle(plain, max));
}
function normalizePrerenderedHead(html) {
  let out = html;
  if (!/<meta[^>]+name="viewport"/i.test(out)) {
    const withCharset = out.replace(/(<meta charset="[^"]*">)/i, `$1\n${VIEWPORT_META}`);
    out = withCharset !== out ? withCharset : out.replace('<head>', `<head>\n${VIEWPORT_META}`);
  }
  return out
    .replace(/(<title>)([^<]*)(<\/title>)/i, (m, a, v, b) => `${a}${clampEscapedTitle(v, TITLE_MAX)}${b}`)
    .replace(
      /(<meta (?:property|name)="(?:og:title|twitter:title|og:image:alt|twitter:image:alt)" content=")([^"]*)(">)/g,
      (m, a, v, b) => `${a}${clampEscapedTitle(v, TITLE_MAX)}${b}`,
    );
}

export function stylePrerendered(html) {
  if (typeof html !== 'string') return html;
  if (!html.includes('</head>') || !html.includes('</body>')) return html;
  if (html.includes('class="dh-main"')) return html;
  return stripInlineStyles(normalizePrerenderedHead(html).replace('</head>', `${PRERENDER_STYLE}</head>`))
    .replace(/<body[^>]*>/i, `<body>${PRERENDER_HEADER}`)
    .replace('</body>', `${PRERENDER_FOOTER}</body>`);
}

export function appHref(url) {
  if (url.includes(`${APP_ESCAPE_PARAM}=1`)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}${APP_ESCAPE_PARAM}=1`;
}

// Static marketing/app routes that need per-route OG meta (bots only).
// Kept in sync with the STATIC_ROUTES map inside supabase/functions/ssr-seo.
const SSR_STATIC_ROUTES = new Set([
  'features', 'pricing', 'depin', 'creator', 'editor', 'prompt', 'work',
  'affiliate', 'premium', 'governance', 'leaderboard', 'top-100', 'dao',
  'music', 'radio', 'tv', 'bridge', 'agents',
  'assistant', 'creators', 'jobs',
  // Same reason as 'arcade' below: /app/usernames and /usernames are the same
  // page, and without this the /app twin self-canonicalizes and indexes as a
  // duplicate. Rendered from MARKETING_PAGES, never proxied to the fn.
  'usernames',
  // Listed for canonicalizePath, not for the Supabase fn: /app/arcade is a
  // real SPA route and without this it self-canonicalizes, indexing as a
  // duplicate of /arcade. The page itself is rendered from MARKETING_PAGES,
  // which is checked before the fn is ever consulted (same as 'features').
  'arcade',
  // Same again: each of these is one page with a top-level route AND an /app
  // twin, both rendered from MARKETING_PAGES.
  'accounts', 'converter', 'events', 'launchpad', 'stats',
  'migrate-youtube',
  // These three used to be the exception — /app-only pages that named their own
  // `path` in MARKETING_PAGES so the canonical would not point at a URL the
  // router did not have. The router has it now: every /app child answers at the
  // bare path as well, so they canonicalize the same way as everything above
  // and their `path` overrides are gone.
  'stores', 'fractions', 'superpowers', 'glossary',
  'ads', 'buy',
  // /guides/* is handled entirely at the edge (GUIDE_PAGES + blog manifest),
  // never proxied to the Supabase fn — its STATIC_ROUTES allowlist is stale.
  //
  // 'delete-account' is out for the same reason: the Supabase fn's STATIC_ROUTES
  // never learned it, so proxying there answered 404 to every crawler while
  // browsers saw the real React page. It's in SYSTEM_ROUTES, so dropping it here
  // routes it to the SPA shell (200) instead. App-store and OAuth reviewers do
  // check the account-deletion URL, and a 404 there fails review.
]);

/** Canonical path: strip trailing slashes, and collapse the /app-prefixed
 *  twins of static marketing routes onto the bare variant (/app/tv -> /tv).
 *  Both variants serve identical HTML; without one canonical they index as
 *  duplicates and split ranking signals. Query strings never survive
 *  (dehub.io/?type=new was indexed as a homepage duplicate). */
function canonicalizePath(pathname) {
  const p = pathname.replace(/\/+$/, '') || '/';
  const noApp = p.replace(/^\/app\//, '/');
  const key = noApp.replace(/^\/+|\/+$/g, '').toLowerCase();
  if (SSR_STATIC_ROUTES.has(key)) return noApp;
  // Profile deep paths: /<user>/<anything> served 200 with a self-canonical,
  // letting every registered username mint an unbounded duplicate URL space
  // (fed by dehub.net's catch-all 301). Canonicalize to the profile root.
  const parts = p.replace(/^\/+/, '').split('/');
  if (parts.length > 1) {
    const first = parts[0].toLowerCase().replace('@', '');
    if (couldBeProfileSegment(first, SYSTEM_ROUTES)) {
      return `/${parts[0]}`;
    }
  }
  return p;
}

/**
 * Make `pageUrl` the page's one URL: rel=canonical and og:url set to it (added
 * if missing), and twitter:url too where the page carries one. Every existing
 * copy is dropped first, so a proxied page can never end up declaring two.
 * Written in exactly the shape localizePage and the profile branch match on.
 */
export function setPageUrl(html, pageUrl) {
  const hadTwitterUrl = /<meta\s+(?:name|property)="twitter:url"/i.test(html);
  const out = html
    .replace(/[ \t]*<link\s+rel="canonical"[^>]*>\n?/gi, '')
    .replace(/[ \t]*<meta\s+(?:property|name)="og:url"[^>]*>\n?/gi, '')
    .replace(/[ \t]*<meta\s+(?:name|property)="twitter:url"[^>]*>\n?/gi, '');
  const tags = [
    `<link rel="canonical" href="${pageUrl}">`,
    `<meta property="og:url" content="${pageUrl}">`,
    ...(hadTwitterUrl ? [`<meta name="twitter:url" content="${pageUrl}">`] : []),
  ].join('\n');
  return out.replace('</head>', `${tags}\n</head>`);
}

/** Exact <title> strings the deployed Supabase fn emits when an entity
 *  lookup comes back empty. Serving them as 200 minted an indexable thin
 *  page for every random URL; they must be 404s. */
const NOT_FOUND_TITLES = [
  '<title>Post by someone on DeHub</title>',
  '<title>DeHub — Open Source, User Owned & Censorship Resistant Media</title>',
];

/** Resolve an off-chain post slug (/newpost/<n>) to the tokenId every other
 *  surface addresses that post by. The mapping lives behind the API and
 *  survives minting, so a link shared before the mint keeps resolving. */
async function resolveNewPostTokenId(n) {
  try {
    const res = await fetch(`https://api.dehub.io/api/newpost/${encodeURIComponent(n)}`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const id = data?.tokenId ?? data?.result?.tokenId;
    return Number.isFinite(Number(id)) ? String(Number(id)) : null;
  } catch {
    return null;
  }
}

/** The sitemap spec's own cap, and the page size the API is asked for. */
const PROFILE_SITEMAP_PAGE_SIZE = 50000;

/**
 * One page of the profile list, or null.
 *
 * The API decides who is in it — accounts with at least one post a signed-out
 * visitor can see. That threshold lives there rather than here because it is an
 * indexation policy, not a rendering detail: submitting a few thousand empty
 * profile pages is a thin-content signal Google applies to the whole site.
 *
 * The generous timeout is deliberate. This runs at most twice an hour per
 * colo (the responses carry s-maxage=3600) and the first uncached call behind
 * it aggregates every published post; giving up early would mean publishing the
 * fifty-URL fallback for an hour to save a few seconds nobody is waiting on.
 */
async function dehubProfileSitemap(page, limit) {
  try {
    const res = await fetch(
      `https://api.dehub.io/api/sitemap/profiles?page=${page}&limit=${limit}`,
      { signal: AbortSignal.timeout(20000) },
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !Array.isArray(data.profiles)) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * A page of profile rows as sitemap XML.
 *
 * Exported for its tests: the two filters below are the difference between a
 * sitemap of real pages and a sitemap of 404s, and neither is visible in a
 * response anyone reads.
 *
 *  - `couldBeProfileSegment` is the same test the SSR path uses to decide a URL
 *    IS a profile. A handful of accounts pre-date the reserved-name list and
 *    hold names like `admin` and `explore`; `dehub.io/<that>` serves the route,
 *    not the person, so submitting it asks Google to index a page that will
 *    never exist. It also drops anything with a dot, which is the same rule
 *    that keeps `/favicon.ico` from being read as a username.
 *  - Case-insensitive de-duplication, because the router matches
 *    case-insensitively: `/Alice` and `/alice` are one page, and submitting
 *    both is a self-inflicted duplicate.
 *
 * `changefreq` is weekly rather than the old daily. Fifty hand-picked accounts
 * could honestly claim daily; several thousand cannot, and a sitemap whose
 * hints are contradicted by every recrawl is one whose hints get ignored.
 */
export function profileSitemapXml(profiles, systemRoutes) {
  const seen = new Set();
  const urls = [];
  for (const p of profiles || []) {
    const username = typeof p?.username === 'string' ? p.username.trim().replace(/^@+/, '') : '';
    if (!username) continue;
    const key = username.toLowerCase();
    if (seen.has(key) || !couldBeProfileSegment(key, systemRoutes)) continue;
    seen.add(key);
    // Anything not an exact YYYY-MM-DD is dropped rather than passed through:
    // a malformed lastmod invalidates the whole file for some parsers, and the
    // date is the least important thing in the entry.
    const lastmod = /^\d{4}-\d{2}-\d{2}$/.test(p?.lastmod ?? '') ? `<lastmod>${p.lastmod}</lastmod>` : '';
    // The avatar, when the API row carries one. Today's rows are a username
    // and a date, so this stays empty until the endpoint adds it — nothing is
    // fetched per profile to find one.
    const avatar = [p?.avatarUrl, p?.avatarImageUrl, p?.avatar].find((u) => typeof u === 'string' && u.trim());
    const image = avatar
      ? transformedImageUrl(/^https?:\/\//i.test(avatar.trim()) ? avatar.trim() : `${CDN_ORIGIN}/${avatar.trim().replace(/^\/+/, '')}`)
      : '';
    const img = image ? `<image:image><image:loc>${xmlText(image)}</image:loc></image:image>` : '';
    urls.push(
      `  <url><loc>${APP_URL}/${encodeURIComponent(username)}</loc>${lastmod}<changefreq>weekly</changefreq><priority>0.5</priority>${img}</url>`,
    );
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${urls.join('\n')}\n</urlset>`;
}

/** Post ids are sequential, so a sitemap page is an id range. */
const POST_SITEMAP_CHUNK_SIZE = 50000;
/** The API caps `limit` at 100 and silently returns 100 for anything larger. */
const POST_SITEMAP_FEED_PAGE_SIZE = 100;
const POST_SITEMAP_RETRIES = 4;
const POST_SITEMAP_MAX_WAIT_SECONDS = 30;
/** Start waiting with this many requests still in the budget: waiting out the
 *  tail of a window costs seconds, being throttled costs a whole one. */
const POST_SITEMAP_RATE_HEADROOM = 1;
/** Bounds both the run and the worker's subrequest count if the feed never
 *  says "no more". 200 pages is 20,000 posts against today's 3,299. */
const POST_SITEMAP_MAX_FEED_PAGES = 200;
/**
 * The quality bar a post clears to be offered to Google.
 *
 * Measured against 1,200 live posts on 2026-09-16: 44% carry fewer than 15
 * characters of letters and digits across their title and body, 10% carry none
 * at all, and 81% have no comments. Google had already reached its own verdict
 * on that corpus — 4,441 post URLs sat in "Crawled - currently not indexed" and
 * another 851 in "Discovered", i.e. it fetched them, read a caption and a view
 * count, and declined. Submitting the whole set costs crawl budget on pages
 * that will not be indexed and puts a site-wide thin-content signal on the ones
 * that would be.
 *
 * So: 40 characters of real text (roughly a sentence) in the title or body, or
 * a real conversation on the page. Comments count because the crawler HTML
 * carries them — they are the page's substance when the caption is not.
 *
 * This removes URLs from the sitemap; it does not deindex anything. A post that
 * is already indexed stays indexed, and one linked from a profile or feed page
 * is still reachable. The sitemap is a recommendation, and it is worth more
 * when every URL in it can carry a result.
 */
const POST_SITEMAP_MIN_TEXT = 40;
const POST_SITEMAP_MIN_COMMENTS = 3;

export function postQualifiesForSitemap(post) {
  if (!post || post.isHidden || post.isPrivate) return false;
  // A subscriber-gated post renders a paywall to a signed-out crawler, so the
  // page Google would index is not the page the URL promises.
  if (Array.isArray(post.plansDetails) && post.plansDetails.length) return false;
  // Deliberately no `status` test. The feed's own `status=minted` parameter is
  // silently ignored — 308 of 1,200 rows came back `signed`, i.e. posted
  // off-chain, which minting being optional makes routine — and all eight
  // sampled `signed` posts answer 200 at /app/post/<tokenId>. Rejecting them
  // would drop a quarter of the corpus for a distinction the page does not
  // make.
  const text = `${post.name || ''} ${post.description || ''}`.replace(/[^\p{L}\p{N}]/gu, '').length;
  if (text >= POST_SITEMAP_MIN_TEXT) return true;
  return Number(post.commentCount) >= POST_SITEMAP_MIN_COMMENTS;
}

/**
 * Qualifying posts as sitemap XML.
 *
 * Exported for its tests: the filter above is the whole point of the file and
 * it is invisible in any single response.
 */
export function postSitemapXml(posts) {
  const seen = new Set();
  const rows = [];
  for (const post of posts || []) {
    const id = Number(post && post.tokenId);
    if (!Number.isFinite(id) || seen.has(id)) continue;
    if (!postQualifiesForSitemap(post)) continue;
    seen.add(id);
    rows.push({ id, createdAt: post.createdAt, image: postSitemapImage(post) });
  }
  rows.sort((a, b) => a.id - b.id);
  const urls = rows.map(({ id, createdAt, image }) => {
    // Anything not an ISO date is dropped rather than passed through: a
    // malformed lastmod invalidates the whole file for some parsers.
    const day = /^\d{4}-\d{2}-\d{2}/.test(String(createdAt || '')) ? String(createdAt).slice(0, 10) : '';
    const lastmod = day ? `<lastmod>${day}</lastmod>` : '';
    const img = image ? `<image:image><image:loc>${xmlText(image)}</image:loc></image:image>` : '';
    return `  <url><loc>${APP_URL}/app/post/${id}</loc>${lastmod}<changefreq>weekly</changefreq><priority>0.6</priority>${img}</url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${urls.join('\n')}\n</urlset>`;
}

/**
 * The picture a post's page shows, served the way its share card serves it.
 * The feed row already carries the path, so this costs nothing. The legacy
 * nfts/images/ prefix is moved and a CDN copy goes through the same transform
 * the og:image does (see repairProxiedImages) — a real image/jpeg rather than
 * the octet-stream some originals answer with. Text posts have none.
 */
function postSitemapImage(post) {
  const raw = [post && post.imageUrl, ...(post && Array.isArray(post.imageUrls) ? post.imageUrls : [])]
    .find((u) => typeof u === 'string' && u.trim());
  if (!raw) return '';
  const url = /^https?:\/\//i.test(raw.trim()) ? raw.trim() : `${CDN_ORIGIN}/${raw.trim().replace(/^\/+/, '')}`;
  return transformedImageUrl(url.split(`${CDN_ORIGIN}/nfts/images/`).join(`${CDN_ORIGIN}/images/`));
}

const postSitemapSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Seconds to wait before the next feed request, read from the response's own
 * budget. api.dehub.io answers with `X-RateLimit-{Limit,Remaining,Reset}-
 * {short,medium,long}` and enforces all three; whichever is closest to empty
 * decides. A full enumeration is ~33 requests against a 20-per-10s bucket, so
 * it does not fit in one window and a naive run is throttled partway through.
 */
function postSitemapRateWait(headers) {
  let wait = 0;
  for (const bucket of ['short', 'medium', 'long']) {
    const remaining = Number(headers.get(`x-ratelimit-remaining-${bucket}`));
    const reset = Number(headers.get(`x-ratelimit-reset-${bucket}`));
    if (!Number.isFinite(remaining) || !Number.isFinite(reset)) continue;
    if (remaining > POST_SITEMAP_RATE_HEADROOM) continue;
    wait = Math.max(wait, Math.min(reset, POST_SITEMAP_MAX_WAIT_SECONDS));
  }
  return wait;
}

/** One page of the feed, retried through transient failures. Null once the
 *  retries are spent — which the caller must treat as an incomplete run, not
 *  as the end of the data. */
async function fetchSitemapFeedPage(page) {
  for (let attempt = 0; attempt < POST_SITEMAP_RETRIES; attempt++) {
    try {
      const res = await fetch(
        `https://api.dehub.io/api/feed?limit=${POST_SITEMAP_FEED_PAGE_SIZE}&page=${page}`
          // Without an explicit sort the API's page boundaries shift between
          // requests, so a post slides across one and is listed twice or not at
          // all; without status=minted the list carries posts whose /app/post/
          // page does not resolve, i.e. a sitemap of 404s.
          + '&sortBy=createdAt&sortOrder=desc&status=minted',
        { signal: AbortSignal.timeout(15000) },
      );
      if (!res.ok) {
        // A 429 or a 502 is "ask again", not "there are no more posts".
        const retryAfter = Number(res.headers.get('retry-after'));
        const wait = Math.max(
          postSitemapRateWait(res.headers),
          Number.isFinite(retryAfter) ? Math.min(retryAfter, POST_SITEMAP_MAX_WAIT_SECONDS) : 0,
          2 ** attempt,
        );
        await postSitemapSleep(wait * 1000);
        continue;
      }
      const json = await res.json();
      const wait = postSitemapRateWait(res.headers);
      if (wait > 0) await postSitemapSleep(wait * 1000);
      return json;
    } catch {
      await postSitemapSleep(1000 * 2 ** attempt);
    }
  }
  return null;
}

/**
 * Whether the sitemap index lists posts page `raw` — true, false, or null when
 * the newest post id could not be read.
 *
 * Counted the way the sitemap-index function counts: one page per
 * POST_SITEMAP_CHUNK_SIZE ids up to the newest minted post, never fewer than
 * one. Page 1 always exists and costs nothing; any other number costs one
 * single-row feed read instead of a full walk. `01` or `0` is not a page.
 */
async function postSitemapPageListed(raw) {
  if (!/^[1-9]\d{0,5}$/.test(String(raw))) return false;
  const page = Number(raw);
  if (page === 1) return true;
  try {
    const res = await fetch(
      'https://api.dehub.io/api/feed?limit=1&page=1&sortBy=createdAt&sortOrder=desc&status=minted',
      { signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return null;
    const json = await res.json();
    const maxId = Number(json && Array.isArray(json.result) && json.result[0] && json.result[0].tokenId);
    if (!Number.isFinite(maxId)) return null;
    return page <= Math.max(1, Math.ceil(maxId / POST_SITEMAP_CHUNK_SIZE));
  } catch {
    return null;
  }
}

/** The answer for a posts page the index does not list, or null to build it.
 *  An uncountable index is a 503 (retry), never a walk. */
async function unlistedPostSitemapResponse(raw) {
  const listed = await postSitemapPageListed(raw);
  if (listed === true) return null;
  if (listed === null) {
    return new Response('sitemap temporarily unavailable', { status: 503, headers: { 'Retry-After': '600' } });
  }
  return new Response('Not Found', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
}

/**
 * Every minted post in this sitemap page's id range, or null if the feed
 * failed partway.
 *
 * Null matters as much as the rows do: a feed that errors mid-walk says
 * nothing about the posts it did not return, so the caller keeps its cached
 * copy or falls back to the Supabase function rather than publishing a file
 * cut short by an outage. Running out of walk budget is different — see the
 * end of the loop.
 *
 * Built here rather than left in that function for the usual reason: the
 * sitemap-* functions only move on a manual `supabase functions deploy` that
 * nobody runs, so a filter added there would never reach production. Bounties
 * and profiles came across for the same reason; this was the last one left.
 */
async function dehubPostSitemap(page) {
  const minId = (page - 1) * POST_SITEMAP_CHUNK_SIZE + 1;
  const maxId = page * POST_SITEMAP_CHUNK_SIZE;
  const posts = [];
  const seen = new Set();
  for (let feedPage = 1; feedPage <= POST_SITEMAP_MAX_FEED_PAGES; feedPage++) {
    const json = await fetchSitemapFeedPage(feedPage);
    if (!json) return null;
    const rows = Array.isArray(json.result) ? json.result : [];
    if (rows.length === 0) return posts;
    let smallest = Infinity;
    for (const row of rows) {
      const id = Number(row && row.tokenId);
      if (!Number.isFinite(id)) continue;
      smallest = Math.min(smallest, id);
      if (id < minId || id > maxId || seen.has(id)) continue;
      seen.add(id);
      posts.push(row);
    }
    // Feed is newest-first, so once the smallest id on a page is below the
    // range no later page can add one inside it.
    if (smallest < minId) return posts;
    if (!(json.pagination && json.pagination.hasMore)) return posts;
  }
  // Out of walk budget with the feed still going: the newest posts in the
  // range, filtered. Returning null here used to hand the page to the
  // Supabase fallback, which lists every minted post unfiltered — thousands of
  // URLs Google has already declined — the moment the corpus outgrew the cap.
  // The older tail stays reachable through profiles; it is simply not
  // recommended, which is all a sitemap omission means.
  console.warn(`[Edge] post sitemap ${page}: walk cap of ${POST_SITEMAP_MAX_FEED_PAGES} feed pages reached, publishing the newest ${posts.length}`);
  return posts;
}

/**
 * Correct the profile entries in a sitemap index built by the Supabase
 * function: give chunk 1 the real newest-profile date, and add the chunks the
 * function does not know exist.
 *
 * Exported for its tests, and every step is guarded — a null `meta`, a changed
 * upstream shape or a missing closing tag all leave the index exactly as it
 * arrived. Publishing a broken index costs every sitemap on the site; missing
 * chunk 2 costs the profiles above 50,000.
 */
export function patchProfileChunks(indexXml, meta) {
  if (!indexXml || !meta || !indexXml.includes('</sitemapindex>')) return indexXml;

  let out = indexXml;

  if (/^\d{4}-\d{2}-\d{2}$/.test(meta.lastmod ?? '')) {
    out = out.replace(
      /<sitemap><loc>[^<]*\/sitemap-profiles-1\.xml<\/loc>(?:<lastmod>[^<]*<\/lastmod>)?<\/sitemap>/,
      `<sitemap><loc>${APP_URL}/sitemap-profiles-1.xml</loc><lastmod>${meta.lastmod}</lastmod></sitemap>`,
    );
  }

  const total = Number(meta.total);
  if (!Number.isFinite(total) || total <= 0) return out;
  const chunks = Math.ceil(total / PROFILE_SITEMAP_PAGE_SIZE);
  for (let i = 2; i <= chunks; i++) {
    if (out.includes(`/sitemap-profiles-${i}.xml`)) continue;
    out = out.replace(
      '</sitemapindex>',
      `  <sitemap><loc>${APP_URL}/sitemap-profiles-${i}.xml</loc></sitemap>\n</sitemapindex>`,
    );
  }
  return out;
}

function shouldServeSSR(pathname) {
  // Feed section pages (/explore, /videos, /shorts) + their /app twins — bot
  // HTML built at the edge. Must be checked before the profile fall-through so
  // /shorts and /videos aren't mistaken for @shorts / @videos profiles.
  const sec = pathname.replace(/^\/app\//, '/').replace(/^\/+|\/+$/g, '').toLowerCase();
  if (Object.hasOwn(SECTION_PAGES, sec)) return true;
  // Edge-rendered marketing pages (/connect, /pricing, /communities, …)
  if (Object.hasOwn(MARKETING_PAGES, sec)) return true;
  // Always SSR for post pages
  if (pathname.includes('/post/')) return true;
  // Always SSR for community pages
  if (pathname.includes('/communities/')) return true;
  // Stores, shop items and events — rendered at the edge below. Without these
  // a shared listing unfurled as the SPA shell, i.e. as the homepage.
  // The /app prefix is optional throughout: every one of these pages answers at
  // the bare path too, and a share link written the short way must get the same
  // card as the long one rather than the SPA shell.
  if (/^\/(?:app\/)?stores\/[^/]+/.test(pathname)) return true;
  if (/^\/(?:app\/)?events\/\d+/.test(pathname)) return true;
  // A single governance proposal, rendered from PostgREST below.
  if (/^\/(?:app\/)?governance\/[0-9a-fA-F-]{8,}\/?$/.test(pathname)) return true;
  // A shared Creator Flow, /creator/flow/<id>. `creator` is a reserved
  // ROUTE_SEGMENT, so without this rule the share link unfurls as the SPA
  // shell — the flow renderer below would never run.
  if (/^\/creator\/flow\/[a-z0-9]{6,32}\/?$/.test(pathname)) return true;
  // One creator pack and one community DEX pool. Same story: `packs` and
  // `dex` are reserved ROUTE_SEGMENTs, so both renderers below sat unreached
  // and crawlers got the noindexed SPA shell.
  if (/^\/(?:app\/)?packs\/[a-z0-9][a-z0-9_-]{2,47}\/?$/i.test(pathname)) return true;
  if (/^\/dex\/(?:base|ethereum|robinhood|solana)\/(?:0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})\/?$/.test(pathname)) return true;
  // One film or series. The renderer for these has existed since /cinema
  // shipped and had never run once: `cinema` is a reserved ROUTE_SEGMENT, so
  // the profile fall-through rejected the path and the SPA shell went out
  // before the branch was reached.
  //
  // The id is not always digits. It is whatever the JustWatch partner API
  // hands back for a title, which for a good part of the catalogue is a node
  // id like `tm12345` — so a `\d+` gate dropped those links to the SPA shell
  // and the share button produced a blank unfurl for them. `movie` and `show`
  // are the object-type names the client passes around internally; they reach
  // this route from older links, and the renderer canonicalizes them onto
  // /cinema like every other title path, so there is no reason to card one
  // spelling and not the other.
  if (/^\/cinema\/(?:film|series|movie|show)\/[A-Za-z0-9_-]{1,64}\/?$/.test(pathname)) return true;
  // Sub-paths that fall back to their section's card below.
  if (/^\/(?:app\/)?launchpad\/[^/]+\/?$/.test(pathname)) return true;
  if (/^\/(?:app\/)?arcade\/kings-gambit\/online\/?$/.test(pathname)) return true;
  // /app/video/<tokenId> is a post — SinglePostPage renders it, and
  // parseDehubLink reads it as one — so it needs the post treatment. It is
  // normalised onto /app/post/<tokenId> before the proxy.
  if (/^\/(?:app\/)?video\/\d+\/?$/.test(pathname)) return true;
  // Stage invite links, both shapes. Needed here and not only at the renderer
  // below: `stage` and `stages` are both reserved ROUTE_SEGMENTS, so the
  // profile fall-through at the foot of this function rejects them, and the
  // `!shouldServeSSR` branch then returns the SPA shell with noindex before
  // the stage renderer is ever reached — which is why every stage link
  // unfurled as the generic homepage card.
  // Tolerant of a trailing slash: this function receives the RAW pathname
  // (the renderer below matches cleanPath), so a $-anchor alone made
  // /stages/1/ fall back to the homepage card while /stages/1 rendered.
  if (/^\/stage\/[0-9a-fA-F-]{16,}\/?$/.test(pathname)) return true;
  if (/^\/stages\/\d+\/?$/.test(pathname)) return true;
  // Bounties, /bounty/<job_number>. Needed here for exactly the reason stages
  // were: `bounty` is a reserved ROUTE_SEGMENT, so the profile fall-through at
  // the foot of this function rejects it and the SPA shell would go out under
  // a noindex long before the renderer below is reached.
  if (/^\/bounty\/\d+\/?$/.test(pathname)) return true;
  // One mini app, /apps/<slug>. `apps` is reserved too, and /apps/dev is a
  // static card of its own, handled above.
  if (/^\/apps\/(?!dev\/?$)[a-z0-9][a-z0-9-]{1,39}\/?$/.test(pathname)) return true;
  // A shared Builder app. `builder` is a MARKETING key, so the bare segment
  // passes above and the preview path under it did not.
  if (BUILDER_PREVIEW_ID.test(pathname)) return true;
  // Off-chain post slugs (/newpost/<n>) and the short post shapes (/posts/<n>,
  // /posts/<n>/b, /posts/<n>/b/<commentId>). Same trap a third time: `newpost`
  // and `posts` are both reserved ROUTE_SEGMENTS, so the profile fall-through
  // rejected them and the SPA shell went out under a noindex before any
  // renderer was reached. This one was the widest of the three — minting is
  // optional, so a post that never mints is only ever shared as /newpost/<n>,
  // from web and from the app alike.
  if (/^\/(?:app\/)?newpost\/\d+\/?$/.test(pathname)) return true;
  if (/^\/posts\/\d+(?:\/b(?:\/[^/]+)?)?\/?$/.test(pathname)) return true;
  // Always SSR for affiliate referral landings (/r/{code})
  if (/^\/r\/[A-Za-z0-9]+/.test(pathname)) return true;
  // Always SSR for the blog: index + posts at both URL schemes
  // (/guides/<slug> is canonical; /docs/blog/<slug> is the legacy twin),
  // the reserved legacy /blog space (redirected), and the docs section
  // (edge-rendered for bots from docs-content JSON).
  const cleanBlog = pathname.replace(/\/+$/, '');
  if (cleanBlog === '/docs/blog' || /^\/(?:guides|docs\/blog)\//.test(cleanBlog)) return true;
  if (cleanBlog === '/blog' || /^\/blog\//.test(cleanBlog)) return true;
  if (cleanBlog === '/docs' || /^\/docs\//.test(cleanBlog)) return true;
  // Always SSR for root
  if (pathname === '/') return true;
  // Static marketing routes with per-route OG meta.
  // Accept both `/slug` and `/app/slug` — many product pages live under /app.
  const trimmed = pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
  const trimmedNoApp = trimmed.replace(/^app\//, '');
  if (SSR_STATIC_ROUTES.has(trimmed) || SSR_STATIC_ROUTES.has(trimmedNoApp)) return true;
  // Always SSR for profile pages (top-level non-system routes), including a
  // verified `.eth` handle — see isEnsHandle.
  if (couldBeProfileSegment(firstSegmentOf(pathname), SYSTEM_ROUTES)) return true;
  return false;
}


// ==========================================================================
// Live visitor stats — /api/stats
// ==========================================================================
// Backs the /stats page. Numbers come from Cloudflare's own GraphQL Analytics
// API for this zone, which counts requests at the edge — before they ever
// reach the SPA. That matters for honesty: this is not a client-side counter
// the page could inflate, and it is not a number anyone here typed. It is the
// same aggregation the Cloudflare dashboard renders.
//
// The three queries below are echoed verbatim in the `provenance` block of
// every response, and /api/stats/raw returns Cloudflare's untouched reply. The
// query we publish is therefore, by construction, the query we ran — see the
// "Where this comes from" panel on /stats.
//
// Requires one secret:  wrangler secret put CF_ANALYTICS_TOKEN
// (a Cloudflare API token with Zone → Analytics → Read on dehub.io).
// Without it the endpoint answers 501 and the page renders an honest
// "not configured" state rather than inventing numbers.
const STATS_ZONE_TAG = 'bedbbcab93853fe4a11f9d004370c130'; // dehub.io
const STATS_GRAPHQL_ENDPOINT = 'https://api.cloudflare.com/client/v4/graphql';
// One response serves every range the page offers (24h / 3d / 7d / 30d / all):
// it carries the widest window of each resolution and the page slices it. That
// keeps range switching instant and costs the Analytics API one read per minute
// no matter how many people are looking or which range they pick.
//
// The two ceilings below are Cloudflare's, not ours, and were measured against
// this zone rather than assumed:
//   * hourly buckets refuse any window wider than 3 days ("cannot request a
//     time range wider than 3d"), so 72 buckets is the hard maximum and "all
//     time" can never be hourly;
//   * daily buckets accept a request up to a year wide (the API rejects
//     anything over 52w1d1h) and simply return what they still retain — so
//     asking wide IS the all-time query. 360 days sits comfortably under that
//     ceiling, and since the span is measured to the hour, asking for a round
//     365 would trip it.
const STATS_ALLTIME_LOOKBACK_DAYS = 360;
const STATS_HOURLY_HOURS = 72;
const STATS_BREAKDOWN_DAYS = 30;
// Per-day country/browser maps run ~77 and ~19 entries; trimming to these keeps
// the whole month's breakdown near 17KB instead of 55KB, and nothing below the
// cut would ever be rendered anyway.
const STATS_COUNTRIES_PER_DAY = 20;
const STATS_BROWSERS_PER_DAY = 10;
// Cloudflare's analytics pipeline updates in ~minutes, so a 60s edge cache
// costs no freshness worth having and keeps a traffic spike on /stats from
// turning into a matching spike of Analytics API calls.
const STATS_CACHE_SECONDS = 60;

const STATS_QUERY_DAILY = `query DeHubDailyVisitors($zoneTag: String!, $since: Date!, $until: Date!) {
  viewer {
    zones(filter: { zoneTag: $zoneTag }) {
      httpRequests1dGroups(limit: 400, filter: { date_geq: $since, date_leq: $until }, orderBy: [date_ASC]) {
        dimensions { date }
        sum { pageViews requests bytes }
        uniq { uniques }
      }
    }
  }
}`;

const STATS_QUERY_HOURLY = `query DeHubHourlyVisitors($zoneTag: String!, $since: Time!, $until: Time!) {
  viewer {
    zones(filter: { zoneTag: $zoneTag }) {
      httpRequests1hGroups(limit: 80, filter: { datetime_geq: $since, datetime_lt: $until }, orderBy: [datetime_ASC]) {
        dimensions { datetime }
        sum { pageViews requests }
        uniq { uniques }
      }
    }
  }
}`;

const STATS_QUERY_BREAKDOWN = `query DeHubVisitorBreakdown($zoneTag: String!, $since: Date!, $until: Date!) {
  viewer {
    zones(filter: { zoneTag: $zoneTag }) {
      httpRequests1dGroups(limit: 31, filter: { date_geq: $since, date_leq: $until }, orderBy: [date_ASC]) {
        dimensions { date }
        sum {
          requests
          cachedRequests
          encryptedRequests
          threats
          countryMap { clientCountryName requests }
          browserMap { uaBrowserFamily pageViews }
        }
      }
    }
  }
}`;

function statsDayString(date) {
  return date.toISOString().slice(0, 10);
}

/** Run one named GraphQL query against Cloudflare's Analytics API. */
async function statsGraphql(token, query, variables) {
  const res = await fetch(STATS_GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json();
  // GraphQL answers 200 with an `errors` array on query failures, so HTTP
  // status alone is not a success signal here.
  if (!res.ok || (body && body.errors && body.errors.length)) {
    const message = body && body.errors && body.errors.length
      ? body.errors.map((e) => e.message).join('; ')
      : `HTTP ${res.status}`;
    const err = new Error(message);
    err.cfRay = res.headers.get('cf-ray');
    throw err;
  }
  return { body, cfRay: res.headers.get('cf-ray') };
}

function statsZoneGroups(body, field) {
  const zones = body && body.data && body.data.viewer && body.data.viewer.zones;
  const zone = Array.isArray(zones) ? zones[0] : null;
  return (zone && zone[field]) || [];
}

/**
 * Sort one day's map by its value and keep the top `limit`, renaming the fields
 * to the shorter names the page uses. Kept per-day rather than pre-aggregated
 * so the page can total whichever range the reader picks without a refetch.
 */
function statsTrimMap(rows, keyField, valueField, outKey, outValue, limit) {
  return (rows || [])
    .filter((entry) => entry && entry[keyField])
    .sort((a, b) => (b[valueField] || 0) - (a[valueField] || 0))
    .slice(0, limit)
    .map((entry) => ({ [outKey]: entry[keyField], [outValue]: entry[valueField] || 0 }));
}

async function buildStatsPayload(env) {
  const token = env && env.CF_ANALYTICS_TOKEN;
  if (!token) {
    return { status: 501, payload: { ok: false, reason: 'unconfigured' } };
  }

  const zoneTag = (env && env.CF_ZONE_TAG) || STATS_ZONE_TAG;
  const now = new Date();
  const until = statsDayString(now);
  // Asking a year back is the all-time query: Cloudflare accepts the width and
  // returns only what it still retains, which today is everything since the
  // zone went live.
  const since = statsDayString(new Date(now.getTime() - STATS_ALLTIME_LOOKBACK_DAYS * 86400000));
  const breakdownSince = statsDayString(new Date(now.getTime() - STATS_BREAKDOWN_DAYS * 86400000));
  // Hourly buckets are half-open [since, until): round the upper bound up to
  // the next hour so the bucket currently being filled is included.
  const hourUntil = new Date(now);
  hourUntil.setUTCMinutes(0, 0, 0);
  hourUntil.setUTCHours(hourUntil.getUTCHours() + 1);
  const hourSince = new Date(hourUntil.getTime() - STATS_HOURLY_HOURS * 3600000);

  const [daily, hourly, breakdown] = await Promise.all([
    statsGraphql(token, STATS_QUERY_DAILY, { zoneTag, since, until }),
    statsGraphql(token, STATS_QUERY_HOURLY, {
      zoneTag,
      since: hourSince.toISOString(),
      until: hourUntil.toISOString(),
    }),
    statsGraphql(token, STATS_QUERY_BREAKDOWN, { zoneTag, since: breakdownSince, until }),
  ]);

  const dailyGroups = statsZoneGroups(daily.body, 'httpRequests1dGroups');
  const hourlyGroups = statsZoneGroups(hourly.body, 'httpRequests1hGroups');
  const breakdownGroups = statsZoneGroups(breakdown.body, 'httpRequests1dGroups');

  const dailySeries = dailyGroups.map((g) => ({
    date: g.dimensions.date,
    visitors: g.uniq.uniques,
    pageViews: g.sum.pageViews,
    requests: g.sum.requests,
    bytes: g.sum.bytes,
  }));

  const hourlySeries = hourlyGroups.map((g) => ({
    hour: g.dimensions.datetime,
    visitors: g.uniq.uniques,
    pageViews: g.sum.pageViews,
    requests: g.sum.requests,
  }));

  // Per-day rows, not pre-totalled. The page picks a range and adds up the days
  // inside it, so switching between 7d / 30d / all costs nothing and every
  // figure on screen is derived from the same rows the reader can see.
  const breakdownSeries = breakdownGroups.map((g) => ({
    date: g.dimensions.date,
    // `requests` rides along with the cached/encrypted counts so a share can
    // always be taken over the same rows. Dividing a 7-day numerator by a
    // 30-day denominator would quietly understate caching.
    requests: g.sum.requests || 0,
    cachedRequests: g.sum.cachedRequests || 0,
    encryptedRequests: g.sum.encryptedRequests || 0,
    threats: g.sum.threats || 0,
    countries: statsTrimMap(g.sum.countryMap, 'clientCountryName', 'requests', 'code', 'requests', STATS_COUNTRIES_PER_DAY),
    browsers: statsTrimMap(g.sum.browserMap, 'uaBrowserFamily', 'pageViews', 'name', 'pageViews', STATS_BROWSERS_PER_DAY),
  }));

  const payload = {
    ok: true,
    fetchedAt: new Date().toISOString(),
    window: {
      // What was actually returned, so the page can label ranges with real
      // spans instead of the ones it asked for. Analytics only exists from the
      // day the zone went live on Cloudflare, so the series is short by fact.
      firstDay: dailySeries.length ? dailySeries[0].date : null,
      lastDay: dailySeries.length ? dailySeries[dailySeries.length - 1].date : null,
      dailyDays: dailySeries.length,
      hourlyHours: hourlySeries.length,
      breakdownDays: breakdownSeries.length,
      // Cloudflare's ceilings, surfaced so the page can explain why "all time"
      // is never hourly and why the country breakdown stops at a month.
      hourlyMaxHours: STATS_HOURLY_HOURS,
      breakdownMaxDays: STATS_BREAKDOWN_DAYS,
    },
    daily: dailySeries,
    hourly: hourlySeries,
    breakdown: breakdownSeries,
    provenance: {
      source: 'Cloudflare GraphQL Analytics API',
      endpoint: STATS_GRAPHQL_ENDPOINT,
      datasets: ['httpRequests1dGroups', 'httpRequests1hGroups'],
      measuredAt: 'Cloudflare edge (server-side, before the page loads)',
      zoneTag,
      // Cloudflare stamps every API response with a unique ray ID. It ties this
      // payload to a real call against their infrastructure at a real time.
      cfRay: { daily: daily.cfRay, hourly: hourly.cfRay, breakdown: breakdown.cfRay },
      queries: {
        daily: STATS_QUERY_DAILY,
        hourly: STATS_QUERY_HOURLY,
        breakdown: STATS_QUERY_BREAKDOWN,
      },
      variables: { zoneTag, since, until, breakdownSince },
      rawUrl: '/api/stats/raw',
      // Stated plainly on the page too: this proves the numbers came from
      // Cloudflare's aggregation rather than from application code, and that
      // the published query is the one that ran. It does not make the endpoint
      // trustless — only Cloudflare exposing a public read would do that.
      note: 'Server-measured by Cloudflare. Not a client-side counter.',
    },
  };

  return { status: 200, payload };
}

/** /api/stats/raw — Cloudflare's untouched GraphQL replies, for verification. */
async function buildStatsRawPayload(env) {
  const token = env && env.CF_ANALYTICS_TOKEN;
  if (!token) {
    return { status: 501, payload: { ok: false, reason: 'unconfigured' } };
  }
  const zoneTag = (env && env.CF_ZONE_TAG) || STATS_ZONE_TAG;
  const now = new Date();
  const until = statsDayString(now);
  const since = statsDayString(new Date(now.getTime() - STATS_ALLTIME_LOOKBACK_DAYS * 86400000));
  const daily = await statsGraphql(token, STATS_QUERY_DAILY, { zoneTag, since, until });
  return {
    status: 200,
    payload: {
      ok: true,
      fetchedAt: new Date().toISOString(),
      request: { endpoint: STATS_GRAPHQL_ENDPOINT, query: STATS_QUERY_DAILY, variables: { zoneTag, since, until } },
      cfRay: daily.cfRay,
      response: daily.body,
    },
  };
}

async function handleStatsRequest(request, env, isRaw) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(JSON.stringify({ ok: false, reason: 'method_not_allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', Allow: 'GET, HEAD' },
    });
  }

  const cache = caches.default;
  const cacheKey = new Request(new URL(request.url).toString(), { method: 'GET' });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  let status;
  let payload;
  try {
    ({ status, payload } = isRaw ? await buildStatsRawPayload(env) : await buildStatsPayload(env));
  } catch (err) {
    status = 502;
    payload = { ok: false, reason: 'upstream_error', message: String((err && err.message) || err), cfRay: err && err.cfRay };
  }

  const response = new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // Anyone may read and re-check these numbers — that is the point of
      // publishing them.
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': status === 200
        ? `public, max-age=${STATS_CACHE_SECONDS}, s-maxage=${STATS_CACHE_SECONDS}`
        : 'no-store',
      'X-Robots-Tag': 'noindex',
    },
  });

  if (status === 200) await cache.put(cacheKey, response.clone());
  return response;
}

const API_RELAY_PREFIX = '/_api';

/**
 * Carry ordinary API traffic over the apex hostname visitors have already
 * reached. The upstream remains private to this hop, so a device whose route
 * to api.dehub.io is stalled can still load and authenticate through dehub.io.
 */
export async function proxyApiRequest(request) {
  const incoming = new URL(request.url);
  const upstreamUrl = new URL(
    `${incoming.pathname.slice(API_RELAY_PREFIX.length)}${incoming.search}`,
    'https://api.dehub.io',
  );

  try {
    const method = request.method.toUpperCase();
    const body = method === 'GET' || method === 'HEAD'
      ? undefined
      : await request.arrayBuffer();
    const upstreamHeaders = new Headers(request.headers);
    // Cloudflare regenerates these for the subrequest. Do not let an incoming
    // value masquerade as edge metadata at the API origin.
    upstreamHeaders.delete('host');
    upstreamHeaders.delete('cf-connecting-ip');
    upstreamHeaders.delete('cf-ray');
    upstreamHeaders.delete('cf-worker');
    const upstream = await fetch(upstreamUrl, {
      method,
      headers: upstreamHeaders,
      body,
      redirect: 'manual',
    });
    const response = new Response(upstream.body, upstream);
    response.headers.set('X-DeHub-Relay', 'dehub.io');
    return response;
  } catch {
    return new Response(JSON.stringify({
      status: false,
      message: 'API temporarily unreachable',
    }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-DeHub-Relay': 'dehub.io',
      },
    });
  }
}

const SUPABASE_RELAY_PREFIX = '/_sb';
const SUPABASE_RELAY_ORIGIN = 'https://aigxuutjaqsywioxjefr.supabase.co';
// Hosts that serve the web app. The client picks its own origin as the relay
// base on these, so each has to answer /_sb itself.
const SUPABASE_RELAY_HOSTS = new Set(['dehub.io', 'www.dehub.io', 'staging.dehub.io', 'origin.dehub.io']);
const HOP_BY_HOP_HEADERS = [
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'proxy-connection', 'te', 'trailer', 'transfer-encoding', 'upgrade',
];

export function isSupabaseRelayRequest(url) {
  return SUPABASE_RELAY_HOSTS.has(url.hostname) &&
    (url.pathname === SUPABASE_RELAY_PREFIX || url.pathname.startsWith(`${SUPABASE_RELAY_PREFIX}/`));
}

function supabaseRelayError(status, message) {
  return new Response(JSON.stringify({ message }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
      'X-DeHub-Relay': 'dehub.io',
    },
  });
}

/**
 * Same-origin route to Supabase for browsers whose network blocks the project
 * host's address ranges (see src/integrations/supabase/relayFetch.ts). It only
 * ever reaches the one project host: the path is appended to a fixed origin
 * and re-checked, and dot segments or encoded separators are refused. Auth
 * headers pass through untouched; nothing is cached. No client IP is
 * forwarded — Supabase ignores forwarded addresses on publishable-key calls.
 */
export async function proxySupabaseRequest(request) {
  const incoming = new URL(request.url);
  // The URL parser has already resolved dot segments; one that climbed out of
  // the prefix no longer starts with it.
  if (!isSupabaseRelayRequest(incoming)) return supabaseRelayError(400, 'Bad relay path');
  const rest = incoming.pathname.slice(SUPABASE_RELAY_PREFIX.length) || '/';
  let decoded;
  try {
    decoded = decodeURIComponent(rest);
  } catch {
    return supabaseRelayError(400, 'Bad relay path');
  }
  if (
    !rest.startsWith('/') ||
    /%2f|%5c/i.test(rest) ||
    decoded.includes('\\') ||
    decoded.split('/').some((segment) => segment === '..' || segment === '.')
  ) {
    return supabaseRelayError(400, 'Bad relay path');
  }
  const upstreamUrl = new URL(`${SUPABASE_RELAY_ORIGIN}${rest}${incoming.search}`);
  if (upstreamUrl.origin !== SUPABASE_RELAY_ORIGIN) return supabaseRelayError(400, 'Bad relay path');

  const method = request.method.toUpperCase();
  const websocket = (request.headers.get('upgrade') || '').toLowerCase() === 'websocket';
  const upstreamHeaders = new Headers(request.headers);
  const named = (request.headers.get('connection') || '').split(',').map((h) => h.trim().toLowerCase());
  for (const header of [...HOP_BY_HOP_HEADERS, ...named]) {
    if (header) upstreamHeaders.delete(header);
  }
  // A websocket handshake needs its Upgrade header to reach the upstream.
  if (websocket) upstreamHeaders.set('Upgrade', 'websocket');
  for (const header of ['host', 'cf-connecting-ip', 'cf-ray', 'cf-worker', 'cf-ipcountry', 'cf-visitor', 'x-forwarded-for', 'x-real-ip']) {
    upstreamHeaders.delete(header);
  }

  try {
    const upstream = await fetch(upstreamUrl, {
      method,
      headers: upstreamHeaders,
      body: method === 'GET' || method === 'HEAD' ? undefined : await request.arrayBuffer(),
      redirect: 'manual',
    });
    if (upstream.status === 101) return upstream;
    const response = new Response(upstream.body, upstream);
    for (const header of HOP_BY_HOP_HEADERS) response.headers.delete(header);
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('X-Robots-Tag', 'noindex');
    response.headers.set('X-DeHub-Relay', 'dehub.io');
    response.headers.delete('alt-svc');
    return response;
  } catch {
    return supabaseRelayError(502, 'Supabase temporarily unreachable');
  }
}

export function canonicalOriginRequest(request) {
  const target = new URL(request.url);
  // The direct gateway uses a separate upstream DNS name to avoid a loop
  // after the public apex moves. This affects URL semantics, not access rights.
  if (target.hostname !== 'origin.dehub.io' || request.headers.get('X-DeHub-Public-Host') !== 'dehub.io') return request;
  target.hostname = 'dehub.io';
  return new Request(target, request);
}

/**
 * How long a built sitemap counts as fresh, and the header the build time is
 * stamped into. `Cache-Control: s-maxage` cannot be read back off a cache hit
 * as an age, so the stamp is what decides stale.
 */
const SITEMAP_FRESH_SECONDS = 3600;
const SITEMAP_BUILT_HEADER = 'X-Sitemap-Built';

/** A built sitemap, stamped so its age survives a round trip through the cache. */
function sitemapResponse(xml) {
  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      [SITEMAP_BUILT_HEADER]: String(Date.now()),
    },
  });
}

/**
 * A sitemap from the edge cache, rebuilt behind the response rather than in
 * front of it.
 *
 * sitemap-posts-1.xml took 21–23 seconds to answer on every request, measured
 * warm and cold on 2026-09-22. It enumerates ~33 pages of the feed and sleeps
 * out api.dehub.io's rate-limit windows between them, and `s-maxage` alone
 * never covered that: a Worker's own subrequests and its generated response
 * are not zone-cached unless the Worker puts them there itself, so every fetch
 * paid the full walk. Google abandons slow sitemap fetches, which put all
 * 1,129 post URLs at risk of never being read.
 *
 * So the build result is held in `caches.default` and served from there. Past
 * SITEMAP_FRESH_SECONDS the stale copy is still answered immediately and the
 * rebuild runs in `waitUntil` — one request per hour per colo pays the walk,
 * and it is a request nobody is waiting on. A failed rebuild leaves the stale
 * copy in place, which is a better sitemap than the unfiltered Supabase
 * fallback the caller would otherwise reach for.
 *
 * Returns null only when there is no cached copy and the build failed, which
 * is the caller's cue to fall through as before.
 */
export async function cachedSitemap(request, ctx, build) {
  const cache = caches.default;
  const key = new Request(new URL(request.url).toString(), { method: 'GET' });
  const hit = await cache.match(key);
  const builtAt = hit ? Number(hit.headers.get(SITEMAP_BUILT_HEADER)) : NaN;
  const ageSeconds = Number.isFinite(builtAt) ? (Date.now() - builtAt) / 1000 : Infinity;

  if (hit && ageSeconds < SITEMAP_FRESH_SECONDS) return hit;

  const rebuild = async () => {
    const fresh = await build();
    if (fresh) await cache.put(key, fresh.clone());
    return fresh;
  };

  // A stale copy answers now; only a cold cache waits for the walk.
  if (hit && ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(rebuild().catch((e) => console.error('[Edge] sitemap refresh failed:', e)));
    return hit;
  }

  const fresh = await rebuild().catch((e) => {
    console.error('[Edge] sitemap build failed:', e);
    return null;
  });
  return fresh || hit || null;
}

/** Text escaped for an XML element body or attribute. */
function xmlText(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** A YYYY-MM-DD from any date-ish value, or ''. */
function sitemapDay(value) {
  const s = String(value || '');
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
}

/** How many <url> rows a sitemap holds and the newest <lastmod> among them. */
function sitemapSummary(xml) {
  const count = (String(xml).match(/<url>/g) || []).length;
  let lastmod = '';
  for (const m of String(xml).matchAll(/<lastmod>([^<]+)<\/lastmod>/g)) {
    const day = sitemapDay(m[1]);
    if (day > lastmod) lastmod = day;
  }
  return { count, lastmod };
}

/** Letters and digits in a string — the same measure the post filter uses. */
function substantiveLength(s) {
  return String(s || '').replace(/[^\p{L}\p{N}]/gu, '').length;
}

/**
 * One sitemap <url>. `image` becomes an image-sitemap entry, which is how a
 * post's thumbnail or a store's banner gets into Google Images without the
 * crawler having to find it on the page first.
 */
function sitemapUrl({ loc, lastmod, changefreq, priority, image }) {
  const day = sitemapDay(lastmod);
  return `  <url><loc>${xmlText(loc)}</loc>${day ? `<lastmod>${day}</lastmod>` : ''}`
    + `${changefreq ? `<changefreq>${changefreq}</changefreq>` : ''}${priority ? `<priority>${priority}</priority>` : ''}`
    + `${image ? `<image:image><image:loc>${xmlText(image)}</image:loc></image:image>` : ''}</url>`;
}

function urlsetXml(urls) {
  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n'
    + `${urls.join('\n')}\n</urlset>`;
}

/**
 * Sitemaps for the entity pages the worker renders straight from PostgREST.
 *
 * Every one of these had a crawler page and no sitemap, so a community, a
 * store or a proposal was findable only if something happened to link to it.
 * Each part is one anon-readable select and a row → entry mapping that
 * applies the same indexability rule the page builder does: a URL the builder
 * would mark noindex is left out, because submitting a page we then ask
 * Google to drop is a wasted crawl and a soft-404 signal. Where the builder
 * has no rule, the entry needs a sentence of real text (or, for a community,
 * some members) — the bar the post sitemap already uses.
 *
 * Stages are deliberately absent: a stage is noindex the moment it ends, so a
 * sitemap of them would be a list of pages that are about to disappear.
 */
const ENTITY_SITEMAP_MIN_TEXT = 40;
const ENTITY_SITEMAPS = {
  bounties: [{
    // Same rule as the page's own robots (status and deadline), so an open
    // bounty past its deadline is left out as well.
    query: () => 'work_jobs?status=in.(open,in_progress)&select=job_number,status,deadline,updated_at,cover_image_url&order=job_number.asc&limit=5000',
    entry: (j) => (isBountyIndexable(j)
      ? { loc: `${APP_URL}/bounty/${j.job_number}`, lastmod: j.updated_at, changefreq: 'daily', priority: '0.6', image: absolutize(j.cover_image_url) }
      : null),
  }],
  communities: [{
    query: () => 'communities?is_private=eq.false&select=slug,description,member_count,avatar_url,updated_at&order=created_at.asc&limit=5000',
    entry: (c) => {
      const slug = String(c.slug || '');
      // `join` is the invite-link route, not a community.
      if (!slug || slug === 'join' || slug.includes('/')) return null;
      if (substantiveLength(c.description) < ENTITY_SITEMAP_MIN_TEXT && Number(c.member_count) < 3) return null;
      return { loc: `${APP_URL}/app/communities/${encodeURIComponent(slug)}`, lastmod: c.updated_at, changefreq: 'daily', priority: '0.6', image: absolutize(c.avatar_url) };
    },
  }],
  stores: [
    {
      query: () => 'stores?is_active=eq.true&select=id,name,banner_url,avatar_url,updated_at&order=created_at.asc&limit=5000',
      entry: (s) => (s.name && String(s.name).trim()
        ? { loc: `${APP_URL}/stores/${s.id}`, lastmod: s.updated_at, changefreq: 'weekly', priority: '0.5', image: absolutize(s.banner_url || s.avatar_url) }
        : null),
    },
    {
      // Items of live stores only. A sold or withdrawn item is noindex on its
      // own page (buildListingHtml), and its store's page is gone with it.
      query: () => 'store_listings?status=eq.active&select=id,store_id,images,updated_at,stores!inner(is_active)&stores.is_active=eq.true&order=created_at.asc&limit=5000',
      entry: (l) => ({
        loc: `${APP_URL}/stores/${l.store_id}?listing=${l.id}`,
        lastmod: l.updated_at,
        changefreq: 'weekly',
        priority: '0.5',
        image: absolutize(Array.isArray(l.images) ? l.images[0] : null),
      }),
    },
  ],
  events: [{
    // Upcoming or still running. A past event is a dead listing even while
    // its page stays up.
    query: () => {
      const now = new Date().toISOString();
      return `community_events?is_private=eq.false&or=${encodeURIComponent(`(starts_at.gte."${now}",ends_at.gte."${now}")`)}`
        + '&select=event_number,cover_image_url,created_at&order=starts_at.asc&limit=5000';
    },
    entry: (e) => ({ loc: `${APP_URL}/app/events/${e.event_number}`, lastmod: e.created_at, changefreq: 'daily', priority: '0.5', image: absolutize(e.cover_image_url) }),
  }],
  packs: [{
    query: () => 'creator_packs?item_count=gt.0&select=slug,cover_url,updated_at&order=created_at.asc&limit=5000',
    entry: (p) => (/^[a-z0-9][a-z0-9_-]{2,47}$/i.test(String(p.slug || ''))
      ? { loc: `${APP_URL}/packs/${String(p.slug).toLowerCase()}`, lastmod: p.updated_at, changefreq: 'weekly', priority: '0.4', image: absolutize(p.cover_url) }
      : null),
  }],
  flows: [{
    query: () => 'creator_flows?is_public=eq.true&node_count=gt.0&select=id,cover_url,updated_at&order=created_at.asc&limit=5000',
    entry: (f) => (/^[a-z0-9]{6,32}$/.test(String(f.id || ''))
      ? { loc: `${APP_URL}/creator/flow/${f.id}`, lastmod: f.updated_at, changefreq: 'weekly', priority: '0.4', image: absolutize(f.cover_url) }
      : null),
  }],
  proposals: [{
    query: () => 'governance_proposals?select=id,title,description,updated_at&order=created_at.asc&limit=5000',
    entry: (p) => (substantiveLength(`${p.title || ''} ${p.description || ''}`) >= ENTITY_SITEMAP_MIN_TEXT
      ? { loc: `${APP_URL}/app/governance/${p.id}`, lastmod: p.updated_at, changefreq: 'weekly', priority: '0.5' }
      : null),
  }],
  features: [{
    query: () => 'feature_requests?status=neq.declined&select=id,title,description,status,image_url,updated_at&order=created_at.asc&limit=5000',
    entry: (f) => (f.status !== 'declined' && substantiveLength(`${f.title || ''} ${f.description || ''}`) >= ENTITY_SITEMAP_MIN_TEXT
      ? { loc: `${APP_URL}/features?feature=${f.id}`, lastmod: f.updated_at, changefreq: 'weekly', priority: '0.4', image: absolutize(f.image_url) }
      : null),
  }],
};

/**
 * One entity sitemap from its rows, one array per part. Exported for its
 * tests: the indexability rules are the point of the file and invisible in
 * any single response.
 */
export function entitySitemapXml(kind, partRows) {
  const parts = ENTITY_SITEMAPS[kind];
  if (!parts) return null;
  const seen = new Set();
  const urls = [];
  parts.forEach((part, i) => {
    for (const row of (partRows && partRows[i]) || []) {
      const entry = row && part.entry(row);
      if (!entry || seen.has(entry.loc)) continue;
      seen.add(entry.loc);
      urls.push(sitemapUrl(entry));
    }
  });
  return urlsetXml(urls);
}

/** An entity sitemap, or null when any of its selects failed — never a partial one. */
async function buildEntitySitemap(kind) {
  const parts = ENTITY_SITEMAPS[kind];
  const partRows = await Promise.all(parts.map((p) => supabaseRows(p.query())));
  if (partRows.some((rows) => rows === null)) return null;
  return sitemapResponse(entitySitemapXml(kind, partRows));
}

/**
 * The newest minted post's id, from one row of the feed, or null. Post ids
 * are sequential, so this is what says how many sitemap-posts-N pages exist.
 */
async function newestPostId() {
  try {
    const res = await fetch(
      `https://api.dehub.io/api/feed?limit=1&page=1&sortBy=createdAt&sortOrder=desc&status=minted`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return null;
    const json = await res.json();
    const id = Number(json && Array.isArray(json.result) && json.result[0] && json.result[0].tokenId);
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

/** The <lastmod> a cached sitemap earns: its newest row, else when it was built. '' when not cached. */
async function cachedSitemapLastmod(url) {
  const hit = await caches.default.match(new Request(url, { method: 'GET' }));
  if (!hit) return '';
  const { lastmod } = sitemapSummary(await hit.text());
  if (lastmod) return lastmod;
  const built = Number(hit.headers.get(SITEMAP_BUILT_HEADER));
  return Number.isFinite(built) ? new Date(built).toISOString().slice(0, 10) : '';
}

/**
 * The sitemap index, built here rather than by the sitemap-index function.
 *
 * That function stamped every child with the day of the request, so Google
 * saw every sitemap on the site "change" daily and learned to ignore the
 * dates; it never knew about bounties or any of the entity sitemaps either.
 * Each child here carries a real date: sitemap-static.xml its newest row;
 * posts the newest row of the cached copy (the index never pays for a posts
 * walk); profiles the newest profile from the API; each entity sitemap its
 * newest row, and an entity sitemap with no rows is left out altogether.
 *
 * Exported for its tests. `children` is [{ loc, lastmod }] in index order.
 */
export function sitemapIndexXml(children) {
  const rows = children.map(({ loc, lastmod }) => {
    const day = sitemapDay(lastmod);
    return `  <sitemap><loc>${xmlText(loc)}</loc>${day ? `<lastmod>${day}</lastmod>` : ''}</sitemap>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join('\n')}\n</sitemapindex>`;
}

async function buildSitemapIndex(request, env, ctx) {
  const staticXml = await env.ASSETS.fetch(new URL('/sitemap-static.xml', request.url))
    .then((res) => (res.ok ? res.text() : ''))
    .catch(() => '');
  // The static file is the one child that must exist; without it this is not
  // an index worth caching, and the caller falls back to the old one.
  if (!staticXml.includes('</urlset>')) return null;

  const [newestId, profileMeta, entities] = await Promise.all([
    newestPostId(),
    dehubProfileSitemap(1, 1),
    Promise.all(Object.keys(ENTITY_SITEMAPS).map(async (kind) => {
      const res = await cachedSitemap(new Request(`${APP_URL}/sitemap-${kind}.xml`), ctx, () => buildEntitySitemap(kind));
      return { kind, summary: res ? sitemapSummary(await res.clone().text()) : null };
    })),
  ]);

  const children = [{ loc: `${APP_URL}/sitemap-static.xml`, lastmod: sitemapSummary(staticXml).lastmod }];
  const postPages = newestId ? Math.ceil(newestId / POST_SITEMAP_CHUNK_SIZE) : 1;
  for (let page = 1; page <= postPages; page++) {
    const loc = `${APP_URL}/sitemap-posts-${page}.xml`;
    children.push({ loc, lastmod: await cachedSitemapLastmod(loc) });
  }
  const profileTotal = Number(profileMeta && profileMeta.total);
  const profilePages = Number.isFinite(profileTotal) && profileTotal > 0 ? Math.ceil(profileTotal / PROFILE_SITEMAP_PAGE_SIZE) : 1;
  for (let page = 1; page <= profilePages; page++) {
    children.push({
      loc: `${APP_URL}/sitemap-profiles-${page}.xml`,
      lastmod: page === 1 && profileMeta ? profileMeta.lastmod : '',
    });
  }
  for (const { kind, summary } of entities) {
    // Unknown (the select failed and nothing is cached) stays listed; known
    // empty is left out until there is something to submit.
    if (summary && summary.count === 0) continue;
    children.push({ loc: `${APP_URL}/sitemap-${kind}.xml`, lastmod: summary ? summary.lastmod : '' });
  }
  return sitemapResponse(sitemapIndexXml(children));
}

// The page tables, for src/test/sitemap-static.test.ts: every indexable page
// the worker renders has to be in sitemap-static.xml, and that is only
// checkable against the tables themselves.
export { MARKETING_PAGES, SECTION_PAGES, DOCS_PAGES, GUIDE_PAGES };

/**
 * Crawler renders proxied through the ssr-seo function, held for five minutes.
 *
 * Every bot hit on a post, profile or community page paid a round trip to the
 * function plus the enrichment reads below it (post record, author feed), and
 * nothing kept the result: `s-maxage` on a Worker's own generated response
 * does nothing unless the Worker puts it in the cache itself (see
 * cachedSitemap). Social unfurlers and search bots re-fetch the same URLs in
 * bursts, so a short hold removes most of that load without letting a card
 * go stale for long.
 *
 * The key is the full request URL (host, path and query, so ?hl= variants and
 * mirror hosts stay separate) plus a marker param, so a bot render can never
 * be confused with anything cached for browsers under the bare URL. Only the
 * finished 200 is stored; 404s and fallbacks are not.
 */
const SSR_CACHE_SECONDS = 300;

function ssrCacheKey(requestUrl) {
  const u = new URL(requestUrl);
  u.searchParams.set('__dh_ssr', '1');
  return new Request(u.toString(), { method: 'GET' });
}

async function ssrCacheGet(key) {
  try {
    if (typeof caches === 'undefined' || !caches.default) return null;
    return (await caches.default.match(key)) || null;
  } catch {
    return null;
  }
}

function ssrCachePut(ctx, key, resp) {
  try {
    if (typeof caches === 'undefined' || !caches.default) return;
    const copy = new Response(resp.clone().body, resp);
    copy.headers.set('Cache-Control', `public, s-maxage=${SSR_CACHE_SECONDS}`);
    const put = caches.default.put(key, copy).catch((e) => console.error('[Edge] SSR cache put failed:', e));
    if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(put);
  } catch (e) {
    console.error('[Edge] SSR cache put failed:', e);
  }
}

async function handleRequest(request, env, ctx) {
  if (new URL(request.url).pathname.startsWith('/api/editor/presence/')) {
    return handleEditorPresence(request, env);
  }
  if (new URL(request.url).pathname === '/api/work/receipt') {
    return handleWorkReceipt(request, env);
  }
  request = canonicalOriginRequest(request);
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Mirror hosts (staging, previews, aliases) serve identical content and
  // must not index as duplicates of dehub.io.
  const isCanonicalHost = url.hostname === 'dehub.io';
  // Every prerendered response passes through here, which makes it the one
  // place that can put the site's own look on all of them — the pages built
  // in this file and the ones proxied from the ssr-seo function alike.
  // guardNext() (the React SPA, which already has the look) deliberately
  // does not.
  const guard = async (resp) => {
    if (!isCanonicalHost) resp.headers.set('X-Robots-Tag', 'noindex');
    if (!(resp.headers.get('Content-Type') || '').includes('text/html')) return resp;
    return new Response(stylePrerendered(await resp.text()), {
      status: resp.status,
      headers: resp.headers,
    });
  };
  // Response.redirect() headers are immutable — build redirects by hand so
  // guard() can still stamp mirror hosts.
  const redirect301 = (to) => guard(new Response(null, { status: 301, headers: { Location: to } }));

  // Supabase relay, ahead of the www → apex 301: a redirected POST would lose
  // its method and body, and the client uses whichever app host it is on.
  if (url.protocol === 'https:' && isSupabaseRelayRequest(url)) {
    return proxySupabaseRequest(request);
  }

  // Alias hosts → apex, path + query preserved; wrangler.jsonc routes bind
  // these hosts to this worker so the 301 is served at the edge with no
  // origin behind it. Covers www.dehub.io and every dehub.net host — the
  // dehub.net zone moved into this Cloudflare account in July 2026, and
  // these are the SEO domain-move redirects.
  // Retired dehub.net subdomains. Each was a separate site with its own URL
  // space, so carrying the path across lands on a dehub.io path that does not
  // exist — and because /:username is the SPA's catch-all, every one of them
  // resolved 200 on a "no such user" screen. That is a soft 404: Google passes
  // no equity through it. Send each subdomain to its nearest live successor
  // instead. A blanket redirect to "/" would be read as a soft 404 too, so the
  // targets are real pages, checked against the SEO tables above.
  //
  // dapps, beta-stream and raffle are mapped here for the day their DNS comes
  // back: all three are in the Wayback index and none of them resolves today,
  // and the *.dehub.net route cannot fire without a proxied record on the zone.
  // The mapping is the cheap half; the DNS record is the other half.
  const RETIRED_SUBDOMAIN_TARGETS = {
    arcade: '/arcade',
    games: '/arcade',
    staking: '/stake',
    bridge: '/bridge',
    stream: '/videos',
    'beta-stream': '/videos',
    dapps: '/features',
    raffle: '/raffle',
  };
  // Apex paths from the pre-Angular dehub.net site with no dehub.io twin. The
  // path-preserving 301 dropped each one on the /:username catch-all: six of
  // them 404, and /staking and /ppv did something worse — they resolved as
  // indexable, self-canonical "@staking" / "@ppv" profile pages, a soft 404
  // Google keeps in the index and shows for brand queries. Every target below
  // is a real page that renders its own meta.
  const LEGACY_NET_PATHS = {
    '/staking': '/stake',
    '/claim': '/stake',
    '/buy': '/docs/token/where-to-buy',
    '/swap': '/docs/token/where-to-buy',
    '/careers': '/jobs',
    '/tournaments': '/arcade',
    '/prize-draw': '/raffle',
    '/ppv': '/videos',
    // Old dApp landers still linked from third-party listings. /stream goes
    // where the stream subdomain and /web/stream already go; /prediction was
    // a price-prediction game, so it lands with the other games.
    '/games': '/arcade',
    '/stream': '/videos',
    '/prediction': '/arcade',
    '/ad-free': '/premium',
  };
  // /web/* is the pre-Angular site chrome, still in Google's index. Flattening
  // the lot onto "/" reads as a soft 404 and throws away the best links the old
  // domain ever earned: /web/news/* are the GQ, Yahoo Finance, Entrepreneur and
  // Investing.com write-ups, and /docs/featured-in is precisely that page.
  // Ordered longest-prefix-first — /web/legal/careers must beat /web/legal.
  const LEGACY_WEB_PREFIXES = [
    ['/web/legal/privacy', '/docs/privacy'],
    ['/web/legal/terms', '/docs/terms'],
    ['/web/legal/careers', '/jobs'],
    ['/web/news', '/docs/featured-in'],
    ['/web/learn', '/docs'],
    ['/web/shop', '/stores'],
    ['/web/stream', '/videos'],
    ['/web/game', '/arcade'],
  ];
  // stream-api is not retired in the same sense: the v1 stream contracts carry
  // https://stream-api.dehub.net/nfts/nft_metadata/<id> on-chain as their
  // tokenURIPrefix across four chains, changeable only with a per-chain
  // setTokenURIPrefix tx. The origin behind that DNS record is dead, so the
  // catch-all 301 was handing wallets and marketplaces the SPA shell — 200
  // text/html where JSON was promised, and nothing 404s so nothing flagged it.
  // Re-point it at the live route: costs no on-chain transaction, and it starts
  // serving real metadata the moment the backend's nft_metadata handler stops
  // throwing (it currently answers {} or 500 — separate repo, separate fix).
  const NFT_METADATA_PATH = /^\/nfts\/nft_metadata\/([^/]+)$/;
  // SendGrid's link-branding, click-tracking and unsubscribe hosts are CNAMEs
  // on this zone and they are proxied, so *.dehub.net/* swallowed them too:
  // every tracked link in an outbound email 301'd to the homepage, which kills
  // the CTA and every campaign's attribution with it. Pass them through to
  // their own origin untouched — this is the one class of alias host on the
  // zone that is not part of the domain move.
  const MAIL_HOSTS = /^(?:\d+|em\d+|url\d+|s\d+\._domainkey)$/;
  // legacy.dehub.io is the pre-2026 app, and its DNS record has been deleted —
  // the host is NXDOMAIN. Google still holds ~300 of its URLs and now records a
  // fetch failure against each one; because this is a sc-domain: property they
  // are counted against dehub.io itself, which is where the 42 "Server error
  // (5xx)" and all 219 "Duplicate without user-selected canonical" pages in the
  // 2026-09-16 index report came from. Exactly the dapps/beta-stream/raffle
  // situation on dehub.net: the mapping is the cheap half, the proxied DNS
  // record is the other half, and the route cannot fire without it.
  //
  // Usernames carried across the rebuild unchanged — all twelve in the indexed
  // sample resolve as real dehub.io profiles — so the default is the
  // path-preserving 301 that makes a domain move work, and /stream/<id> has a
  // live twin too. Only /live/<objectid> has no successor.
  const LEGACY_IO_PREFIXES = [['/live', '/videos']];
  const aliasHost = url.hostname;
  if (aliasHost === 'legacy.dehub.io') {
    const cleanPath = url.pathname.replace(/\/+$/, '') || '/';
    const p = cleanPath.toLowerCase();
    const mapped = LEGACY_IO_PREFIXES.find(([from]) => p === from || p.startsWith(`${from}/`));
    // The query is dropped on purpose. ?tab=user-activity, ?tab=video and
    // ?type=latest are legacy view state with no meaning on dehub.io, and
    // carrying them through would mint one duplicate URL per tab out of a
    // redirect whose whole job is to collapse them onto one page.
    const target = `https://dehub.io${mapped ? mapped[1] : cleanPath}`;
    // Raw 301, deliberately not through guard() — see the block below: noindex
    // on a domain-move redirect risks suppressing the equity transfer.
    return new Response(null, { status: 301, headers: { Location: target } });
  }
  if (aliasHost === 'www.dehub.io' || aliasHost === 'dehub.net' || aliasHost.endsWith('.dehub.net')) {
    // Plain 301 WITHOUT guard(): X-Robots-Tag noindex is for mirror hosts
    // serving duplicate content, not for domain-move redirects — mixing
    // noindex with an equity-passing 301 risks suppressing the transfer.
    let target = `https://dehub.io${url.pathname}${url.search}`;
    if (aliasHost !== 'www.dehub.io') {
      const p = (url.pathname.replace(/\/+$/, '') || '/').toLowerCase();
      // The apex and its www keep the path-preserving redirect —
      // dehub.net/<username> → dehub.io/<username> is the point of the domain
      // move, and /guides/* etc. map one-to-one. Only the other subdomains,
      // which never shared this URL space, get remapped.
      const sub = (aliasHost === 'dehub.net' || aliasHost === 'www.dehub.net')
        ? null
        : aliasHost.slice(0, -'.dehub.net'.length);
      // Mail hosts are not part of the domain move — hand them to their origin.
      if (sub !== null && MAIL_HOSTS.test(sub)) return fetch(request);
      const nft = sub === 'stream-api' ? url.pathname.replace(/\/+$/, '').match(NFT_METADATA_PATH) : null;
      if (nft) {
        const id = encodeURIComponent(nft[1].replace(/\.json$/i, ''));
        target = `https://api.dehub.io/api/nft_metadata/${id}.json`;
      } else if (sub !== null) {
        target = `https://dehub.io${RETIRED_SUBDOMAIN_TARGETS[sub] || '/'}`;
      } else {
        // Legacy dehub.net URL spaces with no dehub.io equivalent, each mapped
        // to a real destination. Anything not named here (/guides/*, and every
        // /<username>) keeps the path-preserving redirect.
        const web = LEGACY_WEB_PREFIXES.find(([from]) => p === from || p.startsWith(`${from}/`));
        if (web) {
          target = `https://dehub.io${web[1]}`;
        } else if (p === '/web' || p.startsWith('/web/')) {
          target = 'https://dehub.io/';
        } else if (p === '/learn' || p.startsWith('/learn/')) {
          target = 'https://dehub.io/docs';
        } else if (LEGACY_NET_PATHS[p]) {
          target = `https://dehub.io${LEGACY_NET_PATHS[p]}`;
        } else if (p === '/streams' || p.startsWith('/streams/')) {
          target = 'https://dehub.io/videos';
        }
      }
    }
    return new Response(null, { status: 301, headers: { Location: target } });
  }

  // Plain http:// served 200 at the apex instead of upgrading — the Workers
  // custom domain answers on both schemes and the zone has no Always Use HTTPS
  // rule. Checkers that probe http:// first (Google's OAuth verification among
  // them) were reading an insecure origin. Placed AFTER the alias block on
  // purpose: those hosts already 301 straight to an absolute https://dehub.io
  // target, so upgrading first would cost them a second hop.
  if (url.protocol === 'http:') {
    return redirect301(`https://${url.host}${url.pathname}${url.search}`);
  }

  // Same-origin API relay for clients that reached the site but cannot open a
  // separate connection to api.dehub.io. Restrict it to the canonical host and
  // the real /api namespace so this cannot become a general-purpose proxy.
  if (
    isCanonicalHost &&
    (pathname === `${API_RELAY_PREFIX}/api` || pathname.startsWith(`${API_RELAY_PREFIX}/api/`))
  ) {
    return proxyApiRequest(request);
  }

  // Live visitor stats for the /stats page. Answered here at the edge, ahead
  // of every SEO/SSR branch below — none of that applies to a JSON endpoint,
  // and shouldServeSSR() would otherwise have to reason about it.
  if (pathname === '/api/stats' || pathname === '/api/stats/raw') {
    return handleStatsRequest(request, env, pathname.endsWith('/raw'));
  }

  // URL-space hygiene (all UAs — these paths have no content in the SPA
  // either): bare /guides has no route, /app twins of the blog duplicate it.
  const trimmedPath = pathname.replace(/\/+$/, '') || '/';
  if (trimmedPath === '/guides') return redirect301(`${APP_URL}/docs/blog`);

  // Docs and blog paths are all lowercase, but /Docs, /DOCS/FAQ and
  // /Guides/What-Is-Dehub answered 200 (the SPA shell, under a noindex): a
  // dead end for whoever typed or linked them. One hop to the real page.
  // Only these two spaces — profile handles and entity ids are case-sensitive.
  const docsCase = pathname.match(/^\/(docs|guides)(\/.*)?$/i);
  if (docsCase && pathname !== pathname.toLowerCase()) {
    const lower = pathname.toLowerCase();
    return redirect301(lower.replace(/\/+$/, '') === '/guides'
      ? `${APP_URL}/docs/blog`
      : `${APP_URL}${lower}${url.search}`);
  }

  // The asset layer answers /index.html with a 307 to /, which tells a
  // crawler to keep the old URL. It is permanent.
  if (pathname === '/index.html') return redirect301(`${APP_URL}/${url.search}`);

  // Whitepaper PDFs from the dehub.net era (/uploads/DeHub-English-Whitepaper.pdf
  // and the like) still rank for brand queries, and dehub.net's path-preserving
  // 301 lands them here. There is no PDF any more; the docs are its successor.
  if (/^\/uploads\/[^/]*(?:white|lite)(?:[-_ ]|%20)?paper[^/]*\.pdf$/i.test(pathname)) {
    return redirect301(`${APP_URL}/docs`);
  }

  // The legal pages live at /docs/privacy and /docs/terms — the bare paths were
  // never React routes. Browsers got the SPA catch-all (a soft 404 that looked
  // like 200); crawlers got a hard 404, because SYSTEM_ROUTES doesn't list them
  // so shouldServeSSR() classified /privacy as a *username* and the profile
  // renderer 404'd on the missing user. Any reviewer checking the policy URL —
  // Google OAuth verification included — saw a dead link. 301 to the real page.
  const LEGAL_REDIRECTS = {
    '/privacy': '/docs/privacy',
    '/privacy-policy': '/docs/privacy',
    '/terms': '/docs/terms',
    '/terms-of-service': '/docs/terms',
    '/legal': '/docs/terms',
  };
  const legalTarget = LEGAL_REDIRECTS[trimmedPath.toLowerCase()];
  if (legalTarget) return redirect301(`${APP_URL}${legalTarget}`);

  // Milestone-archive posts superseded by a hand-written article on the same
  // event. They were hidden from the blog index by `excludedTitles`, but the
  // manifest generator never consulted that list — so each stayed in
  // sitemap-static.xml and kept answering at its own URL: an orphan page,
  // submitted to Google, reachable by no link on the site, duplicating the
  // post that replaced it.
  //
  // See src/lib/blog-redirects.js. The generator reads the same map and drops
  // these from the manifest, blog-content/, sitemap and rss, so we never
  // submit a URL we redirect.
  //
  // Ahead of the SSR branches on purpose: these have to 301 for crawlers as
  // well as browsers, or the duplicate simply stays in the index.
  if (trimmedPath.startsWith('/guides/')) {
    const supersededBy = MILESTONE_REDIRECTS[trimmedPath.slice('/guides/'.length)];
    if (supersededBy) return redirect301(`${APP_URL}/guides/${supersededBy}`);
    // Retired guides have no counterpart under /guides/, so their target is an
    // absolute app path — see RETIRED_GUIDES in src/lib/blog-redirects.js.
    const retiredTo = RETIRED_GUIDES[trimmedPath.slice('/guides/'.length)];
    if (retiredTo) return redirect301(`${APP_URL}${retiredTo}`);
    // Thin standalone guides folded into the flagship post on the same query.
    const consolidatedInto = CONSOLIDATED_GUIDES[trimmedPath.slice('/guides/'.length)];
    if (consolidatedInto) return redirect301(`${APP_URL}/guides/${consolidatedInto}`);
  }

  // /docs/blog/<slug> is a second address for every post: the SPA mounts it
  // for the blog list's sake, but every link, the sitemap and the RSS use
  // /guides/<slug>. It answered crawlers 200 with a canonical to the /guides
  // twin, which still costs a crawl per post and splits links between the two.
  const docsBlogPost = trimmedPath.match(/^\/docs\/blog\/([^/]+)$/);
  if (docsBlogPost) return redirect301(`${APP_URL}/guides/${docsBlogPost[1]}`);

  // Routes the SPA answers with <Navigate> (App.tsx). Bots never run that JS,
  // so both resolved somewhere a human can never land: /radio is in
  // SSR_STATIC_ROUTES, so it was proxied to the Supabase fn and served an
  // indexable "DeHub Radio — 24/7 Web3 Stations" page that no browser ever
  // sees, and /mcp isn't in SYSTEM_ROUTES, so it was read as a username and
  // 404'd. 301 both to where a human actually ends up; the /app twins go too,
  // since canonicalizePath collapses /app/radio onto /radio.
  const SPA_REDIRECTS = {
    '/radio': '/music',
    '/app/radio': '/music',
    '/mcp': '/connect',
    '/app/mcp': '/connect',
    // The sidebar calls the board 'Requests'; the SPA redirects both to the
    // board (dehubweb#1427) and 'requests' is a reserved username, but without
    // this crawlers still read it as a username and served Not Found.
    '/requests': '/features',
    '/app/requests': '/features',
  };
  const spaTarget = SPA_REDIRECTS[trimmedPath.toLowerCase()];
  if (spaTarget) return redirect301(`${APP_URL}${spaTarget}`);

  // /radio is `<Navigate to="/music" replace />` in the SPA, but crawlers were
  // handed a standalone "DeHub Radio" page by the Supabase fn — a URL that only
  // exists for bots, describing a page no human can land on. Match the router.
  if (trimmedPath.toLowerCase() === '/radio') return redirect301(`${APP_URL}/music`);

  // Builder moved from /app/builder to the top-level /builder and took that URL
  // for itself (`builder` is reserved in src/lib/reserved-usernames.js, so no
  // account can claim the handle and shadow it). 301 the whole old space rather
  // than only the landing page: every app the Builder has published so far was
  // shared as /app/builder/preview/<id>, and those links have to keep resolving.
  const builderLegacy = trimmedPath.match(/^\/app\/builder((?:\/.*)?)$/i);
  if (builderLegacy) return redirect301(`${APP_URL}/builder${builderLegacy[1] || ''}`);

  const appTwin = trimmedPath.match(/^\/app\/(guides|docs\/blog)((?:\/.*)?)$/);
  if (appTwin) return redirect301(`${APP_URL}/${appTwin[1]}${appTwin[2] || ''}`);

  // Bounties moved from /work/<uuid> to /bounty/<job_number>. Links to the old
  // shape are already out in the wild — in chats, in X posts, in the Turkish
  // community threads the first bounties came from — so the uuid space keeps
  // resolving forever: look the row up, 301 onto its number. Both the bare and
  // /app-prefixed forms, and the /edit child, because all three were reachable.
  //
  // Ahead of the bot branch on purpose. A 301 is what consolidates the ranking
  // signal, and it has to reach browsers too, or a human sharing from the
  // address bar keeps minting uuid links after the switch. The SPA runs the
  // same lookup for in-app navigation (BountyLegacyRedirect), where no request
  // gets this far.
  //
  // On a miss — deleted row, PostgREST unreachable — fall through rather than
  // redirect: the SPA's own /work/:jobKey route answers, and a guessed target
  // would be a lie cached for a year.
  // /app/bounty/<n> is a real SPA route (the board lives inside the app shell),
  // and left alone it would self-canonicalize into a duplicate of every bounty.
  // Nothing links it — bountyPath() always emits the bare form — but a route
  // that answers is a route Google will eventually find.
  const appBounty = trimmedPath.match(/^\/app\/bounty\/(\d+)(\/edit)?$/);
  if (appBounty) return redirect301(`${APP_URL}/bounty/${appBounty[1]}${appBounty[2] || ''}`);

  const legacyBounty = trimmedPath.match(/^(?:\/app)?\/work\/([0-9a-fA-F-]{16,})(\/edit)?$/);
  if (legacyBounty) {
    const job = await supabaseRow(
      `work_jobs?id=eq.${encodeURIComponent(legacyBounty[1])}&select=job_number&limit=1`,
    );
    if (job && job.job_number != null) {
      return redirect301(`${APP_URL}/bounty/${job.job_number}${legacyBounty[2] || ''}`);
    }
  }
  const guardNext = async () => {
    const resp = await env.ASSETS.fetch(request);
    if (!isCanonicalHost) {
      const r = new Response(resp.body, resp);
      r.headers.set('X-Robots-Tag', 'noindex');
      return r;
    }
    return resp;
  };

  // The broad /gods-eye-game/* static rule keeps the generated Cesium tree
  // immutable, but Cloudflare combines that rule with the exact index rule
  // even when the latter appears first. Pin the unhashed entry response here:
  // run_worker_first means this code is the final authority over its headers.
  if (pathname === '/gods-eye-game/index.html') {
    const resp = await guardNext();
    const out = new Response(resp.body, resp);
    out.headers.set('Access-Control-Allow-Origin', '*');
    out.headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
    return out;
  }

  // The mini app SDK, loaded by third-party pages on their own domains. An ES
  // module import of it is a CORS fetch, so the allow-origin is pinned here
  // for the same reason as the entry above. A missing file must 404 rather
  // than fall through to the SPA shell, which a <script> tag would try to run.
  if (pathname.startsWith('/sdk/')) {
    const resp = await env.ASSETS.fetch(request);
    const isScript = resp.ok && !(resp.headers.get('Content-Type') || '').includes('text/html');
    if (!isScript) return new Response('Not found', { status: 404 });
    const out = new Response(resp.body, resp);
    out.headers.set('Access-Control-Allow-Origin', '*');
    out.headers.set('Content-Type', 'text/javascript; charset=utf-8');
    out.headers.set('Cache-Control', 'public, max-age=300');
    return out;
  }

  // Android App Links and Apple Universal Links association files. Three
  // separate things go wrong if these are left to the default asset path, and
  // all three fail silently — which is how the app links shipped broken and
  // stayed broken with nothing anywhere returning an error.
  //
  //  1. `not_found_handling: "single-page-application"` (wrangler.jsonc) answers
  //     a MISSING file with index.html at HTTP 200. Android's verifier read
  //     21,996 bytes of the SPA shell as the statement list and rejected it,
  //     and every probe of the URL came back 200 looking healthy.
  //  2. apple-app-site-association has NO file extension, which iOS requires.
  //     Wrangler's MIME lookup therefore returns null and uploads it as
  //     "application/null" — wrangler's own signal for "send no Content-Type at
  //     all". Google's Digital Asset Links checker and Apple's swcd both demand
  //     application/json and reject anything else.
  //  3. The bare /apple-app-site-association twin that older iOS probes has no
  //     dot in it, so the static-asset skip further down never catches it and
  //     shouldServeSSR() reads it as a USERNAME. It currently renders a profile
  //     page to browsers and a "Not Found — DeHub" page to crawlers.
  //
  // Pinned in code rather than only in public/_headers because Cloudflare
  // documents _headers as not applying when `assets.run_worker_first` is set,
  // which wrangler.jsonc does set. The rules are in fact applied today
  // (/version.json comes back no-store, /assets/* immutable), but an app-link
  // contract should not rest on undocumented behaviour. The _headers stanza is
  // kept as a second layer.
  const APP_LINK_FILES = new Set([
    '/.well-known/assetlinks.json',
    '/.well-known/apple-app-site-association',
    '/apple-app-site-association',
  ]);
  // Profiles (/mal, /mal.eth) open in the iOS app too, but a one-segment
  // catch-all can only be said to iOS as "everything else": exclude each
  // system route, then claim what is left. That exclusion list IS
  // SYSTEM_ROUTES — the set this worker already uses to decide /docs is a page
  // and /mal a person — so it is appended here rather than copied into the
  // static file, where it would drift the first time a route was added. iOS
  // takes the first component that matches, so the static, specific entries
  // stay ahead of all of this. Any surprise in the file serves it unchanged.
  const withProfileAppLinks = (text) => {
    try {
      const aasa = JSON.parse(text);
      const details = aasa?.applinks?.details;
      if (!Array.isArray(details) || !details.every((d) => Array.isArray(d.components))) return text;
      const tail = [
        ...[...SYSTEM_ROUTES].map((seg) => ({ '/': `/${seg}`, exclude: true, caseSensitive: false })),
        { '/': '/', exclude: true, comment: 'Home stays on the web' },
        { '/': '/*/*', exclude: true, comment: 'Deeper paths not claimed above' },
        { '/': '/*.eth', caseSensitive: false, comment: 'Profile at a verified ENS name' },
        { '/': '/*.*', exclude: true, comment: 'Files' },
        { '/': '/*', comment: 'Profile, bare or @handle' },
      ];
      for (const d of details) d.components.push(...tail);
      return JSON.stringify(aasa);
    } catch {
      return text;
    }
  };
  if (APP_LINK_FILES.has(pathname)) {
    const asset = await env.ASSETS.fetch(new Request(new URL('/.well-known/' + pathname.split('/').pop(), url), request));
    // Parse the BODY. Checking the Content-Type header cannot work here: the
    // public/_headers rule below pins application/json on these exact paths,
    // and Workers Assets applies it to the SPA fallback response too — so a
    // missing file came back as the 22 KB index.html labelled application/json,
    // sailing past a text/html check. Measured on prod, not reasoned about.
    //
    // These files are a few hundred bytes, so buffering them is free, and
    // parsing catches the whole failure class rather than one symptom of it:
    // the SPA shell, a half-written file, a stray BOM, an editor's smart
    // quotes. A file a verifier cannot parse is a file that is not there.
    const body = asset.ok ? await asset.text() : null;
    let valid = false;
    if (body) { try { JSON.parse(body); valid = true; } catch { valid = false; } }
    if (!valid) {
      return new Response('Not Found', {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }
    const out = new Response(pathname.endsWith('apple-app-site-association') ? withProfileAppLinks(body) : body, { status: 200 });
    out.headers.set('Content-Type', 'application/json');
    // Short, unlike the year-long caches above: a certificate fingerprint or
    // Team ID change has to reach Google's and Apple's fetchers quickly, and
    // these files are a few hundred bytes.
    out.headers.set('Cache-Control', 'public, max-age=300');
    // Deliberately no X-Robots-Tag and no Vary — these are machine-read files
    // and both verifiers are strict about what they will accept.
    return out;
  }

  // Sitemaps must be proxied HERE, not via redirect rules: redirect files and
  // rules are processed ahead of static-asset fallbacks, so a broad catch-all
  // would serve these paths as SPA HTML — Google then reads the sitemap as an
  // HTML page. This proxy runs first at the edge and cannot be shadowed.
  // (/sitemap-static.xml is a real file in public/ and intentionally falls
  // through.)

  // Every sitemap below is cached under its bare URL: a query string would
  // otherwise mint a fresh cache key, and with it a fresh build, per request.
  const sitemapRequest = new Request(`${url.origin}${pathname}`);

  // The index, built here with a real date on every child (see
  // buildSitemapIndex). Falls through to the sitemap-index function below
  // only when there is no cached copy and the build failed.
  if (pathname === '/sitemap.xml') {
    const cached = await cachedSitemap(sitemapRequest, ctx, () => buildSitemapIndex(request, env, ctx));
    if (cached) return cached;
    console.error('[Edge] sitemap index build failed, falling back');
  }

  // Bounties (/sitemap-bounties.xml), communities, stores, events, packs,
  // creator flows, proposals and feature requests, straight from PostgREST —
  // see ENTITY_SITEMAPS for what each one admits. Built here rather than as
  // more sitemap-* Supabase functions for the usual reason: those only move on
  // a manual `supabase functions deploy` that nobody runs, and this ships with
  // the Cloudflare build. A failed select with nothing cached is a 503, never
  // an empty file: an empty sitemap tells Google every URL it held is gone.
  const entitySitemapMatch = pathname.match(/^\/sitemap-([a-z]+)\.xml$/);
  if (entitySitemapMatch && Object.hasOwn(ENTITY_SITEMAPS, entitySitemapMatch[1])) {
    const kind = entitySitemapMatch[1];
    const cached = await cachedSitemap(sitemapRequest, ctx, () => buildEntitySitemap(kind));
    if (cached) return cached;
    return new Response('sitemap temporarily unavailable', {
      status: 503,
      headers: { 'Retry-After': '600' },
    });
  }

  // Profiles, from the API that actually holds them. The Supabase function
  // this replaces read `suggested_profiles_cache` — the fifty rows behind the
  // "who to follow" rail — so the sitemap offered Google fifty profile URLs
  // against several thousand accounts, and the rest were crawlable only where
  // something happened to link to them. That table was never a census; it was
  // reused as one because profiles live in Mongo and nothing on the Supabase
  // side could see them.
  //
  // Falls through to the proxy below on any failure, so a slow or broken API
  // degrades to the fifty-URL sitemap rather than to a 503.
  const profileSitemapMatch = pathname.match(/^\/sitemap-profiles-(\d+)\.xml$/);
  if (profileSitemapMatch) {
    const page = Number(profileSitemapMatch[1]) || 1;
    const cached = await cachedSitemap(sitemapRequest, ctx, async () => {
      const meta = await dehubProfileSitemap(page, PROFILE_SITEMAP_PAGE_SIZE);
      return meta ? sitemapResponse(profileSitemapXml(meta.profiles, SYSTEM_ROUTES)) : null;
    });
    if (cached) return cached;
    console.error(`[Edge] profile sitemap unavailable for ${pathname}, falling back`);
  }

  // Posts, enumerated and filtered here. The Supabase function this replaces
  // offered Google every minted post — 3,299 of them — and Google declined
  // 4,441 post URLs as not worth indexing. postQualifiesForSitemap explains
  // the bar. Falls through to that function only when the feed fails partway
  // and nothing is cached.
  const postSitemapMatch = pathname.match(/^\/sitemap-posts-(\d+)\.xml$/);
  if (postSitemapMatch) {
    const page = Number(postSitemapMatch[1]);
    // Only the pages the index lists. Any other number used to start the
    // whole feed walk (posts-2 took ten seconds to answer an empty urlset),
    // which made every made-up page number a free way to burn the API.
    const unlisted = await unlistedPostSitemapResponse(postSitemapMatch[1]);
    if (unlisted) return unlisted;
    const cached = await cachedSitemap(sitemapRequest, ctx, async () => {
      const posts = await dehubPostSitemap(page);
      return posts ? sitemapResponse(postSitemapXml(posts)) : null;
    });
    if (cached) return cached;
    console.error(`[Edge] post sitemap enumeration incomplete for ${pathname}, falling back`);
  }

  const sitemapMatch = pathname.match(/^\/sitemap(?:-(posts|profiles)-(\d+))?\.xml$/);
  if (sitemapMatch) {
    const [, kind, page] = sitemapMatch;
    const target = kind
      ? `${SUPABASE_FN_BASE}/sitemap-${kind}?page=${page}`
      : `${SUPABASE_FN_BASE}/sitemap-index`;
    try {
      const res = await fetch(target);
      if (res.ok) {
        let body = await res.text();
        // Reached for the index only when the edge build above failed with
        // nothing cached. The (undeployable) sitemap-index function that
        // answers instead will never learn about bounties. Splice the entry in
        // on the way past — same trick the homepage branch uses to swap that
        // function's stale og:image. Guarded on the closing tag so a changed
        // upstream shape degrades to "no bounties listed", not to broken XML.
        if (!kind && body.includes('</sitemapindex>') && !body.includes('sitemap-bounties.xml')) {
          body = body.replace(
            '</sitemapindex>',
            `  <sitemap><loc>${APP_URL}/sitemap-bounties.xml</loc></sitemap>\n</sitemapindex>`,
          );
        }
        // The same function counts profile chunks from that 50-row suggestion
        // cache and dates them by when the cache was rebuilt, so it advertises
        // exactly one chunk however many profiles exist, stamped with a date
        // that moves for no reason. Correct both from the real list. Costs one
        // small request on a path Google reads rarely and the edge holds for an
        // hour; a null answer leaves the index exactly as the function built it.
        if (!kind) {
          body = patchProfileChunks(body, await dehubProfileSitemap(1, 1));
        }
        return new Response(body, {
          status: 200,
          headers: {
            // Deployed Supabase fns return text/plain; browsers/crawlers need XML.
            'Content-Type': 'application/xml; charset=utf-8',
            'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
          },
        });
      }
      console.error(`[Edge] sitemap upstream ${res.status} for ${pathname}`);
    } catch (e) {
      console.error('[Edge] sitemap proxy error:', e);
    }
    // 503, never the SPA fallback: crawlers treat 5xx as transient and retry,
    // but cache an HTML body as a permanently unreadable sitemap.
    return new Response('sitemap temporarily unavailable', {
      status: 503,
      headers: { 'Retry-After': '600' },
    });
  }

  // Build output must 404 when it is genuinely missing. `not_found_handling:
  // "single-page-application"` (wrangler.jsonc) answers a chunk from a
  // superseded deploy with index.html at 200 — and the assets layer stamps it
  // `immutable, max-age=31536000`, because as far as it knows it just served a
  // hashed asset. Three things go wrong downstream, none of which look like a
  // missing file:
  //
  //   - The browser rejects the HTML at the module MIME check, so a routine
  //     stale-deploy miss surfaces as "Failed to fetch dynamically imported
  //     module" — an app crash, not a 404.
  //   - That HTML is then cached under the chunk's URL for a year, so retrying
  //     the import re-reads it and cannot recover.
  //   - sw.js stores it too (CacheFirst treats 200 as truth), which outlives
  //     the HTTP cache entirely.
  //
  // A hard 404 keeps every one of those caches clean and lets the app's
  // stale-deploy reload path (lib/lazy-with-retry) do the job it was written
  // for. Nothing under /assets/ is ever an HTML document, so content-type is a
  // safe tell that the SPA fallback answered instead of a real file.
  if (pathname.startsWith('/assets/')) {
    const resp = await guardNext();
    const contentType = (resp.headers.get('Content-Type') || '').toLowerCase();
    if (contentType.startsWith('text/html')) {
      return new Response('Not Found', {
        status: 404,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      });
    }
    return resp;
  }

  // Legacy upload prefix. Those files now live under /media/, but the old URLs
  // are baked into shared links, OG cards Google and the social crawlers have
  // already cached, and every post body written before the move. Served as a
  // rewrite rather than a 301 so a cached card keeps resolving to a 200 image.
  if (pathname.startsWith('/lovable-uploads/')) {
    const aliased = new URL(request.url);
    aliased.pathname = pathname.replace('/lovable-uploads/', '/media/');
    const resp = await env.ASSETS.fetch(new Request(aliased, request));
    if (!isCanonicalHost) {
      const r = new Response(resp.body, resp);
      r.headers.set('X-Robots-Tag', 'noindex');
      return r;
    }
    return resp;
  }

  // Share-card sources for the image transform (see shareCardImage). Ahead of
  // the `/_` static-asset skip below, which would hand these to ASSETS.
  // Older installed apps and already-shared URLs continue to receive the current card.
  const textPostCard = pathname.match(/^\/_og\/post\/v(?:1|2|3|4)\/([1-9]\d{0,14})\.png$/);
  if (textPostCard) {
    const { handlePostShareImage } = await import('./server/post-share-image.js');
    return handlePostShareImage(request, env, ctx, textPostCard[1], fetchPostRecord, {
      rows: supabaseRows,
      price: fetchShareBadgePrice,
    });
  }
  if (pathname.startsWith(OG_SOURCE_PREFIX)) return ogSourceResponse(request, env, pathname);

  // Skip static assets immediately.
  //
  // This is the gate that actually decided `dehub.io/mal.eth` was a file: it
  // runs before shouldServeSSR, so a dotted path never reached the profile
  // branch at all. A `.eth` first segment is exempted here and nowhere deeper,
  // so every other extension still short-circuits exactly as it did.
  if (pathname.startsWith('/_') ||
      (pathname.includes('.') && !pathname.includes('/post/') && !isEnsHandle(firstSegmentOf(pathname)))) {
    const resp = await guardNext();
    // …but a file that is not there must say so. The SPA fallback answers a
    // miss with index.html at 200, so /x.pdf, /.env, /ads.txt and every legacy
    // dehub.net upload became an indexable copy of the homepage. Same tell as
    // /assets/ above: none of these extensions is ever an HTML document, so
    // text/html means the asset lookup missed. Real files keep their own type
    // and pass straight through.
    if (isFilePath(pathname) &&
        (resp.headers.get('Content-Type') || '').toLowerCase().startsWith('text/html')) {
      return new Response('Not Found', {
        status: 404,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Robots-Tag': 'noindex',
        },
      });
    }
    return resp;
  }

  // Everything reaching here without a per-route SSR handler gets the raw SPA
  // shell — i.e. the HOMEPAGE title/description/og with `robots: index, follow`
  // and no canonical. Google indexed that cluster (/app, /app/messages,
  // /notifications, /settings, /app/wallet …) as near-duplicates of the
  // homepage, and because the homepage is by far the strongest URL on the
  // domain for the token "dehub", those clones outranked /docs for the query
  // "dehub docs". Every genuinely indexable route already returns true from
  // shouldServeSSR() (SECTION_PAGES, SSR_STATIC_ROUTES, posts, communities,
  // profiles, blog, docs), so the residue is exactly the logged-in app chrome.
  //
  // noindex, FOLLOW — not Disallow. A robots.txt block would stop the recrawl
  // that Google needs in order to *see* the noindex, freezing the clones in the
  // index; and `follow` keeps internal link equity flowing to /docs.
  // Static assets already returned above, so they never reach this branch.
  if (!shouldServeSSR(pathname)) {
    return noindexShell(await guardNext());
  }

  // A profile deep path, /<user>/<anything>. The SPA has no such route (it
  // renders Not Found) and crawlers were served the profile under a canonical,
  // so every handle carried an unbounded space of 200 URLs. Send all of them
  // to the profile itself. Posts and communities have their own shapes and
  // are left alone.
  const pathSegments = pathname.split('/').filter(Boolean);
  if (
    pathSegments.length > 1 &&
    !pathname.includes('/post/') &&
    !pathname.includes('/communities/') &&
    couldBeProfileSegment(firstSegmentOf(pathname), SYSTEM_ROUTES)
  ) {
    return redirect301(`${APP_URL}/${pathSegments[0].replace(/^(?:@|%40)/i, '')}`);
  }

  const userAgent = request.headers.get('User-Agent') || '';
  const forceApp = url.searchParams.get(APP_ESCAPE_PARAM) === '1';
  const isBot = !forceApp && isCrawlerUa(userAgent);

  // The two ways an entity page can come up empty. A row that does not exist
  // is a 404 — answering 200 with the generic card minted an indexable
  // homepage-titled page at every deleted or made-up id. A row we could not
  // read is not a 404 either: a search engine is told to come back (503 +
  // Retry-After), a link previewer still gets the generic card so the unfurl
  // does not fail, and neither version asks to be indexed.
  const entityNotFound = () => guard(new Response(buildFallbackHtml(pathname, request.url), {
    status: 404,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, s-maxage=300',
      'Vary': 'User-Agent',
      'X-Robots-Tag': 'noindex',
    },
  }));
  const entityUnavailable = () => (isSearchBotUa(userAgent)
    ? guard(new Response('Temporarily unavailable', {
      status: 503,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'Retry-After': '120',
        'Vary': 'User-Agent',
        'X-Robots-Tag': 'noindex',
      },
    }))
    : guard(new Response(buildFallbackHtml(pathname, request.url), {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        'Vary': 'User-Agent',
        'X-Robots-Tag': 'noindex',
      },
    })));
  /** `undefined` from supabaseLookup is the unreadable case, `null` the missing one. */
  const entityMiss = (row) => (row === undefined ? entityUnavailable() : entityNotFound());

  // Non-bots (regular browsers) always get the React SPA directly.
  // The SSR HTML contains `window.location.href = '<same-url>'` for non-bots,
  // which causes an infinite reload loop on every route (/, /app/communities/x,
  // /app/post/x, /username, etc.). The React SPA handles all routing itself.
  if (!isBot) {
    // These URLs serve different bodies per UA; without Vary a fronting CDN
    // (e.g. Cloudflare) could cache bot HTML by URL and serve it to browsers —
    // which triggers the infinite-reload loop documented above.
    const resp = await guardNext();
    const varied = new Response(resp.body, resp);
    varied.headers.append('Vary', 'User-Agent');
    // ?app=1 is a duplicate of the canonical URL: keep it out of the index,
    // while still letting a crawler follow the links on the page it lands on.
    if (forceApp) return noindexShell(varied);
    return varied;
  }

  // Blog (edge-built, no Supabase SSR involved). Canonical URL for every post
  // is /guides/<slug> — the SPA's share links, internal links, sitemap and RSS
  // all point there; /docs/blog/<slug> serves identical HTML canonicalized to
  // the /guides twin.
  const cleanPath = pathname.replace(/\/+$/, '') || '/';
  const blogHeaders = {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    'Vary': 'User-Agent',
    'X-Powered-By': 'DeHub-Edge-SEO-Blog',
  };

  // Legacy /blog URL space: a user registered the handle "blog", so these
  // resolved as indexable "Join @blog" profile pages — and dehub.net's
  // catch-all 301 funnels its old blog paths here. Redirect to the real blog.
  if (cleanPath === '/blog') {
    return redirect301(`${APP_URL}/docs/blog`);
  }
  const legacyBlog = cleanPath.match(/^\/blog\/([^/?#]+)/);
  if (legacyBlog) {
    let legacySlug = legacyBlog[1];
    try { legacySlug = decodeURIComponent(legacySlug); } catch { /* keep raw */ }
    const manifest = await getBlogManifest(request, env);
    const target = manifest.has(legacySlug)
      ? `${APP_URL}/guides/${encodeURIComponent(legacySlug)}`
      : `${APP_URL}/docs/blog`;
    return redirect301(target);
  }

  // Blog index: bots got the empty SPA shell before, making every post
  // undiscoverable by crawling. Serve a real list of post links.
  if (cleanPath === '/docs/blog') {
    const manifest = await getBlogManifest(request, env);
    if (manifest.size) {
      return guard(new Response(buildBlogIndexHtml(manifest), { status: 200, headers: blogHeaders }));
    }
    return guardNext();
  }

  const blogMatch = cleanPath.match(/^\/(?:docs\/blog|guides)\/([^/?#]+)$/);
  if (blogMatch) {
    // Malformed percent-encoding must 404, not crash the isolate into a 5xx.
    let slug;
    try {
      slug = decodeURIComponent(blogMatch[1]);
    } catch {
      slug = null;
    }

    // Hand-built standalone guide pages (React components, not manifest posts).
    // Object.hasOwn: a plain [slug] lookup made /guides/constructor et al.
    // return 200 pages via the prototype chain.
    if (slug && cleanPath.startsWith('/guides/') && Object.hasOwn(GUIDE_PAGES, slug)) {
      const guide = await getGuideContent(request, env, slug);
      return guard(new Response(buildGuidePageHtml(slug, GUIDE_PAGES[slug], guide && guide.html), { status: 200, headers: blogHeaders }));
    }
    if (!slug) {
      return guard(new Response(buildFallbackHtml(pathname, request.url), {
        status: 404,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, s-maxage=300',
          'Vary': 'User-Agent',
          'X-Robots-Tag': 'noindex',
        },
      }));
    }

    const manifest = await getBlogManifest(request, env);
    const post = manifest.get(slug);
    if (post) {
      const canonical = `${APP_URL}/guides/${encodeURIComponent(slug)}`;
      const content = await getBlogContent(request, env, slug);
      return guard(new Response(buildBlogHtml(post, canonical, content && content.html, manifest), {
        status: 200,
        headers: blogHeaders,
      }));
    }

    // Unknown slug. If the manifest loaded, this is a real 404 — serving 200
    // minted an indexable thin page for every random URL (soft-404 surface).
    if (manifest.size) {
      return guard(new Response(buildFallbackHtml(pathname, request.url), {
        status: 404,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, s-maxage=300',
          'Vary': 'User-Agent',
          'X-Robots-Tag': 'noindex',
        },
      }));
    }
    // Manifest fetch failed — can't distinguish real posts; degrade to 200 stub.
    return guard(new Response(buildFallbackHtml(pathname, request.url), {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        'Vary': 'User-Agent',
      },
    }));
  }

  // Docs section: bots used to get the raw SPA shell (homepage title/meta, no
  // canonical) for every /docs URL — 11 sitemap entries presenting as
  // homepage duplicates. Serve real documentation text extracted at build.
  if (cleanPath === '/docs') {
    const table = await seoI18nTable(env, request.url);
    const localeRedirect = unservedLocaleRedirect(url, '/docs', table, false);
    if (localeRedirect) return redirect301(localeRedirect);
    const docsHtml = localizePage(
      buildDocsIndexHtml(),
      '/docs',
      requestedLocale(url),
      table,
    );
    return guard(new Response(docsHtml, { status: 200, headers: blogHeaders }));
  }
  const docsMatch = cleanPath.match(/^\/docs\/(.+)$/);
  if (docsMatch) {
    const route = docsMatch[1].toLowerCase();
    if (Object.hasOwn(DOCS_REDIRECTS, route)) {
      return redirect301(`${APP_URL}${DOCS_REDIRECTS[route]}`);
    }
    if (Object.hasOwn(DOCS_PAGES, route)) {
      const content = await getDocsContent(request, env, route);
      return guard(new Response(buildDocsHtml(route, DOCS_PAGES[route], content && content.html), {
        status: 200,
        headers: blogHeaders,
      }));
    }
    if (DOCS_COMING_SOON.has(route)) {
      return noindexShell(await guardNext());
    }
    // Unknown docs subpage: previously fell through to the SPA shell, which
    // answered 200 with homepage meta — a soft-404 that let any typo'd URL mint
    // another homepage duplicate (Google indexed /docs/quick-start this way).
    // The SPA renders NotFound for these, so 404 is the honest, matching status.
    return guard(new Response('Not found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Robots-Tag': 'noindex' },
    }));
  }

  // Feed section pages (/explore, /videos, /shorts). Accept the /app-prefixed
  // twin too and canonicalize both to the bare path so they index as one.
  const sectionKey = cleanPath.replace(/^\/app\//, '/').replace(/^\/+|\/+$/g, '').toLowerCase();
  if (Object.hasOwn(SECTION_PAGES, sectionKey)) {
    // The feed page lists what is actually in the feed. Same rows the app
    // shows, one bounded API read, held by the edge for an hour; a miss
    // costs the list, never the page (see sectionLiveHtml).
    const html = injectBeforeCta(
      buildSectionHtml(sectionKey, SECTION_PAGES[sectionKey]),
      await sectionLiveHtml(sectionKey),
    );
    return guard(new Response(html, {
      status: 200,
      headers: blogHeaders,
    }));
  }

  // A single title, /cinema/<film|series>/<id>. sectionKey is the whole path,
  // so these match no table and would fall through to the generic handling —
  // which means a film link shared to Twitter or Discord unfurls with no card
  // at all, and the share button exists precisely to produce those links.
  //
  // They serve the Cinema page's own HTML and canonicalize onto /cinema. Per
  // title metadata would be better and is not possible yet: the titles live
  // behind the JustWatch partner API, which needs a token the worker does not
  // have. Revisit when that is provisioned — the shape to copy is the stores
  // branch below, which reads PostgREST directly.
  if (
    /^cinema\/(?:film|series|movie|show)\/[A-Za-z0-9_-]{1,64}$/.test(sectionKey) &&
    Object.hasOwn(MARKETING_PAGES, 'cinema')
  ) {
    // noindex, follow: with no way to check the id, every string that fits the
    // pattern answered 200 with the same page as /cinema. The card is what
    // these links exist for, and unfurlers ignore robots.
    return guard(new Response(buildMarketingHtml('cinema', MARKETING_PAGES['cinema']), {
      status: 200,
      headers: { ...blogHeaders, 'X-Robots-Tag': 'noindex, follow' },
    }));
  }

  // Two more sub-paths with no metadata of their own, handled the same way:
  // the section's card beats the homepage's, and a `noindex` keeps them out of
  // the index rather than minting a page per id that says the same thing.
  //
  // A launchpad coin deserves its own card — name, ticker, chart — and
  // launchpad_tokens is anon-readable, so the shape to copy is the stores
  // branch below. Not written yet because the table is empty: there would be
  // no way to check it against a real coin. Revisit at the first launch.
  const SECTION_FALLBACKS = [
    [/^launchpad\/[^/]+$/, 'launchpad'],
    [/^arcade\/kings-gambit\/online$/, 'arcade/kings-gambit'],
  ];
  for (const [re, key] of SECTION_FALLBACKS) {
    if (re.test(sectionKey) && Object.hasOwn(MARKETING_PAGES, key)) {
      return guard(new Response(buildMarketingHtml(key, MARKETING_PAGES[key]), {
        status: 200,
        headers: { ...blogHeaders, 'X-Robots-Tag': 'noindex, follow' },
      }));
    }
  }

  // A single request or bug report, /features?feature=<id>. Same PostgREST-
  // direct shape as stores/events/stages/bounties below — checked ahead of the
  // generic MARKETING_PAGES dispatch two blocks down so a resolvable id gets
  // its own card instead of the board's static one.
  if (sectionKey === 'features') {
    const featureId = url.searchParams.get('feature');
    if (featureId && /^[0-9a-fA-F-]{8,}$/.test(featureId)) {
      const feature = await supabaseRow(
        `feature_requests?id=eq.${encodeURIComponent(featureId)}&select=*&limit=1`,
      );
      if (feature) {
        return guard(new Response(buildFeatureRequestHtml(feature), {
          status: 200,
          headers: feature.status === 'declined'
            ? { ...blogHeaders, 'X-Robots-Tag': 'noindex, follow' }
            : blogHeaders,
        }));
      }
      // Row missing or Supabase unreachable: fall through to the generic
      // board card below rather than inventing a 404 for a real request we
      // just couldn't read.
    }
  }

  // Edge-rendered marketing pages — never proxied to the Supabase fn (its
  // STATIC_ROUTES allowlist predates these routes and 404s them).
  if (Object.hasOwn(MARKETING_PAGES, sectionKey)) {
    let html = buildMarketingHtml(sectionKey, MARKETING_PAGES[sectionKey]);
    // The bounty board is the only entry point into /bounty/*, and its bot HTML
    // is a static description that links to no bounty. Without this the whole
    // space is sitemap-only — reachable by no link on the site, which is what
    // Google treats as an orphan and crawls last. The list is the same live
    // rows the browser sees, so the two variants describe the same board.
    if (sectionKey === 'work') {
      const rows = await supabaseRows(
        'work_jobs?status=in.(open,in_progress)&select=job_number,title,total_budget,currency&order=created_at.desc&limit=25',
      );
      if (rows && rows.length) {
        const items = rows.map((j) => `<li style="margin:6px 0"><a href="${APP_URL}/bounty/${j.job_number}">${escHtml(truncate(j.title || `Bounty #${j.job_number}`, 90))}</a> — ${escHtml(Number(j.total_budget).toLocaleString('en-US', { maximumFractionDigits: 4 }))} ${escHtml(j.currency || '')}</li>`).join('');
        html = html.replace('</body>', `<section style="max-width:600px;margin:24px auto;text-align:left"><h2 style="font-size:16px">Open bounties</h2><ul style="list-style:none;padding:0">${items}</ul></section></body>`);
      }
    }
    // Same for the music page: the latest tracks, from the same feed the
    // app's music lane reads.
    if (sectionKey === 'music') {
      html = injectBeforeCta(html, await sectionLiveHtml('music'));
    }
    // The localised variant when ?hl= names a language this page is served
    // in, otherwise the English page with its hreflang cluster (see
    // localizePage). Every other ?hl= — en included — 301s to the bare page.
    const table = await seoI18nTable(env, request.url);
    const localeRedirect = unservedLocaleRedirect(url, `/${sectionKey}`, table, MARKETING_PAGES[sectionKey].noindex);
    if (localeRedirect) return redirect301(localeRedirect);
    html = localizePage(html, `/${sectionKey}`, requestedLocale(url), table);
    return guard(new Response(html, {
      status: 200,
      headers: MARKETING_PAGES[sectionKey].noindex
        ? { ...blogHeaders, 'X-Robots-Tag': 'noindex, follow' }
        : blogHeaders,
    }));
  }

  // Stores and shop items. `?listing=<id>` is the item; the bare path is the
  // store. Read straight from PostgREST rather than through the ssr-seo
  // function, which has never been redeployed and does not know these routes.
  const storeMatch = cleanPath.match(/^\/(?:app\/)?stores\/([0-9a-fA-F-]{8,})$/);
  if (storeMatch) {
    const listingId = url.searchParams.get('listing');
    if (listingId && /^[0-9a-fA-F-]{8,}$/.test(listingId)) {
      const listing = await supabaseRow(
        `store_listings?id=eq.${encodeURIComponent(listingId)}&select=*,stores(name)&limit=1`,
      );
      if (listing) {
        return guard(new Response(buildListingHtml(listing), {
          status: 200,
          headers: listing.status === 'active'
            ? blogHeaders
            : { ...blogHeaders, 'X-Robots-Tag': 'noindex, follow' },
        }));
      }
    }
    const store = await supabaseLookup(
      `stores?id=eq.${encodeURIComponent(storeMatch[1])}&select=id,name,description,banner_url,avatar_url&limit=1`,
    );
    if (store) {
      return guard(new Response(buildStoreHtml(store), { status: 200, headers: blogHeaders }));
    }
    return entityMiss(store);
  }
  // Store ids are uuids, so anything else under /stores/ names no store.
  if (/^\/(?:app\/)?stores\/[^/]+$/.test(cleanPath)) return entityNotFound();

  // A shared Creator Flow. Public rows are readable with the anon key (RLS
  // select policy on is_public), so this reads PostgREST directly like
  // proposals do; a private or missing flow is a 404.
  const flowMatch = cleanPath.match(/^\/creator\/flow\/([a-z0-9]{6,32})$/);
  if (flowMatch) {
    const flow = await supabaseLookup(
      `creator_flows?id=eq.${encodeURIComponent(flowMatch[1])}&is_public=eq.true&select=id,name,cover_url,node_count,created_at,updated_at&limit=1`,
    );
    if (flow) {
      return guard(new Response(buildCreatorFlowHtml(flow), { status: 200, headers: blogHeaders }));
    }
    return entityMiss(flow);
  }

  const packMatch = cleanPath.match(/^\/(?:app\/)?packs\/([a-z0-9][a-z0-9_-]{2,47})$/i);
  if (packMatch) {
    const pack = await supabaseLookup(
      `creator_packs?slug=eq.${encodeURIComponent(packMatch[1].toLowerCase())}&select=slug,name,kind,cover_url,item_count,created_at&limit=1`,
    );
    if (pack) {
      return guard(new Response(buildCreatorPackHtml(pack), { status: 200, headers: blogHeaders }));
    }
    return entityMiss(pack);
  }

  const proposalMatch = cleanPath.match(/^\/(?:app\/)?governance\/([0-9a-fA-F-]{8,})$/);
  if (proposalMatch) {
    const proposal = await supabaseLookup(
      `governance_proposals?id=eq.${encodeURIComponent(proposalMatch[1])}&select=*&limit=1`,
    );
    if (proposal) {
      return guard(new Response(buildProposalHtml(proposal), { status: 200, headers: blogHeaders }));
    }
    return entityMiss(proposal);
  }

  const eventMatch = cleanPath.match(/^\/(?:app\/)?events\/(\d+)$/);
  if (eventMatch) {
    const event = await supabaseLookup(
      `community_events?event_number=eq.${eventMatch[1]}&select=*&limit=1`,
    );
    if (event) {
      return guard(new Response(buildEventHtml(event), {
        status: 200,
        headers: event.is_private
          ? { ...blogHeaders, 'X-Robots-Tag': 'noindex, follow' }
          : blogHeaders,
      }));
    }
    return entityMiss(event);
  }

  // Stage invite links: /stages/<n> is the short share form
  // (audio_spaces.short_id), /stage/<uuid> the original. Same PostgREST path
  // as stores and events — anon-readable row, publishable key. The share image
  // is the stage cover, else the host's profile picture, so every stage link
  // unfurls with its own art rather than the generic card.
  const stageShortMatch = cleanPath.match(/^\/stages\/(\d+)$/);
  const stageIdMatch = cleanPath.match(/^\/stage\/([0-9a-fA-F-]{16,})$/);
  if (stageShortMatch || stageIdMatch) {
    const stage = await supabaseLookup(
      stageShortMatch
        ? `audio_spaces?short_id=eq.${stageShortMatch[1]}&select=*&limit=1`
        : `audio_spaces?id=eq.${encodeURIComponent(stageIdMatch[1])}&select=*&limit=1`,
    );
    if (stage) {
      return guard(new Response(buildStageHtml(stage), {
        status: 200,
        headers: stage.status === 'ended'
          ? { ...blogHeaders, 'X-Robots-Tag': 'noindex, follow' }
          : blogHeaders,
      }));
    }
    return entityMiss(stage);
  }

  // A community DEX pool, /dex/<chain>/<token>. The share image is the picture
  // the pool's creator chose, so a pasted pool link shows its own token.
  const dexPoolMatch = cleanPath.match(/^\/dex\/(base|ethereum|robinhood|solana)\/(0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/);
  if (dexPoolMatch) {
    const address = dexPoolMatch[1] === 'solana' ? dexPoolMatch[2] : dexPoolMatch[2].toLowerCase();
    const pool = await supabaseLookup(`dex_pools?chain=eq.${dexPoolMatch[1]}&token_address=eq.${encodeURIComponent(address)}&select=*&limit=1`);
    if (pool) {
      return guard(new Response(buildDexPoolHtml(pool), { status: 200, headers: blogHeaders }));
    }
    return entityMiss(pool);
  }

  // A single bounty. /work/<uuid> 301s onto this shape further up, so by the
  // time anything reaches here the number is the only address in play.
  const miniAppMatch = cleanPath.match(/^\/apps\/([a-z0-9][a-z0-9-]{1,39})$/);
  if (miniAppMatch && miniAppMatch[1] !== 'dev') {
    const app = await supabaseLookup(
      `miniapp_apps?slug=eq.${miniAppMatch[1]}&select=slug,domain,name,subtitle,description,icon_url,category,tier,manifest&limit=1`,
    );
    if (app) {
      return guard(new Response(buildMiniAppHtml(app), {
        status: 200,
        headers: app.tier === 'unlisted' ? { ...blogHeaders, 'X-Robots-Tag': 'noindex, follow' } : blogHeaders,
      }));
    }
    // A slug with no app fell through to the proxy and unfurled as the
    // homepage, at 200. Answer it like every other missing entity.
    return entityMiss(app);
  }

  // A shared Builder app. Rendered even when its file can't be read (still
  // building, or gone): the link was shared either way, and the Builder card
  // beats the homepage one.
  const builderPreview = cleanPath.match(BUILDER_PREVIEW_ID);
  if (builderPreview) {
    return guard(new Response(buildBuilderPreviewHtml(builderPreview[1], await fetchBuilderAppMeta(builderPreview[1])), {
      status: 200,
      headers: { ...blogHeaders, 'X-Robots-Tag': 'noindex, follow' },
    }));
  }

  const bountyMatch = cleanPath.match(/^\/bounty\/(\d+)$/);
  if (bountyMatch) {
    const job = await supabaseLookup(
      `work_jobs?job_number=eq.${bountyMatch[1]}&select=*&limit=1`,
    );
    if (job) {
      return guard(new Response(buildBountyHtml(job), {
        status: 200,
        headers: isBountyIndexable(job)
          ? blogHeaders
          : { ...blogHeaders, 'X-Robots-Tag': 'noindex, follow' },
      }));
    }
    return entityMiss(job);
  }

  // Every post shape is normalised onto /app/post/<tokenId> before the proxy,
  // because that is the only one the deployed fn renders. Bare /post/<id>
  // predates `post` joining its system-route list, so it reads the segment as
  // a username and answers 404 — the canonical URL of every post page was
  // being handed to crawlers as a dead end. /posts/<n> and /newpost/<n> it has
  // never heard of at all. The fn emits its own canonical at the /app twin, so
  // the alternate shapes consolidate there instead of competing.
  const ssrKey = ssrCacheKey(request.url);
  const ssrHit = await ssrCacheGet(ssrKey);
  if (ssrHit) return ssrHit;

  let ssrPath = pathname;
  const newPostSlug = pathname.match(/^\/(?:app\/)?newpost\/(\d+)\/?$/);
  const shortPostPath = pathname.match(/^\/posts\/(\d+)(?:\/b(?:\/[^/]+)?)?\/?$/);
  const barePostPath = pathname.match(/^\/post\/(\d+)\/?$/);
  const videoPath = pathname.match(/^\/(?:app\/)?video\/(\d+)\/?$/);
  // The bare /communities/<slug> twin has the same problem one level up: the
  // fn's own system-route list has no `communities` entry, so it read the
  // segment as a username, missed, and 404'd every share of that shape.
  const bareCommunity = pathname.match(/^\/communities\/([^/]+)\/?$/);
  if (newPostSlug) {
    const tokenId = await resolveNewPostTokenId(newPostSlug[1]);
    // Unresolvable slug: leave the path alone so the fn's miss lands on the
    // 404 below rather than a 200 carrying the homepage card.
    if (tokenId) ssrPath = `/app/post/${tokenId}`;
  } else if (shortPostPath) {
    ssrPath = `/app/post/${shortPostPath[1]}`;
  } else if (barePostPath) {
    ssrPath = `/app/post/${barePostPath[1]}`;
  } else if (videoPath) {
    ssrPath = `/app/post/${videoPath[1]}`;
  } else if (bareCommunity && bareCommunity[1] !== 'join') {
    ssrPath = `/app/communities/${bareCommunity[1]}`;
  } else if (/^\/%40[^/]+\/?$/i.test(pathname)) {
    // Browsers asking for /@user are sent to /%40user by the asset layer, so
    // that is the form that gets copied and shared. The fn only knows the
    // literal @, and looked up a user called "%40user": a 404 for crawlers on
    // a profile that exists. Same page as /@user, canonical at /user.
    ssrPath = `/@${pathname.slice(4).replace(/\/+$/, '')}`;
  }

  const ssrUrl = `${SUPABASE_FUNCTION_URL}?path=${encodeURIComponent(ssrPath)}&original_url=${encodeURIComponent(request.url)}`;


  try {
    const controller = new AbortController();
    // Increased from 8s → 12s: api.dehub.io is slow for new/uncached posts.
    // The 8s limit was causing timeouts → bots fell through to the React SPA
    // (generic OG image) → 2-3 hour re-scrape delay before seeing the real image.
    const timer = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(ssrUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': userAgent,
        'X-Is-Bot': isBot ? '1' : '0',
      },
    });

    clearTimeout(timer);

    if (!response.ok && response.status !== 404) {
      console.error(`[Edge] SSR returned ${response.status} for ${pathname}`);
      return entityUnavailable();
    }

    let html = await response.text();

    // The deployed Supabase fn still references the dead @DeHubApp X handle;
    // rewrite to the real account until the fn is redeployed. Scoped to meta
    // tags and profile URLs so user content quoting the old handle (or a
    // handle like @DeHubApp2) is never rewritten.
    html = html
      .replaceAll('content="@DeHubApp"', 'content="@dehub_official"')
      .replaceAll('x.com/DeHubApp', 'x.com/dehub_official')
      .replaceAll('twitter.com/DeHubApp', 'twitter.com/dehub_official');

    // Nonexistent entities must be real 404s. The deployed Supabase fn
    // answers 200 with a recognizable generic page for missing posts /
    // profiles / communities; without a 404 every random URL becomes an
    // indexable thin page (infinite soft-404 surface).
    // Scope the title-sniff to ENTITY routes only: static marketing routes
    // newer than the deployed fn's allowlist fall to its generic fallback,
    // whose title matches NOT_FOUND_TITLES — title-sniffing those 404'd live
    // pages (this is exactly what killed /guides/best-web3-social-media-dapps).
    // A future fn deploy can signal explicitly via X-DeHub-NotFound: 1.
    const isEntityRoute =
      ssrPath.includes('/post/') ||
      pathname.includes('newpost/') ||
      pathname.includes('/communities/') ||
      couldBeProfileSegment(firstSegmentOf(pathname), SYSTEM_ROUTES);
    const fnSaysNotFound =
      response.status === 404 || response.headers.get('X-DeHub-NotFound') === '1';
    // A 404 is only honored on ENTITY routes (posts / profiles / communities,
    // where a miss really is a missing entity). On static marketing routes a
    // fn 404 just means the deployed fn's allowlist is stale — passing it
    // through is what de-indexed /pricing. Serve the branded fallback instead.
    if (fnSaysNotFound && !isEntityRoute) {
      // noindex: the fallback body carries the generic homepage title, and a
      // 200 without it would mint exactly the homepage-duplicate cluster this
      // worker exists to prevent. Crawlers retry noindexed 200s, so the page
      // recovers as soon as the fn learns the route.
      return guard(new Response(buildFallbackHtml(pathname, request.url), {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
          'Vary': 'User-Agent',
          'X-Robots-Tag': 'noindex',
        },
      }));
    }
    const looksNotFound =
      isEntityRoute &&
      (fnSaysNotFound || NOT_FOUND_TITLES.some((t) => html.includes(t)));
    if (looksNotFound) {
      return guard(new Response(html, {
        status: 404,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, s-maxage=300',
          'Vary': 'User-Agent',
          'X-Robots-Tag': 'noindex',
        },
      }));
    }

    // The prerendered page's only control is a link to its own URL. For a
    // crawler that is harmless; for anything else it is a button that reloads
    // the page it is already on — the reported dead "View on DeHub". Point it
    // at the escape hatch, which forces the SPA for any user agent.
    html = html.replace(
      /<a href="(https:\/\/[^"]+)"([^>]*)>(View on DeHub)<\/a>/g,
      (m, href, attrs, label) => `<a class="dh-cta" href="${appHref(href)}" rel="nofollow">${label}</a>`,
    );

    if (!html.includes('og:locale')) {
      html = html.replace('</head>', `${ogLocaleTag()}</head>`);
    }

    // Canonical: SSR pages historically had none, letting ?param URLs and
    // /app-prefixed twins index as duplicates. Referral landings (/r/<code>)
    // get noindex ONLY — Google ignores cross-URL canonicals on noindexed
    // pages, so pairing the two just sends mixed signals.
    //
    // Everything else gets its URL set here rather than trusted from the fn.
    // For the homepage (and any other non-entity route) the fn builds
    // canonical, og:url and twitter:url from original_url — query and mirror
    // host included — so /?utm_source=x, /?fbclid=…, /?ref=… and /?hl=xx each
    // declared themselves the canonical homepage. Entity pages keep the fn's
    // canonical, which is deliberately a different shape from the request
    // (/posts/5 → /app/post/5, /@x → /x), minus any query it picked up.
    // localizePage below swaps in the ?hl= self-canonical only for a locale
    // the page is actually translated into.
    const isReferral = /^\/r\/[A-Za-z0-9]+/.test(pathname);
    const canonicalUrl = `${APP_URL}${canonicalizePath(pathname)}`;
    if (isReferral) {
      if (!html.includes('og:url')) {
        html = html.replace('</head>', `<meta property="og:url" content="${request.url}"></head>`);
      }
      html = html.replace(/<link rel="canonical"[^>]*>/gi, '');
    } else {
      let pageUrl = canonicalUrl;
      if (isEntityRoute) {
        const fnCanonical = (html.match(/<link\s+rel="canonical"\s+href="([^"]*)"/i) || [])[1];
        if (fnCanonical && fnCanonical.startsWith(`${APP_URL}/`)) pageUrl = fnCanonical.replace(/[?#].*$/, '');
      }
      html = setPageUrl(html, pageUrl);
    }

    // Profile titles from the deployed fn are CTA-first ("Join @x on DeHub
    // today!") — entity-led titles rank and read better in SERPs.
    html = html.replace(/Join @([A-Za-z0-9_.-]+) on DeHub today!/g, '@$1 on DeHub — posts, videos &amp; profile');

    // …and its titles/descriptions are raw post text and bios: unbounded and
    // full of newlines. Runs after the rewrite above so the profile title it
    // installs is measured, and before the card swap, which matches on
    // og:image only.
    html = normalizeProxiedMeta(html);

    // …and where the fn had no body or bio to describe the page with, it
    // fell back to one sentence per author; build a page-specific one (see
    // enrichPostMeta). The post branch costs one API read, only for a post
    // with no body.
    const proxiedPostId = (ssrPath.match(/^\/app\/post\/([^/?#]+)/) || [])[1];
    const proxiedSegments = cleanPath.split('/').filter(Boolean);
    const proxiedHandle =
      proxiedSegments.length === 1 && couldBeProfileSegment(firstSegmentOf(cleanPath), SYSTEM_ROUTES)
        ? ((html.match(/<link rel="canonical" href="https:\/\/dehub\.io\/([^"/?#]+)">/) || [])[1] || proxiedSegments[0])
        : '';
    let postShareRecord = null;
    if (proxiedPostId) {
      // Every post, not just a bodyless one: the title work in enrichPostMeta
      // has to reach the posts that DO have body text, because those are
      // exactly the ones still carrying whatever the phone named the file.
      // The record is fetched only where its postType and category list are
      // read — the description rewrite — so a post that needs nothing but a
      // title still costs no API call: the author comes off the page's own
      // JSON-LD and the format off the og:video sniff.
      // The record is read for every post now, not only a bodyless one: the
      // comments ride on it, and the comments are the page's content. A post
      // page was 66 words — the caption and the nav — with its whole
      // conversation left on the API. One bounded read, five-second cap, and
      // a miss costs the sections, not the page.
      const record = await fetchPostRecord(proxiedPostId);
      postShareRecord = record;
      html = enrichPostMeta(html, proxiedPostId, record);
      // The VideoObject is repaired first, while it is still its own node;
      // socialPostingLd then nests it under the post as it stands.
      html = enrichVideoPost(html, record);
      html = rewriteJsonLd(html, (ld) => socialPostingLd(ld, record));
      html = injectPostByline(html, record, (segment) => couldBeProfileSegment(segment, SYSTEM_ROUTES));
      const minter = String((record && record.minter) || '').toLowerCase();
      const byAuthor = minter ? await fetchFeedRows(`minter=${minter}`, 7) : [];
      const others = byAuthor.filter((r) => String(r.tokenId) !== String(proxiedPostId)).slice(0, 6);
      const who = String(
        (record && (record.minterDisplayName || record.displayName || record.mintername || record.username)) || '',
      ).replace(/\s+/g, ' ').trim();
      html = injectBeforeCta(
        html,
        postFactsHtml(record) +
          commentsHtml(record) +
          postListHtml(who ? `More from ${who}` : 'More from this creator', others, { author: false }),
      );
    } else if (proxiedHandle) {
      // The account record is the authority on the wallet and the post count;
      // the avatar URL is only a fallback for the wallet (a profile with no
      // avatar has none, and its posts were never listed).
      const account = await fetchAccountInfo(proxiedHandle);
      html = enrichProfileMeta(html, proxiedHandle, account && account.displayName);
      const address = String((account && account.address) || '').toLowerCase() || profileAddressOf(html);
      const rows = address ? await fetchFeedRowsOrNull(`minter=${address}`) : null;
      html = injectBeforeCta(html, postListHtml('Recent posts', rows || [], { author: false }));
      if (profileHasNoPosts(account, rows)) html = noindexPage(html);
    }

    // Communities: private ones are shareable by link but not for the index,
    // and test or empty ones are thin — the same gate as stores and events.
    // The fn's HTML says neither, so one row read decides. A failed read
    // leaves the page as it was.
    const communitySlug = (ssrPath.match(/^\/app\/communities\/([^/?#]+)/) || [])[1];
    if (communitySlug) {
      html = fixCommunityPossessive(html);
      let slug = communitySlug;
      try { slug = decodeURIComponent(slug); } catch { /* keep raw */ }
      const community = await supabaseRow(
        `communities?slug=eq.${encodeURIComponent(slug)}&select=name,description,avatar_url,banner_url,is_private&limit=1`,
      );
      if (
        community &&
        (community.is_private ||
          entityLooksThin({
            name: community.name,
            description: community.description,
            image: community.avatar_url || community.banner_url,
          }))
      ) {
        html = noindexPage(html);
      }
    }
    // Share images the fn points at that 403, carry no content type, or
    // redirect to the logo (see repairProxiedImages).
    if (isEntityRoute) {
      html = repairProxiedImages(html);
    }
    if (proxiedHandle) {
      html = profileBannerCard(html);
      html = logoCardDimensions(html);
    }
    // Structured data and cards on the rest of the fn's entity pages: a
    // profile as ProfilePage, a community as a page rather than a rival brand
    // Organization, and post/community images as true 1200x630 cards.
    const proxiedCommunity = !proxiedPostId && /^\/app\/communities\/[^/?#]+/.test(ssrPath);
    if (proxiedPostId) {
      html = applyTextPostImage(dropTwitterPlayer(cardProxiedImage(html)), postShareRecord);
    } else if (proxiedHandle) {
      html = rewriteJsonLd(html, (ld) => profilePageLd(ld, proxiedHandle));
    } else if (proxiedCommunity) {
      html = cardProxiedImage(rewriteJsonLd(html, communityPageLd));
    }


    // The deployed fn points og:image at the 200-square logo, and for its own
    // static routes at Legacy CDN paths (`/__l5e/assets-v1/...`) that nothing
    // has served since the Cloudflare migration — the SPA catch-all answers
    // those 200 text/html, so crawlers download the React shell where a PNG
    // should be. Swap in the route's card. Entity routes are left alone: a post
    // or profile resolves to its own media, which beats any generic card.
    if (!isEntityRoute) {
      const cardKey = pathname === '/' ? 'home' : canonicalizePath(pathname).replace(/^\/+/, '').toLowerCase();
      const card = shareImage(cardKey);
      if (card !== SHARE_IMAGE) {
        html = html
          .replace(/(<meta property="og:image(?::secure_url)?" content=")[^"]*(">)/g, `$1${card}$2`)
          .replace(/(<meta name="twitter:image" content=")[^"]*(">)/g, `$1${card}$2`)
          .replace(/(<meta property="og:image:width" content=")[^"]*(">)/g, '$11200$2')
          .replace(/(<meta property="og:image:height" content=")[^"]*(">)/g, '$1630$2')
          .replace(/(<meta property="og:image:type" content=")[^"]*(">)/g, '$1image/jpeg$2')
          .replace(/(<meta name="twitter:card" content=")[^"]*(">)/g, '$1summary_large_image$2');
        if (!html.includes('og:image:width')) {
          html = html.replace('</head>', '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"></head>');
        }
      }
    }

    // Footer nav in the deployed fn's HTML links /app/* twins of canonical
    // pages; route internal link equity straight to the canonical URLs. The
    // edge-rendered sections and marketing pages count too — /app/explore,
    // /app/stages and /app/stake all have a bare canonical twin.
    html = html.replace(/href="(?:https:\/\/dehub\.io)?\/app\/([a-z0-9-]+)"/g, (m, seg) =>
      SSR_STATIC_ROUTES.has(seg) || Object.hasOwn(SECTION_PAGES, seg) || Object.hasOwn(MARKETING_PAGES, seg)
        ? `href="${APP_URL}/${seg}"`
        : m);
    // Bare /guides is only a 301 to the blog index.
    html = html.replace(/href="(?:https:\/\/dehub\.io)?\/guides\/?"/g, `href="${APP_URL}/docs/blog"`);

    // Homepage for bots was a ~70-word shell with nav-only links, leaving
    // posts/profiles crawlable solely via sitemap. Inject the latest posts
    // as real links so crawlers get content and crawl paths.
    if (pathname === '/') {
      // Bot and browser titles must not diverge; align to the SPA title.
      html = html.replaceAll(HOME_TITLE_LEGACY, HOME_TITLE);
      // …and the description: the fn's is a different sentence from the one
      // in index.html, so the two variants disagreed on what DeHub is.
      html = html.replace(
        /(<meta (?:property|name)="(?:description|og:description|twitter:description)" content=")[^"]*(">)/g,
        (m, a, b) => `${a}${escFnAttr(HOME_DESCRIPTION)}${b}`,
      );
      // The fn's WebSite node carries the old sentence too.
      html = html.replace(
        /("@type":"WebSite"[^}]*?"description":")[^"]*(")/,
        (m, a, b) => `${a}${escJsonText(HOME_DESCRIPTION)}${b}`,
      );
      // Retired SearchAction off, square logo on (see homeJsonLd).
      html = rewriteJsonLd(html, homeJsonLd);
      // Search Console ownership. The tag lives in index.html, which only
      // browsers ever receive — every bot UA gets this rendered HTML instead,
      // and it had no tag at all. Verification survives today purely because
      // Google's checker announces itself as `Google-Site-Verification/1.0`,
      // which matches nothing in BOT_UA_PATTERN and so falls through to the
      // SPA shell. Anything that re-checks as Googlebot sees an unverified
      // site and access to the property goes away quietly — and URL Inspection
      // (Google-InspectionTool) already renders this HTML, so the tag is
      // missing from the one view used to debug indexing.
      if (!html.includes('google-site-verification')) {
        html = html.replace('</head>', `<meta name="google-site-verification" content="${GOOGLE_SITE_VERIFICATION}"></head>`);
      }
      // Entity repair on the deployed fn's Organization JSON-LD: its only
      // sameAs pointed at a dead account, so Google couldn't reconcile the
      // brand's real properties into one entity.
      if (html.includes('"sameAs"')) {
        html = html.replace(/"sameAs":\s*\[[^\]]*\]/, JSON.stringify({ sameAs: ORG_SAME_AS }).slice(1, -1));
      } else {
        html = html.replace('</head>', `<script type="application/ld+json">${jsonLdScript({ '@context': 'https://schema.org', ...ORG_JSONLD })}</script></head>`);
      }
      // What DeHub IS, in prose. Injected before the nav so it is the first
      // body content a crawler reads — this is the copy the "dehub" brand term
      // has to land on after dehub.net's 301, and it mirrors HomeIntro.tsx in
      // the SPA so the signed-out browser variant says the same thing.
      html = html.replace('</body>', `${HOME_INTRO_HTML}</body>`);
      // Primary section nav: the homepage bot HTML had no links to Explore /
      // Video Feed / Shorts / Music / TV, so crawlers only ever found profiles
      // and posts — which is why Google's sitelinks were random "@user" pages.
      // A consistent nav here makes these sections the strongest sitelink
      // candidates. Injected first so it sits above the blog link + post list.
      html = html.replace('</body>', `<section style="max-width:600px;margin:24px auto;text-align:left">${primaryNavHtml('/')}</section></body>`);
      // Blog was linked from nowhere in bot HTML — give crawlers a path in.
      html = html.replace('</body>', `<p style="max-width:600px;margin:16px auto"><a href="${APP_URL}/docs/blog">DeHub Blog — news, guides &amp; product updates</a></p></body>`);
      try {
        const feedRes = await fetch(
          'https://api.dehub.io/api/feed?page=1&limit=10&sortBy=createdAt&sortOrder=desc&status=minted',
          { signal: AbortSignal.timeout(5000) }
        );
        if (feedRes.ok) {
          const feed = await feedRes.json();
          const items = (feed.result || []).filter((p) => p && p.tokenId && p.name).slice(0, 10);
          if (items.length) {
            const links = items.map((p) => {
              const t = escHtml(String(p.name).slice(0, 90));
              const authorName = escHtml(p.minterDisplayName || p.mintername || p.minterUsername || '');
              // Dotted handles other than `.eth` can't be SSR'd (the
              // static-asset skip excludes them) — linking one creates a crawl
              // path that dead-ends at the SPA shell. This field carries a
              // username, which cannot contain a dot at all, so in practice it
              // only ever drops junk; the check tracks couldBeProfileSegment so
              // the two cannot drift into disagreeing.
              const authorUserRaw = String(p.minterUsername || p.mintername || '').replace(/[^A-Za-z0-9_.-]/g, '');
              const authorUser = couldBeProfileSegment(authorUserRaw.toLowerCase(), SYSTEM_ROUTES) ? authorUserRaw : '';
              return `<li style="margin:6px 0"><a href="${APP_URL}/app/post/${p.tokenId}">${t}</a>${authorUser ? ` by <a href="${APP_URL}/${authorUser}">${authorName}</a>` : ''}</li>`;
            }).join('');
            html = html.replace('</body>', `<section style="max-width:600px;margin:24px auto;text-align:left"><h2 style="font-size:16px">Latest on DeHub</h2><ul style="list-style:none;padding:0">${links}</ul></section></body>`);
          }
        }
      } catch (e) {
        console.error('[Edge] latest-posts inject skipped:', e);
      }
    }

    // The localised homepage when ?hl= names one, otherwise the English page
    // carrying its hreflang cluster (see localizePage). The homepage ships 110
    // UI locales and had no cluster at all, so every one of them was a
    // duplicate of the English page rather than a variant of it. A referral
    // landing is noindex and gets no cluster — annotating a page we ask Google
    // to ignore just spends the annotation.
    if (pathname === '/' && !isReferral) {
      const table = await seoI18nTable(env, request.url);
      const localeRedirect = unservedLocaleRedirect(url, '/', table, false);
      if (localeRedirect) return redirect301(localeRedirect);
      html = localizePage(html, '/', requestedLocale(url), table);
    }

    const rendered = await guard(new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': isBot
          ? 'public, s-maxage=300, stale-while-revalidate=600'
          : 'no-store',
        'Vary': 'User-Agent',
        'X-Powered-By': 'DeHub-Edge-SEO',
        ...(isReferral ? { 'X-Robots-Tag': 'noindex' } : {}),
      },
    }));
    if (isBot && rendered.status === 200) ssrCachePut(ctx, ssrKey, rendered);
    return rendered;
  } catch (e) {
    if (e.name === 'AbortError') {
      console.error(`[Edge] SSR timeout for ${pathname}`);
    } else {
      console.error('[Edge] Error:', e);
    }
    // On timeout/error, previewers get a minimal branded OG page so they don't
    // cache the generic React SPA index.html (which causes the 2-3 hr
    // re-scrape delay). Search engines get a 503 and come back: the stand-in
    // carries a generic title, and at 200 it was indexable at the entity URL.
    return entityUnavailable();
  }
}

export default {
  fetch: handleRequest,
};
