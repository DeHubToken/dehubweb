

## Problem

SEO audit tools report missing H1 tags because:
1. **`index.html`** has no `<h1>` — tools that don't execute JavaScript see an empty shell
2. The **Netlify edge function** bot list doesn't include common SEO audit tool user agents
3. React-rendered `<h1>` tags use `sr-only` (visually hidden) — some tools flag these as missing

## Plan

### 1. Add a static H1 to `index.html`

Add a visible `<h1>` inside `<body>` that displays before React hydrates, then gets replaced by the React app:

```html
<div id="root">
  <h1 style="...">DeHub — Decentralised Social Media, Censorship Resistant & Freedom of Speech</h1>
</div>
```

This sits inside the `#root` div so React overwrites it on mount. Audit tools that don't run JS will still see it.

### 2. Make React H1 tags visible (not sr-only)

Change all `<h1 className="sr-only">` across ~25+ pages to be **visually styled** instead of hidden. Use a small, subtle style that fits the existing design — e.g., a compact header bar or integrate the H1 text into existing page headers. This ensures even JavaScript-executing audit tools see visible H1 content.

### 3. Expand bot user agent list in Netlify edge function

Add common SEO audit tool agents to the `BOT_AGENTS` array:
- `semrushbot`, `ahrefsbot`, `screaming frog`, `mj12bot`, `dotbot`, `rogerbot`, `sitebulb`, `seobilitybot`, `auditsbot`

This ensures audit crawlers get the full SSR HTML with visible H1 from the edge function.

### Files to modify
- `index.html` — add static H1 inside `#root`
- `netlify/edge-functions/ssr-seo.js` — expand bot agent list
- ~25 page files in `src/pages/` — change `sr-only` H1s to visible styling

