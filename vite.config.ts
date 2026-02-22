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
        manualChunks(id: string) {
          if (id.includes('three')) return 'vendor-three';
          if (id.includes('ethers') || id.includes('viem') || id.includes('wagmi') ||
              id.includes('rainbowkit') || id.includes('web3auth') ||
              id.includes('walletconnect') || id.includes('@metamask') ||
              id.includes('@coinbase/wallet-sdk') || id.includes('permissionless')) {
            return 'vendor-web3';
          }
          if (id.includes('framer-motion') || id.includes('motion') ||
              id.includes('recharts') || id.includes('@radix-ui')) {
            return 'vendor-ui';
          }
          if (id.includes('lucide-react')) return 'vendor-icons';
        },
      },
    },
  },
  define: {
    global: 'globalThis',
  },
}));
