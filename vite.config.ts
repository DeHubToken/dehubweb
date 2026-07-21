import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";
import { execSync } from "child_process";

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
        // data-prefetch-only: tells scripts/check-entry-bundle.mjs these are
        // fetch-ahead hints, NOT eagerly-executed modules — the wallet code
        // still only runs when the React.lazy boundary resolves.
        const links = [...seen]
          .map((f) => `<link rel="modulepreload" data-prefetch-only fetchpriority="low" crossorigin href="/${f}">`)
          .join('\n    ');
        console.log(`[preload-wallet-chunk] injected ${seen.size} modulepreload links`);
        return html.replace('</head>', `  ${links}\n  </head>`);
      },
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
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
    preloadWalletChunkPlugin(),
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
