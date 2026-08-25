/**
 * Milestone-archive URLs that are superseded by a hand-written post.
 * =================================================================
 * The milestone archive under /guides/ is generated from roadmap bullets. For
 * a handful of those milestones somebody later wrote a proper article covering
 * the same event, and the generated version was hidden from the blog index by
 * `excludedTitles` in src/data/newPosts.ts.
 *
 * Hiding it from the index did not remove it. The manifest generator builds
 * from the slug-level union of blogSource and newPosts without consulting
 * `excludedTitles`, so every one of these was still written to
 * public/blog-content/, still listed in sitemap-static.xml, and still served
 * at its own URL — an orphan page, submitted to Google, reachable by no link
 * on the site, covering the same event as the post that replaced it.
 *
 * Both consumers read this map so the two cannot drift:
 *
 *   CLOUDFLARE_WORKER_SEO.js      301s /guides/<from> -> /guides/<to>
 *   scripts/generate-blog-manifest.mjs  drops <from> from the manifest,
 *                                       blog-content/, sitemap and rss
 *
 * A 301 with no sitemap row is the honest combination: the URL keeps whatever
 * equity it earned and passes it to the surviving post, and we stop asking
 * Google to crawl something we redirect.
 *
 * ONLY put a slug here when the target genuinely covers the same event. Six
 * further milestones are excluded from the blog index and have no counterpart
 * at all — see EXCLUDED_WITHOUT_COUNTERPART below.
 */
export const MILESTONE_REDIRECTS = {
  // Q4 2024 agency milestone -> the authored write-up of the same milestone.
  'leading-the-way-dehub-agency-becomes-uk-1-with-1000-streamers---a-dehub-milestone-from-q4-2024':
    'leading-the-way-dehub-founders-official-tiktok-partner-agency-becomes-uk-1-with-1000-streamers',

  // Q1 2024 fan.site raise -> "$1,000,000 raise completed", which is the same
  // round (the post names Fan.site, formerly Blocjerk, explicitly).
  'fueling-growth-1m-raised-for-fansite-bj-fork---a-dehub-milestone-from-q1-2024':
    '1-million-dollar-raise-completed',

  // Q1 2025 streaming milestone -> the authored feature post. Note the target
  // slug ends "-tip", not "-tips"; it is the live URL and predates this one.
  'interactive-streaming-on-chain-live-streams-with-animated-tips---a-dehub-milestone-from-q1-2025':
    'interactive-streaming-on-chain-live-streams-with-animated-tip',

  // Q2 2023 press milestone -> the authored press round-up.
  'in-the-spotlight-dehub-featured-in-techcrunch-and-venturebeat---a-dehub-milestone-from-q2-2023':
    'dehub-featured-in-press',

  // Q2 2023 award milestone -> the authored award announcement.
  'innovation-recognized-dehub-wins-corporate-livewire-award---a-dehub-milestone-from-q2-2023':
    'award-winning-innovation-dehub-recognised',

  // The next two are orphaned by a different mechanism and are easy to miss.
  // They are NOT in `excludedTitles`; getAllBlogListPosts() dedupes the index
  // by TITLE (`new Map(combined.map(p => [p.title, p]))`), and because newPosts
  // are appended last the authored copy wins. The milestone shares the title
  // but has its own slug, so it vanished from the index while keeping a
  // sitemap row and a live URL — the same orphan, reached by another route.
  //
  // Note the slug pairs differ only in punctuation (a doubled dash where the
  // generated title had an ampersand, and the `---a-dehub-milestone-from-*`
  // suffix). Worth reading twice before editing either side.
  'fresh-experience-revamped-app-feed-with-audio-replies--live-talk-spaces---a-dehub-milestone-from-q2-2025':
    'fresh-experience-revamped-app-feed-with-audio-replies-live-talk-spaces',

  'global-footprint-dehub-expands-middle-east-presence-via-dubai-event---a-dehub-milestone-from-q2-2024':
    'global-footprint-dehub-expands-middle-east-presence-via-dubai-event',
};

/**
 * The other six entries in `excludedTitles`. These were hidden from the blog
 * index too, but nothing replaced them — there is no authored post covering a
 * 200% backend speed boost, creator partnerships in 15 countries, automated
 * liquidity provision, the DEX policy, the fan.site knowledge transfer, or the
 * patent filings.
 *
 * They are listed here as documentation, not as behaviour: redirecting them
 * would send a reader to something unrelated, and dropping them from the
 * sitemap would de-index six posts that now carry real articles. They were
 * excluded from the index when the archive was nine shared templates, which is
 * no longer true, so they have been un-excluded instead and are reachable from
 * /docs/blog again like every other post.
 */
export const EXCLUDED_WITHOUT_COUNTERPART = [
  'leveling-up-major-app-upgrade-earns-95-positive-feedback---a-dehub-milestone-from-q3-2024',
  'worldwide-creators-partnerships-spanning-15-countries---a-dehub-milestone-from-q2-2024',
  'smarter-liquidity-automated-liquidity-provision-on-dexs---a-dehub-milestone-from-q4-2023',
  'open-and-clear-dex-policy-implementation-and-transparency-commitment---a-dehub-milestone-from-q4-2023',
  'supporting-growth-knowledge-transfer-to-fansite-team---a-dehub-milestone-from-q3-2023',
  'protecting-innovation-patent-applications-for-streaming--watch2earn-tech---a-dehub-milestone-from-q2-2023',
];

/**
 * Guides that are gone for good, and where a reader should land instead.
 * =====================================================================
 * Unlike MILESTONE_REDIRECTS these have no surviving counterpart under
 * /guides/ — the post was retired rather than replaced, so the target is an
 * absolute app path instead of a slug.
 *
 * Both consumers read this map:
 *
 *   CLOUDFLARE_WORKER_SEO.js            301s /guides/<from> -> <to>
 *   scripts/generate-blog-manifest.mjs  asserts <from> is no longer published,
 *                                       so a re-added post can never sit behind
 *                                       a 301 the way the milestone orphans did
 *
 * The DeLabs incorporation milestone is retired because DeHub is an
 * independent DAO governed by its token holders, not a company subsidiary;
 * governance is the page that answers the question the old post was asked for.
 */
export const RETIRED_GUIDES = {
  'official-standing-delabs-ltd-incorporated---a-dehub-milestone-from-q3-2022': '/docs/token/governance',
};
