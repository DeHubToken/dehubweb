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

const SUPABASE_FN_BASE = 'https://aigxuutjaqsywioxjefr.supabase.co/functions/v1';
const SUPABASE_FUNCTION_URL = `${SUPABASE_FN_BASE}/ssr-seo`;
const DEHUB_LOGO = 'https://aigxuutjaqsywioxjefr.supabase.co/storage/v1/object/public/logo//new_logo_Dehub.jpg';
const APP_URL = 'https://dehub.io';
const BLOG_SHARE_IMAGE_BASE = 'https://aigxuutjaqsywioxjefr.supabase.co/functions/v1/blog-share-image';

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

// Standalone hand-built React guide pages under /guides/ that are NOT manifest
// blog posts. Served meta directly at the edge — the deployed Supabase fn's
// STATIC_ROUTES allowlist is stale and 404s the newer one.
const GUIDE_PAGES = {
  'best-decentralized-social-media': {
    title: 'Best Decentralized Social Media Platforms (2026) — DeHub',
    description: 'Compare the best decentralized social media platforms: ownership, censorship resistance, monetization and how DeHub stacks up against Farcaster, Lens and Bluesky.',
    bodyHtml: `<p>Decentralized social media replaces the platform-owned model — where one company controls your account, reach and monetization — with protocols where users own their content and audience. This guide compares the leading options in 2026: <strong>DeHub, Mastodon, Bluesky, Farcaster and Lens Protocol</strong>, across ownership, censorship resistance, monetization and ease of use.</p>
<h2>The short version</h2>
<ul>
<li><strong>Mastodon</strong> — federated (ActivityPub) microblogging. Strong communities, no crypto; your account still lives on an instance an admin controls, and there's no native creator monetization.</li>
<li><strong>Bluesky</strong> — the AT Protocol successor to Twitter's decentralization effort. Familiar feel and portable identity, but content isn't on-chain and monetization is early.</li>
<li><strong>Farcaster</strong> — on-chain identity with off-chain content ("hubs"). Great crypto-native community; primarily text, and most activity flows through one client.</li>
<li><strong>Lens Protocol</strong> — social graph as on-chain primitives on Lens Chain. Powerful for developers building social apps; less a destination app for creators.</li>
<li><strong>DeHub</strong> — a full media platform (video, live streaming, posts, messaging) where every upload is minted on-chain, feeds are chronological, gas is sponsored for social-login users, and creators monetize natively via pay-per-view, token-gated content, tradable subscriptions and ad-revenue sharing.</li>
</ul>
<h2>How to choose</h2>
<p>If you want a federated Twitter alternative, Mastodon or Bluesky fit. If you're building on a social graph, look at Lens or Farcaster. If you're a <strong>creator who wants YouTube/Twitch-style features with on-chain ownership and built-in monetization</strong>, that's the gap DeHub is built to fill.</p>
<p><a href="${APP_URL}/guides/best-decentralized-social-media">Read the full interactive comparison</a> or <a href="${APP_URL}/">try DeHub free</a>.</p>`,
  },
  'best-web3-social-media-dapps': {
    title: 'Best Web3 Social Media dApps (2026) — DeHub',
    description: 'The best Web3 social media dApps ranked: creator monetization, on-chain content ownership, and where DeHub fits among the top decentralized apps.',
    bodyHtml: `<p>Web3 social dApps put content, identity and payments on-chain so creators — not platforms — own the upside. This guide ranks the leading Web3 social media dApps of 2026 by creator monetization, content ownership, user experience and momentum.</p>
<h2>What separates the leaders</h2>
<ul>
<li><strong>Real on-chain ownership</strong> — content minted to the creator's wallet, not just an on-chain username.</li>
<li><strong>Native monetization</strong> — pay-per-view, token-gated posts, subscriptions and tips that settle on-chain without a payment processor.</li>
<li><strong>Web2-grade UX</strong> — social/email sign-in, sponsored gas, no seed-phrase wall in front of the first post.</li>
<li><strong>Media depth</strong> — long-form video, live streaming and audio, not just microblogging.</li>
</ul>
<p><strong>DeHub</strong> scores across all four: uploads mint on-chain, subscriptions are tradable assets with resale royalties (live on Base, BNB Chain and Polygon), streaming runs on decentralized infrastructure that has scaled past 50,000 concurrent viewers, and ad revenue is shared with the ecosystem instead of kept by the house — while sign-up works with plain email or socials.</p>
<p><a href="${APP_URL}/guides/best-web3-social-media-dapps">Read the full ranked comparison</a> or <a href="${APP_URL}/">explore DeHub</a>.</p>`,
  },
};

