/**
 * generate-og-cards.mjs — builds the per-route social share cards in public/og/
 *
 * Why these are real files in public/ rather than hosted assets: the previous
 * cards lived at https://dehub.io/__l5e/assets-v1/<uuid>/<name>.png. After the
 * July 2026 Cloudflare migration that URL space no longer exists in dist/, and
 * because the worker sends every /_-prefixed path to the ASSETS binding (which
 * has SPA fallback), all of them answered 200 text/html with the app shell.
 * Facebook, X and the rest got an HTML document where a PNG was promised, so
 * every one of those routes shared with no image at all. Serving the cards out
 * of public/ means they ship with the same deploy as the worker that names them.
 *
 * Card filenames intentionally match the basenames of the old __l5e URLs — the
 * worker rewrites those dead URLs onto /og/<basename>.png, so the two must agree.
 *
 * Run: node scripts/generate-og-cards.mjs
 * Requires playwright (dev-only, not a project dependency):
 *   PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i --no-save playwright
 */

import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const OUT_DIR = path.join(PUBLIC, 'og');
const FONT_CACHE = path.join(ROOT, 'node_modules', '.cache', 'og-fonts');

const WIDTH = 1200;
const HEIGHT = 630;

// Inter, matching the Supabase og-image function's card font so dynamically
// generated post cards and these static route cards read as one family.
const FONT_WEIGHTS = [400, 600, 800];
const FONT_URL = (w) => `https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-${w}-normal.woff2`;

/**
 * One card per route that needs an og:image. `file` is the output basename and
 * must match what CLOUDFLARE_WORKER_SEO.js points og:image at. `icon` and `bg`
 * come from the brand kit in public/brand-kit — the monochrome chrome renders
 * are the same visual language as the default DeHub share image, so the set
 * stays coherent next to posts and profiles that still use the default.
 */
