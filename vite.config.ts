import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";
import { execSync, execFileSync } from "child_process";
import { writeFileSync } from "fs";

/**
 * Serve /war-game/* with `Access-Control-Allow-Origin: *` in dev and preview.
 *
 * Production gets this from public/_headers, which Cloudflare applies but which
 * Vite's own servers ignore entirely. Without it the game is broken locally in
 * a way that looks nothing like a CORS problem: it runs in a sandboxed iframe
 * with no allow-same-origin, so the frame has an opaque origin, and its
 * `<script type="module">` entry is fetched in CORS mode with `Origin: null`.
 * No matching header comes back, the browser drops the script with no error,
 * and all anyone sees is a black canvas.
 *
 * Keeping dev and production in step here matters more than usual, because the
 * failure is completely silent and cost several rounds of misdiagnosis.
 */
function warGameCorsPlugin() {
  const cors = (req: any, res: any, next: any) => {
    if (req.url && req.url.startsWith("/war-game/")) {
      res.setHeader("Access-Control-Allow-Origin", "*");
    }
    next();
  };
  return {
    name: "war-game-cors",
    configureServer(server: any) {
      server.middlewares.use(cors);
    },
    configurePreviewServer(server: any) {
      server.middlewares.use(cors);
    },
  };
}

function blogManifestPlugin() {
  return {
    name: 'blog-manifest',
    buildStart() {
      try {
        execSync('node scripts/generate-blog-manifest.mjs', { stdio: 'inherit' });
      } catch (e) {
        console.warn('[blog-manifest] generation failed', e);
      }
    },
  };
}

const GITHUB_REPO = 'https://github.com/DeHubToken/dehubweb';

