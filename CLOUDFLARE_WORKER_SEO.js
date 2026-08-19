/**
 * Cloudflare Worker for DeHub Dynamic SEO/SSR
 *
 * CANONICAL implementation (the Netlify edge-function original was retired
 * with the July 2026 Cloudflare migration). Static assets come from the
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
import { MILESTONE_REDIRECTS } from './src/lib/blog-redirects.js';

const SUPABASE_FN_BASE = 'https://aigxuutjaqsywioxjefr.supabase.co/functions/v1';
const SUPABASE_FUNCTION_URL = `${SUPABASE_FN_BASE}/ssr-seo`;
const DEHUB_LOGO = 'https://aigxuutjaqsywioxjefr.supabase.co/storage/v1/object/public/logo//new_logo_Dehub.jpg';
const APP_URL = 'https://dehub.io';
const BLOG_SHARE_IMAGE_BASE = 'https://aigxuutjaqsywioxjefr.supabase.co/functions/v1/blog-share-image';
// Share card for every edge-rendered page. DEHUB_LOGO is a 200-square, so
// `summary_large_image` cards rendered it as a thumbnail rather than a banner;
// this is the 1200x630 the format actually wants. Served from public/ (and so
// from the ASSETS binding) on purpose — the previous per-route cards pointed at
// Lovable CDN paths (`/__l5e/assets-v1/...`) that nothing serves since the
// Cloudflare migration, and the SPA catch-all answered them 200 text/html, so
// crawlers downloaded the React shell where a PNG should be and drew no image.
const SHARE_IMAGE = `${APP_URL}/og/dehub-social-share.png`;


// Per-route share cards, rendered from the banner kit into public/og/ and
// served by the ASSETS binding. Key = the canonical route path without its
// leading slash; 'home' and 'fallback' are the two pages with no route of
// their own. Before this, every /docs page, every product page and the blog
// index shared one card, so a feed full of DeHub links showed one repeated
// image. Anything absent here still falls back to SHARE_IMAGE, so adding a
// route without its card is safe.
const OG_CARD_ROUTES = new Set([
  'home', 'fallback', 'blog', 'docs',
  'docs/overview', 'docs/dapps', 'docs/games', 'docs/token/overview',
  'docs/token/economics', 'docs/token/stake', 'docs/token/utility', 'docs/token/where-to-buy',
  'docs/token/governance', 'docs/token/bridge', 'docs/roadmap', 'docs/faq',
  'docs/team', 'docs/contact', 'docs/privacy', 'docs/terms',
  'docs/terms-of-service', 'docs/advertising', 'docs/security', 'docs/featured-in',
  'docs/brand-assets', 'docs/brand-guidelines', 'docs/donate', 'explore',
  'videos', 'shorts', 'guides/best-decentralized-social-media', 'guides/best-web3-social-media-dapps',
  'connect', 'connect/chatgpt', 'connect/claude', 'communities',
  'stages', 'guide', 'features', 'pricing', 'depin',
  'creator', 'editor', 'prompt', 'work',
  'affiliate', 'premium', 'governance', 'leaderboard',
  'top-100', 'music', 'tv',
  'glossary', 'bridge', 'agents', 'assistant',
  'creators', 'jobs', 'apk',
  'arcade', 'arcade/kings-gambit', 'arcade/claude-of-duty', 'arcade/jungle-trail',
  'arcade/street-slayer',
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
  'https://www.coingecko.com/en/coins/dehub',
  'https://coinmarketcap.com/currencies/dehub/',
];
const ORG_JSONLD = {
  '@type': 'Organization',
  name: 'DeHub',
  url: APP_URL,
  logo: DEHUB_LOGO,
  description: 'DeHub is the open source, user-owned and censorship-resistant social platform for Web3 creators and communities.',
  sameAs: ORG_SAME_AS,
};
// Browser SPA <title> in index.html — bot HTML must carry the same string so
// the two variants never diverge (cloaking-suspicion surface).
const HOME_TITLE = 'DeHub — Open Source, User Owned Social Media';
const HOME_TITLE_LEGACY = 'DeHub — Open Source, User Owned & Censorship Resistant Media';

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
  ['/guides/what-is-watch-to-earn', 'What is watch-to-earn?'],
  ['/guides/tokenized-subscriptions-explained', 'Tokenised subscriptions'],
  ['/guides/web3-live-streaming-decentralised-twitch-alternative', 'Web3 live streaming'],
  ['/guides/decentralised-social-media-explained-uk', 'Decentralised social media'],
  ['/docs/token/overview', 'The DHB currency'],
  ['/guides/what-is-dehub', 'What is DeHub?'],
];

// Story slides — mirror SLIDES in src/components/app/HomeIntro.tsx, which in
// turn mirror the mobile app's screens/auth/OnboardingScreen.tsx. All three are
// always mounted in the SPA (stacked and cross-faded, never conditionally
// rendered), so all three belong here too.
const HOME_INTRO_SLIDES = [
  ['The Social Media We All Deserve', 'Instantly monetize, never get deplatformed, keep up to 99% of revenue and create free from censorship or platform manipulation.'],
  ['The App For Everyone', 'No algorithms that favor one side of the argument. Everyone is amplified equally and fairly with open source code.'],
  ['You Will Own Everything, And Be Happy', 'The ownership economy means your data, assets and audience are yours forever. Even the DeHub network is owned by its users, you.'],
];

const HOME_INTRO_HTML = `<section style="max-width:600px;margin:24px auto;text-align:left">
<h2 style="font-size:16px">Welcome to DeHub — the open-source, user-owned social platform</h2>
${HOME_INTRO_SLIDES.map(([h, p]) => `<h3 style="font-size:14px">${h}</h3>\n<p>${p}</p>`).join('\n')}
<p>DeHub is a decentralised social network and mobile app, in development since 2021, where every post is minted on-chain and creators keep their audience, their content and their revenue. It combines a chronological feed, live streaming, end-to-end encrypted messaging, user-run communities, a multi-chain wallet and watch-to-earn rewards paid in DHB. If you arrived looking for a different DeHub, this is not DePaul University&rsquo;s student portal, Rowan&rsquo;s DEHub or the deHUB Access door-entry app.</p>
<p><a href="${APP_URL}/guide" style="color:#9f9">Take the tour</a></p>
<nav aria-label="Learn more about DeHub"><ul style="list-style:none;padding:0;margin:0">${
  HOME_INTRO_LINKS.map(([href, label]) =>
    `<li style="margin:6px 0"><a href="${APP_URL}${href}" style="color:#9f9">${label}</a></li>`
  ).join('')
}</ul></nav>
</section>`;

// Standalone hand-built React guide pages under /guides/ that are NOT manifest
// blog posts. Served meta directly at the edge — the deployed Supabase fn's
// STATIC_ROUTES allowlist is stale and 404s the newer one.
const GUIDE_PAGES = {
  // Titles/descriptions mirror the React pages' own SEOHead strings — the two
  // UA variants must never diverge, and body claims must not exceed what the
  // human-visible page actually states.
  'best-decentralized-social-media': {
    title: 'Best Decentralized Social Media 2026 — DeHub Guide',
    description: 'Comparison guide of the best decentralized and Web3 social media platforms in 2026. DeHub, Mastodon, Bluesky, Farcaster and Lens — features, monetization, ownership and who each is for.',
    bodyHtml: `<p>Decentralized social media replaces the platform-owned model — where one company controls your account, reach and monetization — with protocols where users own their content and audience. This guide compares the leading options in 2026: <strong>DeHub, Mastodon, Bluesky, Farcaster and Lens Protocol</strong>, across ownership, censorship resistance, monetization and ease of use.</p>
<h2>The short version</h2>
<ul>
<li><strong>Mastodon</strong> — federated (ActivityPub) microblogging. Strong communities, no crypto; your account still lives on an instance an admin controls, and there's no native creator monetization.</li>
<li><strong>Bluesky</strong> — the AT Protocol successor to Twitter's decentralization effort. Familiar feel and portable identity, but content isn't on-chain and monetization is early.</li>
<li><strong>Farcaster</strong> — on-chain identity with off-chain content ("hubs"). Great crypto-native community; primarily text, and most activity flows through one client.</li>
<li><strong>Lens Protocol</strong> — social graph as on-chain primitives on Lens Chain. Powerful for developers building social apps; less a destination app for creators.</li>
<li><strong>DeHub</strong> — a full media platform (video, live streaming, posts, messaging) where uploads are minted on-chain and creators monetize natively via tips, pay-per-view, token-gated content, staking rewards and a 20% affiliate program, with an integrated AI creator studio.</li>
</ul>
<h2>How to choose</h2>
<p>If you want a federated Twitter alternative, Mastodon or Bluesky fit. If you're building on a social graph, look at Lens or Farcaster. If you're a <strong>creator who wants YouTube/Twitch-style features with on-chain ownership and built-in monetization</strong>, that's the gap DeHub is built to fill.</p>
<p><a href="${APP_URL}/guides/best-decentralized-social-media">Read the full interactive comparison</a> or <a href="${APP_URL}/">try DeHub free</a>.</p>`,
  },
  'best-web3-social-media-dapps': {
    title: 'Best Web3 Social Media Dapps in 2026 — DeHub Guide',
    description: 'Curated comparison of the best Web3 social media dapps in 2026 — DeHub, Farcaster, Lens, Friend.tech and Hive. Scored on monetization, censorship resistance and UX.',
    bodyHtml: `<p>Web3 social dApps put content, identity and payments on-chain so creators — not platforms — own the upside. This guide ranks the leading Web3 social media dApps of 2026 by creator monetization, content ownership, user experience and momentum.</p>
<h2>What separates the leaders</h2>
<ul>
<li><strong>Real on-chain ownership</strong> — content minted to the creator's wallet, not just an on-chain username.</li>
<li><strong>Native monetization</strong> — pay-per-view, token-gated posts, subscriptions and tips that settle on-chain without a payment processor.</li>
<li><strong>Web2-grade UX</strong> — social/email sign-in, sponsored gas, no seed-phrase wall in front of the first post.</li>
<li><strong>Media depth</strong> — long-form video, live streaming and audio, not just microblogging.</li>
</ul>
<p><strong>DeHub</strong> scores across all four: uploads mint on-chain across Base and BNB Chain, creators monetize natively through tips, pay-per-view and token-gated posts, and sign-up works with plain email or socials. The full guide compares DeHub with <strong>Farcaster, Lens, Friend.tech and Hive</strong> on monetization, censorship resistance and UX.</p>
<p><a href="${APP_URL}/guides/best-web3-social-media-dapps">Read the full ranked comparison</a> or <a href="${APP_URL}/">explore DeHub</a>.</p>`,
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
  'token/overview': { title: 'DHB Currency Overview — DeHub Docs', description: 'How the $DHB currency works in-app: tipping, unlocking content, rewards, AI generation credits, profit share and the $0.001 in-app peg.' },
  'token/economics': { title: 'DHB Token Economics — DeHub Docs', description: '$DHB tokenomics: the 8 billion supply, how it is distributed, and the fully-diluted-from-TGE model with no emissions.' },
  'token/stake': { title: 'Staking DHB — DeHub Docs', description: 'How DHB staking works: rewards, mechanics and what staking unlocks across DeHub.' },
  'roadmap': { title: 'DeHub Roadmap — DeHub Docs', description: "Where DeHub is headed: shipped milestones and what's next across the app, token and games." },
  'faq': { title: 'DeHub FAQ — Frequently Asked Questions', description: 'Answers to the most common questions about DeHub, the DHB token, staking, governance and the platform.' },
  'team': { title: 'DeHub Team — DeHub Docs', description: 'The founders and team behind DeHub: backgrounds across social media, gaming, entertainment and Web3.' },
  'contact': { title: 'Contact DeHub — DeHub Docs', description: 'How to reach the DeHub team: support, partnerships, press and community channels.' },
  'privacy': { title: 'Privacy Policy — DeHub', description: "DeHub's privacy policy: what data the platform handles and how." },
  'terms': { title: 'Legal Disclaimer & Terms — DeHub', description: "DeHub's legal disclaimer and terms of use." },
  'advertising': { title: 'Advertising on DeHub — POVR Ad Tech', description: "DeHub's proof-of-view-and-rank (POVR) ad tech: on-chain verified audiences and revenue sharing for creators and holders." },
  'security': { title: 'Security at DeHub — DeHub Docs', description: "The Certik audit of DeHub's smart contracts and how to report vulnerabilities to the team." },
  // These ten are in sitemap-static.xml but had no entry here, so bots got the
  // raw SPA shell — the homepage title/description with no canonical. Ten of
  // the twenty-eight docs URLs we submit were presenting to Google as homepage
  // duplicates, which is what poisoned the /docs cluster. No docs-content JSON
  // exists for them yet (public/dehub-docs-content.txt is gone), so they fall
  // back to the description-only body in buildDocsHtml — thin, but correctly
  // titled, described and self-canonical, which a homepage clone never was.
  'token/utility': { title: 'DHB Token Utility & Holder Benefits — DeHub Docs', description: 'What holding $DHB unlocks: governance rights, staking rewards, moderation power and marketplace perks across DeHub.' },
  'token/where-to-buy': { title: 'Where to Buy DHB — DeHub Docs', description: 'Where to buy the $DHB token: Uniswap on Base, PancakeSwap on BNB Chain, listed CEX venues and direct in-app purchase.' },
  'token/governance': { title: 'DeHub Governance — Voting & Proposals', description: 'How DeHub governance works: proposals, burn-to-vote mechanics, whale prevention and how holders steer the platform.' },
  'token/bridge': { title: 'Bridge DHB Between BASE & BNB — DeHub Docs', description: 'How to move $DHB between the BASE and BNB networks with the manual DeHub bridge, and what to expect while it processes.' },
  'featured-in': { title: 'DeHub in the Press — Featured In', description: 'Press and media coverage of DeHub, including US Weekly, Yahoo Finance, Entrepreneur and Investing.com.' },
  'brand-assets': { title: 'DeHub Brand Assets — Logos & Downloads', description: 'Official DeHub brand assets: logos, icons, graphics and marketing materials available to download.' },
  'brand-guidelines': { title: 'DeHub Brand Guidelines', description: 'How to use the DeHub brand: identity, logo usage, colour and design standards.' },
  'donate': { title: 'Donate to DeHub', description: 'Support DeHub development through community donations and contributions.' },
  'terms-of-service': { title: 'Terms of Service — DeHub', description: "DeHub's terms of service: the agreement, user responsibilities and platform rules." },
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

function buildDocsHtml(route, meta, contentHtml) {
  const canonicalUrl = `${APP_URL}/docs/${route}`;
  const body = contentHtml || `<p>${escHtml(meta.description)}</p><p><a href="${canonicalUrl}">Open this page in the DeHub docs</a>.</p>`;
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
<meta property="og:url" content="${canonicalUrl}">
<meta property="og:title" content="${escHtml(meta.title)}">
<meta property="og:description" content="${escHtml(meta.description)}">
${shareMetaTags(`docs/${route}`, meta.title)}
<meta name="twitter:site" content="@dehub_official">
<script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org', '@type': 'TechArticle',
  headline: meta.title, description: meta.description,
  publisher: ORG_JSONLD, mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
})}</script>
</head>
<body style="background:#000;color:#eee;font-family:sans-serif;max-width:720px;margin:0 auto;padding:24px;line-height:1.6">
<p><a href="${APP_URL}/" style="color:#9f9">DeHub</a> › <a href="${APP_URL}/docs" style="color:#9f9">Docs</a></p>
<article><h1>${escHtml(meta.title.replace(/ — DeHub( Docs)?$/, ''))}</h1>
${body}</article>
<nav aria-label="DeHub documentation"><h2>More documentation</h2><ul>${nav}</ul></nav>
<p><a href="${APP_URL}/docs/blog" style="color:#9f9">DeHub Blog</a> · <a href="${APP_URL}/" style="color:#9f9">dehub.io home</a></p>
</body>
</html>`;
}

function buildDocsIndexHtml() {
  const canonicalUrl = `${APP_URL}/docs`;
  const items = Object.entries(DOCS_PAGES).map(([r, m]) =>
    `<li style="margin:10px 0"><a href="${APP_URL}/docs/${r}" style="color:#9f9">${escHtml(m.title.replace(/ — DeHub( Docs)?$/, ''))}</a><br><small>${escHtml(m.description)}</small></li>`).join('');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>DeHub Documentation — Guides, Token, dApps &amp; FAQ</title>
<meta name="description" content="Official DeHub documentation: platform overview, dApps, DHB token economics, staking, games, roadmap, FAQ and more.">
<link rel="canonical" href="${canonicalUrl}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="DeHub">
<meta property="og:url" content="${canonicalUrl}">
<meta property="og:title" content="DeHub Documentation">
${shareMetaTags('docs', 'DeHub Documentation')}
<meta name="twitter:site" content="@dehub_official">
</head>
<body style="background:#000;color:#eee;font-family:sans-serif;max-width:720px;margin:0 auto;padding:24px;line-height:1.6">
<p><a href="${APP_URL}/" style="color:#9f9">DeHub</a> › Docs</p>
<h1>DeHub Documentation</h1>
<ul style="list-style:none;padding:0">${items}</ul>
<p><a href="${APP_URL}/docs/blog" style="color:#9f9">DeHub Blog</a> · <a href="${APP_URL}/" style="color:#9f9">dehub.io home</a></p>
</body>
</html>`;
}

function escHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function absolutize(url) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `${APP_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}

function buildBlogShareImage(post) {
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
        datePublished: published,
        dateModified: modified,
        author: { '@type': 'Person', name: post.author || 'DeHub Team' },
        publisher: ORG_JSONLD,
        mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'DeHub', item: `${APP_URL}/` },
          { '@type': 'ListItem', position: 2, name: 'Blog', item: `${APP_URL}/docs/blog` },
          { '@type': 'ListItem', position: 3, name: post.title, item: canonicalUrl },
        ],
      },
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
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body style="background:#000;color:#eee;font-family:sans-serif;max-width:720px;margin:0 auto;padding:24px;line-height:1.6">
<p><a href="${APP_URL}/" style="color:#9f9">DeHub</a> › <a href="${APP_URL}/docs/blog" style="color:#9f9">Blog</a></p>
<article>
<h1>${escHtml(post.title)}</h1>
<p><em>By ${escHtml(post.author || 'DeHub Team')}${published ? ` — ${escHtml(published.slice(0, 10))}` : ''}</em></p>
${banner ? `<img src="${escHtml(banner)}" alt="${escHtml(post.bannerImageAlt || post.title)}" style="max-width:100%">` : ''}
${body}
</article>
${manifest ? relatedPostsHtml(manifest, post.slug) : ''}
<p><a href="${APP_URL}/docs/blog" style="color:#9f9">← All DeHub blog posts</a> · <a href="${APP_URL}/" style="color:#9f9">dehub.io home</a></p>
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
    `<li style="margin:14px 0"><a href="${APP_URL}/guides/${slug}" style="color:#9f9">${escHtml(m.title)}</a><br><small>${escHtml(m.description.slice(0, 200))}</small></li>`).join('');
  const items = guideItems + posts.map((p) => {
    const date = (p.publishedAt || '').slice(0, 10);
    return `<li style="margin:14px 0"><a href="${APP_URL}/guides/${encodeURIComponent(p.slug)}" style="color:#9f9">${escHtml(p.title)}</a>${date ? ` <small>(${date})</small>` : ''}<br><small>${escHtml((p.excerpt || '').slice(0, 200))}</small></li>`;
  }).join('');
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'DeHub Blog',
    description: 'News, product updates and Web3 guides from DeHub — the open source, user-owned social platform.',
    url: canonicalUrl,
    publisher: ORG_JSONLD,
  };
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>DeHub Blog — News, Guides &amp; Product Updates</title>
<meta name="description" content="News, product updates and Web3 guides from DeHub — the open source, user-owned social platform. ${posts.length} posts and counting.">
<link rel="canonical" href="${canonicalUrl}">
<link rel="alternate" type="application/rss+xml" title="DeHub Blog RSS Feed" href="${APP_URL}/rss.xml">
<meta property="og:type" content="website">
<meta property="og:site_name" content="DeHub">
<meta property="og:url" content="${canonicalUrl}">
<meta property="og:title" content="DeHub Blog — News, Guides &amp; Product Updates">
${shareMetaTags('blog', 'DeHub Blog — news, guides and product updates')}
<meta name="twitter:site" content="@dehub_official">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body style="background:#000;color:#eee;font-family:sans-serif;max-width:720px;margin:0 auto;padding:24px;line-height:1.6">
<p><a href="${APP_URL}/" style="color:#9f9">DeHub</a> › Blog</p>
<h1>DeHub Blog</h1>
<ul style="list-style:none;padding:0">${items}</ul>
<p><a href="${APP_URL}/" style="color:#9f9">dehub.io home</a></p>
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
      : `<li style="margin:6px 0"><a href="${APP_URL}${n.path}" style="color:#9f9">${escHtml(n.label)}</a></li>`
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
    intro: 'Find trending creators, videos, shorts, music and communities across DeHub — the open source, user-owned social platform where every post is minted on-chain and creators earn natively.',
    bodyHtml: `<ul>
<li><a href="${APP_URL}/videos" style="color:#9f9">Video Feed</a> — the latest on-chain videos from creators.</li>
<li><a href="${APP_URL}/shorts" style="color:#9f9">Shorts</a> — a vertical, swipeable short-form feed.</li>
<li><a href="${APP_URL}/music" style="color:#9f9">Music</a> — tracks and audio from DeHub artists.</li>
<li><a href="${APP_URL}/tv" style="color:#9f9">DeHub TV</a> — lean-back, continuous video.</li>
</ul>`,
  },
  videos: {
    title: 'Video Feed — Watch On-Chain Videos on DeHub',
    heading: 'DeHub Video Feed',
    description: 'Watch the latest on-chain videos from creators on DeHub: long-form uploads with pay-per-view, token-gated content and ad-revenue sharing on the user-owned video platform.',
    intro: 'Watch the newest videos from DeHub creators — long-form uploads minted on-chain, with pay-per-view, token-gated posts and ad-revenue sharing built in. No platform owns your reach; you do.',
    bodyHtml: `<p>DeHub’s video feed is chronological and creator-owned. Sign in with email or a social account, get a sponsored-gas wallet automatically, and start watching or uploading in minutes.</p>`,
  },
  shorts: {
    title: 'Shorts — Short-Form Videos on DeHub',
    heading: 'DeHub Shorts',
    description: 'Scroll the latest short-form videos on DeHub: a vertical, swipeable shorts feed on the open-source, user-owned social platform where creators own their content.',
    intro: 'Scroll a vertical feed of short-form videos from DeHub creators — quick, swipeable clips on the user-owned social platform. Every short is minted on-chain, so creators keep ownership and earn natively.',
    bodyHtml: `<p>Shorts sit alongside the full <a href="${APP_URL}/videos" style="color:#9f9">video feed</a> and <a href="${APP_URL}/music" style="color:#9f9">music</a> on DeHub — one open, censorship-resistant home for every format.</p>`,
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
<meta property="og:url" content="${canonicalUrl}">
<meta property="og:title" content="${escHtml(meta.title)}">
<meta property="og:description" content="${escHtml(meta.description)}">
${shareMetaTags(key, meta.title)}
<meta name="twitter:site" content="@dehub_official">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body style="background:#000;color:#eee;font-family:sans-serif;max-width:720px;margin:0 auto;padding:24px;line-height:1.6">
<p><a href="${APP_URL}/" style="color:#9f9">DeHub</a> › ${escHtml(meta.heading)}</p>
<h1>${escHtml(meta.heading)}</h1>
<p>${escHtml(meta.intro)}</p>
${meta.bodyHtml || ''}
${primaryNavHtml(`/${key}`)}
<p style="margin-top:24px"><a href="${canonicalUrl}" style="color:#9f9">Open ${escHtml(meta.heading)} on DeHub</a></p>
</body>
</html>`;
}

// Newer public marketing routes, rendered entirely at the edge. The deployed
// Supabase fn's STATIC_ROUTES predates them, so proxying answered 404 — and the
// worker passed that through, hard-404ing real pages (/connect, /pricing,
// /communities, /stages, /guide) to every crawler while humans saw the React
// page. Titles and descriptions mirror each page's SPA SEOHead strings exactly
// so the two UA variants never diverge.
const MARKETING_PAGES = {
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
<p>Verified contribution may receive a share of a platform-revenue-funded pool after an epoch closes. There is no fixed rate, minimum return, APY or guaranteed reward, and contribution records are not a promise of payment. Running a node creates electricity, bandwidth and hardware costs that may exceed any reward. Any future DHB settlement would occur on Base and remain subject to eligibility, network rules and applicable law.</p>
<p>The node client is not available yet. DePin will launch in controlled phases, beginning with delivery and adaptive video infrastructure.</p>`,
  },
  'connect': {
    title: 'Connect DeHub to your AI assistant',
    description: 'Connect ChatGPT, Claude, or any MCP-compatible assistant to DeHub with a single URL.',
    heading: 'Connect DeHub to your AI assistant',
    bodyHtml: `<p>DeHub ships a Model Context Protocol (MCP) server, so any MCP-compatible AI assistant can browse public DeHub posts, search topics and look up creator profiles.</p>
<ul>
<li><a href="${APP_URL}/connect/chatgpt" style="color:#9f9">DeHub for ChatGPT</a> — add the connector to ChatGPT in one click.</li>
<li><a href="${APP_URL}/connect/claude" style="color:#9f9">DeHub for Claude</a> — add the connector to Claude in one click.</li>
<li><a href="${APP_URL}/skill.md" style="color:#9f9">skill.md</a> — the agent-readable spec for the DeHub MCP API.</li>
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
<p>Looking for the DeHub Extra social membership instead? <a href="${APP_URL}/premium" style="color:#9f9">See Premium</a>.</p>`,
  },
  'communities': {
    title: 'Communities — Find Your People on DeHub',
    description: 'Discover DeHub communities: join public groups, follow the topics you care about and build your own community on the decentralized, user-owned social platform.',
    heading: 'DeHub Communities',
    bodyHtml: `<p>Communities are public groups on DeHub — join the ones that match your interests, follow their feeds, or create your own and grow it with posts, events and stages.</p>
<p><a href="${APP_URL}/communities" style="color:#9f9">Browse communities on DeHub</a>.</p>`,
  },
  'stages': {
    title: 'Stages — Live Audio Rooms on DeHub',
    description: 'Join live audio Stages, listen back to recorded conversations, and go live with your own room on DeHub — the decentralized, open source social platform.',
    heading: 'DeHub Stages',
    bodyHtml: `<p>Stages are live audio rooms on DeHub: join a conversation as a listener, come up on stage to speak, or host your own room. Finished stages stay available as recordings.</p>
<p><a href="${APP_URL}/stages" style="color:#9f9">See live and recorded Stages</a>.</p>`,
  },
  // The Arcade. Titles and descriptions mirror the SPA's SEOHead strings so
  // the bot and human variants never diverge, and each game gets its own page
  // rather than being folded into the grid: they are separately linkable, they
  // are what somebody actually searches for, and one shared page for all of
  // them would be a soft duplicate of every one.
  'arcade': {
    title: 'Arcade | DeHub',
    description: 'Play games in your browser on DeHub — cinematic 3D chess, a procedurally generated shooter, a rainforest walk and a neon-street brawler. No install, no download.',
    heading: 'DeHub Arcade',
    bodyHtml: `<p>Games that run in the browser tab. Nothing to install, nothing to buy — three of them open source, one made for DeHub, and all four served from DeHub itself.</p>
<ul>
<li><a href="${APP_URL}/arcade/kings-gambit" style="color:#9f9">King's Gambit</a> — cinematic 3D chess with three rigged civilisations, four battlegrounds and three engine strengths.</li>
<li><a href="${APP_URL}/arcade/claude-of-duty" style="color:#9f9">Claude of Duty</a> — a first-person shooter that generates every mesh, texture and sound on your machine as it loads.</li>
<li><a href="${APP_URL}/arcade/jungle-trail" style="color:#9f9">Jungle Trail</a> — a walk through a procedurally generated rainforest, with no score and no timer.</li>
<li><a href="${APP_URL}/arcade/street-slayer" style="color:#9f9">Street Slayer</a> — a side-scrolling beat 'em up down a neon-lit street, built for DeHub rather than found.</li>
</ul>`,
  },
  'arcade/kings-gambit': {
    title: "King's Gambit | DeHub Arcade",
    description: "Play King's Gambit on DeHub — cinematic 3D chess where three rigged civilisations march, strike and fall across a marble board. Free, in your browser, no install.",
    heading: "King's Gambit — Cinematic 3D Chess",
    bodyHtml: `<p>Chess with an army behind every piece. Three rigged civilisations — the Ivory Kingdom, the Sun Empire and the Grande Armée — march, strike and fall across a marble board in four battlegrounds.</p>
<p>Full rules including castling, en passant and promotion; three engine strengths; a two-player hotseat; and an AI vs AI mode you can just sit and watch.</p>
<p><a href="${APP_URL}/arcade/kings-gambit" style="color:#9f9">Play King's Gambit</a> or <a href="${APP_URL}/arcade" style="color:#9f9">see the whole arcade</a>.</p>`,
  },
  'arcade/claude-of-duty': {
    title: 'Claude of Duty | DeHub Arcade',
    description: 'Play Claude of Duty on DeHub — a browser first-person shooter that ships no art at all and generates every mesh, texture and sound on your machine. Free, no install.',
    heading: 'Claude of Duty — A Browser FPS With No Assets',
    bodyHtml: `<p>A first-person shooter that ships no art at all: every mesh, texture and sound is generated in JavaScript on your machine while the level loads.</p>
<p>It is also hidden inside the War theme, where an arrow key offers to deploy you.</p>
<p><a href="${APP_URL}/arcade/claude-of-duty" style="color:#9f9">Play Claude of Duty</a> or <a href="${APP_URL}/arcade" style="color:#9f9">see the whole arcade</a>.</p>`,
  },
  'arcade/jungle-trail': {
    title: 'Jungle Trail | DeHub Arcade',
    description: 'Walk Jungle Trail on DeHub — a first-person walk through a procedurally generated rainforest with weather and a day cycle. No score, no timer, no install.',
    heading: 'Jungle Trail — A Procedural Rainforest Walk',
    bodyHtml: `<p>A first-person walk through a procedurally generated rainforest — a hundred thousand plants, weather and a day cycle, all grown on your machine before the first frame. No score, no timer, nothing to beat.</p>
<p>It is also hidden inside the Jungle theme, where the background you are already looking at pushes forward and becomes the game.</p>
<p><a href="${APP_URL}/arcade/jungle-trail" style="color:#9f9">Walk the trail</a> or <a href="${APP_URL}/arcade" style="color:#9f9">see the whole arcade</a>.</p>`,
  },
  'arcade/street-slayer': {
    title: 'Street Slayer | DeHub Arcade',
    description: "Play Street Slayer on DeHub — a side-scrolling beat 'em up down a neon-lit street, with three fighters and a boss. Free, in your browser, no install.",
    heading: "Street Slayer — A Neon-Street Beat 'Em Up",
    bodyHtml: `<p>A side-scrolling beat 'em up down a neon-lit street: pick one of three fighters — Mike, Indi or Lerone — then punch, kick and throw your way through everything the block sends at you.</p>
<p>The only game in the arcade that was not found: it was commissioned for DeHub and built by Studio Shook Pixel, so it exists nowhere else. Arrows or WASD to move, Z to jump, four attack keys, and a full set of on-screen controls on a touchscreen.</p>
<p><a href="${APP_URL}/arcade/street-slayer" style="color:#9f9">Play Street Slayer</a> or <a href="${APP_URL}/arcade" style="color:#9f9">see the whole arcade</a>.</p>`,
  },
  'guide': {
    title: 'DeHub Guide — Visual Walkthrough of the App',
    description: 'A visual walkthrough of DeHub: feeds, messaging, wallet, staking, governance and more. See every screen and learn how the decentralized social platform works.',
    heading: 'DeHub Guide',
    bodyHtml: `<p>A screen-by-screen walkthrough of the DeHub app: the home feed, video and shorts, messaging, the wallet, staking, governance and the creator tools.</p>
<p><a href="${APP_URL}/guide" style="color:#9f9">Open the full visual guide</a> or start with the <a href="${APP_URL}/docs" style="color:#9f9">documentation</a>.</p>`,
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
    jsonLdType: 'SoftwareApplication',
    jsonLdExtra: {
      alternateName: 'DeHub APK',
      downloadUrl: 'https://github.com/DeHubToken/dehub-mobile/releases/latest/download/dehub.apk',
      installUrl: `${APP_URL}/apk`,
      softwareVersion: '1.14.0',
      fileSize: '205 MB',
      applicationCategory: 'SocialNetworkingApplication',
      operatingSystem: 'Android 8.0 and up',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    },
    bodyHtml: `<p>Skip the stores and get the latest version of DeHub right here — straight from us, no store account and no waiting on a review queue.</p>
<p><a href="https://github.com/DeHubToken/dehub-mobile/releases/latest/download/dehub.apk" style="color:#9f9">Download the DeHub APK</a> — Android 8 and up. Allow installs from your browser when Android asks.</p>
<p>Prefer the store? DeHub is also <a href="https://play.google.com/store/apps/details?id=io.dehub.mobile" style="color:#9f9">on Google Play</a>.</p>`,
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
    title: 'DeHub Creator Studio — AI Image, Video & Music',
    description: 'Generate images, videos, songs and branded posters with the DeHub Creator Studio. One workspace for every AI tool a modern creator needs.',
    heading: 'DeHub Creator Studio',
    bodyHtml: `<p>The Creator Studio bundles image, video, music, voice and poster generation behind a single credit balance. Pick a model, describe what you want, and publish the result straight to the decentralized feed.</p>
<ul>
<li>Image generation with FLUX, Ideogram, Recraft and Nano Banana models.</li>
<li>Video generation with Kling, Luma, Runway, Pika, Minimax and ByteDance.</li>
<li>Song generation with Suno, plus voice cloning and text-to-speech with ElevenLabs.</li>
<li>Branded poster templates built on the DeHub design system.</li>
</ul>
<p>See <a href="${APP_URL}/pricing" style="color:#9f9">Creator Studio pricing</a> for plans and monthly credits.</p>`,
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
    description: 'Browse open bounties on DeHub: social media tasks, clipping bounties and fixed-price contracts. Claim a bounty as a hunter and get paid in DHB or USDC.',
    heading: 'DeHub Work — Bounties',
    bodyHtml: `<p>DeHub Work is an on-chain marketplace for creator jobs. Post a bounty with a budget and criteria, receive submissions from creators worldwide, then release payment through the DeHubWork escrow contract on Base. Disputes are handled by community moderators.</p>
<ul>
<li><strong>Clipping</strong> — pay per verified view for short clips of streams or long-form video.</li>
<li><strong>Social tasks</strong> — pay for high-quality engagement across posts.</li>
<li><strong>Fixed-price contracts</strong> — hire creators for logos, video, translation and community work.</li>
</ul>`,
  },
  'affiliate': {
    title: 'DeHub Affiliate — Earn 20% Revenue Share',
    description: 'Refer creators to DeHub and earn 20% of the revenue they generate, plus 5% from second-tier invites. Transparent on-chain payouts.',
    heading: 'DeHub Affiliate Program',
    bodyHtml: `<p>Every DeHub user gets a personal referral link. When someone signs up through it and spends on Creator Studio credits, premium subscriptions or ads, you earn <strong>20% of that revenue</strong> for the lifetime of the account. Second-tier invites earn another <strong>5%</strong>. Payouts are made in DHB and are visible on-chain.</p>`,
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
<p>DeHub Extra is billed monthly and unlocks across the whole network — social, video, music and TV. For Creator Studio plans instead, see <a href="${APP_URL}/pricing" style="color:#9f9">pricing</a>.</p>`,
  },
  'governance': {
    title: 'Governance — Vote on Community Proposals',
    description: "Participate in decentralized governance on DeHub. Submit proposals, vote with your staking badge weight, and shape the platform's future.",
    heading: 'DeHub Governance',
    bodyHtml: `<p>DHB holders shape the DeHub roadmap. Any staker can open a proposal — new features, moderation rules, treasury spend or partnerships — and the community votes with staked DHB weight. Results are tallied on-chain and executed by the core team on approved proposals.</p>`,
  },
  'leaderboard': {
    title: 'Leaderboard — Top Creators & Earners',
    description: "See who's leading on DeHub. Track top holders, biggest tippers, most followed creators, and trending accounts across all time periods.",
    heading: 'DeHub Leaderboard',
    bodyHtml: `<p>The leaderboard ranks DeHub's biggest creators, tippers and DHB stakers across BNB Chain and Base. Snapshots are taken daily, and the top ranks unlock silhouette badges, profile overlays and larger platform rewards.</p>`,
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
    bodyHtml: `<p>DeHub Music hosts songs from independent Web3 artists — stream them free, tip in DHB, or collect a token-gated release. Build playlists, watch music videos, or tune into a 24/7 community radio station. Every play, tip and follow is recorded on-chain.</p>`,
  },
  'tv': {
    title: 'Live TV — Free Channels From Around the World',
    description: 'Watch free live TV channels from around the world on DeHub. News, sports, entertainment and more — streamed in the browser, no subscription needed.',
    heading: 'DeHub TV',
    bodyHtml: `<p>DeHub TV streams free live channels from around the world — news, sports and entertainment — alongside creator streams and curated shows. Picture-in-picture keeps playback going while you scroll, and you can tip in DHB straight from the player.</p>`,
  },
  'glossary': {
    title: 'Glossary — Icons, Features & Web3 Terms',
    description: "Learn what every icon, button and feature means on DeHub. A complete guide to the platform's UI, Web3 terms, staking badges and more.",
    heading: 'DeHub Glossary',
    bodyHtml: `<p>Plain-English definitions for everything you meet on DeHub — every icon and button in the interface, plus the Web3 vocabulary behind them: wallets, gas, staking badges, bridges, escrow, on-chain tipping and the DHB token. Written for creators, not engineers.</p>`,
  },
  'bridge': {
    title: 'Bridge — Transfer DHB Cross-Chain',
    description: 'Bridge your DHB tokens between Base and BNB Chain seamlessly on DeHub. Fast, secure cross-chain transfers with live transaction tracking.',
    heading: 'DeHub Bridge',
    bodyHtml: `<p>The DeHub Bridge moves DHB between BNB Chain and Base from inside the platform wallet, with live transaction tracking. Balances round down to two decimals to match on-chain settlement, and every transfer is verified before your balance updates.</p>`,
  },
  'agents': {
    title: 'AI Agents — Build & Manage Bots',
    description: 'Create and manage AI-powered agents on DeHub. Automate posting, engage with your audience, and integrate with the DeHub API.',
    heading: 'DeHub Agents',
    bodyHtml: `<p>DeHub Agents are configurable AI assistants that post on a schedule, reply to comments, moderate your community, curate feeds and report on growth. Start from a pre-built agent or build your own against the DeHub MCP server and API.</p>
<p>See <a href="${APP_URL}/connect" style="color:#9f9">Connect</a> to wire DeHub into ChatGPT or Claude.</p>`,
  },
  'assistant': {
    title: 'AI Assistant — Chat, Generate Images & Video',
    description: "Chat with DeHub's AI assistant. Generate images, create videos, get web search results, and explore AI capabilities — all in one place.",
    heading: 'DeHub Assistant',
    bodyHtml: `<p>The DeHub Assistant is a chat interface into the whole Creator Studio. Ask it to draft a post, generate an image or video, translate captions, search the web or explain how the DHB token works — then publish the result without leaving the conversation.</p>`,
  },
  'creators': {
    title: 'Become a Creator',
    description: 'Apply to become a creator on DeHub — the open source, censorship resistant media platform.',
    heading: 'Become a DeHub Creator',
    bodyHtml: `<p>Apply for a creator account on DeHub and unlock uploads, monetization and the Creator Studio. Creators earn through pay-per-view, token-gated posts, tradable subscriptions, tips and ad-revenue sharing — all settled on-chain.</p>`,
  },
  'jobs': {
    title: 'Careers — Join the DeHub Team',
    description: 'Join the team building the future of decentralized media. Explore open positions at DeHub and help shape Web3 social.',
    heading: 'Careers at DeHub',
    bodyHtml: `<p>DeHub is a small, distributed team building a decentralized creator network. Open roles span engineering, design, growth, community and moderation. If you care about Web3 and creator tools, we want to hear from you.</p>
<p>Looking for paid work rather than a role? See <a href="${APP_URL}/work" style="color:#9f9">DeHub bounties</a>.</p>`,
  },
};

function buildMarketingHtml(key, meta) {
  const canonicalUrl = `${APP_URL}/${key}`;
  // A page whose subject is a *thing* rather than a document can name its own
  // schema type (`meta.jsonLdType` + `jsonLdExtra`); everything else stays a
  // plain WebPage. Must mirror the type the SPA writes for the same route, or
  // the two UA variants describe the same URL as two different entities.
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
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escHtml(meta.title)}</title>
<meta name="description" content="${escHtml(meta.description)}">
<link rel="canonical" href="${canonicalUrl}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="DeHub">
<meta property="og:url" content="${canonicalUrl}">
<meta property="og:title" content="${escHtml(meta.title)}">
<meta property="og:description" content="${escHtml(meta.description)}">
${shareMetaTags(key, meta.title)}
<meta name="twitter:site" content="@dehub_official">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body style="background:#000;color:#eee;font-family:sans-serif;max-width:720px;margin:0 auto;padding:24px;line-height:1.6">
<p><a href="${APP_URL}/" style="color:#9f9">DeHub</a> › ${escHtml(meta.heading)}</p>
<h1>${escHtml(meta.heading)}</h1>
${meta.bodyHtml || `<p>${escHtml(meta.description)}</p>`}
${primaryNavHtml()}
<p style="margin-top:24px"><a href="${canonicalUrl}" style="color:#9f9">Open ${escHtml(meta.heading)} on DeHub</a></p>
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
 * No width/height hints here, unlike shareMetaTags: those are only correct for
 * the 1200x630 cards in public/og, and a store banner or a photo of a jacket is
 * whatever shape the seller uploaded. Claiming 1200x630 for a square photo gets
 * it letterboxed or cropped by the scraper.
 */