const CARDS = [
  { file: 'features',    eyebrow: 'Features',    headline: 'Everything DeHub does, in one account', sub: 'Social feed, video, music, live TV, AI studio, Web3 jobs and on-chain payments.', icon: 'globe',        bg: 'bg-01' },
  { file: 'pricing',     eyebrow: 'Pricing',     headline: 'Creator Studio, billed monthly',        sub: 'Ultra, Team and Scale — credits for AI image, video, music and poster generation.', icon: 'card',         bg: 'bg-03' },
  { file: 'creator',     eyebrow: 'Creator Studio', headline: 'Every AI tool, one credit balance',  sub: 'Image, video, song, voice and poster generation — publish straight to the feed.', icon: 'sparkles-duo', bg: 'bg-04' },
  { file: 'editor',      eyebrow: 'Video Editor', headline: 'A multi-track timeline in your browser', sub: 'Trim, caption and score your video, then publish it on-chain in one click.', icon: 'camera',       bg: 'bg-05' },
  { file: 'prompt',      eyebrow: 'Prompt',      headline: 'A feed you describe in words',          sub: 'Tell DeHub what you want to see and reshape Home in real time. No opaque algorithm.', icon: 'sparkle',      bg: 'bg-07' },
  // U+2011 non-breaking hyphen: a plain "on-chain" wraps to "on-" / "chain".
  { file: 'work',        eyebrow: 'Work',        headline: 'Get paid to create, on‑chain',     sub: 'Clipping paid per view, comment jobs and custom briefs — escrow and disputes on Base.', icon: 'pickaxe',      bg: 'bg-10' },
  { file: 'affiliate',   eyebrow: 'Affiliate',   headline: 'Earn 20% of everyone you refer',        sub: 'Lifetime revenue share on every creator you bring, plus 5% on second-tier invites.', icon: 'handshake',    bg: 'bg-11' },
  { file: 'premium',     eyebrow: 'DeHub Extra', headline: 'Bigger uploads, priority AI credits',   sub: 'Exclusive drops, badges and creator perks across the whole DeHub network.', icon: 'star',         bg: 'bg-12' },
  { file: 'governance',  eyebrow: 'Governance',  headline: 'Vote the roadmap with DHB',             sub: 'Open a proposal, vote with staked weight, and see every tally settled on-chain.', icon: 'shield',       bg: 'bg-13' },
  { file: 'leaderboard', eyebrow: 'Leaderboard', headline: 'Who is earning on DeHub right now',     sub: 'Top creators and stakers, ranked live across the decentralized creator network.', icon: 'chart-pie',    bg: 'bg-14' },
  { file: 'top-100',     eyebrow: 'Top 100',     headline: 'Live prices for the top 100 cryptos',   sub: 'Market cap, 24h volume and sparkline charts, tracked inside DeHub.', icon: 'coin',         bg: 'bg-16' },
  { file: 'music',       eyebrow: 'Music',       headline: 'Web3 songs, tipped in DHB',             sub: 'Stream community artists, build playlists and tip the tracks you love.', icon: 'mic',          bg: 'bg-18' },
  { file: 'radio',       eyebrow: 'Radio',       headline: '24/7 stations, always on',              sub: 'Continuous Web3 audio curated by the community. Keep it playing while you post.', icon: 'megaphone',    bg: 'bg-19' },
  { file: 'tv',          eyebrow: 'TV',          headline: 'Lean back and watch',                   sub: 'Live streams, shows and continuous video from DeHub creators.', icon: 'play',         bg: 'bg-20' },
  { file: 'glossary',    eyebrow: 'Glossary',    headline: 'Web3, in plain English',                sub: 'Wallets, gas, staking, bridges, escrow and on-chain tipping — written for creators.', icon: 'folder-star',  bg: 'bg-21' },
  { file: 'bridge',      eyebrow: 'Bridge',      headline: 'Move DHB across chains',                sub: 'Bridge between BASE and BNB Chain in a few clicks.', icon: 'chain',        bg: 'bg-22' },
  { file: 'agents',      eyebrow: 'Agents',      headline: 'AI that works while you do not',        sub: 'Automate posting, replies and moderation with DeHub agents.', icon: 'rocket',       bg: 'bg-23' },
  { file: 'assistant',   eyebrow: 'Assistant',   headline: 'Your creator AI, built in',             sub: 'Draft posts, plan content and get answers without ever leaving DeHub.', icon: 'rocket-2',     bg: 'bg-25' },
  { file: 'creators',    eyebrow: 'Creators',    headline: 'Find people worth following',           sub: 'Discover and follow creators across the decentralized social network.', icon: 'thumbs-up',    bg: 'bg-26' },
  { file: 'jobs',        eyebrow: 'Jobs',        headline: 'Build DeHub with us',                   sub: 'Open roles across engineering, design, growth, community and moderation.', icon: 'suitcase',     bg: 'bg-27' },
  // Feed sections. These are rendered at the edge by buildSectionHtml rather
  // than proxied, but they shared the generic logo for the same reason.
  { file: 'explore',     eyebrow: 'Explore',     headline: 'See what is trending on DeHub',        sub: 'Top creators, videos, shorts, music and communities across the network.', icon: 'sparkles-duo', bg: 'bg-30' },
  { file: 'videos',      eyebrow: 'Video Feed',  headline: 'On-chain video, from creators',        sub: 'Every upload minted to its creator wallet, monetized natively.', icon: 'play',         bg: 'bg-35' },
  { file: 'shorts',      eyebrow: 'Shorts',      headline: 'Swipe through short-form',             sub: 'A vertical feed of quick videos from across DeHub.', icon: 'camera',       bg: 'bg-37' },
  {
    file: 'guides-best-decentralized-social-media',
    eyebrow: 'Guide',
    headline: 'The best decentralized social platforms',
    sub: 'Ownership, censorship resistance and monetization compared across DeHub, Farcaster, Lens and Bluesky.',
    icon: 'globe',
    bg: 'bg-28',
  },
];

/** Fetch the Inter weights once and cache them so reruns work offline. */
async function loadFonts() {
  await mkdir(FONT_CACHE, { recursive: true });
  const faces = [];
  for (const weight of FONT_WEIGHTS) {
    const cached = path.join(FONT_CACHE, `inter-${weight}.woff2`);
    if (!existsSync(cached)) {
      const res = await fetch(FONT_URL(weight));
      if (!res.ok) throw new Error(`font ${weight} fetch failed: ${res.status}`);
      await writeFile(cached, Buffer.from(await res.arrayBuffer()));
    }
    const b64 = (await readFile(cached)).toString('base64');
    faces.push(
      `@font-face{font-family:Inter;font-style:normal;font-weight:${weight};` +
      `src:url(data:font/woff2;base64,${b64}) format('woff2')}`
    );
  }
  return faces.join('');
}

