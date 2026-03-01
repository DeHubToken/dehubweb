/**
 * Staking Page
 * ============
 * Displays DHB staking stats: total staked, TVL, estimated APY, and unstake queue.
 */

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Lock, TrendingUp, DollarSign, Activity, ExternalLink, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStakingStats, useUnstakeQueue, useStakingTVL, type UnstakeEvent } from '@/hooks/use-staking-data';
import { useSidebarCollapse } from '@/contexts/SidebarCollapseContext';
import { cn } from '@/lib/utils';
import dehubCoin from '@/assets/dehub-coin.png';
import bnbLogo from '@/assets/bnb-logo.png';
import baseLogo from '@/assets/icons/base-logo.png';

function formatNumber(val: string | number, decimals = 0): string {
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return '0';
  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(2) + 'B';
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(2) + 'K';
  return num.toFixed(decimals);
}

function formatUSD(val: number): string {
  if (val >= 1_000_000) return '$' + (val / 1_000_000).toFixed(2) + 'M';
  if (val >= 1_000) return '$' + (val / 1_000).toFixed(2) + 'K';
  return '$' + val.toFixed(2);
}

function timeAgo(timestamp: number): string {
  if (!timestamp) return '—';
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function truncateAddress(addr: string): string {
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

function getExplorerUrl(txHash: string, chain: 'BNB' | 'Base'): string {
  const base = chain === 'BNB' ? 'https://bscscan.com' : 'https://basescan.org';
  return `${base}/tx/${txHash}`;
}

const ESTIMATED_APY = 12; // Estimated APY percentage

// Stat card component
function StatCard({ 
  icon: Icon, 
  label, 
  value, 
  subtitle, 
  accent,
  delay = 0 
}: { 
  icon: any; 
  label: string; 
  value: string; 
  subtitle?: string;
  accent: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-5"
    >
      <div className={cn("absolute top-0 right-0 w-24 h-24 rounded-full blur-3xl opacity-20", accent)} />
      <div className="flex items-start gap-3">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center bg-white/5 border border-white/10")}>
          <Icon className="w-5 h-5 text-white/70" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-white/50 uppercase tracking-wider mb-1">{label}</p>
          <p className="text-2xl font-bold text-white truncate">{value}</p>
          {subtitle && <p className="text-xs text-white/40 mt-0.5">{subtitle}</p>}
        </div>
      </div>
    </motion.div>
  );
}

export default function StakingPage() {
  const { t } = useTranslation();
  const { isCollapsed } = useSidebarCollapse();
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useStakingStats();
  const { data: unstakeQueue, isLoading: queueLoading, refetch: refetchQueue } = useUnstakeQueue();
  const { tvl, dhbPrice } = useStakingTVL();

  const handleRefresh = () => {
    refetchStats();
    refetchQueue();
  };

  return (
    <div className={cn("min-h-screen pb-24 px-4 max-w-4xl mx-auto", isCollapsed && "pt-16 md:pt-0")}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center justify-between py-6"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/20 flex items-center justify-center">
            <img src={dehubCoin} alt="DHB" className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">DHB Staking</h1>
            <p className="text-xs text-white/40">Stake your DHB tokens to earn rewards</p>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors"
        >
          <RefreshCw className="w-4 h-4 text-white/60" />
        </button>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <StatCard
          icon={Lock}
          label="Total Staked"
          value={statsLoading ? '—' : formatNumber(stats?.totalStaked ?? '0')}
          subtitle="DHB across all chains"
          accent="bg-blue-500"
          delay={0}
        />
        <StatCard
          icon={DollarSign}
          label="TVL"
          value={statsLoading ? '—' : formatUSD(tvl)}
          subtitle={`@ $${dhbPrice.toFixed(6)}/DHB`}
          accent="bg-emerald-500"
          delay={0.05}
        />
        <StatCard
          icon={TrendingUp}
          label="Estimated APY"
          value={`${ESTIMATED_APY}%`}
          subtitle="Variable rate"
          accent="bg-purple-500"
          delay={0.1}
        />
        <StatCard
          icon={Activity}
          label="Unstake Events"
          value={queueLoading ? '—' : `${unstakeQueue?.length ?? 0}`}
          subtitle="Recent unstakes"
          accent="bg-rose-500"
          delay={0.15}
        />
      </div>

      {/* Chain Breakdown */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-5 mb-8"
      >
        <h2 className="text-sm font-semibold text-white/70 mb-4 uppercase tracking-wider">Chain Breakdown</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* BNB */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/5">
            <img src={bnbLogo} alt="BNB" className="w-8 h-8 rounded-full" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">BNB Chain</p>
              <p className="text-xs text-white/40">Staking Contract</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-white">{statsLoading ? '—' : formatNumber(stats?.bnbStaked ?? '0')}</p>
              <p className="text-xs text-white/40">DHB</p>
            </div>
          </div>
          {/* Base */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/5">
            <img src={baseLogo} alt="Base" className="w-8 h-8 rounded-full" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">Base</p>
              <p className="text-xs text-white/40">Staking Address</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-white">{statsLoading ? '—' : formatNumber(stats?.baseStaked ?? '0')}</p>
              <p className="text-xs text-white/40">DHB</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Unstake Queue */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl overflow-hidden"
      >
        <div className="p-5 border-b border-white/5">
          <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider">Unstake Queue</h2>
          <p className="text-xs text-white/30 mt-1">Recent unstake transactions across all chains</p>
        </div>

        {queueLoading ? (
          <div className="p-8 text-center">
            <RefreshCw className="w-5 h-5 text-white/30 animate-spin mx-auto mb-2" />
            <p className="text-xs text-white/30">Loading events...</p>
          </div>
        ) : !unstakeQueue?.length ? (
          <div className="p-8 text-center">
            <Activity className="w-6 h-6 text-white/20 mx-auto mb-2" />
            <p className="text-sm text-white/30">No recent unstake events</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_1fr_80px_80px_40px] gap-2 px-5 py-2 text-xs text-white/30 uppercase tracking-wider">
              <span>Wallet</span>
              <span className="text-right">Amount</span>
              <span className="text-center">Chain</span>
              <span className="text-right">When</span>
              <span />
            </div>
            {unstakeQueue.map((event: UnstakeEvent, idx: number) => (
              <motion.div
                key={event.txHash + idx}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.02 * idx }}
                className="grid grid-cols-[1fr_1fr_80px_80px_40px] gap-2 px-5 py-3 items-center hover:bg-white/[0.02] transition-colors"
              >
                <span className="text-sm text-white/70 font-mono">
                  {truncateAddress(event.wallet)}
                </span>
                <span className="text-sm text-white font-medium text-right">
                  {event.amount} <span className="text-white/40 text-xs">DHB</span>
                </span>
                <span className="text-center">
                  <span className={cn(
                    "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
                    event.chain === 'BNB' 
                      ? "bg-yellow-500/10 text-yellow-400/80" 
                      : "bg-blue-500/10 text-blue-400/80"
                  )}>
                    {event.chain}
                  </span>
                </span>
                <span className="text-xs text-white/40 text-right">
                  {timeAgo(event.timestamp)}
                </span>
                <a
                  href={getExplorerUrl(event.txHash, event.chain)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center w-7 h-7 rounded-lg hover:bg-white/10 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-white/30" />
                </a>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
