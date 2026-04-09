

## Add "Assets" Button to Leaderboard Category Tabs

### What
Add an "Assets" tab/button alongside the existing category tabs (Holdings, Spent, Earned, Followers, Likes, Subscribers) in the leaderboard page. When clicked, it navigates to `/app/top-100` instead of filtering the leaderboard.

### How

**File: `src/pages/app/LeaderboardPage.tsx`**

1. Import `TrendingUp` (or `BarChart3`) icon from lucide-react for the Assets button.
2. After the `GlassFilterRow` (or appended to its items), add an "Assets" item that, when selected, navigates to `/app/top-100` via `navigate('/app/top-100')` instead of setting a category.
3. The cleanest approach: append a special entry to the `items` array passed to `GlassFilterRow` with key `'assets'`. In the `onSelect` handler, intercept the `'assets'` key to call `navigate('/app/top-100')` and skip the normal category state change.

### Technical Detail

In the `onSelect` callback (~line 337):
```ts
onSelect={(key) => {
  if (key === 'assets') {
    navigate('/app/top-100');
    return;
  }
  setCategory(key as CategoryType);
  setSortDirection('desc');
}}
```

In the `items` array (~line 335), append:
```ts
...categories.map(...),
{ key: 'assets', label: <span className="flex items-center gap-1.5"><TrendingUp className="w-4 h-4" />Assets</span> }
```

This keeps it visually consistent with the other tabs — one line change to the items array and a small guard in the handler.