// Docs pages: per-route meta + (where extracted) full text from
// public/docs-content/<route>.json, generated at build from
// dehub-docs-content.txt. Bots used to get the raw SPA shell (homepage meta,
// no canonical) for the entire /docs section.
const DOCS_PAGES = {
  'overview': { title: 'DeHub Docs — Overview', description: 'What DeHub is and how the user-owned, censorship-resistant media platform works: on-chain content, DePIN infrastructure, sponsored gas and creator monetization.' },
  'dapps': { title: "DeHub dApps — The Complete Ecosystem", description: "DeHub's decentralized apps: streaming, feed, messaging, staking, marketplace and games — how they fit together in one user-owned ecosystem." },
  'games': { title: 'DeHub Games — Play & Win On-Chain', description: "DeHub's gaming arm: the arcade, provably fair mechanics and Last Chad Standing, the fighter battle royale with licensed fighters." },
  'token/overview': { title: 'DHB Currency Overview — DeHub Docs', description: 'How the $DHB currency works in-app: tipping, unlocking content, rewards, AI generation credits, profit share and the $0.001 peg ahead of DEX listing.' },
  'token/economics': { title: 'DHB Token Economics & Emissions — DeHub Docs', description: '$DHB supply distribution, emissions, burns and how value flows through the DeHub ecosystem.' },
  'token/stake': { title: 'Staking DHB — DeHub Docs', description: 'How DHB staking works: rewards, mechanics and what staking unlocks across DeHub.' },
  'roadmap': { title: 'DeHub Roadmap — DeHub Docs', description: "Where DeHub is headed: shipped milestones and what's next across the app, token and games." },
  'faq': { title: 'DeHub FAQ — Frequently Asked Questions', description: 'Answers to the most common questions about DeHub, the DHB token, creator earnings, staking and the platform.' },
  'team': { title: 'DeHub Team — DeHub Docs', description: 'The founders and team behind DeHub: backgrounds across social media, gaming, entertainment and Web3.' },
  'contact': { title: 'Contact DeHub — DeHub Docs', description: 'How to reach the DeHub team: support, partnerships, press and community channels.' },
  'privacy': { title: 'Privacy Policy — DeHub', description: "DeHub's privacy policy: what data the platform handles and how." },
  'terms': { title: 'Legal Disclaimer & Terms — DeHub', description: "DeHub's legal disclaimer and terms of use." },
  'quickstart': { title: 'DeHub Quickstart — Get Started in Minutes', description: 'Create an account with email or socials, get a sponsored-gas wallet automatically, and publish your first on-chain post on DeHub.' },
  'installation': { title: 'Install DeHub — Web, Android & PWA', description: 'How to use DeHub on any device: the web app at dehub.io, the Android app on Google Play, and installing as a PWA.' },
  'advertising': { title: 'Advertising on DeHub — POVR Ad Tech', description: "DeHub's proof-of-view-and-rank (POVR) ad tech: on-chain verified audiences and revenue sharing for creators and holders." },
  'security': { title: 'Security at DeHub — DeHub Docs', description: 'Audits, smart-contract security and platform hardening at DeHub.' },
  // These ten are in sitemap-static.xml but had no entry here, so bots got the
  // raw SPA shell — the homepage title/description with no canonical. Ten of
  // the twenty-eight docs URLs we submit were presenting to Google as homepage
  // duplicates, which is what poisoned the /docs cluster. No docs-content JSON
  // exists for them yet (public/dehub-docs-content.txt is gone), so they fall
  // back to the description-only body in buildDocsHtml — thin, but correctly
  // titled, described and self-canonical, which a homepage clone never was.
  'token/utility': { title: 'DHB Token Utility & Holder Benefits — DeHub Docs', description: 'What holding $DHB unlocks: badge tiers, tipping, staking rewards, governance rights and moderation power across DeHub.' },
  'token/where-to-buy': { title: 'Where to Buy DHB — DeHub Docs', description: 'Where to buy the $DHB token: supported exchanges, DEX and CEX listings, trading pairs and liquidity.' },
  'token/governance': { title: 'DeHub Governance — Voting & Proposals', description: 'How DeHub governance works: proposals, voting power, DAO structure and how holders steer the platform.' },
  'token/bridge': { title: 'Bridge DHB Between BASE & BNB — DeHub Docs', description: 'How to move $DHB across chains with the DeHub bridge, between the BASE and BNB networks.' },
  'endpoints': { title: 'DeHub API Endpoints — Developer Docs', description: 'DeHub API reference: REST endpoints, integration guide and how to build against the platform.' },
  'featured-in': { title: 'DeHub in the Press — Featured In', description: 'Press and media coverage of DeHub, including US Weekly, Yahoo Finance, Entrepreneur, GQ South Africa and Investing.com.' },
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
 *  answer: the page really does exist, it just has nothing to rank. */
const DOCS_COMING_SOON = new Set([
  'website', 'app', 'dehub', 'x', 'instagram', 'architecture', 'configuration',
  'data-models', 'auth', 'webhooks', 'best-practices', 'troubleshooting', 'examples',
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
<meta property="og:image" content="${DEHUB_LOGO}">
<meta name="twitter:card" content="summary">
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
<meta property="og:image" content="${DEHUB_LOGO}">
<meta name="twitter:card" content="summary">
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
<meta property="og:image" content="${DEHUB_LOGO}">
<meta name="twitter:card" content="summary">
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
<meta property="og:image" content="${DEHUB_LOGO}">
<meta name="twitter:card" content="summary_large_image">
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
<meta property="og:image" content="${DEHUB_LOGO}">
<meta name="twitter:card" content="summary_large_image">
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
  const image = DEHUB_LOGO;
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
  <meta property="og:image:width" content="200">
  <meta property="og:image:height" content="200">
  <meta name="twitter:card" content="summary">
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

const SYSTEM_ROUTES = [
  'app', 'post', 'explore', 'notifications', 'messages', 'settings',
  'delete-account', 'creators', 'jobs', 'features', 'skill.md',
  '_netlify', 'favicon.ico', 'assets', 'og-image.png',
  'radio', 'tv', 'governance', 'stake', 'leaderboard', 'music',
  'shorts', 'videos',
  'top-100', 'glossary', 'bridge', 'agents', 'assistant', 'buy',
  'docs', 'prompt', 'premium', 'affiliate', 'work', 'editor', 'guides',
  // 'blog' is reserved: a user registered that handle, and without this every
  // /blog/<anything> minted an indexable "Join @blog" profile page.
  'blog',
];


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
  'features', 'pricing', 'creator', 'editor', 'prompt', 'work',
  'affiliate', 'premium', 'governance', 'leaderboard', 'top-100',
  'music', 'radio', 'tv', 'glossary', 'bridge', 'agents',
  'assistant', 'creators', 'jobs',
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
    if (first && !SYSTEM_ROUTES.includes(first) && !first.includes('.')) {
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
  // Always SSR for post pages
  if (pathname.includes('/post/')) return true;
  // Always SSR for community pages
  if (pathname.includes('/communities/')) return true;
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
  if (first && !SYSTEM_ROUTES.includes(first) && !first.includes('.')) return true;
  return false;
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

  // Skip static assets immediately
  if (pathname.startsWith('/assets/') || pathname.startsWith('/_') ||
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
      (firstSeg && !SYSTEM_ROUTES.includes(firstSeg) && !firstSeg.includes('.'));
    const looksNotFound =
      response.status === 404 ||
      response.headers.get('X-DeHub-NotFound') === '1' ||
      (isEntityRoute && NOT_FOUND_TITLES.some((t) => html.includes(t)));
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
