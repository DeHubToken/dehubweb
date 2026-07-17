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
