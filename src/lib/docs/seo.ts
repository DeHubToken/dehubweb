// SEO metadata for every docs section. Keyed by route path under /docs.
// Keep titles <60 chars, descriptions <160 chars.

export interface DocsSeoEntry {
  title: string;
  description: string;
  keywords?: string;
}

export const DOCS_SEO: Record<string, DocsSeoEntry> = {
  "": {
    title: "DeHub Docs — Decentralized Social Platform Documentation",
    description:
      "Official DeHub documentation. Learn the platform, token, dApps, APIs and developer guides for the decentralized social network.",
    keywords: "DeHub, docs, documentation, web3, decentralized social",
  },
  overview: {
    title: "Overview — DeHub Docs",
    description:
      "High-level overview of DeHub: its mission, origins and the decentralized, user-owned social ecosystem.",
  },
  dapps: {
    title: "The DeHub dApp — Complete Feature Guide",
    description:
      "Every DeHub feature in one guide: feeds, shorts, stories, the daily posting allowance, communities, stages, TV and radio, wallet, bounty hunting, stores, AI toolkits, encryption and DePIN.",
    keywords:
      "DeHub dApp, web3 social app, decentralized social features, posting allowance, daily post limit, watch2earn, pay-per-view, live streaming, audio stages, creator wallet, DHB token, bounty hunting, end-to-end encryption, DePIN, AI toolkits",
  },
  games: {
    title: "Games — DeHub Docs",
    description: "Discover Web3 games and play-to-earn experiences on DeHub.",
  },
  token: {
    title: "DHB Token — DeHub Docs",
    description:
      "Everything about the DHB token: utility, economics, governance, staking, bridging and security.",
  },
  "token/overview": {
    title: "Currency Overview — DeHub Docs",
    description:
      "How the DHB currency works in-app: tipping, unlocking content, rewards, AI credits, profit share and the $0.001 in-app peg.",
    keywords:
      "DHB currency, utility token, tipping, pay-per-view, AI credits, profit share, staking rewards, token peg",
  },
  "token/economics": {
    title: "Token Economics — DeHub Docs",
    description:
      "DHB tokenomics: supply, distribution, emissions and economic model that powers DeHub.",
  },
  "token/utility": {
    title: "Token Utility — DeHub Docs",
    description:
      "What holding DHB unlocks: governance, staking rewards, moderation power and marketplace perks across DeHub.",
  },
  "token/where-to-buy": {
    title: "Where to Buy DHB — DeHub Docs",
    description:
      "Official exchanges, DEXs and on-ramps where you can buy the DHB token.",
  },
  "token/governance": {
    title: "Token Governance — DeHub Docs",
    description:
      "How DHB holders shape DeHub through proposals, voting and on-chain governance.",
  },
  "token/stake": {
    title: "Stake DHB — DeHub Docs",
    description:
      "Stake DHB to earn rewards, unlock badges and access premium DeHub features.",
  },
  "token/bridge": {
    title: "Token Bridge — DeHub Docs",
    description:
      "How to move DHB between BNB Chain and Base with the manual DeHub bridge, and what to expect while it processes.",
  },
  // depin / e2e-encryption / ai-toolkits now redirect into /docs/dapps, so their
  // metadata is folded into the dapps entry above rather than duplicated here.
  advertising: {
    title: "Advertising — DeHub Docs",
    description:
      "DeHub's POVR ad tech explained: proof-of-view-and-rank, fraud-resistant campaigns and revenue sharing for creators.",
  },
  team: {
    title: "Team — DeHub Docs",
    description: "Meet the team building DeHub and the decentralized social future.",
  },
  security: {
    title: "Security — DeHub Docs",
    description:
      "DeHub contract security: the Certik audit and how to report vulnerabilities to the team.",
  },
  roadmap: {
    title: "Roadmap — DeHub Docs",
    description:
      "The DeHub product roadmap: shipped milestones and what is coming next across the platform.",
  },
  contact: {
    title: "Contact — DeHub Docs",
    description: "Get in touch with the DeHub team for support, partnerships and press.",
  },
  terms: {
    title: "Legal Disclaimer — DeHub Docs",
    description: "DeHub's legal disclaimer: risk notices and terms of use for the platform and the DHB token.",
  },
  "terms-of-service": {
    title: "Terms of Service — DeHub Docs",
    description: "Full Terms of Service for the DeHub platform.",
  },
  privacy: {
    title: "Privacy Policy — DeHub Docs",
    description: "How DeHub collects, uses and protects user data across the platform.",
  },
  "brand-assets": {
    title: "Brand Assets — DeHub Docs",
    description:
      "Download the official DeHub logos, wordmarks and brand assets for press and partners.",
  },
  "brand-guidelines": {
    title: "Brand Guidelines — DeHub Docs",
    description:
      "The official DeHub brand guidelines deck: identity, logo usage and design standards for partners and press.",
  },
  "featured-in": {
    title: "Featured In — DeHub Press Coverage",
    description:
      "Press coverage of DeHub: US Weekly, Yahoo Finance, Entrepreneur and Investing.com on the user-owned social platform.",
  },
  // quickstart / installation / endpoints are developer-doc drafts that still
  // carry placeholder content; the worker serves them noindex,follow until the
  // real API docs land. Descriptions here describe what actually renders.
  quickstart: {
    title: "Quick Start — DeHub Docs",
    description:
      "Developer quick start for the DeHub API: prerequisites, client setup and your first request. Full API docs are in progress.",
  },
  installation: {
    title: "Installation — DeHub Docs",
    description: "Developer environment setup for building against DeHub. Full SDK docs are in progress.",
  },
  endpoints: {
    title: "API Endpoints — DeHub Docs",
    description:
      "DeHub API endpoint reference — full, versioned API documentation is in progress.",
  },
  blog: {
    title: "Blog — DeHub Docs",
    description: "Updates, deep dives and announcements from the DeHub team.",
  },
  faq: {
    title: "FAQ — DeHub Docs",
    description: "Frequently asked questions about DeHub, the DHB token and the platform.",
  },
  donate: {
    title: "Donate — DeHub Docs",
    description: "Support DeHub development by donating directly to the team's EVM or BTC addresses.",
  },
  website: {
    title: "Website Guide — DeHub Docs",
    description: "Learn about the DeHub website features and how to navigate the platform.",
  },
  app: {
    title: "App Guide — DeHub Docs",
    description: "Guides for the DeHub mobile and desktop applications.",
  },
  dehub: {
    title: "DeHub Platform — DeHub Docs",
    description: "Complete guide to using the DeHub decentralized social platform.",
  },
  x: {
    title: "X Integration — DeHub Docs",
    description: "Connect your X account and cross-post content with DeHub.",
  },
  instagram: {
    title: "Instagram Integration — DeHub Docs",
    description: "Connect Instagram with DeHub for cross-platform content distribution.",
  },
  architecture: {
    title: "Architecture — DeHub Docs",
    description: "DeHub system architecture, services and on-chain infrastructure.",
  },
  configuration: {
    title: "Configuration — DeHub Docs",
    description: "Configure DeHub clients, edge functions and developer tooling.",
  },
  "data-models": {
    title: "Data Models — DeHub Docs",
    description: "Database schemas and data structures used across DeHub services.",
  },
  auth: {
    title: "Authentication — DeHub Docs",
    description: "DeHub authentication: wallet sign-in, JWT sessions and edge function auth.",
  },
  webhooks: {
    title: "Webhooks — DeHub Docs",
    description: "Subscribe to real-time DeHub events with webhook integrations.",
  },
  "best-practices": {
    title: "Best Practices — DeHub Docs",
    description: "Recommended approaches and coding standards for building on DeHub.",
  },
  troubleshooting: {
    title: "Troubleshooting — DeHub Docs",
    description: "Common DeHub issues, error messages and how to resolve them.",
  },
  examples: {
    title: "Examples — DeHub Docs",
    description: "Code examples and end-to-end implementation samples for DeHub developers.",
  },
};

