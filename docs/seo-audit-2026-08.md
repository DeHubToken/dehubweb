# DeHub SEO Audit — August 2026

Method: live crawl of dehub.io as Googlebot and as a browser (10 Aug 2026), static analysis of this
repository, and manual review of the live SERPs for each candidate term.

Search-volume figures are deliberately omitted — competition and intent were observed directly, volume was
not. Confirm in Search Console and a keyword tool before committing budget.

**Summary:** the technical foundation is stronger than most production sites. None of the findings below are
foundational. This is a distribution and prioritisation problem sitting on top of solid engineering.

---

## The three bets

### 1. `watch to earn`

Variants: watch to earn app · watch to earn crypto · get paid to watch videos crypto · watch2earn ·
is watch to earn legit · best watch to earn platforms 2026

- **Why us:** core product mechanic, and we hold patent filings on watch2earn streaming tech. No one else in
  the SERP can make that claim, and the term is small enough that a real product can still own it.
- **Who holds it:** nobody. Live top-10 is content farms and forum reposts (aads.com, tradersunion, Binance
  Square, Gate Square, coinpaper, dicloak). No platform brand ranks for its own category.
- **Where we are:** absent from every watch-to-earn SERP tested. Named incumbents: Odysee, Verasity,
  Permission.io, XCAD, Cointiply, PlayNANO.
- **Assets ready:** 5 pages, 3,700–4,600 words each, already SSR'd and canonical.
- **Call:** category-ownership play, not a ranking play. Win the definition query
  (`/guides/what-is-watch-to-earn`) and the commercial query (`/guides/best-watch-to-earn-platforms-2026`)
  and downstream comparison terms follow. Two quarters to a defensible position.

### 2. `cheelee alternative`

Variants: is cheelee a scam · cheelee not paying · xcad alternative · theta.tv alternative · apps like cheelee

- **Why us:** Cheelee has millions of Play Store installs and a heavy scam-query reputation — a churning user
  base actively shopping for a replacement. Highest-intent traffic available in our space.
- **Who holds it:** app directories, not editorial — apkpure, similarweb, cbinsights, justuseapp, a TikTok
  discover page. Weakest SERP found in this audit.
- **Where we are:** absent. Named alternatives are HOOTT, Stereo, BeeLive, Chingari, Taki — none a full
  social platform.
- **Assets ready:** one combined page (`/guides/dehub-vs-cheelee-theta-xcad-watch-to-earn`) doing three jobs.
- **Call:** lowest effort-to-conversion ratio on the board. Split into `/guides/cheelee-alternative`,
  `/guides/xcad-alternative` and `/guides/theta-tv-alternative`; keep the combined page as cluster hub.

### 3. `web3 live streaming platform`

Variants: decentralised twitch alternative · crypto live streaming · stream to earn · blockchain streaming
platform · twitch alternative for creators

- **Why us:** supply-side acquisition — one streamer arrives with an audience, one viewer arrives alone. Our
  founders run the UK's #1 TikTok partner agency with 1,000 streamers: genuine distribution plus genuine
  first-hand experience, which is what this content category is graded on.
- **Who holds it:** stale and thin — a 2024 Blockonomi listicle, a Medium post, an MDPI paper, LinkedIn
  Pulse, Seeking Alpha. Incumbents named: Theta, DLive, Livepeer, Stacked.
- **Where we are:** absent, despite the strongest infrastructure story on that list.
- **Assets ready:** one page (3,938 words) plus unused proof — Livepeer integration, 50k concurrent viewers,
  99.99% uptime, sub-200ms custom CDN, on-chain animated tips.
- **Call:** those proof points are buried in milestone announcements. Pull them into the streaming guide as
  first-hand benchmark data — the differentiator no listicle farm can copy.

## Deliberately not chosen

| Term | Why not |
| --- | --- |
| `decentralized social media` | Highest volume, unwinnable. Top-10 is high-authority affiliate listicles (QuickNode, Coinbound, NinjaPromo, TradersUnion, AADS). The play is **digital PR, not SEO** — get DeHub added to them. We are currently in none. |
| `play to earn games no investment` | Pure affiliate content-farm SERP (ChainPlay, Downgraf, StealthEX, EarnifyHub) and we have one game. Poor fit for the effort. |
| `tiktok alternative` | Volume without intent. Searchers want another short-video app, not a wallet. Keep the UK creator angle as a supporting page. |
| `dehub` / `dehub app` | Not a growth term — a leak. Demand already generated via CoinGecko, CMC, Coinbase, Forbes, Google Play and not captured. Treated as a defect below. |

---

## Measured state (10 Aug 2026)

