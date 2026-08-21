/**
 * Post-build guardrail: the wallet stack must never ride in the eager bundle.
 *
 * Sibling guard: scripts/boot-path-report.mjs, run in CI. This file catches a
 * heavy dependency arriving all at once; that one catches the boot path
 * drifting upward a few modules at a time, which no ceiling here can see.
 *
 * The WalletProviders React.lazy split silently regressed once (July 2026)
 * when App.tsx gained static imports of AuthContext/LoginModal, folding
 * wagmi + RainbowKit + Web3Auth (~1.5 MB gz) into the entry chunk and
 * tripling time-to-first-paint. This script fails the build if it happens
 * again.
 *
 * Checks, against dist/index.html's entry script and modulepreload'd chunks:
 *   1. No wallet-library-internal marker strings present.
 *      (Markers are strings that exist only inside the libraries — app code
 *      legitimately contains e.g. the literal 'Web3Auth' in localStorage
 *      migration keys, so package-name greps would false-positive.)
 *   2. A separate WalletProviders-*.js chunk exists in dist/assets.
 *   3. Entry chunk stays under a raw-size ceiling (a wallet merge roughly
 *      triples it, so a generous ceiling still catches the failure mode).
 *   4. The whole boot path stays within budget, reported in three buckets.
 *
 * On (4): the marker checks above answer "did the wallet stack collapse INTO
 * the entry chunk", which is the catastrophic failure. They say nothing about
 * how big the boot path is when the split is working correctly — and measuring
 * dehub.io in Aug 2026 found a signed-out phone downloading 4,753 KB of JS, of
 * which 2,277 KB was wallet stack it never executed. 871 KB of that is
 * WalletProviders' own transitive closure, which DOES block first paint,
 * because WalletProviders wraps the whole app tree.
 *
 * So the three buckets are reported separately every build:
 *
 *   entry           the entry chunk — app code, executes immediately
 *   eager preloads  Vite's own modulepreloads — the entry's static import
 *                   graph, so also executed before first paint
 *   wallet closure  the data-prefetch-only set injected by
 *                   preloadWalletChunkPlugin. Downloaded at boot alongside
 *                   everything else (fetchpriority=low does NOT defer it), and
 *                   executed as soon as the React.lazy boundary resolves.
 *
 * Printing these makes bundle regressions legible in the build log instead of
 * only showing up as "the app feels slower on a phone" months later.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const ASSETS = join(DIST, 'assets');
const ENTRY_SIZE_CEILING = 2.0 * 1024 * 1024; // raw bytes, pre-gzip

// Boot-path ceilings, raw bytes. Set roughly 20-25% above the Aug 2026
// measurement so ordinary feature work doesn't trip them, while a new heavy
// dependency joining the boot path does. Lower them when a split lands —
// a ceiling that no longer tracks reality stops being a guardrail.
//
//   measured: entry 1,551 KB + eager preloads 604 KB = 2,155 KB executed
//   measured: wallet closure 871 KB
const EAGER_TOTAL_CEILING = 2.7 * 1024 * 1024;
const WALLET_CLOSURE_CEILING = 1.1 * 1024 * 1024;

const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;

// Strings that appear only inside wagmi / web3auth / walletconnect builds.
const WALLET_MARKERS = [
  'api.web3auth.io',
  'relay.walletconnect',
  'WagmiProviderNotFoundError',
  'explorer-api.walletconnect',
];

// Other heavy libraries that have each leaked into the eager graph before
// (hls.js via the hooks barrel in July 2026; recharts via always-mounted
// overlays). Markers are library-internal strings, not package names.
const HEAVY_MARKERS = [
  // NOT 'fragLoadingTimeOut' — app code passes that as an Hls config key, so
  // it appears in eager chunks legitimately. 'hlsMediaAttached' is an event
  // name string that exists only inside the hls.js build itself.
  { lib: 'hls.js', marker: 'hlsMediaAttached' },
  { lib: 'recharts', marker: 'recharts_measurement_span' },
  // three.js leaked in via WarLogo (Aug 2026): the War hologram mark was
  // statically imported by DesktopSidebar + MobileHeader. Both only *render*
  // it under the War theme, so it read as correctly gated — but a static
  // import is a bundling decision, and it put vendor-three in the entry's
  // eager modulepreload set for every visitor on every theme. Marker is a
  // renderer error string; app code says `new THREE.WebGLRenderer(...)`,
  // which compiles to a property access, never this literal.
  { lib: 'three', marker: 'THREE.WebGLRenderer: WebGL' },
];

const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const eagerFiles = new Set();

const entryMatch = html.match(/<script[^>]*type="module"[^>]*src="\/(assets\/[^"]+\.js)"/);
if (!entryMatch) {
  console.error('[check-entry-bundle] Could not find entry <script> in dist/index.html');
  process.exit(1);
}
const entryFile = entryMatch[1];
eagerFiles.add(entryFile);

// Vite's own modulepreload links mirror the entry's static import graph, so
// they're eagerly EXECUTED and must be scanned. Links tagged data-prefetch-only
// (injected by preloadWalletChunkPlugin for the wallet graph) are fetch-ahead
// hints for a React.lazy chunk that only executes on demand — they are NOT
// scanned for markers, or the wallet chunk would (correctly!) match its own.
// They are still measured below: not executing at boot doesn't make them free,
// it just makes them bandwidth instead of main-thread time.
const prefetchOnlyFiles = new Set();
for (const m of html.matchAll(/<link[^>]*rel="modulepreload"[^>]*>/g)) {
  const href = m[0].match(/href="\/(assets\/[^"]+\.js)"/);
  if (!href) continue;
  if (m[0].includes('data-prefetch-only')) prefetchOnlyFiles.add(href[1]);
  else eagerFiles.add(href[1]);
}

// The wallet closure shares chunks with the entry graph (vendor-react, the
// entry itself, ...) because WalletProviders imports app code too. Those are
// already counted as eager, so subtract them — otherwise the wallet number
// double-counts the entry chunk and reads ~1.5 MB heavier than it is.
for (const f of eagerFiles) prefetchOnlyFiles.delete(f);

let failed = false;

for (const rel of eagerFiles) {
  const path = join(DIST, rel.replace('assets/', 'assets' + '/'));
  const code = readFileSync(path, 'utf8');
  const hits = WALLET_MARKERS.filter(marker => code.includes(marker));
  if (hits.length > 0) {
    console.error(
      `[check-entry-bundle] FAIL: ${rel} contains wallet-library code (markers: ${hits.join(', ')}).\n` +
      `  The wallet stack must stay behind the WalletProviders React.lazy boundary.\n` +
      `  Likely cause: a static import chain from App.tsx/main.tsx now reaches\n` +
      `  wagmi/web3auth/rainbowkit (check src/contexts/AuthContext.tsx stays type-only).`
    );
    failed = true;
  }
  const heavyHits = HEAVY_MARKERS.filter(({ marker }) => code.includes(marker));
  if (heavyHits.length > 0) {
    console.error(
      `[check-entry-bundle] FAIL: ${rel} contains ${heavyHits.map(h => h.lib).join(', ')} ` +
      `(markers: ${heavyHits.map(h => h.marker).join(', ')}).\n` +
      `  These libraries must load via dynamic import()/React.lazy only.\n` +
      `  Likely cause: a new static import, or an eager module importing the\n` +
      `  '@/hooks' barrel (which re-exports the TV player).`
    );
    failed = true;
  }
}

const walletChunk = readdirSync(ASSETS).find(f => /^WalletProviders-.*\.js$/.test(f));
if (!walletChunk) {
  console.error(
    '[check-entry-bundle] FAIL: no WalletProviders-*.js chunk in dist/assets — the code split collapsed.'
  );
  failed = true;
}

const entrySize = readFileSync(join(DIST, entryFile)).byteLength;
if (entrySize > ENTRY_SIZE_CEILING) {
  console.error(
    `[check-entry-bundle] FAIL: entry chunk ${entryFile} is ${(entrySize / 1048576).toFixed(1)} MB raw ` +
    `(ceiling ${(ENTRY_SIZE_CEILING / 1048576).toFixed(1)} MB). Something heavy joined the eager graph.`
  );
  failed = true;
}

// ── Boot-path budget ────────────────────────────────────────────────────
// Sizes are raw (pre-compression) because the number that matters on a phone
// is what the main thread has to parse and compile, not what crosses the wire.
const sizeOf = (rel) => readFileSync(join(DIST, rel)).byteLength;
const sum = (files) => [...files].reduce((total, f) => total + sizeOf(f), 0);

const eagerTotal = sum(eagerFiles);
const walletClosure = sum(prefetchOnlyFiles);

// Biggest single contributors, so a regression names itself instead of leaving
// someone to diff two dist/ directories by hand.
const biggest = [...eagerFiles, ...prefetchOnlyFiles]
  .map((f) => ({ f, bytes: sizeOf(f), wallet: prefetchOnlyFiles.has(f) }))
  .sort((a, b) => b.bytes - a.bytes)
  .slice(0, 5);

console.log(
  `[check-entry-bundle] boot JS (raw): ${kb(eagerTotal + walletClosure)} total\n` +
  `    entry chunk     ${kb(entrySize)}  ${entryFile}\n` +
  `    eager preloads  ${kb(eagerTotal - entrySize)}  ${eagerFiles.size - 1} chunks, executed before first paint\n` +
  `    wallet closure  ${kb(walletClosure)}  ${prefetchOnlyFiles.size} chunks, fetched at boot, executed on demand\n` +
  `    largest: ${biggest.map((b) => `${b.f.replace('assets/', '')} ${kb(b.bytes)}${b.wallet ? ' (wallet)' : ''}`).join(', ')}`
);

if (eagerTotal > EAGER_TOTAL_CEILING) {
  console.error(
    `[check-entry-bundle] FAIL: eager boot JS is ${kb(eagerTotal)} raw ` +
    `(ceiling ${kb(EAGER_TOTAL_CEILING)}). Every byte here is parsed before first paint.`
  );
  failed = true;
}

if (walletClosure > WALLET_CLOSURE_CEILING) {
  console.error(
    `[check-entry-bundle] FAIL: WalletProviders' closure is ${kb(walletClosure)} raw ` +
    `(ceiling ${kb(WALLET_CLOSURE_CEILING)}). It wraps the whole app tree, so this ` +
    `blocks first paint — check what new static import reached it.`
  );
  failed = true;
}

if (failed) {
  process.exit(1);
}

console.log(
  `[check-entry-bundle] OK — entry ${entryFile} ${(entrySize / 1048576).toFixed(2)} MB raw, ` +
  `wallet chunk ${walletChunk} present, ${eagerFiles.size} eager files clean.`
);