const BASE_URL = "https://dehub.io";

export function getDocsSeoForPath(pathname: string): {
  entry: DocsSeoEntry;
  canonical: string;
  slug: string;
} {
  const clean = pathname.replace(/\/+$/, "");

  // Bare /guides is the blog index's alias (the worker 301s direct loads to
  // /docs/blog; in-app navigation can still land here) — without this it fell
  // through to the generic entry with a canonical of /docs/guides, a 404.
  if (clean === "/guides") {
    return {
      slug: "blog",
      canonical: `${BASE_URL}/docs/blog`,
      entry: DOCS_SEO["blog"],
    };
  }

  // Blog posts: /guides/<slug> is canonical, /docs/blog/<slug> is the legacy
  // twin. Both canonicalize to /guides — matching the worker, the sitemap and
  // every share link. (Previously /guides/<slug> fell through to the generic
  // docs entry with a canonical of /docs/guides/<slug>, a URL that does not
  // exist.) This is only a pre-data fallback: BlogPost overwrites it with the
  // post's real seoTitle/seoDescription once the post loads.
  const blogMatch = clean.match(/^\/(?:guides|docs\/blog)\/([^/?#]+)$/);
  if (blogMatch) {
    const slug = blogMatch[1];
    const pretty = slug.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    return {
      slug: `blog/${slug}`,
      canonical: `${BASE_URL}/guides/${slug}`,
      entry: {
        title: `${pretty} — DeHub Blog`,
        description: `${pretty} — read the full post on the DeHub blog.`,
      },
    };
  }

  // Normalize: strip /docs prefix and leading slash
  let p = clean.replace(/^\/docs/, "");
  if (p.startsWith("/")) p = p.slice(1);

  const entry = DOCS_SEO[p] ?? DOCS_SEO[""];
  return {
    slug: p,
    canonical: `${BASE_URL}/docs${p ? `/${p}` : ""}`,
    entry,
  };
}
