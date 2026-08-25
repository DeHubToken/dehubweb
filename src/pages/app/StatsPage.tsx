/**
 * Stats Page
 * ==========
 * Live visitor numbers for dehub.io, read from Cloudflare's edge analytics.
 *
 * Two things shape this page. First, it is a native middle-panel page like
 * Glossary or Careers — sticky `[data-feed-nav-outer]` header, `[data-page-bento]`
 * containers, and nothing but the app's own zinc/white classes, so every theme
 * (cosmic, hazy, swarms, lavalamp, winter, war, light, minimal) restyles it for
 * free through the rules already in index.css and styles/war-*.css.
 *
 * Second, it is meant to be checkable. Publishing traffic numbers is worth
 * nothing if readers have to take our word for them, so the page shows where
 * each figure comes from, links to the raw upstream response, and states
 * plainly what that does and does not prove. See ProvenancePanel below.
 */

import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  BarChart3,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
  ShieldCheck,
} from 'lucide-react';

import { SEOHead } from '@/components/SEOHead';
import { GlassFilterRow } from '@/components/app/feeds/GlassFilterRow';
import { useFeedSwallowClip } from '@/hooks/use-feed-swallow-clip';
import {
  useSiteStats,
  type SiteStats,
  type SiteStatsBreakdownDay,
  type SiteStatsResponse,
  type SiteStatsUnavailable,
} from '@/hooks/use-site-stats';
import { cn } from '@/lib/utils';
import { ThemedIcon } from '@/components/app/war/WarHudIcon';

type Range = '24h' | '3d' | '7d' | '30d' | 'all';

/**
 * The five ranges, and the resolution each one can actually be drawn at.
 *
 * Cloudflare refuses any hourly window wider than 3 days on this plan, so 24h
 * and 3d are the only hourly views that can exist — everything longer is daily.
 * `days: null` means all time: every day Cloudflare still retains.
 */
const RANGES: { key: Range; label: string; hourly: boolean; hours?: number; days?: number | null }[] = [
  { key: '24h', label: '24 hours', hourly: true, hours: 24 },
  { key: '3d', label: '3 days', hourly: true, hours: 72 },
  { key: '7d', label: '7 days', hourly: false, days: 7 },
  { key: '30d', label: '30 days', hourly: false, days: 30 },
  { key: 'all', label: 'All time', hourly: false, days: null },
];

function isUnavailable(res: SiteStatsResponse | undefined): res is SiteStatsUnavailable {
  return !!res && res.ok === false;
}

