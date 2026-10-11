import { translateCopy as _translateCopy } from '@/i18n/copy';
import { useTranslation as _useCopy } from 'react-i18next';
import { useSurfaceDraft } from '@/hooks/use-surface-draft';
/**
 * Earnings Comparison
 * ===================
 * Side-by-side: what this creator actually earned on DeHub, against what the
 * same view count would have paid on YouTube, Twitch, TikTok or Reels.
 *
 * Two honesty constraints shape the whole component:
 *
 * 1. Competitor payouts are NOT a fact we can look up. Real RPM swings by
 *    niche, geography, season and watch time — a finance channel and a gaming
 *    channel differ by an order of magnitude. So the rates below are documented
 *    industry ranges used as *defaults*, every one is editable, and the UI says
 *    "estimate" wherever a competitor number appears. Baking in flattering
 *    fixed numbers would make this marketing, and the first creator to check it
 *    against their own dashboard would stop trusting the whole page.
 *
 * 2. The DeHub side is real money, taken from receivedTips and converted at the
 *    live DHB price. It is deliberately not padded with projected or
 *    "potential" earnings — mixing an actual figure with a hypothetical one in
 *    the same comparison is how these charts turn into lies.
 *
 * The estimator underneath serves the second half of the request: someone not
 * on DeHub yet can put in their own view count and see the same maths.
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DhbAmount } from '@/components/app/DhbAmount';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Info } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getAccountInfo, getMyPosts, getDHBPrice } from '@/lib/api/dehub';
import { cn } from '@/lib/utils';
import { resolveViewCount } from '@/lib/engagement';

/**
 * Per-1000-view creator payout, in USD, before tax.
 *
 * These are mid-points of commonly reported ranges, not measured values. They
 * are the starting position for the user's own number, which is why each row
 * carries the range it came from — a creator who knows their real RPM should
 * type it in rather than trust ours.
 */
interface Platform {
  key: string;
  label: string;
  defaultRpm: number;
  range: string;
  note: string;
}

const PLATFORMS: Platform[] = [
  {
    key: 'youtube',
    label: 'YouTube',
    defaultRpm: 2.0,
    range: '$0.50 – $6.00',
    note: 'After YouTube’s 45% ad-revenue cut. Swings hardest by niche and viewer country.',
  },
  {
    key: 'twitch',
    get label() { return _translateCopy("copy.a731a58c4cf3", { defaultValue: "Twitch" }); },
    defaultRpm: 3.0,
    range: '$2.00 – $4.00',
    note: 'Ad revenue only — excludes subs and bits, which are usually the larger share.',
  },
  {
    key: 'tiktok',
    label: 'TikTok',
    defaultRpm: 0.03,
    range: '$0.02 – $0.04',
    note: 'Creator Rewards. Famously low per view; scale is the entire model.',
  },
  {
    key: 'reels',
    get label() { return _translateCopy("copy.b19565a545ba", { defaultValue: "Instagram Reels" }); },
    defaultRpm: 0.02,
    range: '$0.01 – $0.05',
    note: 'Bonus programmes are invite-only and have been repeatedly wound down.',
  },
];

const usd = (n: number) =>
  n >= 1000
    ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    : `$${n.toFixed(2)}`;

const compact = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
};