| Metric | Value | Note |
| --- | --- | --- |
| Brand SERP | **Lost** | DePaul University owns "dehub". dehub.io not in top 10. |
| Money pages | 16 / 122 | Keyword-targeted guides. Other 106 are announcements. |
| Homepage → guides | **0 / 44** | Internal links from homepage reaching a money page. |
| Indexable URLs | 1,817 | 167 static + 1,600 posts + 50 profiles. Posts average 83 words. |
| Locale files | 109 | Translations shipped. Zero hreflang, zero localised URLs. |
| Edge SSR | Working | Verified on guides, docs, sections, profiles, posts. |
| Publishing gap | 27 days | Last money page 14 Jul. Prior cadence ~2.7/month. |
| Median post length | 466 w | 25 posts under 400 w. Money pages run 3,600–5,400. |

---

## Findings

### CRITICAL — We do not rank for our own name

A search for `dehub` returns DePaul University's student portal, the DePaul app on Google Play and App
Store, Instagram, CoinMarketCap, CoinGecko and our own legacy `dehub.net` — but not `dehub.io` in the top 10.

Compounding it, `docs.dhb.gg` is indexed with the title *"DeHub Documentation — Build on the Decentralized
Future"* but serves HTTP 404 reading *"Build incomplete."*

```
query "dehub" → 1. depaul.edu  2. instagram  3. play.google (DePaul app)
                 4. coinmarketcap  5. coingecko  6. dehub.net → 301 → dehub.io ✓
                 dehub.io ................................ not in top 10

docs.dhb.gg/ → HTTP 404 "Build incomplete"  (indexed, ranking, broken)
```

**Fix:** retire or 301 `docs.dhb.gg` to `dehub.io/docs`. Extend the Wikidata item (`Q140518527`, already in
our `sameAs` graph) with a proper description and links. Publish a `/dehub-app` landing page. Link the
existing disambiguation guide from the homepage instead of burying it in the blog index.

### CRITICAL — The homepage sends no link equity to any money page

The bot-rendered homepage carries 44 internal links and not one points at any of the 16 keyword-targeted
guides. The only route in is `/docs/blog`, unpaginated with 124 links, so each guide receives roughly 0.8%
of an already second-hand signal.

```
homepage (Googlebot) → 44 internal links, 0 to /guides/*
/docs/blog           → 124 links to /guides/*, unpaginated, no hub structure
    of which: 16 keyword-targeted · 73 "a-dehub-milestone-from-qN-YYYY" · 33 other
```

**Fix:** add a curated block of 6–8 guide links to the homepage SSR template
(`CLOUDFLARE_WORKER_SEO.js`, alongside `PRIMARY_NAV`). Split the blog index into topic hubs — Watch to Earn,
Creators, Streaming, Announcements.

### HIGH — Four pages fighting over one query

Worsened by mixed US/UK spelling across the two commercial pages.

```
/guides/best-decentralized-social-media ..............   264 w  ← stub, 301 away
/guides/best-web3-social-media-dapps .................  thin    ← 301 away
/guides/best-decentralised-social-media-platforms-2026 5,429 w  ← keep (commercial)
/guides/decentralised-social-media-explained-uk ...... 4,789 w  ← keep (informational)
```

**Fix:** 301 the two thin pages into the flagship. Two pages, two intents, one winner each. Note the
watch-to-earn cluster is *not* cannibalising — its five pages map to five distinct intents. Leave it alone.

### HIGH — 109 translations no search engine can reach

```
src/i18n/*.ts ............................. 109 locale files
grep -r "hreflang" (src, worker, index.html) ... 0 matches
language persistence ...................... localStorage only, URL unchanged
```

**Fix:** don't localise all 109. Pick 3–5 with real user concentration, give them a URL prefix
(`/es/guides/…`), emit reciprocal `hreflang` plus `x-default`, add to sitemap. The worker already renders
per-route bot HTML, so this is a routing and tag change, not new infrastructure.

### HIGH — 1,600 eighty-word URLs in the sitemap

```
/app/post/2008 (Googlebot) → 200, 83 words of body text
sitemap-posts-1.xml ........ 1,600 URLs
sitemap-static.xml .........   167 URLs
sitemap-profiles-1.xml .....    50 URLs
```

**Fix:** gate sitemap inclusion on a word-count or engagement floor. The rest stay crawlable and canonical,
they just stop being nominated.

### MEDIUM — Heading hierarchy skips H2 entirely

Markdown `##` renders to `<h3>`, so the only H2 on a 4,600-word article is boilerplate.

```
/guides/best-watch-to-earn-platforms-2026
  h1  Best Watch-to-Earn Platforms 2026
  h3  How we assessed…        ← should be h2
  h4  DeHub — best all-round… ← should be h3
  h3  Frequently asked questions
  h2  More from the DeHub Blog  ← boilerplate is the page's only h2
```

