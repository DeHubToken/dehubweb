/**
 * Small pieces shared by the post stats sheet and the Post Info stats panel.
 * Colours come from text-white / white-alpha classes so every theme's remap
 * applies to them the same way it does to the rest of Post Info.
 */

import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
export const fmt = (n: number | null | undefined) => compact.format(Math.max(0, Math.round(n ?? 0)));

export function fmtDuration(seconds: number | null | undefined): string {
  const s = Math.max(0, Math.round(seconds ?? 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}

/** Smallest count worth comparing against the creator's usual post. */
const MIN_COMPARE = 5;

/** "2.3× usual" style comparison against the creator's average post. */
export function VsUsual({ value, usual }: { value: number; usual: number | null | undefined }) {
  const { t } = useTranslation();
  if (usual == null || usual <= 0) return null;
  // Tiny numbers make silly ratios (1 save vs a usual of 0.1 reads as "10x").
  // Only compare once this post or the usual reaches a few, and cap at 10+.
  if (Math.max(value, usual) < MIN_COMPARE) return null;
  const ratio = value / usual;
  if (ratio >= 0.9 && ratio <= 1.1) {
    return <span className="text-[11px] font-semibold text-white/50">{t('postStats.aboutUsual', 'about your usual')}</span>;
  }
  const up = ratio > 1;
  return (
    <span className={cn('text-[11px] font-semibold', up ? 'text-emerald-400' : 'text-red-400')}>
      {up ? '▲' : '▼'} {t('postStats.timesUsual', { defaultValue: '{{ratio}}× usual', ratio: ratio > 10 ? '10+' : ratio >= 9.95 ? '10' : ratio.toFixed(1) })}
    </span>
  );
}

export function StatTile({
  icon,
  label,
  value,
  sub,
  className,
}: {
  icon?: ReactNode;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('bg-white/5 rounded-lg p-3 min-w-0 flex flex-col gap-0.5', className)}>
      <span className="flex items-center gap-1.5 text-xs text-white/60 leading-tight">
        {icon}
        {label}
      </span>
      <span className="text-lg font-bold text-white tabular-nums leading-tight">{value}</span>
      {sub ? <span className="text-[11px] text-white/50 leading-tight">{sub}</span> : null}
    </div>
  );
}

export function StatsSection({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="bg-white/5 rounded-xl p-4 border border-white/10">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="text-sm font-medium text-white/60">{title}</h2>
        {aside ? <span className="text-xs text-white/50 tabular-nums">{aside}</span> : null}
      </div>
      {children}
    </section>
  );
}

/** Two-part bar: first share solid, rest faint, with labels under it. */
export function SplitBar({ left, right, leftLabel, rightLabel, percent = false }: { left: number; right: number; leftLabel: string; rightLabel: string; /** Show each side as a share of the total instead of a count. */ percent?: boolean }) {
  const total = left + right;
  const pct = total ? Math.round((left / total) * 100) : 0;
  // Right side is 100 minus the left so the two always add up to 100.
  const leftText = percent ? (total ? `${pct}%` : '–') : fmt(left);
  const rightText = percent ? (total ? `${100 - pct}%` : '–') : fmt(right);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="h-2 bg-white/10 rounded-full overflow-hidden flex">
        <div className="h-full bg-white rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-xs text-white/60 tabular-nums gap-2">
        <span><b className="text-white">{leftText}</b> {leftLabel}</span>
        <span><b className="text-white">{rightText}</b> {rightLabel}</span>
      </div>
    </div>
  );
}

/**
 * Area chart of one or two series. The first series is drawn solid, the second
 * stacked on top of it and fainter, so members + visitors read as one total.
 */
export function AreaChart({
  series,
  height = 72,
  marker,
  className,
  label,
}: {
  series: number[][];
  height?: number;
  /** Index on the x axis to draw a dashed line at. */
  marker?: number | null;
  className?: string;
  label: string;
}) {
  const gradId = useId();
  const n = Math.max(...series.map((s) => s.length));
  if (!n) return null;
  const stacked = series.map((_, i) =>
    Array.from({ length: n }, (_, x) => series.slice(0, i + 1).reduce((sum, s) => sum + (s[x] ?? 0), 0)),
  );
  const max = Math.max(1, ...stacked[stacked.length - 1]);
  const w = 300;
  const pad = 3;
  const X = (i: number) => (n === 1 ? w / 2 : (i / (n - 1)) * w);
  const Y = (v: number) => pad + (height - pad * 2) * (1 - v / max);
  const line = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
  const area = (top: number[], bottom: number[] | null) =>
    `${line(top)} ${bottom ? bottom.map((v, i) => `L${X(bottom.length - 1 - i).toFixed(1)} ${Y(bottom[bottom.length - 1 - i]).toFixed(1)}`).join(' ') : `L${w} ${height} L0 ${height}`} Z`;
  const peak = stacked[stacked.length - 1].indexOf(max);
  return (
    <svg
      viewBox={`0 0 ${w} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      className={cn('block w-full text-white', className)}
      style={{ height }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.35" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.05" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1="0" x2={w} y1={pad + (height - pad * 2) * f} y2={pad + (height - pad * 2) * f} stroke="currentColor" strokeOpacity="0.1" />
      ))}
      {stacked.map((top, i) => (
        <path key={`a${i}`} d={area(top, i ? stacked[i - 1] : null)} fill={i ? 'currentColor' : `url(#${gradId})`} fillOpacity={i ? 0.12 : 1} />
      ))}
      {stacked.map((top, i) => (
        <path
          key={`l${i}`}
          d={line(top)}
          fill="none"
          stroke="currentColor"
          strokeOpacity={i ? 0.45 : 1}
          strokeWidth="1.8"
          strokeDasharray={i ? '3 3' : undefined}
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
        />
      ))}
      {marker != null && marker >= 0 && marker < n ? (
        <line x1={X(marker)} x2={X(marker)} y1="0" y2={height} stroke="currentColor" strokeOpacity="0.6" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
      ) : null}
      <circle cx={X(peak)} cy={Y(max)} r="3" fill="currentColor" />
    </svg>
  );
}

export function ChartLegend({ items }: { items: { label: string; faint?: boolean }[] }) {
  return (
    <div className="flex gap-3 text-[11px] text-white/60">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5">
          <span className={cn('inline-block w-3 h-0.5 rounded bg-white', it.faint && 'opacity-40')} />
          {it.label}
        </span>
      ))}
    </div>
  );
}
