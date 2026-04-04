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
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Web3 / wallet libraries — largest chunk
          if (
            id.includes('node_modules/wagmi') ||
            id.includes('node_modules/viem') ||
            id.includes('node_modules/ethers') ||
            id.includes('node_modules/@web3auth') ||
            id.includes('node_modules/@walletconnect') ||
            id.includes('node_modules/@rainbow-me') ||
            id.includes('node_modules/@coinbase/wallet-sdk') ||
            id.includes('node_modules/@metamask') ||
            id.includes('node_modules/@wagmi') ||
            id.includes('node_modules/@toruslabs') ||
            id.includes('node_modules/permissionless') ||
            id.includes('node_modules/buffer') ||
            id.includes('node_modules/process')
          ) {
            return 'vendor-web3';
          }
          // Agora RTC
          if (id.includes('node_modules/agora-rtc-sdk-ng')) {
            return 'vendor-agora';
          }
          // Heavy UI libraries
          if (
            id.includes('node_modules/recharts') ||
            id.includes('node_modules/framer-motion') ||
            id.includes('node_modules/motion') ||
            id.includes('node_modules/@radix-ui') ||
            id.includes('node_modules/three')
          ) {
            return 'vendor-ui';
          }
          // React core
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom') ||
            id.includes('node_modules/react-router')
          ) {
            return 'vendor-react';
          }
        },
      },
    },
  },
  define: {
    global: 'globalThis',
  },
}));
