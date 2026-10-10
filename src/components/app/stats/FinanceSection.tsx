/**
 * Revenue and costs
 * =================
 * The money half of the Stats page: what DeHub takes in — things people buy in
 * the app, and the fee kept on payments between people — against what it
 * spends to run, in USD, over the same range as every other chart here.
 *
 * Like the community half it renders nothing when its endpoint is down, and a
 * source the endpoint could not read is named as missing rather than drawn as
 * zero. The definitions card publishes what each line counts and what it
 * leaves out, for the same reason the traffic half publishes its query.
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDownRight, ArrowUpRight, ChevronDown, ListChecks, Wallet } from 'lucide-react';

import {
  FINANCE_STATS_ENDPOINT,
  useFinanceStats,
  type FinanceDay,
  type FinanceSource,
  type FinanceStats,
} from '@/hooks/use-finance-stats';
import { GroupHeading, ShareRow, StatTile } from '@/components/app/stats/StatsPieces';
import { RevenueLedger } from '@/components/app/stats/RevenueLedger';
import { cn } from '@/lib/utils';

type Range = '24h' | '3d' | '7d' | '30d' | '1y' | 'all';

/** Money is recorded per UTC day, so the two hourly tabs become today and the last three days. */
function windowDays(range: Range): number | null {
  if (range === 'all') return null;
  if (range === '1y') return 365;
  if (range === '30d') return 30;
  if (range === '7d') return 7;
  if (range === '3d') return 3;
  return 1;
}

/** Past two months of days the chart switches to one point per month. */
const MONTHLY_AFTER_DAYS = 62;

const REVENUE_GROUPS = ['buys', 'fees', 'tax'] as const;
const COST_GROUPS = ['compute', 'ai_tools', 'infrastructure', 'payments'] as const;

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatUsd(n: number): string {
  const abs = Math.abs(n);
  if (abs < 10) return `$${abs.toFixed(2)}`;
  if (abs < 10_000) return `$${Math.round(abs).toLocaleString('en-US')}`;
  if (abs < 1_000_000) return `$${(abs / 1000).toFixed(abs < 100_000 ? 1 : 0)}K`;
  return `$${(abs / 1_000_000).toFixed(1)}M`;
}

function formatSigned(n: number): string {
  if (Math.abs(n) < 0.005) return '$0.00';
  return `${n < 0 ? '−' : '+'}${formatUsd(n)}`;
}

/**
 * Axis ticks: short, so a narrow axis never clips them. Whole dollars under a
 * thousand, then K and M without a trailing ".0", and a sign on refund days
 * that dip below zero.
 */
