# Why the page feels slow now

In the previous fix we made the HTML boot shell (the first skeleton outside `#root`) stay on screen as a full-screen overlay (`z-index: 9999`) until the **entire home feed query finishes** and dispatches `home-feed-boot-ready`.

Sequence today:
1. HTML boot shell paints instantly (fast).
2. React mounts under it — invisible (overlay covers everything).
3. WalletProviders chunk loads, auth runs, HomeFeed mounts, query fires, network round-trip completes.
4. Only then does HomeFeed dispatch `home-feed-boot-ready` and `main.tsx` removes the boot shell.

So the user stares at the static HTML skeleton for the full duration of the feed network request. There is no second stage anymore, but the single stage is now as long as the slowest dependency (feed API). That's why it "takes so long".

Previously the boot shell disappeared as soon as React mounted, and the React skeleton handled the rest — visually faster even though total time was similar.

## Plan

Drop the boot shell when **React chrome is on screen**, not when feed data resolves. The chrome (header + sidebar + feed column) is already styled identically, so the handoff is invisible and the user immediately sees the real app shell with the feed column showing its own inline loading state.

### Changes

1. **`src/components/app/AppLayout.tsx`** — On mount, dispatch `home-feed-boot-ready` (or call the boot-shell remover directly) inside a `useLayoutEffect` so the boot shell is removed the moment the real layout has painted.
2. **`src/components/app/feeds/HomeFeed.tsx`** — Remove the late dispatch tied to `isLoadingState`. The feed's own skeleton inside the center column is enough; the page chrome around it is already real.
3. **`src/main.tsx`** — Keep the listener + 10s safety timeout as-is.
4. **Verify** — Hard reload `/app`, watch sequence: HTML shell → real AppLayout chrome with inline feed loader → feed content. No long blank wait, no second-stage skeleton (chrome is real, not a skeleton).

### Files involved
- `src/components/app/AppLayout.tsx`
- `src/components/app/feeds/HomeFeed.tsx`
- `src/main.tsx` (no change expected)
