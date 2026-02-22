

# Performance Optimization: Code Splitting, Lazy Hero, Deferred Icons

## What Changes

### 1. Route-Level Code Splitting (App.tsx)
Replace all 23 static page imports with `React.lazy()` and wrap routes in a `Suspense` boundary with a dark-themed fallback. Pages only download when the user navigates to them.

Pages to lazy-load: `Index`, `DeleteAccount`, `CreatorsPage`, `JobsPage`, `SkillPage`, `NotFound`, `TVPage`, `HomePage`, `ExplorePage`, `ProfilePage`, `PlaceholderPage`, `NotificationsPage`, `MessagesPage`, `LeaderboardPage`, `BookmarksPage`, `SettingsPage`, `CommandCentrePage`, `MusicPage`, `PostInfoPage`, `SinglePostPage`, `AssistantPage`, `BuyCoinsPage`, `AgentsPage`, `FeaturesPage`, `FullWalletPage`.

The `Suspense` fallback will be a simple dark screen (matching the app's black background) so there is no white flash.

### 2. Lazy-Load Three.js Hero (Index.tsx)
Change `FuturisticAlienHero` from a static import to `React.lazy()` inside `Index.tsx`. First-time visitors see a brief dark screen before the nebula fades in. Returning users (redirected to `/app`) never download Three.js at all.

### 3. Defer Icon Preloading (use-preload-icons.ts)
Move the 50+ image preloads from module-level (runs immediately on import) to inside the `usePreloadIcons()` hook using `requestIdleCallback` (with `setTimeout` fallback). Icons still preload early, but no longer compete with critical resources during initial page render.

### 4. Vite Manual Chunks (vite.config.ts)
Add `build.rollupOptions.output.manualChunks` to split heavy vendor libraries into separate cached chunks:
- `vendor-web3`: ethers, viem, wagmi, rainbowkit, web3auth, walletconnect
- `vendor-ui`: framer-motion, recharts, radix-ui
- `vendor-three`: three
- `vendor-icons`: lucide-react

## User Experience
- First-time visitors: brief dark screen (under 1 second on decent connection) then the nebula hero fades in as normal
- Returning visitors: skip straight to `/app` without downloading Three.js
- All navigation: pages load on demand with near-instant perceived speed (chunks are small)

## Technical Details

### Files Modified

**`src/App.tsx`**
- Replace 23 static imports with `React.lazy(() => import(...))` calls
- Add `Suspense` wrapper around `Routes` with a dark fallback div
- Keep all non-page imports (providers, contexts, hooks) as static imports

**`src/pages/Index.tsx`**
- Lazy-import `FuturisticAlienHero` with `React.lazy`
- Add local `Suspense` with dark fallback

**`src/hooks/use-preload-icons.ts`**
- Remove the module-level `ALL_ICONS.forEach` block
- Move preloading logic into the `usePreloadIcons()` hook body using `useEffect` + `requestIdleCallback`
- Keep all icon imports and re-exports unchanged

**`vite.config.ts`**
- Add `build.rollupOptions.output.manualChunks` function to split vendor bundles

