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
      "High-level overview of DeHub: its mission, architecture and the decentralized social ecosystem.",
  },
  dapps: {
    title: "The DeHub dApp — Complete Feature Guide",
    description:
      "Every DeHub feature in one guide: feeds, shorts, stories, communities, stages, TV and radio, wallet, bounty hunting, stores, AI toolkits, encryption and DePIN.",
    keywords:
      "DeHub dApp, web3 social app, decentralized social features, watch2earn, pay-per-view, live streaming, audio stages, creator wallet, DHB token, bounty hunting, end-to-end encryption, DePIN, AI toolkits",
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
  "token/economics": {
    title: "Token Economics — DeHub Docs",
    description:
      "DHB tokenomics: supply, distribution, emissions and economic model that powers DeHub.",
  },
  "token/utility": {
    title: "Token Utility — DeHub Docs",
    description:
      "How DHB is used across DeHub: payments, tipping, gated content, staking rewards and more.",
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
      "Bridge DHB across supported chains including BNB Chain and Base safely.",
  },
  // depin / e2e-encryption / ai-toolkits now redirect into /docs/dapps, so their
  // metadata is folded into the dapps entry above rather than duplicated here.
  advertising: {
    title: "Advertising — DeHub Docs",
    description:
      "Run ads on DeHub: campaign setup, formats, targeting and creator monetization.",
  },
  team: {
    title: "Team — DeHub Docs",
    description: "Meet the team building DeHub and the decentralized social future.",
  },
  security: {
    title: "Security — DeHub Docs",
    description:
      "DeHub security model: audits, key management, custody and best practices for users.",
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
    title: "Terms — DeHub Docs",
    description: "Terms governing use of DeHub products and services.",
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
      "Official DeHub brand guidelines: logo usage, color palette, typography and tone.",
  },
  quickstart: {
    title: "Quick Start — DeHub Docs",
    description:
      "Get started on DeHub in minutes: create an account, connect a wallet and post your first content.",
  },
  installation: {
    title: "Installation — DeHub Docs",
    description: "Install DeHub on desktop and mobile and set up your developer environment.",
  },
  endpoints: {
    title: "API Endpoints — DeHub Docs",
    description:
      "Reference for the DeHub REST and edge function endpoints used by clients and integrations.",
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
    description: "Support DeHub development by donating to the public treasury.",
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
  // Normalize: strip /docs prefix and trailing slash
  let p = pathname.replace(/^\/docs/, "").replace(/\/+$/, "");
  if (p.startsWith("/")) p = p.slice(1);

  // Blog post fallback: /docs/blog/:slug
  if (p.startsWith("blog/") && p !== "blog") {
    const slug = p.slice("blog/".length);
    const pretty = slug.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    return {
      slug: p,
      canonical: `${BASE_URL}/docs/${p}`,
      entry: {
        title: `${pretty} — DeHub Blog`,
        description: `${pretty} — read the full post on the DeHub blog.`,
      },
    };
  }

  const entry = DOCS_SEO[p] ?? DOCS_SEO[""];
  return {
    slug: p,
    canonical: `${BASE_URL}/docs${p ? `/${p}` : ""}`,
    entry,
  };
}
