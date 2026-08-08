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
    label: 'Twitch',
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
    label: 'Instagram Reels',
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
  const { walletAddress } = useAuth();
  const [rpms, setRpms] = useState<Record<string, number>>(() =>
    Object.fromEntries(PLATFORMS.map((p) => [p.key, p.defaultRpm]))
  );
  const [estimatorViews, setEstimatorViews] = useState('');

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
        <h3 className="text-white font-semibold">Earnings comparison</h3>
        <p className="text-zinc-500 text-xs mt-0.5">
          Your real DeHub earnings against what the same views would have paid elsewhere.
        </p>
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
              <p className="text-zinc-500 text-[11px]">Earned on DeHub</p>
              <p className="text-white text-lg font-bold mt-0.5">
                {priceKnown ? usd(dehubUsd) : `${compact(tipsEarnedDhb)} DHB`}
              </p>
              <p className="text-zinc-600 text-[10px] mt-0.5">
                {priceKnown ? `${compact(tipsEarnedDhb)} DHB` : 'USD price unavailable'}
              </p>
            </div>
            <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3">
              <p className="text-zinc-500 text-[11px]">Total views</p>
              <p className="text-white text-lg font-bold mt-0.5">{compact(totalViews)}</p>
              <p className="text-zinc-600 text-[10px] mt-0.5">across {postCount} posts</p>
            </div>
            <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3">
              <p className="text-zinc-500 text-[11px]">Your DeHub RPM</p>
              <p className="text-white text-lg font-bold mt-0.5">
                {totalViews > 0 && priceKnown ? usd((dehubUsd / totalViews) * 1000) : '—'}
              </p>
              <p className="text-zinc-600 text-[10px] mt-0.5">per 1,000 views</p>
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
                    <p className="text-zinc-600 text-[10px] mt-0.5">
                      typical {r.range} per 1,000
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <label className="flex items-center gap-1">
                      <span className="text-zinc-600 text-[10px]">RPM $</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={rpms[r.key]}
                        onChange={(e) =>
                          setRpms((prev) => ({ ...prev, [r.key]: Number(e.target.value) || 0 }))
                        }
                        className="w-16 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-white text-xs"
                        aria-label={`${r.label} RPM in dollars per 1,000 views`}
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
                          {usd(Math.abs(r.delta))} on DeHub
                        </p>
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
            <label className="text-zinc-400 text-xs block mb-2">
              Not your numbers? Try any view count
            </label>
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
              Competitor figures are estimates from published industry ranges, not measured
              payouts — real RPM varies widely by niche, audience country and watch time, so
              edit each rate to match what you actually earn. The DeHub figure is your real
              tip income converted at the live DHB price, and excludes subscriptions, PPV and
              store sales. Views are summed from your most recent 100 posts.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