const dataUri = async (rel, mime) =>
  `data:${mime};base64,${(await readFile(path.join(PUBLIC, rel))).toString('base64')}`;

/** Inline every asset: the page is rendered from a data: URL with no network. */
async function buildHtml(card, fontCss) {
  const [bg, icon, wordmark] = await Promise.all([
    dataUri(`brand-kit/bg/${card.bg}.jpg`, 'image/jpeg'),
    dataUri(`brand-kit/icons/${card.icon}.png`, 'image/png'),
    dataUri('brand/wordmark-white.png', 'image/png'),
  ]);

  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fontCss}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${WIDTH}px;height:${HEIGHT}px}
body{font-family:Inter,sans-serif;background:#050505;overflow:hidden;
  -webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}
.card{position:relative;width:${WIDTH}px;height:${HEIGHT}px;overflow:hidden}
/* Backgrounds vary in exposure; dim hard and lean on the scrim so every card
   lands on the same text contrast rather than tracking the source image. */
.bg{position:absolute;inset:0;background:url("${bg}") center/cover no-repeat;filter:brightness(.5) saturate(0)}
.scrim{position:absolute;inset:0;background:
  linear-gradient(100deg,rgba(5,5,5,.97) 0%,rgba(5,5,5,.9) 42%,rgba(5,5,5,.45) 68%,rgba(5,5,5,.72) 100%)}
/* Specular lift behind the chrome icon — without it the darker renders sink
   into the background and read as a smudge at feed thumbnail size. */
.halo{position:absolute;right:70px;top:50%;transform:translateY(-50%);width:520px;height:520px;
  background:radial-gradient(circle,rgba(255,255,255,.16) 0%,rgba(255,255,255,.05) 42%,transparent 68%)}
.icon{position:absolute;right:82px;top:50%;transform:translateY(-50%);width:340px;height:340px;
  object-fit:contain;filter:drop-shadow(0 26px 50px rgba(0,0,0,.85))}
/* align-items:flex-start matters — the default stretch overrides the
   wordmark's width:auto and smears it across the full card width. */
.content{position:absolute;inset:0;padding:70px 74px;display:flex;flex-direction:column;
  align-items:flex-start;justify-content:space-between}
.wordmark{height:38px;width:auto;opacity:.97}
.mid{max-width:660px}
.eyebrow{font-size:19px;font-weight:600;letter-spacing:.19em;text-transform:uppercase;
  color:rgba(255,255,255,.5);margin-bottom:20px}
h1{font-size:62px;line-height:1.06;font-weight:800;letter-spacing:-.028em;color:#fff;
  text-shadow:0 2px 26px rgba(0,0,0,.6)}
p{margin-top:22px;font-size:25px;line-height:1.42;font-weight:400;color:rgba(255,255,255,.66);max-width:600px}
.url{font-size:21px;font-weight:600;letter-spacing:.01em;color:rgba(255,255,255,.42)}
</style></head><body><div class="card">
<div class="bg"></div><div class="scrim"></div>
<div class="halo"></div><img class="icon" src="${icon}" alt="">
<div class="content">
  <img class="wordmark" src="${wordmark}" alt="DeHub">
  <div class="mid">
    <div class="eyebrow">${esc(card.eyebrow)}</div>
    <h1>${esc(card.headline)}</h1>
    <p>${esc(card.sub)}</p>
  </div>
  <div class="url">dehub.io</div>
</div></div></body></html>`;
}

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const fontCss = await loadFonts();

  // CHROMIUM_PATH lets the script run against a preinstalled browser whose
  // build number does not match this playwright release (CI images commonly
  // ship one), instead of forcing `npx playwright install`.
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
  );
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  });

  for (const card of CARDS) {
    const html = await buildHtml(card, fontCss);
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(OUT_DIR, `${card.file}.png`), type: 'png' });
    console.log(`  public/og/${card.file}.png`);
  }

  await browser.close();
  console.log(`\n${CARDS.length} cards written to public/og/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