**Fix:** shift the heading map up a level in the markdown-to-HTML step. Applies to all 122 posts at once.

### MEDIUM — Q&A blocks written but never marked up

```
Article ✓   BreadcrumbList ✓   Organization ✓   WebSite ✓
SoftwareApplication ✓        FAQPage ✗   QAPage ✗
```

To be straight about the upside: Google restricted FAQ *rich results* to government and health sites in
2023, so this won't win snippet real estate. It matters because structured Q&A is what AI answer engines and
Bing quote from.

**Fix:** emit `FAQPage` into the existing `@graph` when a post contains an FAQ section.

### MEDIUM — Author is a Person named "DeHub Team", and nothing is ever updated

Every article declares `author: {"@type": "Person", "name": "DeHub Team"}` — a Person that is not a person —
and every money page carries `dateModified` identical to `datePublished`.

**Fix:** attribute to named humans with `Person` entities `sameAs`-linked to real profiles. Set
`dateModified` from actual file mtime. `/docs/team` returns 200 — link author bylines to it.

### MEDIUM — Two posts published at two URLs each

```
fresh-experience-revamped-app-feed-with-audio-replies--live-talk-spaces---a-dehub-milestone-from-q2-2025
fresh-experience-revamped-app-feed-with-audio-replies-live-talk-spaces

global-footprint-dehub-expands-middle-east-presence-via-dubai-event---a-dehub-milestone-from-q2-2024
global-footprint-dehub-expands-middle-east-presence-via-dubai-event
```

**Fix:** 301 the milestone-suffixed variant to the clean slug. Add a build-time assertion on duplicate
normalised slugs.

### MEDIUM — Our most important URL is 149 words

The bot-rendered homepage is a nav list plus a scrape of recent feed post titles ("No way 🤣🤣🤣 ffs",
"$1 per 1 DHB SOON 🔥🚀"). Thin for a page carrying Organization, WebSite and SoftwareApplication entities.

**Fix:** give the homepage SSR template a real 300–500 word product summary plus the curated guide links.
Keep the feed excerpt below the substance rather than as the substance.

---

## Verified working — no action needed

- **Edge SSR for bots is real and correct.** 200s with full rendered content on guides (2,166 w), docs
  (806 w), section pages, profiles, posts — `x-powered-by: DeHub-Edge-SEO`.
- **Canonicals are right, including the hard ones.** Legacy twin `/docs/blog/<slug>` canonicalises to
  `/guides/<slug>`; `/app/*` marketing twins collapse to the bare route; query strings and trailing slashes
  stripped.
- **Unknown URLs return a true 404**, with an explicit guard against the upstream function's soft-404 titles
  minting thin indexable pages.
- **Legacy domain handled.** `dehub.net` 301s cleanly to `dehub.io` with a self-referencing canonical.
- **Mirror hosts defended.** Lovable preview domains flip to `noindex, nofollow` client-side.
- **Entity graph is properly built.** Organization, WebSite and SoftwareApplication with a Wikidata `sameAs`.
- **Caching is deliberate.** Hashed assets immutable for a year, unhashed art given explicit rules, service
  worker and version manifest correctly never cached.
- **Bundle weight is actively policed** by a post-build guardrail that fails the build if the wallet stack
  rejoins the entry chunk.
- **Money-page content is honestly written.** The watch-to-earn ranking page grades competitors on stated
  criteria and names DeHub's own limitations. That is what earns links in this category.

---

## Sequence

| When | Do | Because |
| --- | --- | --- |
| Week 1 | Kill `docs.dhb.gg`; add guide links to homepage SSR; 301 the four duplicate/thin pages. | Config-level, no new content. Stops active leakage, gets the money cluster its first real internal signal. |
| Week 2 | Fix the heading map, emit `FAQPage`, set real `dateModified`, add named authors. | Four small render-pipeline changes that apply to all 122 posts at once. |
| Weeks 3–4 | Split the Cheelee/XCAD/Theta page into three; rewrite the homepage SSR body. | Bet 02 is the fastest conversion win and the content exists in draft form. |
| Month 2 | Gate the posts sitemap on a substance floor. Pitch DeHub into the decentralised-social listicles. | Cuts thin-URL exposure ~90%, buys presence on the head term we cannot rank for directly. |
| Month 2–3 | Rebuild the streaming guide around our own benchmark data. | Bet 03 needs first-hand proof no listicle farm can reproduce. We have it, filed in announcements. |
| Month 3 | Restart money-page cadence at 2–3/month; localise 3–5 languages with hreflang. | 27 days since the last commercial guide. The 109 translations are already paid for. |
