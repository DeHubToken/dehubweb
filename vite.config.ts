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
      "react",
      "react-dom",
      "scheduler",
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
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Web3Auth + AA — heavy, only needed for auth
          if (id.includes('@web3auth') || id.includes('@toruslabs') || id.includes('permissionless')) {
            return 'vendor-web3auth';
          }
          // WalletConnect / Reown / Coinbase — large packages
          if (id.includes('@walletconnect') || id.includes('@reown') || id.includes('@metamask') || id.includes('@coinbase')) {
            return 'vendor-walletconnect';
          }
          // ethers — blockchain utils, loaded with web3auth
          if (id.includes('/ethers/') || id.includes('node_modules/ethers')) {
            return 'vendor-ethers';
          }
          // HLS.js — video streaming, only used on TV/video pages
          if (id.includes('hls.js') || id.includes('node_modules/hls')) {
            return 'vendor-hls';
          }
          // Socket.io — real-time, lazy where possible
          if (id.includes('socket.io') || id.includes('engine.io')) {
            return 'vendor-socket';
          }
          // Wagmi + RainbowKit + viem — wallet connections
          if (id.includes('wagmi') || id.includes('@wagmi') || id.includes('@rainbow-me') || id.includes('viem')) {
            return 'vendor-wagmi';
          }
          // THREE.js — only used on landing page
          if (id.includes('/three/')) {
            return 'vendor-three';
          }
          // Recharts — only used in command-centre
          if (id.includes('recharts') || id.includes('d3-')) {
            return 'vendor-charts';
          }
          // Agora — only used in audio spaces
          if (id.includes('agora')) {
            return 'vendor-agora';
          }
          // Radix UI components
          if (id.includes('@radix-ui')) {
            return 'vendor-radix';
          }
          // General node_modules (React/scheduler/react-dom left here — Vite handles them correctly)
          if (id.includes('node_modules')) {
            return 'vendor-misc';
          }
        },
      },
    },
  },
}));
