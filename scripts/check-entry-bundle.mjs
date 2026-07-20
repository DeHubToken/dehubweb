/**
 * Post-build guardrail: the wallet stack must never ride in the eager bundle.
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
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const ASSETS = join(DIST, 'assets');
const ENTRY_SIZE_CEILING = 2.0 * 1024 * 1024; // raw bytes, pre-gzip

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

for (const m of html.matchAll(/<link[^>]*rel="modulepreload"[^>]*href="\/(assets\/[^"]+\.js)"/g)) {
  eagerFiles.add(m[1]);
}

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

if (failed) {
  process.exit(1);
}

console.log(
  `[check-entry-bundle] OK — entry ${entryFile} ${(entrySize / 1048576).toFixed(2)} MB raw, ` +
  `wallet chunk ${walletChunk} present, ${eagerFiles.size} eager files clean.`
);
