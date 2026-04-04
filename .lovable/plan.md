

## Improving Lighthouse Performance Scores

**Current scores**: Mobile 41, Desktop 8 (!) — LCP 30.4s, FCP 10.0s, TBT 600ms

### Root Causes (in order of impact)

**1. Massive JS bundle — no code splitting for Web3 libraries**
The app eagerly loads 16+ heavy Web3 packages (wagmi, viem, ethers, RainbowKit, Web3Auth, WalletConnect, Agora RTC, buffer/process polyfills) in the critical path. These are all required at the root `<App>` level via `WagmiProvider` and `RainbowKitProvider`. This is the #1 cause of the 30s LCP and 10s FCP.

**2. Render-blocking polyfill in `<head>`**
`index.html` has a synchronous `<script type="module">` in `<head>` that imports `buffer` and `process` — this blocks parsing of the entire page.

**3. 26+ 3D icon images preloaded at module-load time**
`use-preload-icons.ts` imports 26+ PNG images as static imports, meaning they're all bundled into the main chunk or trigger network requests immediately.

**4. Render-blocking Google Fonts**
`index.css` line 1: `@import url('https://fonts.googleapis.com/css2?family=Exo:...')` — CSS `@import` is render-blocking.

**5. No Vite build optimization**
`vite.config.ts` has zero `build` configuration — no `rollupOptions.output.manualChunks`, meaning Vite puts everything into one or two giant chunks.

---

### Proposed Fixes

#### Fix 1: Add manual chunk splitting in Vite (HIGH IMPACT)
Split Web3, Agora, and UI libraries into separate chunks so the main app JS is much smaller.

**File: `vite.config.ts`** — Add `build.rollupOptions.output.manualChunks`:
- `vendor-web3`: wagmi, viem, ethers, @web3auth/*, @walletconnect/*, @rainbow-me/rainbowkit, @coinbase/wallet-sdk, buffer, process
- `vendor-agora`: agora-rtc-sdk-ng
- `vendor-ui`: recharts, framer-motion, @radix-ui/*
- `vendor-react`: react, react-dom, react-router-dom

#### Fix 2: Make Google Fonts non-render-blocking (HIGH IMPACT)
**File: `index.html`** — Move the font from CSS `@import` to a `<link>` tag with `rel="preload"` + font-display swap, or use `&display=swap` and `<link rel="preconnect">`.

**File: `src/index.css`** — Remove line 1 (`@import url(...)`)

#### Fix 3: Defer the buffer/process polyfill (MEDIUM IMPACT)
**File: `index.html`** — Move the `<script type="module">` block from `<head>` to just before `</body>`, or add `async` behavior. These polyfills are only needed when Web3 code runs, not at parse time.

#### Fix 4: Lazy-load 3D icon preloading (MEDIUM IMPACT)
**File: `src/hooks/use-preload-icons.ts`** — Convert static `import` statements to dynamic `new Image().src = url` calls inside a `requestIdleCallback` after first paint, so they don't block the main bundle.

#### Fix 5: Lazy-load Web3 providers (HIGHEST IMPACT but most complex)
**File: `src/App.tsx`** — Wrap `WagmiProvider` + `RainbowKitProvider` in a lazy-loaded component that only mounts when the user needs wallet functionality (e.g., clicks "Connect Wallet"). Until then, render the app without the Web3 provider tree. This is the most impactful change but requires ensuring auth/wallet checks degrade gracefully when providers aren't yet loaded.

---

### Recommended Implementation Order

| Priority | Fix | Est. Impact on LCP | Complexity |
|----------|-----|-------------------|------------|
| 1 | Vite manual chunks | -5-10s | Low |
| 2 | Non-blocking Google Font | -2-4s | Low |
| 3 | Defer buffer/process polyfill | -1-2s | Low |
| 4 | Lazy icon preloading | -1s TBT | Low |
| 5 | Lazy Web3 providers | -10-15s | High |

Fixes 1-4 are low-risk, quick wins. Fix 5 is the nuclear option that would bring scores into green but requires careful refactoring of the auth flow.

### What this won't fix
- The scores are measured on the **Lovable preview domain** which has inherent latency. Production (`dehub.io`) with a CDN will score better.
- Server-side rendering (SSR) would help FCP dramatically but isn't available in this stack.

