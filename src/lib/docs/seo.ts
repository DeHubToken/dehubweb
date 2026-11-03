// SEO metadata for every docs section. Keyed by route path under /docs.
// Keep titles <60 chars, descriptions <160 chars.
//
// Crawlers get the SEO worker's own DOCS_PAGES copy, not these. These are what
// DocsSEO sets for readers (tab title, share meta). Their translations come
// from src/i18n/en.ts docsSeo, keyed by docsSeoKey() below
// ('token/where-to-buy' -> tokenWhereToBuyTitle / tokenWhereToBuyDesc,
// '' -> indexTitle). Change an English line here and there together.

import developerDocs from "@/data/developer-docs.json";

export interface DocsSeoEntry {
  title: string;
  description: string;
  keywords?: string;
}

export const DOCS_SEO: Record<string, DocsSeoEntry> = {
  // The docs index: the worker's crawler strings for /docs, which are also
  // en.json docs.seoTitle / docs.seoDescription (DocsSEO shows those, translated).
  "": {
    title: "Riftn Documentation: Guides, Token, dApps & FAQ",
    description:
      "Official Riftn documentation: platform overview, dApps, token economics, staking, games, roadmap, FAQ and more.",
    keywords: "Riftn, docs, documentation, web3, decentralized social",
  },
  overview: {
    title: "Overview | Riftn Docs",
    description:
      "High-level overview of Riftn: its mission, origins and the decentralized, user-owned social ecosystem.",
  },
  dapps: {
    title: "The Riftn dApp: Complete Feature Guide",
    description:
      "Every Riftn feature in one guide: feeds, shorts, stories, the daily posting allowance, communities, stages, TV and radio, wallet, bounty hunting, stores, AI toolkits, encryption and DePIN.",
    keywords:
      "Riftn dApp, web3 social app, decentralized social features, posting allowance, daily post limit, watch2earn, pay-per-view, live streaming, audio stages, creator wallet, Riftn token, bounty hunting, end-to-end encryption, DePIN, AI toolkits",
  },
  games: {
    title: "Games | Riftn Docs",
    description: "Discover Web3 games and play-to-earn experiences on Riftn.",
  },
  token: {
    title: "Riftn tokens | Riftn Docs",
    description:
      "Everything about the Riftn token: utility, economics, governance, staking, bridging and security.",
  },
  "token/overview": {
    title: "Currency Overview | Riftn Docs",
    description:
      "How Riftn tokens work in-app: tipping, unlocking content, rewards, AI credits, profit share and the $0.001 in-app peg.",
    keywords:
      "Riftn tokens, utility token, tipping, pay-per-view, AI credits, profit share, staking rewards, token peg",
  },
  "token/economics": {
    title: "Token Economics | Riftn Docs",
    description:
      "Token economics: supply, distribution, emissions and economic model that powers Riftn.",
  },
  "token/utility": {
    title: "Token Utility | Riftn Docs",
    description:
      "What holding tokens unlocks: governance, staking rewards, moderation power and marketplace perks across Riftn.",
  },
  "token/where-to-buy": {
    title: "Where to Buy Tokens | Riftn Docs",
    description:
      "Official exchanges, DEXs and on-ramps where you can buy the Riftn token.",
  },
  "token/governance": {
    title: "Token Governance | Riftn Docs",
    description:
      "How token holders shape Riftn through proposals, voting and on-chain governance.",
  },
  "token/stake": {
    title: "Stake tokens | Riftn Docs",
    description:
      "Stake tokens to earn rewards, unlock badges and access premium Riftn features.",
  },
  "token/bridge": {
    title: "Token Bridge | Riftn Docs",
    description:
      "How to move tokens between BNB Chain and Base with the manual Riftn bridge, and what to expect while it processes.",
  },
  // depin / e2e-encryption / ai-toolkits now redirect into /docs/dapps, so their
  // metadata is folded into the dapps entry above rather than duplicated here.
  advertising: {
    title: "Advertising | Riftn Docs",
    description:
      "Riftn's POVR ad tech explained: proof-of-view-and-rank, fraud-resistant campaigns and revenue sharing for creators.",
  },
  team: {
    title: "Team | Riftn Docs",
    description: "Meet the team building Riftn and the decentralized social future.",
  },
  security: {
    title: "Security | Riftn Docs",
    description:
      "Riftn contract security: the Certik audit and how to report vulnerabilities to the team.",
  },
  roadmap: {
    title: "Roadmap | Riftn Docs",
    description:
      "The Riftn product roadmap: shipped milestones and what is coming next across the platform.",
  },
  contact: {
    title: "Contact | Riftn Docs",
    description: "Get in touch with the Riftn team for support, partnerships and press.",
  },
  terms: {
    title: "Legal Disclaimer | Riftn Docs",
    description: "Riftn's legal disclaimer: risk notices and terms of use for the platform and the Riftn token.",
  },
  "terms-of-service": {
    title: "Terms of Service | Riftn Docs",
    description: "Full Terms of Service for the Riftn platform.",
  },
  privacy: {
    title: "Privacy Policy | Riftn Docs",
    description: "How Riftn collects, uses and protects user data across the platform.",
  },
  "brand-assets": {
    title: "Brand Assets | Riftn Docs",
    description:
      "Download the official Riftn logos, wordmarks and brand assets for press and partners.",
  },
  "brand-guidelines": {
    title: "Brand Guidelines | Riftn Docs",
    description:
      "The official Riftn brand guidelines deck: identity, logo usage and design standards for partners and press.",
  },
  "featured-in": {
    title: "Featured In | Riftn Press Coverage",
    description:
      "Press coverage of Riftn: US Weekly, Yahoo Finance, Entrepreneur and Investing.com on the user-owned social platform.",
  },
  // The worker serves quickstart noindex,follow until it gets a sitemap row.
  quickstart: {
    title: "Quick Start | Riftn Docs",
    description:
      "Developer quick start for the Riftn API: prerequisites, client setup and your first request. Full API docs are in progress.",
  },
  blog: {
    title: "Blog | Riftn Docs",
    description: "Updates, deep dives and announcements from the Riftn team.",
  },
  faq: {
    title: "FAQ | Riftn Docs",
    description: "Frequently asked questions about Riftn, the Riftn token and the platform.",
  },
  donate: {
    title: "Donate | Riftn Docs",
    description: "Support Riftn development by donating directly to the team's EVM or BTC addresses.",
  },
  website: {
    title: "Website Guide | Riftn Docs",
    description: "Learn about the Riftn website features and how to navigate the platform.",
  },
  app: {
    title: "App Guide | Riftn Docs",
    description: "Guides for the Riftn mobile and desktop applications.",
  },
  dehub: {
    title: "Riftn Platform | Riftn Docs",
    description: "Complete guide to using the Riftn decentralized social platform.",
  },
  x: {
    title: "X Integration | Riftn Docs",
    description: "Connect your X account and cross-post content with Riftn.",
  },
  instagram: {
    title: "Instagram Integration | Riftn Docs",
    description: "Connect Instagram with Riftn for cross-platform content distribution.",
  },
  architecture: {
    title: "Architecture | Riftn Docs",
    description: "Riftn system architecture, services and on-chain infrastructure.",
  },
};

// The developer docs carry their own metadata in src/data/developer-docs.json
// (shared with the worker's DOCS_PAGES and the crawler copy). They are written
// in English only, so no translated docsSeo line may replace them.
const DEVELOPER_ROUTES = new Set<string>();
for (const page of developerDocs.pages) {
  DEVELOPER_ROUTES.add(page.route);
  DOCS_SEO[page.route] = { title: page.seoTitle, description: page.description };
}

const BASE_URL = "https://riftn.com";

/** The en.ts docsSeo key stem for a DOCS_SEO slug. */
const docsSeoKey = (slug: string): string =>
  slug ? slug.replace(/[/-](\w)/g, (_, c: string) => c.toUpperCase()) : "index";

export function getDocsSeoForPath(pathname: string): {
  entry: DocsSeoEntry;
  canonical: string;
  slug: string;
  /** en.ts docsSeo key stem; absent for blog posts, which own their metadata. */
  key?: string;
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
      key: docsSeoKey("blog"),
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
        title: `${pretty} | Riftn Blog`,
        description: `${pretty}, read the full post on the Riftn blog.`,
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
    key: DEVELOPER_ROUTES.has(p) ? undefined : docsSeoKey(DOCS_SEO[p] ? p : ""),
  };
}
