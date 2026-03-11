import { useEffect, useState } from 'react';
import { buildAvatarUrl } from '@/lib/media-url';
import { Snowflake, Trophy, Gift, Star, Loader2, ExternalLink, Crown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface WinnerEntry {
  wallet: string;
  buyAmount?: string;
  rawAmount?: number;
  bonusAmount?: string;
  rawBonusAmount?: number;
  prize?: string;
  rawPrize?: number;
  txHash?: string;
  currentBalance: string;
  tier: string;
  username?: string | null;
  avatar?: string | null;
}

interface DrawResult {
  drawDate: string;
  periodStart: string;
  periodEnd: string;
  stats: {
    totalBuysScanned: number;
    uniqueBuyers: number;
    eligibleBuys: number;
    eligibleUniqueBuyers: number;
    preDecemberHolders?: number;
    eligibleStakers?: number;
  };
  winners: {
    tier1: WinnerEntry[];
    tier2: WinnerEntry[];
    tier3: WinnerEntry[];
    stakerTier?: WinnerEntry[];
  };
  totalWinners: number;
}

const BASESCAN_TX = 'https://basescan.org/tx/';
const BASESCAN_ADDR = 'https://basescan.org/address/';

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function WalletCell({ winner }: { winner: WinnerEntry }) {
  const avatarUrl = winner.avatar ? buildAvatarUrl(winner.wallet, winner.avatar) : undefined;
  return (
    <div className="flex items-center gap-2 min-w-0">
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
      ) : (
        <div className="w-7 h-7 rounded-full bg-white/10 shrink-0" />
      )}
      <div className="min-w-0">
        {winner.username && (
          <a href={`/${winner.username}`} className="block text-sm font-medium text-white hover:underline truncate">
            @{winner.username}
          </a>
        )}
        <a
          href={`${BASESCAN_ADDR}${winner.wallet}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-white/50 hover:text-white/80 font-mono flex items-center gap-1"
        >
          {shortAddr(winner.wallet)}
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}

function BuyerTierTable({
  title,
  icon,
  color,
  winners,
}: {
  title: string;
  icon: React.ReactNode;
  color: string;
  winners: WinnerEntry[];
}) {
  if (!winners.length) return null;
  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h2 className={`text-lg font-bold ${color}`}>{title}</h2>
        <span className="text-white/40 text-sm">({winners.length} winner{winners.length > 1 ? 's' : ''})</span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/[0.03]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-white/50 text-xs uppercase tracking-wider">
              <th className="text-left p-3">#</th>
              <th className="text-left p-3">Wallet</th>
              <th className="text-right p-3">Buy Amount</th>
              <th className="text-right p-3">Bonus</th>
              <th className="text-right p-3">Current Balance</th>
              {winners[0]?.txHash && <th className="text-center p-3">Tx</th>}
            </tr>
          </thead>
          <tbody>
            {winners.map((w, i) => (
              <tr key={w.txHash || w.wallet} className="border-b border-white/5 hover:bg-white/[0.03] transition-colors">
                <td className="p-3 text-white/40">{i + 1}</td>
                <td className="p-3"><WalletCell winner={w} /></td>
                <td className="p-3 text-right text-white font-mono">{w.buyAmount} DHB</td>
                <td className={`p-3 text-right font-mono font-semibold ${color}`}>+{w.bonusAmount} DHB</td>
                <td className="p-3 text-right text-white/60 font-mono">{w.currentBalance}</td>
                {w.txHash && (
                  <td className="p-3 text-center">
                    <a href={`${BASESCAN_TX}${w.txHash}`} target="_blank" rel="noopener noreferrer" className="text-white/40 hover:text-white/80">
                      <ExternalLink className="w-4 h-4 inline" />
                    </a>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StakerTierTable({ winners }: { winners: WinnerEntry[] }) {
  if (!winners.length) return null;
  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <Crown className="w-5 h-5 text-amber-400" />
        <h2 className="text-lg font-bold text-amber-400">Stakers & Holders — 1,000,000 DHB Each</h2>
        <span className="text-white/40 text-sm">({winners.length} winner{winners.length > 1 ? 's' : ''})</span>
      </div>
      <p className="text-white/40 text-xs mb-3">Pre-December holders & stakers who still hold DHB</p>
      <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/[0.03]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-white/50 text-xs uppercase tracking-wider">
              <th className="text-left p-3">#</th>
              <th className="text-left p-3">Wallet</th>
              <th className="text-right p-3">Prize</th>
              <th className="text-right p-3">Current Balance</th>
            </tr>
          </thead>
          <tbody>
            {winners.map((w, i) => (
              <tr key={w.wallet} className="border-b border-white/5 hover:bg-white/[0.03] transition-colors">
                <td className="p-3 text-white/40">{i + 1}</td>
                <td className="p-3"><WalletCell winner={w} /></td>
                <td className="p-3 text-right font-mono font-semibold text-amber-400">{w.prize}</td>
                <td className="p-3 text-right text-white/60 font-mono">{w.currentBalance}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function WinterWonderlandPage() {
  const [data, setData] = useState<DrawResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDraw() {
      try {
        // First try to read cached results from DB
        const { data: cached } = await supabase
          .from('winter_wonderland_results')
          .select('results')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (cached?.results) {
          setData(cached.results as unknown as DrawResult);
          return;
        }

        // Fallback: call edge function to run + store the draw (one-time only)
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/winter-wonderland-draw`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' } }
        );
        if (!res.ok) throw new Error('Failed to fetch draw results');
        const json: DrawResult = await res.json();
        setData(json);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    fetchDraw();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin text-white/60 mx-auto" />
          <p className="text-white/50 text-sm">Loading draw results...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-red-400">Error: {error || 'No data'}</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 pb-24">
      {/* Header */}
      <div className="text-center mb-10">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Snowflake className="w-6 h-6 text-sky-300" />
          <h1 className="text-3xl font-bold text-white">DeHub's Winter Wonderland</h1>
          <Snowflake className="w-6 h-6 text-sky-300" />
        </div>
        <p className="text-white/50 text-sm">
          Random draw from Uniswap buys between Dec 1, 2025 – Jan 25, 2026
        </p>
        <p className="text-white/30 text-xs mt-1">
          {data.totalWinners} winners drawn • Results are final
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10">
        {[
          { label: 'Total Buys', value: data.stats.totalBuysScanned.toLocaleString() },
          { label: 'Unique Buyers', value: data.stats.uniqueBuyers.toLocaleString() },
          { label: 'Eligible', value: data.stats.eligibleUniqueBuyers.toLocaleString() },
          { label: 'Winners', value: data.totalWinners.toString() },
        ].map((s) => (
          <div key={s.label} className="bg-white/[0.04] rounded-xl p-4 text-center border border-white/5">
            <div className="text-xl font-bold text-white">{s.value}</div>
            <div className="text-xs text-white/40 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Buyer Tier Tables */}
      <BuyerTierTable
        title="Tier 1 — 100% Bonus (max 5M buy)"
        icon={<Trophy className="w-5 h-5 text-yellow-400" />}
        color="text-yellow-400"
        winners={data.winners.tier1}
      />
      <BuyerTierTable
        title="Tier 2 — 50% Bonus (max 10M buy)"
        icon={<Star className="w-5 h-5 text-sky-400" />}
        color="text-sky-400"
        winners={data.winners.tier2}
      />
      <BuyerTierTable
        title="Tier 3 — 20% Bonus (no max)"
        icon={<Gift className="w-5 h-5 text-emerald-400" />}
        color="text-emerald-400"
        winners={data.winners.tier3}
      />

      {/* Staker/Holder Tier */}
      {data.winners.stakerTier && data.winners.stakerTier.length > 0 && (
        <StakerTierTable winners={data.winners.stakerTier} />
      )}

      {/* Footer */}
      <div className="text-center text-white/30 text-xs mt-8 space-y-1">
        <p>Draw executed: {new Date(data.drawDate).toLocaleString()}</p>
        <p>Results are final and stored on-chain verification</p>
      </div>
    </div>
  );
}
