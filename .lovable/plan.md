
# Instant Side Panel Tab Switching

## Problem
The `TabbedSidePanel` uses conditional rendering (`activeTab === 'follow' && <WhoToFollow />`) which unmounts and remounts components on every tab switch. Going right (to Who to Follow / Chat) feels slow because those components fully reinitialize -- fetching data, showing skeletons, reconnecting to live chat.

## Solution
Apply the same persistent mount pattern used on the home feed: render all three tab contents simultaneously and toggle visibility with CSS `display: none` / `display: block`.

## Changes

**File: `src/components/app/sidebar/TabbedSidePanel.tsx`**

Replace lines 119-121:
```tsx
{activeTab === 'follow' && <WhoToFollow />}
{activeTab === 'leaderboard' && <SidebarLeaderboard ref={leaderboardRef} />}
{activeTab === 'chat' && <SidebarChat />}
```

With persistent mounting:
```tsx
<div style={{ display: activeTab === 'leaderboard' ? 'block' : 'none' }} className="h-full">
  <SidebarLeaderboard ref={leaderboardRef} />
</div>
<div style={{ display: activeTab === 'follow' ? 'block' : 'none' }} className="h-full">
  <WhoToFollow />
</div>
<div style={{ display: activeTab === 'chat' ? 'block' : 'none' }} className="h-full">
  <SidebarChat />
</div>
```

This ensures:
- First visit to each tab still loads normally (skeleton/spinner)
- Every subsequent visit is instant -- no remount, no refetch
- Chat stays connected, leaderboard keeps its period state, Who to Follow keeps its list
