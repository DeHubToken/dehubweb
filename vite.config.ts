import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

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
    target: 'esnext',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Three.js — only used on landing page hero (lazy loaded)
          if (id.includes('/three/') || id.includes('/three@')) {
            return 'vendor-three';
          }
          // All wallet/auth libs in ONE chunk — circular deps between wagmi/rainbowkit/web3auth
          // require them to stay together; splitting causes TDZ (before initialization) errors
          if (
            id.includes('@web3auth/') ||
            id.includes('@toruslabs/') ||
            id.includes('/wagmi/') ||
            id.includes('/viem/') ||
            id.includes('@wagmi/') ||
            id.includes('@rainbow-me/rainbowkit') ||
            id.includes('@metamask/sdk')
          ) {
            return 'vendor-wallet';
          }
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