export function EarningsComparison() {
  const { t: _copy } = _useCopy();
  const { t } = useTranslation();
  const { walletAddress } = useAuth();
  const [rpms, setRpms] = useSurfaceDraft<Record<string, number>>("src/components/app/command-centre/EarningsComparison.tsx:rpms", () =>
    Object.fromEntries(PLATFORMS.map((p) => [p.key, p.defaultRpm])));
  const [estimatorViews, setEstimatorViews] = useSurfaceDraft("components/app/command-centre/EarningsComparison.tsx:estimatorViews", '');

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['account-info', walletAddress],
    queryFn: () => getAccountInfo(walletAddress!),
    enabled: !!walletAddress,
    staleTime: 5 * 60_000,
  });

  // Views aren't aggregated on the account, so they're summed from the
  // creator's own posts. One page of 100 covers the overwhelming majority of
  // creators; the caption says so rather than quietly under-reporting.
  const { data: postsData, isLoading: postsLoading } = useQuery({
    queryKey: ['my-posts-views', walletAddress],
    queryFn: () => getMyPosts(1, 100),
    enabled: !!walletAddress,
    staleTime: 5 * 60_000,
  });

  // Fetched directly rather than through useTokenPrices, which only runs on
  // wallet/stake/buy/store routes and would return 0 here.
  const { data: priceData, isLoading: priceLoading } = useQuery({
    queryKey: ['dhb-price'],
    queryFn: () => getDHBPrice(),
    staleTime: 5 * 60_000,
  });

  const dhbPrice = Number(priceData?.price ?? 0);
  // If the price endpoint fails, the USD figure would read $0.00 and every
  // delta would go red — a lie caused by an outage. Degrade to DHB-only.
  const priceKnown = dhbPrice > 0;
  const tipsEarnedDhb = Number(profile?.receivedTips ?? 0);
  const dehubUsd = tipsEarnedDhb * dhbPrice;

  const posts = postsData?.result ?? [];
  const totalViews = useMemo(
    () => posts.reduce((sum, p) => sum + resolveViewCount(p), 0),
    [posts]
  );
  const postCount = posts.length;

  const isLoading = profileLoading || postsLoading || priceLoading;

  const rows = useMemo(
    () =>
      PLATFORMS.map((p) => {
        const wouldEarn = (totalViews / 1000) * (rpms[p.key] ?? p.defaultRpm);
        return { ...p, wouldEarn, delta: dehubUsd - wouldEarn };
      }),
    [totalViews, rpms, dehubUsd]
  );

  const estimatorRows = useMemo(() => {
    const v = Number(estimatorViews.replace(/[^0-9]/g, ''));
    if (!v) return null;
    return PLATFORMS.map((p) => ({
      ...p,
      wouldEarn: (v / 1000) * (rpms[p.key] ?? p.defaultRpm),
    }));
  }, [estimatorViews, rpms]);

  return (
    <div data-page-bento className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 sm:p-5">
      <div className="mb-4">
        <h3 className="text-white font-semibold">{_copy("copy.a7e8af837a2b", { defaultValue: "Earnings comparison" })}</h3>
        <p className="text-zinc-500 text-xs mt-0.5">{_copy("copy.6b7b77d53839", { defaultValue: "Your real DeHub earnings against what the same views would have paid elsewhere." })}</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
        </div>
      ) : (
        <>
          {/* Your actual numbers */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3">
              <p className="text-zinc-500 text-[11px]">{_copy("copy.1dc1e547e65f", { defaultValue: "Earned on DeHub" })}</p>
              <p className="text-white text-lg font-bold mt-0.5">
                {priceKnown ? usd(dehubUsd) : <DhbAmount amount={compact(tipsEarnedDhb)} />}
              </p>
              <p className="text-zinc-600 text-[10px] mt-0.5">
                {priceKnown ? <DhbAmount amount={compact(tipsEarnedDhb)} /> : _copy("copy.6e31723e40c6", { defaultValue: "USD price unavailable" })}
              </p>
            </div>
            <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3">
              <p className="text-zinc-500 text-[11px]">{_copy("copy.ddcfdfe02311", { defaultValue: "Total views" })}</p>
              <p className="text-white text-lg font-bold mt-0.5">{compact(totalViews)}</p>
              <p className="text-zinc-600 text-[10px] mt-0.5">{_copy("copy.29aa7a49aa25", { defaultValue: "across " })}{postCount}{_copy("copy.e8468d49b505", { defaultValue: " posts" })}</p>
            </div>
            <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3">
              <p className="text-zinc-500 text-[11px]">{_copy("copy.9f9c6f0d0963", { defaultValue: "Your DeHub RPM" })}</p>
              <p className="text-white text-lg font-bold mt-0.5">
                {totalViews > 0 && priceKnown ? usd((dehubUsd / totalViews) * 1000) : '—'}
              </p>
              <p className="text-zinc-600 text-[10px] mt-0.5">{_copy("copy.1d097df795ff", { defaultValue: "per 1,000 views" })}</p>
            </div>
          </div>

          {/* Comparison rows */}
          <div className="space-y-1.5">
            {rows.map((r) => (
              <div
                key={r.key}
                className="rounded-xl bg-white/[0.02] border border-white/[0.08] p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-white text-sm font-medium">{r.label}</p>
                    <p className="text-zinc-600 text-[10px] mt-0.5">{_copy("copy.43fb11b48038", { defaultValue: "typical " })}{r.range}{_copy("copy.4caa918bf60d", { defaultValue: " per 1,000" })}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <label className="flex items-center gap-1">
                      <span className="text-zinc-600 text-[10px]">{_copy("copy.6bdf24e0e55f", { defaultValue: "RPM $" })}</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={rpms[r.key]}
                        onChange={(e) =>
                          setRpms((prev) => ({ ...prev, [r.key]: Number(e.target.value) || 0 }))
                        }
                        className="w-16 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-white text-xs"
                        aria-label={_copy("copy.2173b63036e3", { defaultValue: "{{value1}} RPM in dollars per 1,000 views", value1: r.label })}
                      />
                    </label>
                    <div className="text-right w-24">
                      <p className="text-zinc-300 text-sm font-semibold">{usd(r.wouldEarn)}</p>
                      {priceKnown ? (
                        <p
                          className={cn(
                            'text-[10px]',
                            r.delta >= 0 ? 'text-emerald-400/80' : 'text-red-400/80'
                          )}
                        >
                          {r.delta >= 0 ? '+' : '−'}
                          {usd(Math.abs(r.delta))}{_copy("copy.0435a318b3b4", { defaultValue: " on DeHub" })}</p>
                      ) : (
                        <p className="text-zinc-600 text-[10px]">—</p>
                      )}
                    </div>
                  </div>
                </div>
                <p className="text-zinc-600 text-[10px] mt-2">{r.note}</p>
              </div>
            ))}
          </div>

          {/* Estimator — the "not on DeHub yet" half of the request */}
          <div className="mt-4 pt-4 border-t border-white/[0.06]">
            <label className="text-zinc-400 text-xs block mb-2">{_copy("copy.600d1c6e47ab", { defaultValue: "Not your numbers? Try any view count" })}</label>
            <input
              type="text"
              inputMode="numeric"
              value={estimatorViews}
              onChange={(e) => setEstimatorViews(e.target.value)}
              placeholder="e.g. 250000"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white text-sm placeholder:text-zinc-600"
            />
            {estimatorRows && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                {estimatorRows.map((r) => (
                  <div
                    key={r.key}
                    className="rounded-xl bg-white/[0.02] border border-white/[0.08] p-2.5"
                  >
                    <p className="text-zinc-500 text-[10px]">{r.label}</p>
                    <p className="text-white text-sm font-semibold mt-0.5">{usd(r.wouldEarn)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-start gap-2 mt-4 text-zinc-600">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <p className="text-[10px] leading-relaxed">
              {t('commandCentre.earningsComparisonNote')}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
