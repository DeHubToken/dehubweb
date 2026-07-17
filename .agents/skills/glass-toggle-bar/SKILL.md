---
name: glass-toggle-bar
description: Apply the home-feed liquid-glass segmented toggle/tab bar (GlassFilterRow + GlassIndicator) to any row of toggle buttons — filter chips, tab switchers, sort selectors — so the sliding glass pill animation and instant-cached positioning work consistently.
type: design
---

# Glass Toggle Bar

Reusable segmented control that pairs a scrollable row of pill buttons with a floating liquid-glass indicator that springs between the active item. This is the exact system powering the home page nav / feed filter row.

## When to use

- Any horizontal row of mutually-exclusive toggle buttons (tabs, filter chips, sort switches, view modes).
- You want the active pill to slide with a soft spring instead of hard swapping styles.
- The row may scroll horizontally on small screens.

Do NOT use for:
- Multi-select chips (use the standard chip pattern).
- Vertical nav — this is horizontal only.

## Component

Import from the shared UI barrel:

```tsx
import { GlassToggleBar } from '@/components/ui/glass-toggle-bar';

const TABS = [
  { key: 'all',    label: 'All' },
  { key: 'videos', label: 'Videos' },
  { key: 'images', label: 'Images' },
] as const;

type TabKey = typeof TABS[number]['key'];

const [tab, setTab] = useState<TabKey>('all');

<GlassToggleBar<TabKey>
  items={TABS}
  activeKey={tab}
  onSelect={setTab}
/>
```

The underlying implementation lives at:
- `src/components/app/feeds/GlassFilterRow.tsx` — scrollable row + measurement
- `src/components/app/feeds/GlassIndicator.tsx` — the glass pill (position-cached, forwardRef)

`GlassToggleBar` is a re-export of `GlassFilterRow` — same props.

## Props

| Prop              | Type                                 | Notes |
| ----------------- | ------------------------------------ | ----- |
| `items`           | `{ key: T; label: ReactNode }[]`     | Any string-key union. Labels can be nodes (icons + text). |
| `activeKey`       | `T`                                  | Controlled. |
| `onSelect`        | `(key: T) => void`                   | Fired on click. |
| `className`       | `string?`                            | Wrapper. |
| `buttonClassName` | `string?`                            | Extra classes on each button (e.g. `min-w-[80px]`). |
| `borderRadius`    | `string?` (default `'0.5rem'`)       | Matches the pill radius. Use `'9999px'` for fully round. |

## Rules

- Keep button labels short — the row is scrollable but pills shouldn't wrap.
- Don't wrap the bar in a container with `overflow: hidden` on the Y axis — the glass pill's spring bounce needs vertical overflow visible (the component handles X clipping internally).
- Never restyle the active state with a solid color — the glass indicator IS the active state. If you need a different accent, adjust `GLASS_CLASSES` in `GlassIndicator.tsx` globally, don't fork per-usage.
- Respect the project's no-blue rule: keep the indicator white/opacity based.
- For persistent tab bars that survive route changes, pass a stable `layoutKey` down to `GlassIndicator` via a custom wrapper — the cache renders the pill instantly on remount.

## Button radius pairing

Per the project's button-rounding standard: this is a small/functional control, so the default `rounded-lg` / `borderRadius: '0.5rem'` is correct. Only bump to `xl` if the surrounding surface uses larger radii.
