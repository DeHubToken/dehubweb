
# Instant Tab Swiping on Home Feed

## Problem
When swiping between tabs (Videos, Images, Shorts, etc.), there's a noticeable delay before content appears. This happens because:

1. **Feed components unmount/remount on every tab switch** -- the `renderFeed()` function uses a `switch` statement that destroys and recreates the entire feed component each time
2. Even with cached data in the background, remounting a component causes React Query's loading states to flash, hooks to re-initialize, and skeleton loaders to briefly appear
3. The gesture lock duration (400ms) adds perceived sluggishness after a swipe

## Solution: Keep All Feeds Mounted (Hidden)

Instead of conditionally rendering one feed at a time, render ALL feeds simultaneously but use CSS `display: none` / `display: block` to hide/show them. This means:

- Feeds stay alive in the DOM after first visit -- no remounting, no re-initialization
- Cached data renders instantly because the component never unmounted
- First visit to a tab still skeleton-loads as expected (cold cache), but every subsequent visit is instant

## Technical Changes

### 1. Replace `renderFeed()` with persistent mount pattern (`src/pages/app/HomePage.tsx`)

Replace the `switch`-based `renderFeed()` with a series of divs that are always mounted but hidden via CSS:

```tsx
{/* All feeds mounted, only active one visible */}
<div style={{ display: activeTab === 'home' ? 'block' : 'none' }}>
  <HomeFeed ... />
</div>
<div style={{ display: activeTab === 'videos' ? 'block' : 'none' }}>
  <VideosFeed ... />
</div>
<div style={{ display: activeTab === 'images' ? 'block' : 'none' }}>
  <ImagesFeed ... />
</div>
{/* ... same for all other tabs */}
```

Using `display: none` ensures hidden feeds consume zero layout space and minimal render cost while preserving their React state tree.

### 2. Reduce gesture lock duration

Lower `GESTURE_LOCK_DURATION` from 400ms to 300ms -- just enough to absorb trackpad inertia without adding perceived delay.

### 3. Ensure skeleton shows only on true first load

The feeds already use `isLoading` / `isApiLoading` checks which only fire when there's no cached data. With the persistent mount pattern, these will only trigger once (first visit), then the component stays alive with its data.

## Impact
- Tab switches after first visit become truly instant (0ms content swap)
- First-time visits still show appropriate skeleton loading
- No additional memory concerns -- hidden feeds hold the same data that's already in React Query cache
- Swipe gesture feels snappier with reduced lock duration