/** `git ...` as a plain string, or '' if git isn't there / this isn't a checkout. */
function git(args: string[]): string {
  try {
    // execFileSync, not execSync: no shell means no `%s` mangling in the
    // --format arguments on Windows, where cmd.exe owns the percent sign.
    return execFileSync('git', args, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

/**
 * Identity of the build, as shown by the "new version available" toast.
 *
 * GitHub writes a merge commit's SUBJECT as "Merge pull request #N from
 * owner/branch" and puts the PR *title* in the body — so the readable sentence
 * and the PR number live in different places, and the subject alone would
 * surface branch names to users. Squash merges do the opposite and put both in
 * the subject as "title (#N)". Both shapes are handled; anything else (a direct
 * commit) keeps its subject and links to the commit instead of a PR.
 *
 * Everything here degrades rather than throws. With no sha the toast disables
 * itself (see lib/version-check), which is the right failure: silence beats a
 * refresh prompt that can never be satisfied.
 */
function resolveBuildVersion() {
  // Cloudflare Workers Builds exports the sha; git covers local builds and any
  // CI that doesn't. The message always needs git — if only the env var is
  // available the toast still works, just without its one-line summary.
  const sha =
    process.env.WORKERS_CI_COMMIT_SHA ||
    process.env.CF_PAGES_COMMIT_SHA ||
    git(['rev-parse', 'HEAD']);
  const subject = git(['log', '-1', '--format=%s']);
  const body = git(['log', '-1', '--format=%b']);

  const merge = subject.match(/^Merge pull request #(\d+)/);
  const squash = subject.match(/\(#(\d+)\)\s*$/);
  const pr = (merge && merge[1]) || (squash && squash[1]) || '';

  // Merge commits: first line of the body is the PR title. Fall back to the
  // subject if a merge was made with an empty body.
  const headline = merge ? body.split('\n')[0].trim() || subject : subject;

  // The headline is whatever the commit/PR title happened to be, unfiltered —
  // and tooling that commits straight to main (Lovable's agent, notably) has
  // shipped titles like "Lovable update" before. Those are internal, not for
  // an end user's toast, so a match blanks the note rather than surfacing it;
  // NewVersionToast already falls back to its generic copy when note is ''.
  const clean = !/lovable/i.test(headline);

  return {
    id: sha.slice(0, 8),
    // One line in a toast — long commit subjects get clipped rather than
    // pushing the Refresh button off a phone screen.
    note: clean ? (headline.length > 140 ? `${headline.slice(0, 139)}…` : headline) : '',
    url: pr ? `${GITHUB_REPO}/pull/${pr}` : sha ? `${GITHUB_REPO}/commit/${sha}` : '',
  };
}

/**
 * Publishes the build identity two ways so a running tab can tell it has gone
 * stale: compiled into the bundle as `__BUILD_ID__`, and written to
 * dist/version.json for the client to poll.
 *
 * Only the ID is compiled in. The summary and link belong to whatever build is
 * live NOW, not to the one the user happens to be running, so they are read
 * from the fetched manifest instead.
 */
function buildVersionPlugin() {
  const version = resolveBuildVersion();
  return {
    name: 'build-version',
    config() {
      if (!version.id) {
        console.warn('[build-version] no commit sha resolved — the update toast stays off for this build');
      }
      return { define: { __BUILD_ID__: JSON.stringify(version.id) } };
    },
    // writeBundle, not emitFile: dist/ is already on disk here, and this keeps
    // the plugin off Rollup's typed context (see scripts/check-entry-bundle.mjs
    // for the same post-build-on-disk approach).
    writeBundle(options: { dir?: string }) {
      const outDir = options.dir || path.resolve(__dirname, 'dist');
      writeFileSync(path.join(outDir, 'version.json'), JSON.stringify(version));
      console.log(`[build-version] ${version.id || '(none)'} — ${version.note || '(no message)'}`);
    },
  };
}


/**
 * Every route's first paint waits on the WalletProviders chunk (it wraps the
 * whole tree), but its download only starts after the entry bundle has
 * downloaded AND executed (the module-eval dynamic-import kick in App.tsx).
 * Inject modulepreload links for the wallet chunk graph into index.html so the
 * browser fetches it in parallel with the entry instead of serialized after
 * it. modulepreload fetches at script priority by default — fetchpriority=low
 * is set explicitly so the wallet graph yields bandwidth to the entry bundle
 * and LCP media on slow connections.
 */
function preloadWalletChunkPlugin() {
  return {
    name: 'preload-wallet-chunk',
    apply: 'build' as const,
    transformIndexHtml: {
      order: 'post' as const,
      handler(html: string, ctx: { bundle?: Record<string, any> }) {
        const bundle = ctx.bundle;
        if (!bundle) return html;
        const seen = new Set<string>();
        const collect = (fileName: string) => {
          if (seen.has(fileName)) return;
          seen.add(fileName);
          const chunk = bundle[fileName];
          if (chunk && chunk.type === 'chunk') {
            for (const imp of chunk.imports as string[]) collect(imp);
          }
        };
        for (const [fileName, chunk] of Object.entries(bundle)) {
          if (
            (chunk as any).type === 'chunk' &&
            (chunk as any).facadeModuleId?.replace(/\\/g, '/').endsWith('components/app/WalletProviders.tsx')
          ) {
            collect(fileName);
          }
        }
        if (seen.size === 0) {
          console.warn('[preload-wallet-chunk] WalletProviders chunk not found — no links injected');
          return html;
        }

        // One part of this graph is worth fetching ahead for nobody: RainbowKit’s
        // connect-modal UI. `WalletButton.Custom` in LoginModal is RainbowKit’s only
        // consumer in the whole of src — there is no useConnectModal, ConnectButton
        // or useAccountModal anywhere — so the modal itself never opens, yet Rollup
        // merges its shared UI into whichever chunk the graph reaches first. That is
        // the en_US locale entry, which builds at 266 KB against 37-65 KB for every
        // other locale. The difference is the modal. Dropping the link costs one
        // fetch on the first sign-in and saves every visitor 266 KB of boot
        // bandwidth.
        //
        // Matched on the emitted filename, which is the one part of this observable
        // from outside the build: RainbowKit names its locale chunks after the
        // locale, and only the trailing hash moves on an upgrade
        // (en_US-Y4ZOVFV4-<vite hash>). Nothing in src builds to a chunk named for
        // a locale, so the pattern is ours alone.
        //
        // #413 matched on chunk.modules instead — every module in the chunk having
        // come from RainbowKit — and skipped nothing at all on the real build, which
        // is only visible in a Cloudflare build log nobody here can read. A rule
        // that can be checked against the deployed HTML is worth more than a
        // tidier one that cannot.
        const LOCALE_CHUNK = /^assets\/[a-z]{2}_[A-Za-z0-9]{2,4}-/;
        const RAINBOWKIT_UI_MIN_BYTES = 100 * 1024;
        const isRainbowKitUiChunk = (fileName: string) => {
          if (!LOCALE_CHUNK.test(fileName)) return false;
          const chunk = bundle[fileName];
          if (!chunk || chunk.type !== 'chunk') return false;
          // Size floor so a genuinely small locale chunk keeps its prefetch — it is
          // the merged modal UI that makes this one 266 KB, not the strings.
          return (chunk.code?.length ?? 0) >= RAINBOWKIT_UI_MIN_BYTES;
        };

        const skipped = [...seen].filter(isRainbowKitUiChunk);
        for (const f of skipped) seen.delete(f);
        if (skipped.length === 0) {
          // Not fatal — the day the barrel import in lib/wagmi.ts stops dragging the
          // modal in, this correctly matches nothing. Worth saying out loud either
          // way, so a silent return of the 266 KB is visible in the build log.
          console.warn('[preload-wallet-chunk] no RainbowKit UI chunk matched — check whether the connect-modal UI is being prefetched again');
        }
        // data-prefetch-only: tells scripts/check-entry-bundle.mjs these are
        // fetch-ahead hints, NOT eagerly-executed modules — the wallet code
        // still only runs when the React.lazy boundary resolves.
        const links = [...seen]
          .map((f) => `<link rel="modulepreload" data-prefetch-only fetchpriority="low" crossorigin href="/${f}">`)
          .join('\n    ');
        console.log(
          `[preload-wallet-chunk] injected ${seen.size} modulepreload links` +
            (skipped.length ? `, skipped ${skipped.length} RainbowKit UI chunk(s): ${skipped.join(', ')}` : ''),
        );
        return html.replace('</head>', `  ${links}\n  </head>`);
      },
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    // 8080 stays the default so nothing about the normal `npm run dev` changes.
    // Honouring PORT lets a second checkout run alongside the first instead of
    // failing on a busy port.
    port: Number(process.env.PORT) || 8080,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
      "Cross-Origin-Embedder-Policy": "unsafe-none",
    },
  },
  preview: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
      "Cross-Origin-Embedder-Policy": "unsafe-none",
    },
  },
  plugins: [
    react(),
    blogManifestPlugin(),
    buildVersionPlugin(),
    preloadWalletChunkPlugin(),
    warGameCorsPlugin(),
    mcpPlugin(),
    mode === "development" && componentTagger(),
  ].filter(Boolean),

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: [
      "@web3auth/modal",
      "@web3auth/no-modal",
      "@web3auth/account-abstraction-provider",
      "@toruslabs/base-controllers",
      "@toruslabs/ethereum-controllers",
      "permissionless",
      "viem",
      "@wagmi/core",
      "@wagmi/connectors",
      "@metamask/sdk",
      "@rainbow-me/rainbowkit",
    ],
  },
  define: {
    global: 'globalThis',
  },
  // Strip console.log/debug from production output (289 call sites, several in
  // per-message/per-scroll hot paths like dm-socket + AuthProvider). `pure`
  // drops only the listed calls — console.warn/error survive for diagnostics.
  esbuild: mode === 'development' ? undefined : {
    pure: ['console.log', 'console.debug'],
  },
  build: {
    target: ['es2020', 'safari14'],
    // Gzip-size reporting over this many chunks exhausted the build heap.
    reportCompressedSize: false,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Three.js — only used by lazy theme backgrounds / landing hero.
          // Match ONLY the npm package: a broader '/three/' also catches
          // src/lib/three/*, whose shared imports (e.g. lib/theme-color.ts)
          // Rollup then hoists INTO vendor-three — making the entry chunk
          // statically depend on it and download three.js at boot.
          if (id.includes('node_modules/three/') || id.includes('/three@')) {
            return 'vendor-three';
          }
          // NOTE: wagmi / viem / rainbowkit / web3auth are NOT manually chunked here.
          // They have deep internal circular deps that Rollup cannot safely reorder when
          // forced into a named chunk — results in TDZ "Cannot access before initialization".
          // WalletProviders React.lazy() already moves them into an async chunk naturally.
          // Framer Motion — animation library
          if (id.includes('framer-motion')) {
            return 'vendor-animation';
          }
          // Radix UI primitives — UI components
          if (id.includes('@radix-ui/')) {
            return 'vendor-radix';
          }
          // React core
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/react-router')
          ) {
            return 'vendor-react';
          }
          // Supabase client
          if (id.includes('@supabase/')) {
            return 'vendor-supabase';
          }
        },
      },
    },
  },
}));