/** Total a set of per-day breakdown rows into range-wide countries/browsers. */
function aggregateBreakdown(rows: SiteStatsBreakdownDay[]) {
  const countries = new Map<string, number>();
  const browsers = new Map<string, number>();
  let requests = 0;
  let cachedRequests = 0;
  let encryptedRequests = 0;
  let threats = 0;

  for (const row of rows) {
    requests += row.requests;
    cachedRequests += row.cachedRequests;
    encryptedRequests += row.encryptedRequests;
    threats += row.threats;
    for (const c of row.countries) countries.set(c.code, (countries.get(c.code) ?? 0) + c.requests);
    for (const b of row.browsers) browsers.set(b.name, (browsers.get(b.name) ?? 0) + b.pageViews);
  }

  return {
    days: rows.length,
    countries: [...countries.entries()]
      .map(([code, requests]) => ({ code, requests }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 10),
    browsers: [...browsers.entries()]
      .map(([name, pageViews]) => ({ name, pageViews }))
      .sort((a, b) => b.pageViews - a.pageViews)
      .slice(0, 6),
    security: { requests, cachedRequests, encryptedRequests, threats },
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatCount(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString();
}

function formatCompact(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 && unit > 0 ? 1 : 0)} ${units[unit]}`;
}

function formatDayLabel(iso: string): string {
  const [, month, day] = iso.split('-');
  return `${parseInt(day, 10)}/${parseInt(month, 10)}`;
}

/**
 * UTC, not local time. Cloudflare buckets days and hours in UTC, so rendering
 * hours in the viewer's zone would put the hourly chart and the "today" figures
 * on different clocks. Every time on this page is labelled UTC for that reason.
 */
function formatHourLabel(iso: string): string {
  return `${String(new Date(iso).getUTCHours()).padStart(2, '0')}:00`;
}

/** Regional-indicator flag for an ISO-3166 alpha-2 code. */
function countryFlag(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return '🏳️';
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/**
 * Intl.DisplayNames is missing on older WebViews, and constructing it at module
 * scope would throw before the page ever renders. Build it lazily and fall back
 * to the raw country code, which is still readable next to its flag.
 */
let countryNames: Intl.DisplayNames | null | undefined;
function countryName(code: string): string {
  if (countryNames === undefined) {
    try {
      countryNames = new Intl.DisplayNames(['en'], { type: 'region' });
    } catch {
      countryNames = null;
    }
  }
  try {
    return countryNames?.of(code) ?? code;
  } catch {
    return code;
  }
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div data-page-bento className="rounded-2xl bg-zinc-900 border border-zinc-800 px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="text-xl sm:text-2xl font-bold text-white mt-0.5 tabular-nums">{value}</div>
      {hint && <div className="text-[11px] text-zinc-500 mt-0.5">{hint}</div>}
    </div>
  );
}

/** A labelled proportion bar. Fill is currentColor so it inverts with the theme. */
function ShareRow({
  leading,
  label,
  value,
  max,
  formatted,
}: {
  leading?: string;
  label: string;
  value: number;
  max: number;
  formatted: string;
}) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-3 py-1.5">
      {leading && <span className="text-base leading-none w-5 shrink-0">{leading}</span>}
      <span className="text-sm text-white truncate flex-1 min-w-0">{label}</span>
      {/* The middle panel is narrow even on desktop, and the bar is decoration
          while the label is the content — so the bar yields space first. */}
      <div className="w-10 sm:w-20 lg:w-24 h-1.5 rounded-full bg-zinc-800/50 overflow-hidden shrink-0">
        <div className="h-full rounded-full bg-current opacity-50" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-zinc-400 tabular-nums w-12 text-right shrink-0">{formatted}</span>
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number; dataKey: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      data-keep-dark
      className="rounded-xl bg-zinc-900 border border-zinc-700 px-3 py-2 shadow-lg"
    >
      <div className="text-[11px] text-zinc-400 mb-1">{label}</div>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="text-xs text-white tabular-nums">
          {formatCount(entry.value)}{' '}
          <span className="text-zinc-400">
            {entry.dataKey === 'visitors' ? 'visitors' : 'page views'}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Where the numbers come from — the part that makes the rest worth reading.
 *
 * Deliberately unglamorous and specific. It names the dataset, shows the exact
 * query that ran, links to Cloudflare's untouched reply, and ends by saying
 * what this evidence cannot do. Overclaiming here would undo the point.
 */
function ProvenancePanel({ stats }: { stats: SiteStats }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const { provenance } = stats;

  const copyQuery = async () => {
    try {
      await navigator.clipboard.writeText(provenance.queries.daily);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked (insecure context / permission) — the query is on
      // screen and selectable either way, so there is nothing to recover.
    }
  };

  return (
    <div data-page-bento className="rounded-2xl bg-zinc-900 border border-zinc-800">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <ShieldCheck className="w-4 h-4 text-zinc-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-white">
            {t('stats.proof.title', 'Where these numbers come from')}
          </div>
          <div className="text-xs text-zinc-500">
            {t('stats.proof.subtitle', 'Measured by Cloudflare, not by this page')}
          </div>
        </div>
        <ChevronDown
          className={cn('w-4 h-4 text-zinc-500 transition-transform shrink-0', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-zinc-800 pt-4">
          <div className="space-y-3 text-sm text-zinc-400 leading-relaxed">
            <p>
              {t(
                'stats.proof.edge',
                'Every request to dehub.io passes through Cloudflare before it reaches our servers. These counts are Cloudflare’s own aggregation of that traffic — the same figures our dashboard shows. They are not collected by a script in your browser, so nothing on this page can inflate them, and blocking trackers does not change them.',
              )}
            </p>
            <p>
              {t(
                'stats.proof.live',
                'The page reads them live. Loading /stats calls our endpoint, which queries Cloudflare’s Analytics API at that moment and caches the answer for 60 seconds.',
              )}
            </p>
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
            {[
              { k: t('stats.proof.source', 'Source'), v: provenance.source },
              { k: t('stats.proof.datasets', 'Datasets'), v: provenance.datasets.join(', ') },
              { k: t('stats.proof.zone', 'Zone'), v: provenance.zoneTag },
              { k: t('stats.proof.ray', 'Cloudflare ray ID'), v: provenance.cfRay.daily ?? '—' },
              { k: t('stats.proof.fetched', 'Fetched at'), v: new Date(stats.fetchedAt).toUTCString() },
            ].map((row) => (
              <div key={row.k} className="flex gap-2 min-w-0">
                <dt className="text-zinc-500 shrink-0">{row.k}</dt>
                <dd className="text-zinc-300 font-mono truncate">{row.v}</dd>
              </div>
            ))}
          </dl>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-zinc-500">
                {t('stats.proof.query', 'The exact query behind the chart')}
              </span>
              <button
                type="button"
                onClick={copyQuery}
                className="flex items-center gap-1 text-xs text-zinc-400 hover:text-white transition-colors"
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copied ? t('stats.proof.copied', 'Copied') : t('stats.proof.copy', 'Copy')}
              </button>
            </div>
            <pre
              data-keep-dark
              className="text-[11px] leading-relaxed text-zinc-300 bg-zinc-950 border border-zinc-800 rounded-xl p-3 overflow-x-auto"
            >
              <code>{provenance.queries.daily}</code>
            </pre>
          </div>

          <div className="flex flex-wrap gap-2">
            <a
              href="/api/stats"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-zinc-300 hover:text-white bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-800 rounded-lg px-3 py-1.5 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              {t('stats.proof.openEndpoint', 'Open /api/stats')}
            </a>
            <a
              href={provenance.rawUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-zinc-300 hover:text-white bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-800 rounded-lg px-3 py-1.5 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              {t('stats.proof.openRaw', 'Cloudflare’s untouched reply')}
            </a>
          </div>

          <p className="text-xs text-zinc-500 leading-relaxed border-t border-zinc-800 pt-3">
            {t(
              'stats.proof.limits',
              'What this shows, and what it does not: you can see that the figures come from Cloudflare’s aggregation rather than from our application code, and that the query published here is the one that runs. It is not trustless — we hold the API token, and Cloudflare offers no public read of a zone’s analytics. Anyone with their own Cloudflare zone can run the identical query against it and confirm the shape.',
            )}
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function StatsPage() {
  const { t } = useTranslation();
  const [range, setRange] = useState<Range>('30d');
  const contentRef = useRef<HTMLDivElement>(null);
  useFeedSwallowClip(contentRef, '[data-feed-nav-outer] > [data-page-bento]');

  const { data, isLoading, isError, isFetching } = useSiteStats();
  const stats: SiteStats | null = data && data.ok ? data : null;
  const unavailable: SiteStatsUnavailable | null = isUnavailable(data) ? data : null;

  /**
   * Everything on the page below the header derives from the selected range,
   * sliced out of the single payload the endpoint returns. No refetch on
   * switch, and every figure comes from the rows the chart is drawing.
   */
  const view = useMemo(() => {
    if (!stats) return null;
    const cfg = RANGES.find((r) => r.key === range) ?? RANGES[0];
    const sum = <T,>(rows: T[], pick: (row: T) => number) => rows.reduce((a, r) => a + pick(r), 0);

    if (cfg.hourly) {
      const buckets = stats.hourly.slice(-(cfg.hours ?? 24));
      const peak = buckets.length
        ? buckets.reduce((best, h) => (h.visitors > best.visitors ? h : best))
        : null;
      // Breakdown rows are daily, so an hourly range takes the days it spans.
      const breakdownRows = stats.breakdown.slice(-Math.max(1, Math.ceil((cfg.hours ?? 24) / 24)));
      return {
        hourly: true,
        buckets: buckets.length,
        chart: buckets.map((h) => ({ label: formatHourLabel(h.hour), visitors: h.visitors, pageViews: h.pageViews })),
        pageViews: sum(buckets, (h) => h.pageViews),
        requests: sum(buckets, (h) => h.requests),
        bytes: null as number | null,
        peakLabel: 'hour',
        peakValue: peak?.visitors ?? null,
        peakWhen: peak ? formatHourLabel(peak.hour) : null,
        breakdown: aggregateBreakdown(breakdownRows),
      };
    }

    const days = cfg.days == null ? stats.daily : stats.daily.slice(-cfg.days);
    const peak = days.length ? days.reduce((best, d) => (d.visitors > best.visitors ? d : best)) : null;
    const breakdownRows = cfg.days == null ? stats.breakdown : stats.breakdown.slice(-cfg.days);
    return {
      hourly: false,
      buckets: days.length,
      chart: days.map((d) => ({ label: formatDayLabel(d.date), visitors: d.visitors, pageViews: d.pageViews })),
      pageViews: sum(days, (d) => d.pageViews),
      requests: sum(days, (d) => d.requests),
      bytes: sum(days, (d) => d.bytes) as number | null,
      peakLabel: 'day',
      peakValue: peak?.visitors ?? null,
      peakWhen: peak ? formatDayLabel(peak.date) : null,
      breakdown: aggregateBreakdown(breakdownRows),
    };
  }, [stats, range]);

  const maxCountry = view?.breakdown.countries[0]?.requests ?? 0;
  const maxBrowser = view?.breakdown.browsers[0]?.pageViews ?? 0;
  const cachedPct = view && view.breakdown.security.requests > 0
    ? Math.round((view.breakdown.security.cachedRequests / view.breakdown.security.requests) * 100)
    : null;
  const today = stats?.daily.length ? stats.daily[stats.daily.length - 1] : null;

  return (
    <div className="min-h-screen">
      <SEOHead
        title="Live Site Stats — DeHub Visitors in Real Time"
        description="Live visitor numbers for dehub.io, measured at Cloudflare's edge and published with the query behind them. Page views, unique visitors, countries and traffic over the last 30 days."
        url="https://dehub.io/stats"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'Dataset',
          name: 'DeHub live site statistics',
          description: 'Edge-measured visitor statistics for dehub.io, published live from Cloudflare analytics.',
          url: 'https://dehub.io/stats',
          creator: { '@type': 'Organization', name: 'DeHub' },
          isAccessibleForFree: true,
        }}
      />
      <h1 className="sr-only">DeHub Live Site Statistics — Visitors, Page Views and Traffic</h1>

      {/* Sticky header — same shape as every other bento page, so the glass,
          war-HUD and paper themes pick it up without page-specific rules. */}
      <div
        data-feed-nav-outer
        className="sticky top-11 lg:top-0 z-50 bg-black px-2 pt-1 pb-0 sm:px-3 sm:pt-1 sm:pb-0 lg:pt-2"
      >
        <div data-page-bento className="bg-zinc-900 rounded-2xl px-4 py-3 space-y-3">
          <div className="flex items-center gap-3">
            <ThemedIcon icon="stats" alt="" className="w-10 h-10 shrink-0 object-contain" />
            <div className="min-w-0 flex-1">
              <h1 className="text-[1.1rem] sm:text-[1.32rem] font-bold text-white">
                {t('stats.title', 'Stats')}
              </h1>
              <p className="text-xs text-zinc-500 truncate">
                {t('stats.subtitle', 'Real-time open source intel')}
              </p>
            </div>
            {stats && (
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="relative flex h-2 w-2">
                  <span
                    className={cn(
                      'absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75',
                      isFetching && 'animate-ping',
                    )}
                  />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                </span>
                <span className="text-[11px] text-zinc-400">{t('stats.live', 'Live')}</span>
              </div>
            )}
          </div>

          <GlassFilterRow
            items={RANGES.map((r) => ({ key: r.key, label: t(`stats.range.${r.key}`, r.label) }))}
            activeKey={range}
            onSelect={(key) => setRange(key as Range)}
          />
        </div>
      </div>

      <div ref={contentRef} className="px-2 sm:px-3 pt-3 pb-6 space-y-3">
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
          </div>
        )}

        {!isLoading && (isError || unavailable) && (
          <div data-page-bento className="rounded-2xl bg-zinc-900 border border-zinc-800 px-4 py-8 text-center">
            <Activity className="w-6 h-6 text-zinc-600 mx-auto mb-3" />
            <p className="text-sm text-white font-medium">
              {t('stats.unavailable.title', 'Stats are not available right now')}
            </p>
            <p className="text-xs text-zinc-500 mt-1 max-w-md mx-auto leading-relaxed">
              {unavailable?.reason === 'unconfigured'
                ? t(
                    'stats.unavailable.unconfigured',
                    'The analytics endpoint has not been given its Cloudflare API token yet. Nothing is shown rather than a made-up number.',
                  )
                : t(
                    'stats.unavailable.error',
                    'We could not reach Cloudflare’s analytics API. Rather than show a stale or invented figure, this page shows nothing until the live read succeeds.',
                  )}
            </p>
          </div>
        )}

        {stats && view && (
          <>
            {/* Headline numbers */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
              <StatTile
                label={t('stats.tile.visitorsToday', 'Visitors today')}
                value={formatCount(today?.visitors)}
                hint={t('stats.tile.soFarToday', 'so far today, UTC')}
              />
              {/* The busiest single bucket, never a summed "visitors in range"
                  figure: adding overlapping unique counts would count one person
                  once per bucket they appeared in. This is a number Cloudflare
                  actually measures. */}
              <StatTile
                label={
                  view.hourly
                    ? t('stats.tile.peakHour', 'Busiest hour')
                    : t('stats.tile.peakDay', 'Busiest day')
                }
                value={formatCount(view.peakValue)}
                hint={
                  view.peakWhen
                    ? view.hourly
                      ? t('stats.tile.peakAtHour', 'at {{when}} UTC', { when: view.peakWhen })
                      : t('stats.tile.peakOnDay', 'on {{when}}', { when: view.peakWhen })
                    : t('stats.tile.inRange', 'in this range')
                }
              />
              {/* Labelled with the buckets actually returned, not the ones
                  requested — the zone is younger than the longer windows, so a
                  hardcoded span would overstate what these totals cover. */}
              <StatTile
                label={t('stats.tile.pageViews', 'Page views')}
                value={formatCompact(view.pageViews)}
                hint={
                  view.hourly
                    ? t('stats.tile.overHours', 'over {{count}}h', { count: view.buckets })
                    : view.buckets === 1
                      ? t('stats.tile.overDay', 'over 1 day')
                      : t('stats.tile.overDays', 'over {{count}} days', { count: view.buckets })
                }
              />
              <StatTile
                label={view.bytes == null ? t('stats.tile.requestsLabel', 'Requests') : t('stats.tile.served', 'Served')}
                value={view.bytes == null ? formatCompact(view.requests) : formatBytes(view.bytes)}
                hint={t('stats.tile.requests', '{{requests}} requests', {
                  requests: formatCompact(view.requests),
                })}
              />
            </div>

            {/* Traffic over time. Fill and stroke are currentColor, inherited
                from the wrapper's text-white — which light and minimal remap to
                ink, so the chart follows the theme with no per-theme branch. */}
            <div data-page-bento className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4">
              <div className="flex items-baseline justify-between mb-3">
                <span className="text-sm font-semibold text-white">
                  {view.hourly
                    ? t('stats.chart.hourly', 'Visitors per hour')
                    : t('stats.chart.daily', 'Visitors per day')}
                </span>
                <span className="text-[11px] text-zinc-500">
                  {view.hourly
                    ? t('stats.chart.hourlyHint', '{{count}} hourly buckets, UTC', { count: view.buckets })
                    : t('stats.chart.dailyHint', 'unique visitors per day')}
                </span>
              </div>

              {view.chart.length === 0 ? (
                <div className="flex items-center justify-center h-44 text-zinc-500 text-sm">
                  {t('stats.chart.empty', 'No data for this window yet')}
                </div>
              ) : (
                <div className="text-white">
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={view.chart} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
                      <defs>
                        <linearGradient id="statsVisitorsFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="currentColor" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="currentColor" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.45 }}
                        tickLine={false}
                        axisLine={false}
                        interval="preserveStartEnd"
                        minTickGap={16}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.45 }}
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                        width={44}
                        tickFormatter={(v: number) => formatCompact(v)}
                      />
                      <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'currentColor', strokeOpacity: 0.15 }} />
                      <Area
                        type="monotone"
                        dataKey="visitors"
                        stroke="currentColor"
                        strokeWidth={2}
                        fill="url(#statsVisitorsFill)"
                        dot={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Where people are, and what they browse with */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 sm:gap-3">
              <div data-page-bento className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Globe className="w-4 h-4 text-zinc-400" />
                  <span className="text-sm font-semibold text-white">
                    {t('stats.countries.title', 'Top countries')}
                  </span>
                  <span className="text-[11px] text-zinc-500 ml-auto">
                    {view.breakdown.days === 1
                      ? t('stats.countries.windowDay', 'last 24 hours')
                      : t('stats.countries.window', 'last {{days}} days', { days: view.breakdown.days })}
                  </span>
                </div>
                <div className="text-white">
                  {view.breakdown.countries.map((c) => (
                    <ShareRow
                      key={c.code}
                      leading={countryFlag(c.code)}
                      label={countryName(c.code)}
                      value={c.requests}
                      max={maxCountry}
                      formatted={formatCompact(c.requests)}
                    />
                  ))}
                </div>
              </div>

              <div data-page-bento className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Activity className="w-4 h-4 text-zinc-400" />
                  <span className="text-sm font-semibold text-white">
                    {t('stats.browsers.title', 'Browsers')}
                  </span>
                  <span className="text-[11px] text-zinc-500 ml-auto">
                    {t('stats.browsers.window', 'by page views')}
                  </span>
                </div>
                <div className="text-white">
                  {view.breakdown.browsers.map((b) => (
                    <ShareRow
                      key={b.name}
                      label={b.name}
                      value={b.pageViews}
                      max={maxBrowser}
                      formatted={formatCompact(b.pageViews)}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Edge health */}
            <div data-page-bento className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4">
              <div className="flex items-center gap-2 mb-3">
                <ShieldCheck className="w-4 h-4 text-zinc-400" />
                <span className="text-sm font-semibold text-white">
                  {t('stats.edge.title', 'At the edge')}
                </span>
                <span className="text-[11px] text-zinc-500 ml-auto">
                  {view.breakdown.days === 1
                    ? t('stats.edge.windowDay', 'last 24 hours')
                    : t('stats.edge.window', 'last {{days}} days', { days: view.breakdown.days })}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  {
                    label: t('stats.edge.cached', 'Served from cache'),
                    value: cachedPct != null ? `${cachedPct}%` : '—',
                  },
                  {
                    label: t('stats.edge.encrypted', 'Encrypted'),
                    value: formatCompact(view.breakdown.security.encryptedRequests),
                  },
                  {
                    label: t('stats.edge.threats', 'Threats blocked'),
                    value: formatCount(view.breakdown.security.threats),
                  },
                ].map((item) => (
                  <div key={item.label} className="text-center">
                    <div className="text-base font-bold text-white tabular-nums">{item.value}</div>
                    <div className="text-[10px] text-zinc-500 leading-tight mt-0.5">{item.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <ProvenancePanel stats={stats} />

            {/* Reading the numbers honestly matters as much as publishing them:
                "unique visitors" is an IP count, and the series only starts the
                day dehub.io moved onto Cloudflare. Say both, in the open. */}
            <div data-page-bento className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4">
              <div className="text-sm font-semibold text-white mb-2">
                {t('stats.definitions.title', 'What the numbers mean')}
              </div>
              <ul className="space-y-2 text-xs text-zinc-400 leading-relaxed">
                <li>
                  <span className="text-zinc-300">{t('stats.definitions.visitorsTerm', 'Visitors')}</span>{' '}
                  {t(
                    'stats.definitions.visitors',
                    '— unique IP addresses Cloudflare saw that day. Close to people, but not identical: an office on one connection counts once, and a phone moving between wifi and mobile data counts twice.',
                  )}
                </li>
                <li>
                  <span className="text-zinc-300">{t('stats.definitions.pageViewsTerm', 'Page views')}</span>{' '}
                  {t(
                    'stats.definitions.pageViews',
                    '— requests Cloudflare classifies as page loads, rather than images, scripts or API calls.',
                  )}
                </li>
                <li>
                  <span className="text-zinc-300">{t('stats.definitions.botsTerm', 'Bots are included')}</span>{' '}
                  {t(
                    'stats.definitions.bots',
                    '— these are raw edge counts, so crawlers, uptime monitors and scripted clients are in them. You can see them yourself in the browser breakdown above, where entries like “Curl” and “Unknown” are automated traffic rather than people. Filtering bots out needs a paid Cloudflare tier we do not run, and quietly subtracting an estimate would make the numbers less checkable, not more.',
                  )}
                </li>
                <li>
                  <span className="text-zinc-300">{t('stats.definitions.totalTerm', 'Range totals')}</span>{' '}
                  {t(
                    'stats.definitions.total',
                    '— page views and requests add up across the range. Visitor counts deliberately are not summed into a headline "total visitors", because someone here on Monday and Tuesday would be counted twice.',
                  )}
                </li>
                <li>
                  <span className="text-zinc-300">{t('stats.definitions.peakTerm', 'Busiest hour / day')}</span>{' '}
                  {t(
                    'stats.definitions.peak',
                    '— the highest unique count in any single bucket of the range, for the same reason: it is a figure Cloudflare actually measures, rather than one built by adding counts that overlap.',
                  )}
                </li>
                <li>
                  <span className="text-zinc-300">{t('stats.definitions.resolutionTerm', 'Hourly stops at 3 days')}</span>{' '}
                  {t(
                    'stats.definitions.resolution',
                    '— that is Cloudflare\u2019s limit on this plan, not a choice: it refuses any hourly query wider than three days. The 24-hour and 3-day views are hourly; 7 days and longer are daily, and there is no way to draw an hourly all-time chart.',
                  )}
                </li>
                <li>
                  <span className="text-zinc-300">{t('stats.definitions.breakdownTerm', 'Countries and browsers')}</span>{' '}
                  {t(
                    'stats.definitions.breakdown',
                    '— these follow the range you pick, but only back {{max}} days, which is as far as the per-day breakdown is kept. On longer ranges the chart covers more time than the country list does.',
                    { max: stats.window.breakdownMaxDays },
                  )}
                </li>
                {stats.window.firstDay && (
                  <li>
                    <span className="text-zinc-300">{t('stats.definitions.startTerm', 'History')}</span>{' '}
                    {t(
                      'stats.definitions.start',
                      '— "all time" means every day Cloudflare still retains, which today is {{days}} days starting {{date}}, the day dehub.io moved onto Cloudflare. There is no earlier edge data to show, and older days drop off as Cloudflare ages them out.',
                      { date: stats.window.firstDay, days: stats.window.dailyDays },
                    )}
                  </li>
                )}
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