function formatAxisUsd(n: number): string {
  const abs = Math.abs(n);
  let body: string;
  if (abs >= 1_000_000) body = `$${(abs / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  else if (abs >= 1000) body = `$${(abs / 1000).toFixed(abs >= 10_000 ? 0 : 1).replace(/\.0$/, '')}K`;
  else body = Number.isInteger(abs) ? `$${abs}` : formatUsd(abs);
  return n < 0 ? `−${body}` : body;
}

function formatDay(iso: string): string {
  const [, month, day] = iso.split('-');
  return `${parseInt(day, 10)}/${parseInt(month, 10)}`;
}

function formatMonth(month: string): string {
  const [year, m] = month.split('-');
  return `${parseInt(m, 10)}/${year.slice(2)}`;
}

function sumValues(record: Record<string, number>): number {
  let total = 0;
  for (const v of Object.values(record)) total += v;
  return total;
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

interface ChartRow {
  label: string;
  /** Full date or month, for the tooltip. */
  when: string;
  /** Per day. On the monthly view, the month's average per day. */
  revenue: number;
  costs: number;
  /** Monthly view only: the month's totals and how many of its days are in range. */
  month?: { revenue: number; costs: number; days: number };
}

function FinanceTooltip({
  active,
  payload,
  revenueLabel,
  costsLabel,
  netLabel,
}: {
  active?: boolean;
  payload?: { payload: ChartRow }[];
  revenueLabel: string;
  costsLabel: string;
  netLabel: string;
}) {
  const { t } = useTranslation();
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const totals = row.month ?? row;
  return (
    <div data-keep-dark className="rounded-xl bg-zinc-900 border border-zinc-700 px-3 py-2 shadow-lg">
      <div className="text-[11px] text-zinc-400 mb-1">
        {row.month
          ? t('stats.money.tooltipMonth', '{{month}} · {{days}} days', { month: row.when, days: row.month.days })
          : row.when}
      </div>
      <div className="text-xs text-white tabular-nums">
        {formatUsd(totals.revenue)} <span className="text-zinc-400">{revenueLabel}</span>
      </div>
      <div className="text-xs text-white tabular-nums">
        {formatUsd(totals.costs)} <span className="text-zinc-400">{costsLabel}</span>
      </div>
      <div className="text-xs text-white tabular-nums border-t border-zinc-800 mt-1 pt-1">
        {formatSigned(totals.revenue - totals.costs)} <span className="text-zinc-400">{netLabel}</span>
      </div>
      {row.month && (
        <div className="text-[11px] text-zinc-500 tabular-nums mt-1">
          {t('stats.money.tooltipPerDay', '{{revenue}} / {{costs}} a day', {
            revenue: formatUsd(row.revenue),
            costs: formatUsd(row.costs),
          })}
        </div>
      )}
    </div>
  );
}

/** Solid for revenue, dashed for costs — the line style carries identity, not a hue. */
function LegendSwatch({ dashed, label }: { dashed?: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-zinc-400">
      <svg width="18" height="6" aria-hidden className="text-white">
        <line
          x1="1"
          y1="3"
          x2="17"
          y2="3"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={dashed ? '3 3' : undefined}
          strokeOpacity={dashed ? 0.55 : 1}
        />
      </svg>
      {label}
    </span>
  );
}

function SourceList({
  title,
  icon: Icon,
  hint,
  groups,
  groupLabels,
  totals,
  sources,
  emptyLabel,
  quietLabel,
  onSelect,
  selectLabel,
}: {
  title: string;
  icon: typeof Wallet;
  hint: string;
  groups: readonly string[];
  groupLabels: Record<string, string>;
  totals: Map<string, number>;
  sources: FinanceSource[];
  emptyLabel: string;
  quietLabel: string;
  /** Makes each line a button — used to open the revenue ledger on that source. */
  onSelect?: (sourceId: string) => void;
  /** Accessible name for that button, with `{{source}}` for the line's label. */
  selectLabel?: (label: string) => string;
}) {
  const live = sources.filter((s) => s.status === 'ok');
  const withValue = live.filter((s) => (totals.get(s.id) ?? 0) > 0.004);
  const quiet = live.filter((s) => (totals.get(s.id) ?? 0) <= 0.004);
  const max = Math.max(0, ...withValue.map((s) => totals.get(s.id) ?? 0));

  return (
    <div data-page-bento data-kit-section className="bg-zinc-900 border border-zinc-800 p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-zinc-400" />
        <span className="text-sm font-semibold text-white">{title}</span>
        <span className="text-[11px] text-zinc-500 ml-auto">{hint}</span>
      </div>

      {withValue.length === 0 ? (
        <div className="text-sm text-zinc-500 py-3">{emptyLabel}</div>
      ) : (
        groups.map((group) => {
          const rows = withValue
            .filter((s) => s.group === group)
            .sort((a, b) => (totals.get(b.id) ?? 0) - (totals.get(a.id) ?? 0));
          if (!rows.length) return null;
          return (
            <div key={group} className="mt-1">
              <div className="text-[10px] uppercase tracking-wide text-zinc-500 pt-1">{groupLabels[group] ?? group}</div>
              <div className="text-white">
                {rows.map((s) => {
                  const row = (
                    <ShareRow
                      key={s.id}
                      label={s.label}
                      value={totals.get(s.id) ?? 0}
                      max={max}
                      formatted={formatUsd(totals.get(s.id) ?? 0)}
                    />
                  );
                  return onSelect ? (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onSelect(s.id)}
                      aria-label={selectLabel?.(s.label)}
                      className="block w-full text-left rounded-lg -mx-1 px-1 hover:bg-zinc-800/50 transition-colors"
                    >
                      {row}
                    </button>
                  ) : (
                    row
                  );
                })}
              </div>
            </div>
          );
        })
      )}

      {quiet.length > 0 && (
        <p className="text-[11px] text-zinc-500 leading-relaxed mt-2 pt-2 border-t border-zinc-800">
          {quietLabel} {quiet.map((s) => s.label).join(', ')}.
        </p>
      )}
    </div>
  );
}

/**
 * What every line counts and leaves out. Collapsed by default: it is the
 * evidence for the figures, not the figures, and open it is longer than the
 * rest of the section.
 */
function FinanceDefinitions({ stats }: { stats: FinanceStats }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <div data-page-bento data-kit-section className="bg-zinc-900 border border-zinc-800">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <ListChecks className="w-4 h-4 text-zinc-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-white">
            {t('stats.money.definitionsTitle', 'What is counted')}
          </div>
          <div className="text-xs text-zinc-500">
            {t('stats.money.definitionsSubtitle', 'Every line, where it is read from, and what is left out')}
          </div>
        </div>
        <ChevronDown className={cn('w-4 h-4 text-zinc-500 transition-transform shrink-0', open && 'rotate-180')} />
      </button>

      {open && (
        <ul className="px-4 pb-4 pt-3 space-y-2 text-xs text-zinc-400 leading-relaxed border-t border-zinc-800">
          {stats.sources.map((s) => (
            <li key={s.id}>
              <span className="text-zinc-300">{s.label}</span> — {s.note}
            </li>
          ))}
          <li>
            <span className="text-zinc-300">{t('stats.money.conversionTerm', 'Prices')}</span> —{' '}
            {stats.provenance.conversion}{' '}
            {stats.dhb.priceSource === 'market'
              ? t('stats.money.dhbMarket', 'DHB was ${{price}} at this read.', { price: stats.dhb.priceUsd.toPrecision(3) })
              : t('stats.money.dhbPeg', 'No market price was available at this read, so DHB is at the peg.')}
          </li>
          {stats.provenance.excluded.map((line) => (
            <li key={line}>{line}</li>
          ))}
          {stats.notes.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------

export function FinanceSection({ range }: { range: Range }) {
  const { t } = useTranslation();
  const { data: stats } = useFinanceStats();
  const span = windowDays(range);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [ledgerSource, setLedgerSource] = useState<string | null>(null);

  /** A revenue line opens the ledger on that source, and brings it into view. */
  const showLedger = (sourceId: string) => {
    setLedgerSource(sourceId);
    setLedgerOpen(true);
    requestAnimationFrame(() =>
      document.getElementById('revenue-ledger')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  };

  const view = useMemo(() => {
    if (!stats) return null;
    const days: FinanceDay[] = span == null ? stats.days : stats.days.slice(-span);

    const revenue = new Map<string, number>();
    const costs = new Map<string, number>();
    for (const day of days) {
      for (const [id, v] of Object.entries(day.revenue)) revenue.set(id, (revenue.get(id) ?? 0) + v);
      for (const [id, v] of Object.entries(day.costs)) costs.set(id, (costs.get(id) ?? 0) + v);
    }
    const revenueTotal = [...revenue.values()].reduce((a, v) => a + v, 0);
    const costTotal = [...costs.values()].reduce((a, v) => a + v, 0);

    const byGroup = (totals: Map<string, number>, group: string) =>
      stats.sources
        .filter((s) => s.group === group)
        .reduce((a, s) => a + (totals.get(s.id) ?? 0), 0);

    let chart: ChartRow[];
    if (days.length > MONTHLY_AFTER_DAYS) {
      // Plotted as the month's average per day. The first and the running
      // month only cover part of their days, and a raw total would draw that
      // as a collapse every time a month starts.
      const months = new Map<string, { revenue: number; costs: number; days: number }>();
      for (const day of days) {
        const key = day.date.slice(0, 7);
        const m = months.get(key) ?? { revenue: 0, costs: 0, days: 0 };
        m.revenue += sumValues(day.revenue);
        m.costs += sumValues(day.costs);
        m.days += 1;
        months.set(key, m);
      }
      chart = [...months.entries()].map(([key, m]) => ({
        label: formatMonth(key),
        when: key,
        revenue: m.revenue / m.days,
        costs: m.costs / m.days,
        month: m,
      }));
    } else {
      chart = days.map((day) => ({
        label: formatDay(day.date),
        when: day.date,
        revenue: sumValues(day.revenue),
        costs: sumValues(day.costs),
      }));
    }

    return {
      days: days.length,
      first: days[0]?.date ?? null,
      monthly: days.length > MONTHLY_AFTER_DAYS,
      revenue,
      costs,
      revenueTotal,
      costTotal,
      net: revenueTotal - costTotal,
      revenueByGroup: REVENUE_GROUPS.map((group) => ({ group, usd: byGroup(revenue, group) })),
      chart,
    };
  }, [stats, span]);

  if (!stats || !view) return null;

  const revenueSources = stats.sources.filter((s) => s.kind === 'revenue');
  const costSources = stats.sources.filter((s) => s.kind === 'cost');
  const unavailable = stats.sources.filter((s) => s.status === 'unavailable');

  const revenueLabel = t('stats.money.revenue', 'Revenue');
  const costsLabel = t('stats.money.costs', 'Costs');
  const netLabel = t('stats.money.net', 'Net');
  const windowHint =
    span === 1
      ? t('stats.money.today', 'today so far, UTC')
      : span == null
        ? view.first
          ? t('stats.money.since', 'since {{date}}', { date: view.first })
          : t('stats.community.allTime', 'All time')
        : t('stats.countries.window', 'last {{days}} days', { days: view.days });
  const coveredPct = view.costTotal > 0 ? (view.revenueTotal / view.costTotal) * 100 : null;
  // Under one percent is not zero, and rounding it there would say nobody paid for anything.
  // Past ten times over, a percentage stops being readable ("166203%"), so it
  // reads as a multiple instead.
  const covered =
    coveredPct == null
      ? '—'
      : coveredPct > 0 && coveredPct < 1
        ? '<1%'
        : coveredPct >= 1000
          ? `${Math.round(coveredPct / 100).toLocaleString('en-US')}×`
          : `${Math.round(coveredPct)}%`;

  const groupLabels: Record<string, string> = {
    buys: t('stats.money.group.buys', 'In-app buys'),
    fees: t('stats.money.group.fees', 'Fees'),
    tax: t('stats.money.group.tax', 'Token tax'),
    compute: t('stats.money.group.compute', 'AI compute'),
    ai_tools: t('stats.money.group.aiTools', 'AI tools'),
    infrastructure: t('stats.money.group.infrastructure', 'Infrastructure'),
    payments: t('stats.money.group.payments', 'Payment fees'),
  };

  return (
    <>
      <GroupHeading
        icon={Wallet}
        title={t('stats.money.title', 'Revenue & costs')}
        href={FINANCE_STATS_ENDPOINT}
        hrefLabel="/finance-stats"
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <StatTile
          label={revenueLabel}
          value={formatUsd(view.revenueTotal)}
          hint={
            // Only the groups that earned something in this window — "$0.00
            // fees" next to a year of token tax is noise.
            view.revenueByGroup
              .filter((g) => g.usd >= 0.005)
              .map((g) => `${formatUsd(g.usd)} ${(groupLabels[g.group] ?? g.group).toLowerCase()}`)
              .join(' · ') || windowHint
          }
        />
        <StatTile label={costsLabel} value={formatUsd(view.costTotal)} hint={windowHint} />
        <StatTile
          label={view.net < 0 ? t('stats.money.loss', 'Net loss') : t('stats.money.profit', 'Net profit')}
          value={formatSigned(view.net)}
          hint={t('stats.money.netHint', 'revenue minus costs')}
        />
        <StatTile
          label={t('stats.money.covered', 'Costs covered')}
          value={covered}
          hint={t('stats.money.coveredHint', 'of costs paid by revenue')}
        />
      </div>

      <div data-page-bento data-kit-section className="bg-zinc-900 border border-zinc-800 p-4">
        <div className="flex items-baseline justify-between gap-2 mb-3 flex-wrap">
          <span className="text-sm font-semibold text-white">
            {view.monthly
              ? t('stats.money.chartMonthly', 'Revenue and costs per day, monthly average')
              : t('stats.money.chartDaily', 'Revenue and costs per day')}
          </span>
          <span className="flex items-center gap-3">
            <LegendSwatch label={revenueLabel} />
            <LegendSwatch dashed label={costsLabel} />
          </span>
        </div>
        {view.chart.length === 0 ? (
          <div className="flex items-center justify-center h-44 text-zinc-500 text-sm">
            {t('stats.chart.empty', 'No data for this window yet')}
          </div>
        ) : (
          <div className="text-white">
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={view.chart} margin={{ top: 4, right: 4, left: -14, bottom: 0 }}>
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
                  width={52}
                  tickFormatter={(v: number) => formatAxisUsd(v)}
                />
                <Tooltip
                  content={<FinanceTooltip revenueLabel={revenueLabel} costsLabel={costsLabel} netLabel={netLabel} />}
                  cursor={{ stroke: 'currentColor', strokeOpacity: 0.15 }}
                />
                <Line
                  type="monotone"
                  dataKey="costs"
                  name={costsLabel}
                  stroke="currentColor"
                  strokeOpacity={0.55}
                  strokeDasharray="4 4"
                  strokeWidth={2}
                  dot={view.chart.length < 3}
                />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  name={revenueLabel}
                  stroke="currentColor"
                  strokeWidth={2}
                  dot={view.chart.length < 3}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div data-kit-flat-skip className="grid grid-cols-1 lg:grid-cols-2 gap-0 sm:gap-3">
        <SourceList
          title={t('stats.money.inTitle', 'Where the money comes from')}
          icon={ArrowUpRight}
          hint={windowHint}
          groups={REVENUE_GROUPS}
          groupLabels={groupLabels}
          totals={view.revenue}
          sources={revenueSources}
          emptyLabel={t('stats.money.inEmpty', 'No revenue in this window yet')}
          quietLabel={t('stats.money.inQuiet', 'Tracked, nothing yet in this window:')}
          onSelect={showLedger}
          selectLabel={(label) => t('stats.ledger.open', 'See every {{source}} entry', { source: label })}
        />
        <SourceList
          title={t('stats.money.outTitle', 'Where it goes')}
          icon={ArrowDownRight}
          hint={windowHint}
          groups={COST_GROUPS}
          groupLabels={groupLabels}
          totals={view.costs}
          sources={costSources}
          emptyLabel={t('stats.money.outEmpty', 'No costs in this window yet')}
          quietLabel={t('stats.money.outQuiet', 'Tracked, nothing yet in this window:')}
        />
      </div>

      {/* A source that could not be read is named up front, beside the
          numbers it is missing from — not only inside the collapsed list. */}
      {unavailable.length > 0 && (
        <p className="text-[11px] text-zinc-500 leading-relaxed px-1">
          {t('stats.money.unavailable', '{{sources}} could not be reached, so they are left out of every total above rather than guessed.', {
            sources: unavailable.map((s) => s.label).join(', '),
          })}
        </p>
      )}

      <RevenueLedger
        windowDays={span}
        open={ledgerOpen}
        onOpenChange={setLedgerOpen}
        source={ledgerSource}
        onSourceChange={setLedgerSource}
      />

      <FinanceDefinitions stats={stats} />
    </>
  );
}
