/**
 * Who saw a post, by the badge they held when they first saw it, as shares of
 * everyone the post reached: a donut and a legend of percentages. Members with
 * no badge and signed-out visitors close the list, so the slices add up to
 * 100%.
 */

import { useTranslation } from 'react-i18next';
import { badgeImage } from '@/lib/staking-badges';
import type { PostStatsBadge } from '@/lib/api/dehub/post-stats';

interface Row {
  key: string;
  name: string;
  image: string | null;
  people: number;
}

// Slice shades, strongest first. White at falling opacity rather than a
// palette, so every theme's remap of text-white reaches the chart the same way
// it reaches the rest of the stats.
const SHADES = [1, 0.72, 0.5, 0.34, 0.22, 0.14];
const shade = (i: number) => SHADES[Math.min(i, SHADES.length - 1)];

/** Whole percentages that still add up to 100 (largest remainder first). */
function percentages(values: number[]): number[] {
  const total = values.reduce((s, v) => s + v, 0);
  if (!total) return values.map(() => 0);
  const raw = values.map((v) => (v / total) * 100);
  const out = raw.map((v) => Math.floor(v));
  let left = 100 - out.reduce((s, v) => s + v, 0);
  const order = raw.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    out[i] += 1;
    left -= 1;
  }
  return out;
}

// A circle of radius 100 / 2π has a circumference of 100, so a slice's dash
// length is simply its share.
const R = 15.9155;

function Donut({ rows, label }: { rows: Row[]; label: string }) {
  const total = rows.reduce((s, r) => s + r.people, 0) || 1;
  const gap = rows.length > 1 ? 1.5 : 0;
  // Dash offset 25 starts the first slice at 12 o'clock.
  let offset = 25;
  return (
    <svg viewBox="0 0 42 42" className="w-24 h-24 shrink-0 text-white" role="img" aria-label={label}>
      <circle cx="21" cy="21" r={R} fill="none" stroke="currentColor" strokeOpacity={0.08} strokeWidth={6} />
      {rows.map((row, i) => {
        const share = (row.people / total) * 100;
        const dash = Math.max(0.01, share - gap);
        const slice = (
          <circle
            key={row.key}
            cx="21"
            cy="21"
            r={R}
            fill="none"
            stroke="currentColor"
            strokeOpacity={shade(i)}
            strokeWidth={6}
            strokeDasharray={`${dash} ${100 - dash}`}
            strokeDashoffset={offset}
          />
        );
        offset -= share;
        return slice;
      })}
    </svg>
  );
}

export function BadgeBreakdown({
  badges,
  signedOut,
  limit,
}: {
  badges: PostStatsBadge[];
  signedOut: number;
  /** Show at most this many badge slices (the rest fold into "Other badges"). */
  limit?: number;
}) {
  const { t } = useTranslation();
  const withBadge = badges.filter((b) => b.tier >= 0);
  const noBadge = badges.find((b) => b.tier < 0)?.people ?? 0;
  const shown = limit ? withBadge.slice(0, limit) : withBadge;
  const folded = limit ? withBadge.slice(limit).reduce((s, b) => s + b.people, 0) : 0;

  const rows: Row[] = [
    ...shown.map((b) => ({ key: `t${b.tier}`, name: b.name ?? '', image: badgeImage(b.name), people: b.people })),
    ...(folded ? [{ key: 'other', name: t('postStats.otherBadges', 'Other badges'), image: null, people: folded }] : []),
    ...(noBadge ? [{ key: 'none', name: t('postStats.noBadge', 'No badge'), image: null, people: noBadge }] : []),
    ...(signedOut ? [{ key: 'out', name: t('postStats.signedOutViewers', 'Signed out'), image: null, people: signedOut }] : []),
  ].filter((r) => r.people > 0);

  if (!rows.length) {
    return <p className="text-xs text-white/50">{t('postStats.noViewersYet', 'Nobody has seen this post yet.')}</p>;
  }

  const pct = percentages(rows.map((r) => r.people));
  const label = t('postStats.whoSawIt', 'Who saw it');

  return (
    <div className="flex items-center gap-4">
      <Donut rows={rows} label={label} />
      <ul className="flex-1 min-w-0 flex flex-col gap-1.5" aria-label={label}>
        {rows.map((r, i) => (
          <li key={r.key} className="flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-white shrink-0" style={{ opacity: shade(i) }} aria-hidden="true" />
            {r.image ? <img src={r.image} alt="" className="w-[18px] h-[18px] object-contain shrink-0" /> : null}
            <span className="flex-1 min-w-0 text-xs text-white truncate">{r.name}</span>
            <span className="text-xs font-semibold text-white tabular-nums">{pct[i]}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