function entityImageMetaTags(imageUrl, alt) {
  if (!imageUrl) return shareMetaTags('fallback', alt);
  const img = escHtml(imageUrl);
  return `<meta property="og:image" content="${img}">
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
<meta property="og:url" content="${escHtml(canonicalUrl)}">
<meta property="og:title" content="${escHtml(title)}">
<meta property="og:description" content="${escHtml(description)}">
${entityImageMetaTags(image, title)}
<meta name="twitter:site" content="@dehub_official">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body style="background:#000;color:#eee;font-family:sans-serif;max-width:720px;margin:0 auto;padding:24px;line-height:1.6">
<p>${breadcrumb}</p>
<h1>${escHtml(heading)}</h1>
${image ? `<img src="${escHtml(image)}" alt="${escHtml(heading)}" style="max-width:100%">` : ''}
${bodyHtml}
<p style="margin-top:24px"><a href="${escHtml(canonicalUrl)}" style="color:#9f9">Open on DeHub</a></p>
</body>
</html>`;
}

function truncate(text, max) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function buildStoreHtml(store) {
  const canonicalUrl = `${APP_URL}/app/stores/${store.id}`;
  const name = store.name || 'Store';
  const title = `${name} — DeHub Stores`;
  const description = truncate(
    store.description || `Shop ${name} on DeHub. Peer-to-peer commerce paid in DHB or USDC.`,
    200,
  );
  const image = absolutize(store.banner_url || store.avatar_url);
  return entityHtml({
    canonicalUrl,
    title,
    description,
    image,
    ogType: 'profile',
    heading: name,
    breadcrumb: `<a href="${APP_URL}" style="color:#9f9">DeHub</a> › <a href="${APP_URL}/app/stores" style="color:#9f9">Stores</a>`,
    bodyHtml: `<p>${escHtml(description)}</p>`,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Store',
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
  const canonicalUrl = `${APP_URL}/app/stores/${storeId}?listing=${listing.id}`;
  const name = listing.title || 'Item';
  const storeName = (listing.stores && listing.stores.name) || 'a DeHub store';
  const price = Number(listing.price) || 0;
  const currency = (listing.currency || 'USD').toUpperCase();
  const title = `${name} — ${storeName} on DeHub`;
  const description = truncate(
    listing.description || `${name} from ${storeName}, on DeHub. Paid in DHB or USDC.`,
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
    noindex: listing.status !== 'active',
    heading: name,
    breadcrumb: `<a href="${APP_URL}" style="color:#9f9">DeHub</a> › <a href="${APP_URL}/app/stores/${escHtml(storeId)}" style="color:#9f9">${escHtml(storeName)}</a>`,
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
    noindex: !!event.is_private,
    heading: name,
    breadcrumb: `<a href="${APP_URL}" style="color:#9f9">DeHub</a> › <a href="${APP_URL}/app/events" style="color:#9f9">Events</a>`,
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
      ...(event.location ? { location: { '@type': 'Place', name: event.location } } : {}),
      organizer: ORG_JSONLD,
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
    breadcrumb: `<a href="${APP_URL}" style="color:#9f9">DeHub</a> › <a href="${APP_URL}/stages" style="color:#9f9">Stages</a>`,
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

function buildGuidePageHtml(slug, meta) {
  const canonicalUrl = `${APP_URL}/guides/${slug}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escHtml(meta.title)}</title>
<meta name="description" content="${escHtml(meta.description)}">
<link rel="canonical" href="${canonicalUrl}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="DeHub">
<meta property="og:url" content="${canonicalUrl}">
<meta property="og:title" content="${escHtml(meta.title)}">
<meta property="og:description" content="${escHtml(meta.description)}">
${shareMetaTags(`guides/${slug}`, meta.title)}
<meta name="twitter:site" content="@dehub_official">
<script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org', '@type': 'Article',
  headline: meta.title, description: meta.description,
  publisher: ORG_JSONLD, mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
})}</script>
</head>
<body style="background:#000;color:#eee;font-family:sans-serif;max-width:720px;margin:0 auto;padding:24px;line-height:1.6">
<p><a href="${APP_URL}/" style="color:#9f9">DeHub</a> › <a href="${APP_URL}/docs/blog" style="color:#9f9">Blog</a></p>
<article><h1>${escHtml(meta.title)}</h1>
${meta.bodyHtml || `<p>${escHtml(meta.description)}</p>`}</article>
<p><a href="${APP_URL}/docs/blog" style="color:#9f9">← All DeHub blog posts</a> · <a href="${APP_URL}/" style="color:#9f9">dehub.io home</a></p>
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
  <meta property="og:type" content="website">
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
<body style="background:#000;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
  <p><a href="${url}" style="color:#0f0">${title}</a></p>
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
const BOT_UA_PATTERN = /bot|crawl|spider|facebook|twitter|linkedin|whatsapp|telegram|slack|discord|facebot|oggrabber|google-inspectiontool|googleother|apis-google|feedfetcher|curl|wget|python-requests|python-urllib|axios|node-fetch|got |okhttp|go-http-client|java\/|libwww-perl|ruby|postmanruntime|insomnia|httpie/i;

// Static marketing/app routes that need per-route OG meta (bots only).
// Kept in sync with the STATIC_ROUTES map inside supabase/functions/ssr-seo.
const SSR_STATIC_ROUTES = new Set([
  'features', 'pricing', 'depin', 'creator', 'editor', 'prompt', 'work',
  'affiliate', 'premium', 'governance', 'leaderboard', 'top-100',
  'music', 'radio', 'tv', 'glossary', 'bridge', 'agents',
  'assistant', 'creators', 'jobs',
  // Listed for canonicalizePath, not for the Supabase fn: /app/arcade is a
  // real SPA route and without this it self-canonicalizes, indexing as a
  // duplicate of /arcade. The page itself is rendered from MARKETING_PAGES,
  // which is checked before the fn is ever consulted (same as 'features').
  'arcade',
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
    if (first && !SYSTEM_ROUTES.has(first) && !first.includes('.')) {
      return `/${parts[0]}`;
    }
  }
  return p;
}

/** Exact <title> strings the deployed Supabase fn emits when an entity
 *  lookup comes back empty. Serving them as 200 minted an indexable thin
 *  page for every random URL; they must be 404s. */
const NOT_FOUND_TITLES = [
  '<title>Post by someone on DeHub</title>',
  '<title>DeHub — Open Source, User Owned & Censorship Resistant Media</title>',
];

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
  if (/^\/app\/stores\/[^/]+/.test(pathname)) return true;
  if (/^\/app\/events\/\d+/.test(pathname)) return true;
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
  // Always SSR for profile pages (top-level non-system routes)
  const first = pathname.replace(/^\//, '').split('/')[0].toLowerCase().replace('@', '');
  if (first && !SYSTEM_ROUTES.has(first) && !first.includes('.')) return true;
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

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Mirror hosts (*.netlify.app previews etc.) serve identical content and
  // must not index as duplicates of dehub.io.
  const isCanonicalHost = url.hostname === 'dehub.io';
  const guard = (resp) => {
    if (!isCanonicalHost) resp.headers.set('X-Robots-Tag', 'noindex');
    return resp;
  };
  // Response.redirect() headers are immutable — build redirects by hand so
  // guard() can still stamp mirror hosts.
  const redirect301 = (to) => guard(new Response(null, { status: 301, headers: { Location: to } }));

  // Alias hosts → apex, path + query preserved; wrangler.jsonc routes bind
  // these hosts to this worker so the 301 is served at the edge with no
  // origin behind it. Covers www.dehub.io and every dehub.net host — the
  // dehub.net zone moved into this Cloudflare account when its Netlify DNS
  // died (July 2026), and these are the SEO domain-move redirects.
  const aliasHost = url.hostname;
  if (aliasHost === 'www.dehub.io' || aliasHost === 'dehub.net' || aliasHost.endsWith('.dehub.net')) {
    // Plain 301 WITHOUT guard(): X-Robots-Tag noindex is for mirror hosts
    // serving duplicate content, not for domain-move redirects — mixing
    // noindex with an equity-passing 301 risks suppressing the transfer.
    let target = `${url.pathname}${url.search}`;
    if (aliasHost !== 'www.dehub.io') {
      // Legacy dehub.net URL spaces with no dehub.io equivalent (/web/app/*,
      // /learn — pre-Angular site chrome still in Google's index). Path-
      // preserving 301s landed these on the SPA's not-found screen (soft-404),
      // burning the redirect's equity. Map them to real destinations; every
      // other path (e.g. /guides/*) keeps the path-preserving redirect.
      const p = url.pathname.replace(/\/+$/, '') || '/';
      const legacy = p.match(/^\/web(?:\/app)?(\/.*)?$/);
      const rest = legacy ? (legacy[1] || '/') : p;
      if (legacy || rest === '/learn' || rest.startsWith('/learn/')) {
        target = rest === '/learn' || rest.startsWith('/learn/') ? '/docs' : '/';
      }
    }
    return new Response(null, { status: 301, headers: { Location: `https://dehub.io${target}` } });
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
  }

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
  };
  const spaTarget = SPA_REDIRECTS[trimmedPath.toLowerCase()];
  if (spaTarget) return redirect301(`${APP_URL}${spaTarget}`);

  // /radio is `<Navigate to="/music" replace />` in the SPA, but crawlers were
  // handed a standalone "DeHub Radio" page by the Supabase fn — a URL that only
  // exists for bots, describing a page no human can land on. Match the router.
  if (trimmedPath.toLowerCase() === '/radio') return redirect301(`${APP_URL}/music`);

  const appTwin = trimmedPath.match(/^\/app\/(guides|docs\/blog)((?:\/.*)?)$/);
  if (appTwin) return redirect301(`${APP_URL}/${appTwin[1]}${appTwin[2] || ''}`);
  const guardNext = async () => {
    const resp = await env.ASSETS.fetch(request);
    if (!isCanonicalHost) {
      const r = new Response(resp.body, resp);
      r.headers.set('X-Robots-Tag', 'noindex');
      return r;
    }
    return resp;
  };

  // Sitemaps must be proxied HERE, not via redirect rules: a `/*` catch-all in
  // public/_redirects (which Lovable regenerates) is processed before every
  // netlify.toml rule and served these paths as SPA HTML — Google then read the
  // sitemap as an HTML page. Edge functions run before all redirect processing,
  // so this proxy cannot be shadowed. (/sitemap-static.xml is a real file in
  // public/ and intentionally falls through.)
  const sitemapMatch = pathname.match(/^\/sitemap(?:-(posts|profiles)-(\d+))?\.xml$/);
  if (sitemapMatch) {
    const [, kind, page] = sitemapMatch;
    const target = kind
      ? `${SUPABASE_FN_BASE}/sitemap-${kind}?page=${page}`
      : `${SUPABASE_FN_BASE}/sitemap-index`;
    try {
      const res = await fetch(target);
      if (res.ok) {
        return new Response(await res.text(), {
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

  // Skip static assets immediately
  if (pathname.startsWith('/_') ||
      (pathname.includes('.') && !pathname.includes('/post/'))) {
    return guardNext();
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
    const resp = await guardNext();
    const r = new Response(resp.body, resp);
    r.headers.set('X-Robots-Tag', 'noindex, follow');
    return r;
  }

  const userAgent = request.headers.get('User-Agent') || '';
  const isBot = BOT_UA_PATTERN.test(userAgent);

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
      return guard(new Response(buildGuidePageHtml(slug, GUIDE_PAGES[slug]), { status: 200, headers: blogHeaders }));
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
    return guard(new Response(buildDocsIndexHtml(), { status: 200, headers: blogHeaders }));
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
      const resp = await guardNext();
      const r = new Response(resp.body, resp);
      r.headers.set('X-Robots-Tag', 'noindex, follow');
      return r;
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
    return guard(new Response(buildSectionHtml(sectionKey, SECTION_PAGES[sectionKey]), {
      status: 200,
      headers: blogHeaders,
    }));
  }

  // Edge-rendered marketing pages — never proxied to the Supabase fn (its
  // STATIC_ROUTES allowlist predates these routes and 404s them).
  if (Object.hasOwn(MARKETING_PAGES, sectionKey)) {
    return guard(new Response(buildMarketingHtml(sectionKey, MARKETING_PAGES[sectionKey]), {
      status: 200,
      headers: blogHeaders,
    }));
  }

  // Stores and shop items. `?listing=<id>` is the item; the bare path is the
  // store. Read straight from PostgREST rather than through the ssr-seo
  // function, which has never been redeployed and does not know these routes.
  const storeMatch = cleanPath.match(/^\/app\/stores\/([0-9a-fA-F-]{8,})$/);
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
    const store = await supabaseRow(
      `stores?id=eq.${encodeURIComponent(storeMatch[1])}&select=id,name,description,banner_url,avatar_url&limit=1`,
    );
    if (store) {
      return guard(new Response(buildStoreHtml(store), { status: 200, headers: blogHeaders }));
    }
    // Row missing or Supabase unreachable: fall through to the generic stub
    // rather than 404, because we cannot tell those two apart from here.
    return guard(new Response(buildFallbackHtml(pathname, request.url), {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        'Vary': 'User-Agent',
      },
    }));
  }

  const eventMatch = cleanPath.match(/^\/app\/events\/(\d+)$/);
  if (eventMatch) {
    const event = await supabaseRow(
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
    return guard(new Response(buildFallbackHtml(pathname, request.url), {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        'Vary': 'User-Agent',
      },
    }));
  }

  // Stage invite links: /stages/<n> is the short share form
  // (audio_spaces.short_id), /stage/<uuid> the original. Same PostgREST path
  // as stores and events — anon-readable row, publishable key. The share image
  // is the stage cover, else the host's profile picture, so every stage link
  // unfurls with its own art rather than the generic card.
  const stageShortMatch = cleanPath.match(/^\/stages\/(\d+)$/);
  const stageIdMatch = cleanPath.match(/^\/stage\/([0-9a-fA-F-]{16,})$/);
  if (stageShortMatch || stageIdMatch) {
    const stage = await supabaseRow(
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
    return guard(new Response(buildFallbackHtml(pathname, request.url), {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        'Vary': 'User-Agent',
      },
    }));
  }

  const ssrUrl = `${SUPABASE_FUNCTION_URL}?path=${encodeURIComponent(pathname)}&original_url=${encodeURIComponent(request.url)}`;


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
      return guard(new Response(buildFallbackHtml(pathname, request.url), {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
          'Vary': 'User-Agent',
        },
      }));
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
    const firstSeg = pathname.replace(/^\//, '').split('/')[0].toLowerCase().replace('@', '');
    const isEntityRoute =
      pathname.includes('/post/') ||
      pathname.includes('/communities/') ||
      (firstSeg && !SYSTEM_ROUTES.has(firstSeg) && !firstSeg.includes('.'));
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

    if (!html.includes('og:url')) {
      html = html.replace('</head>', `<meta property="og:url" content="${request.url}"></head>`);
    }

    // Canonical: SSR pages historically had none, letting ?param URLs and
    // /app-prefixed twins index as duplicates. Referral landings (/r/<code>)
    // get noindex ONLY — Google ignores cross-URL canonicals on noindexed
    // pages, so pairing the two just sends mixed signals.
    const isReferral = /^\/r\/[A-Za-z0-9]+/.test(pathname);
    const canonicalUrl = `${APP_URL}${canonicalizePath(pathname)}`;
    if (isReferral) {
      html = html.replace(/<link rel="canonical"[^>]*>/gi, '');
    } else if (!html.includes('rel="canonical"')) {
      html = html.replace('</head>', `<link rel="canonical" href="${canonicalUrl}"></head>`);
    }

    // Profile titles from the deployed fn are CTA-first ("Join @x on DeHub
    // today!") — entity-led titles rank and read better in SERPs.
    html = html.replace(/Join @([A-Za-z0-9_.-]+) on DeHub today!/g, '@$1 on DeHub — posts, videos &amp; profile');


    // The deployed fn points og:image at the 200-square logo, and for its own
    // static routes at Lovable CDN paths (`/__l5e/assets-v1/...`) that nothing
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
    // pages; route internal link equity straight to the canonical URLs.
    html = html.replace(/href="(?:https:\/\/dehub\.io)?\/app\/([a-z0-9-]+)"/g, (m, seg) =>
      SSR_STATIC_ROUTES.has(seg) ? `href="${APP_URL}/${seg}"` : m);

    // Homepage for bots was a ~70-word shell with nav-only links, leaving
    // posts/profiles crawlable solely via sitemap. Inject the latest posts
    // as real links so crawlers get content and crawl paths.
    if (pathname === '/') {
      // Bot and browser titles must not diverge; align to the SPA title.
      html = html.replaceAll(HOME_TITLE_LEGACY, HOME_TITLE);
      // Entity repair on the deployed fn's Organization JSON-LD: its only
      // sameAs pointed at a dead account, so Google couldn't reconcile the
      // brand's real properties into one entity.
      if (html.includes('"sameAs"')) {
        html = html.replace(/"sameAs":\s*\[[^\]]*\]/, JSON.stringify({ sameAs: ORG_SAME_AS }).slice(1, -1));
      } else {
        html = html.replace('</head>', `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', ...ORG_JSONLD })}</script></head>`);
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
      html = html.replace('</body>', `<p style="max-width:600px;margin:16px auto"><a href="${APP_URL}/docs/blog" style="color:#9f9">DeHub Blog — news, guides &amp; product updates</a></p></body>`);
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
              // Dotted usernames can't be SSR'd (the static-asset skip and the
              // profile matcher both exclude paths containing '.') — linking
              // them creates crawl paths that dead-end at the SPA shell.
              const authorUserRaw = String(p.minterUsername || p.mintername || '').replace(/[^A-Za-z0-9_.-]/g, '');
              const authorUser = authorUserRaw.includes('.') ? '' : authorUserRaw;
              return `<li style="margin:6px 0"><a href="${APP_URL}/app/post/${p.tokenId}" style="color:#9f9">${t}</a>${authorUser ? ` by <a href="${APP_URL}/${authorUser}" style="color:#aaa">${authorName}</a>` : ''}</li>`;
            }).join('');
            html = html.replace('</body>', `<section style="max-width:600px;margin:24px auto;text-align:left"><h2 style="font-size:16px">Latest on DeHub</h2><ul style="list-style:none;padding:0">${links}</ul></section></body>`);
          }
        }
      } catch (e) {
        console.error('[Edge] latest-posts inject skipped:', e);
      }
    }

    return guard(new Response(html, {
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
  } catch (e) {
    if (e.name === 'AbortError') {
      console.error(`[Edge] SSR timeout for ${pathname}`);
    } else {
      console.error('[Edge] Error:', e);
    }
    // On timeout/error, serve a minimal branded OG page so bots don't cache
    // the generic React SPA index.html (which causes the 2-3 hr re-scrape delay).
    return guard(new Response(buildFallbackHtml(pathname, request.url), {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        // Short cache on fallback so bots re-scrape soon and get the real image
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        'Vary': 'User-Agent',
      },
    }));
  }
}

export default {
  fetch: handleRequest,
};
