# First-load audit & speed plan

## What actually happens on first load (timeline)

```text
0ms     HTML arrives. Critical CSS + boot-shell paint instantly. (good)
~50ms   /src/main.tsx fetched + parsed
~100ms  installSupabaseInterceptor + cache migration + i18n + toast-i18n run synchronously
~150ms  React mounts <App/>. Suspense boundary waits on WalletProviders chunk.
~300ms  vendor-react / vendor-radix / vendor-animation chunks parse
~600ms  WalletProviders chunk arrives (~1.5 MB: wagmi + RainbowKit + Web3Auth + viem + ethers)
~1.2s   WagmiProvider/RainbowKitProvider/AuthProvider initialize (heavy sync work, localStorage scan, web3auth init, custom RLS header bootstrap)
~1.4s   AppLayout mounts → useLayoutEffect dispatches `home-feed-boot-ready`, boot shell removed
~1.4s   HomeFeed mounts. Multiple parallel queries fire:
          - unified feed (videos + images + text) up to 3 calls
          - dehub story users
          - dehub live streams (with prefetch)
          - leaderboard carousel
          - categories
          - radio stations
~2.0s   First feed bytes return; React renders cards. Images start loading.
~3-5s   Above-fold images decode + LCP candidate paints. Network/Wallet sidecars finish.
```

So the "5 second" feeling has three distinct cost centers:

1. **Wallet bundle parse + init (~600–1000ms)** — biggest single delay before any real chrome appears. WalletProviders is on the boot critical path even though most of /app doesn't need a connected wallet to render.
2. **Boot shell → real chrome handoff is invisible to the user** because the boot shell is identical-looking to the React skeleton. Visually it appears as one long freeze rather than a fast handoff.
3. **Feed payload + image decode (~1–2s)** — many parallel queries plus large image LCP.

Smaller contributors:
- Synchronous work in main.tsx (i18n init, toast interceptor, supabase interceptor, cache migration in App.tsx top-level IIFE) blocks first React render by ~50–150ms on slow devices.
- `@web3auth/modal` is being eagerly imported inside WalletProviders even though most users don't open the login modal on first paint.
- 4 `<link rel=preconnect>` is fine, but `api.web3auth.io` and `pulse.walletconnect.org` are only needed for connected users — they're competing with `api.dehub.io` (the actual LCP-blocking origin for feed images).

## Plan — make /app feel <1s, fully ready ~2.5s

Phased so each step is shippable on its own.

### Phase 1 — Cut the wallet chunk off the critical path (biggest win)

- Split `WalletProviders` into two layers:
  - `AuthShellProviders` (lightweight): only what the AppLayout chrome needs to render — currently nothing real, since header/sidebar/feed reads work without wagmi.
  - `WalletProviders` (heavy): WagmiProvider + RainbowKitProvider + Web3Auth, mounted **inside** AppLayout via `<Suspense>`, not wrapping the whole router.
- Render the BrowserRouter + AppLayout chrome with **no wallet dependency**. Mount WalletProviders in a Suspense boundary that wraps only the parts that actually consume `useAccount`/`useAuth` (LoginModal, header wallet button, post composer, tipping, etc.).
- Result: the real app chrome (sidebar, tabs, feed column with inline loader) paints as soon as the React core chunk lands (~300–400ms instead of ~1.4s).

### Phase 2 — Make the handoff visible (perceived speed)

- Stop dispatching `home-feed-boot-ready` in `AppLayout` on `useLayoutEffect`. Instead remove the boot shell **the moment React commits the first AppLayout frame**, fading it out over ~120ms with `opacity` so the user sees real chrome appear distinctly from the static shell.
- Replace HomeFeed's "blank center column waiting for query" with a small inline skeleton matching the first 2 feed cards, so even if the feed query takes 1.5s the user sees the chrome reacting instantly.
- Optional: render a tiny "tap any tab" hint or a shimmering nav indicator on mount so the page feels interactive before data arrives.

### Phase 3 — Defer/parallelize startup work

- Move out of the synchronous main.tsx path (run inside `requestIdleCallback` after first paint):
  - `installSupabaseInterceptor`
  - `toast-i18n-interceptor` import
  - `auth-toast-translations` import
  - `migrateStaleCacheOnce` IIFE in App.tsx
- Lazy-import `@web3auth/modal` only when the user actually opens the login flow (currently it's pulled in by AuthProvider). Keep `@web3auth/no-modal` if it's needed for silent session restore; otherwise lazy that too.
- Drop `@rainbow-me/rainbowkit/styles.css` from the wallet chunk's top-level import; inline only the variables we use, or load it lazily when RainbowKit modal opens.

### Phase 4 — Trim the feed-first-paint cost

- Reduce HomeFeed first-render queries: don't fire `categories`, `leaderboard`, `radio stations`, or `live streams` carousels until the main feed query resolves OR the user scrolls past the first card. They're below the LCP and currently eat parallel bandwidth.
- Lower `PAGE_SIZE` for the **first** unified feed call from 20 → 8 so the LCP card paints sooner; subsequent pages keep 20.
- Add `<link rel="preload" as="fetch" crossorigin>` for the unified feed first-page URL in index.html so it starts before JS parses.
- Mark the first feed image as `fetchpriority="high"` (already done in ImageCard but ensure it actually fires on the LCP candidate, not just multi-image carousels).
- Replace `bs-pulse` (CSS opacity animation that runs the whole boot) with a single 600ms intro then static — the constant repaint costs main-thread time on low-end Android.

### Phase 5 — Network-layer wins

- Swap `<link rel=preconnect href=https://pulse.walletconnect.org>` for `dns-prefetch`. Use that preconnect slot for `https://aigxuutjaqsywioxjefr.supabase.co` instead — it's the avatar/asset CDN and is on the LCP path.
- Add `<link rel=modulepreload>` for the React core chunk + AppLayout chunk (they're known names after build) so they download in parallel with main.tsx parsing.
- Enable HTTP cache for the unified feed (short `s-maxage` on the edge function) so warm visits skip the round-trip entirely.

## Expected result

| Metric | Today | After Phase 1+2 | After all phases |
|---|---|---|---|
| First real chrome paint | ~1.4s | ~0.4s | ~0.3s |
| LCP (first feed image) | ~3–5s | ~2–3s | ~1.2–1.8s |
| TTI (interactive) | ~3–5s | ~1.5–2s | ~1.2s |
| Perceived "loading" feeling | one long freeze | snappy chrome → content streams in | near-native |

## Suggested order to ship

1. Phase 2 (perceived speed — ~30 min, no risk).
2. Phase 1 (wallet off critical path — biggest real win, ~half a day, needs careful Suspense boundary placement).
3. Phase 3 + 5 (defer + network — quick wins, ~1 hr each).
4. Phase 4 (feed payload tuning — needs measuring per-route).

## Technical notes

- The current boot-shell-as-overlay design is fine; only the *handoff timing* and *what's on the critical path behind it* are the problem.
- Splitting `WalletProviders` requires auditing every `useAccount`/`useWalletClient`/`useAuth` consumer to confirm none of them sit in the AppLayout chrome path (sidebar nav items, header search, feed cards' read-only render). Tipping/posting/login already live behind modals so they're safe.
- `@web3auth/modal` lazy-loading is straightforward because the only entry point is the LoginModal flow; AuthContext can dynamic-import it on first `openLoginModal()`.
- For the feed preload `<link rel=preload as=fetch>`, the URL must match exactly (including query string and `Accept` header), otherwise the browser issues a second request. Better to expose a stable "first page" endpoint or use `204` warm-up.
