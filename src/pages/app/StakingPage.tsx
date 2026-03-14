/**
 * Staking Page
 * ============
 * Chain-abstracted DHB staking. Auto-detects which chain(s) user has balance on.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, TrendingUp, DollarSign, Activity, ExternalLink, RefreshCw, ArrowDownToLine, ArrowUpFromLine, Loader2, Clock, Gift, Wallet, AlertTriangle, Percent, Zap, Crown, Rocket } from 'lucide-react';
import { BADGE_LEVELS, getBadgeUrl } from '@/lib/staking-badges';
import { useStakingStats, useUnstakeQueue, useStakingTVL, useUserStakingData, type UnstakeEvent } from '@/hooks/use-staking-data';
import { useSidebarCollapse } from '@/contexts/SidebarCollapseContext';
import { cn } from '@/lib/utils';
import { sendERC20Token } from '@/lib/wallet/send';
import { supabase } from '@/integrations/supabase/client';
import { STAKING_ADDRESS, claimBNBRewards } from '@/lib/contracts/staking';
import { BASE_CHAIN_ID, BNB_CHAIN_ID, CHAIN_CONFIGS } from '@/lib/contracts/dhb-token';
import { getWalletAddress, switchChain } from '@/lib/contracts/aa-utils';
import { toast } from 'sonner';
import { LiquidGlassBubble } from '@/components/ui/liquid-glass-bubble';


import dehubCoin from '@/assets/dehub-coin.png';

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

const ESTIMATED_APY = 0;

function StatCard({ 
  icon: Icon, label, value, subtitle, accent, delay = 0 
}: { 
  icon: any; label: string; value: string; subtitle?: string; accent: string; delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-3 sm:p-4 lg:p-3"
    >
      <div className="absolute top-0 right-0 w-24 h-24 rounded-full blur-3xl opacity-10 bg-white" />
      <div className="flex items-start gap-3 lg:gap-0">
        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex-shrink-0 flex items-center justify-center bg-white/5 border border-white/10 lg:hidden">
          <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-white/70" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] sm:text-xs lg:text-[10px] text-white/50 uppercase tracking-wider mb-1 truncate">{label}</p>
          <p className="text-lg sm:text-xl lg:text-base font-bold text-white break-all leading-tight">{value}</p>
          {subtitle && <p className="text-[10px] sm:text-xs lg:text-[10px] text-white/40 mt-0.5 truncate">{subtitle}</p>}
        </div>
      </div>
    </motion.div>
  );
}

export default function StakingPage() {
  const { isCollapsed } = useSidebarCollapse();
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useStakingStats();
  const { data: unstakeQueue, isLoading: queueLoading, refetch: refetchQueue } = useUnstakeQueue();
  const { data: userData, refetch: refetchUser } = useUserStakingData();
  const { tvl, dhbPrice } = useStakingTVL();

  const [stakeAmount, setStakeAmount] = useState('');
  const [unstakeAmount, setUnstakeAmount] = useState('');
  const [isApproving, setIsApproving] = useState(false);
  const [isStaking, setIsStaking] = useState(false);
  const [isUnstaking, setIsUnstaking] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  // Track which chain we're currently staking on (for multi-chain flow)
  const [stakingChainLabel, setStakingChainLabel] = useState('');

  const handleRefresh = () => {
    refetchStats();
    refetchQueue();
    refetchUser();
  };

  /**
   * Smart stake: auto-detect chain with balance, stake there.
   * If both chains have balance, stake on first available and notify user to repeat.
   */
  const handleStake = async () => {
    const amount = parseFloat(stakeAmount);
    if (!amount || amount <= 0) {
      toast.error('Invalid amount', { description: 'Please enter a valid amount to stake.' });
      return;
    }

    setIsStaking(true);
    try {
      const walletAddress = await getWalletAddress();
      if (!walletAddress) {
        toast.error('Not connected', { description: 'Please connect your wallet first.' });
        return;
      }

      const hasBNB = userData?.hasBNBBalance ?? false;
      const hasBase = userData?.hasBaseBalance ?? false;

      if (!hasBNB && !hasBase) {
        toast.error('No DHB balance', { description: 'You don\'t have DHB tokens on either chain.' });
        return;
      }

      const bothChains = hasBNB && hasBase;
      const targetChain: 'BNB' | 'Base' = hasBNB ? 'BNB' : 'Base';
      setStakingChainLabel(targetChain);

      if (bothChains) {
        toast.info('DHB found on both chains', { description: `Staking on ${targetChain} first. Come back after to stake the other.` });
      }

      if (targetChain === 'BNB') {
        await stakeTransferFlow(amount, BNB_CHAIN_ID, 'BNB Chain');
      } else {
        await stakeTransferFlow(amount, BASE_CHAIN_ID, 'Base');
      }
    } catch (err: any) {
      console.error('[Staking] Stake error:', err);
      toast.error('Stake failed', { description: err?.message || 'Unknown error' });
    } finally {
      setIsStaking(false);
      setIsApproving(false);
      setStakingChainLabel('');
    }
  };

  /**
   * Unified transfer-based staking: send DHB to the staking address on the given chain.
   */
  const stakeTransferFlow = async (amount: number, chainId: typeof BNB_CHAIN_ID | typeof BASE_CHAIN_ID, chainLabel: string) => {
    await switchChain(chainId);
    const dhbTokenAddress = CHAIN_CONFIGS[chainId]?.dhbToken;
    if (!dhbTokenAddress) {
      toast.error('Error', { description: `DHB token not configured for ${chainLabel}.` });
      return;
    }

    toast.loading('Staking DHB...', { description: 'Confirming transaction...' });
    const result = await sendERC20Token(dhbTokenAddress, STAKING_ADDRESS, stakeAmount, 18, chainId as any);
    
    toast.loading('Transaction sent', { description: 'Waiting for confirmation...' });
    const receipt = await result.wait();

    if (receipt.status === 1) {
      // Record stake in database for per-user tracking
      const chainName = chainId === BNB_CHAIN_ID ? 'BNB' : 'Base';
      try {
        const walletAddr = await getWalletAddress();
        await supabase.from('staking_records').insert({
          wallet_address: walletAddr.toLowerCase(),
          amount: parseFloat(stakeAmount),
          chain: chainName,
          tx_hash: receipt.hash || '',
          action: 'stake',
        });
      } catch (dbErr) {
        console.error('[Staking] Failed to record stake in DB:', dbErr);
      }
      toast.dismiss();
      toast.success('Staked successfully! ✅', { description: `${stakeAmount} DHB staked on ${chainLabel}.` });
      setStakeAmount('');
      refetchStats();
      refetchUser();
    } else {
      toast.dismiss();
      toast.error('Stake failed', { description: 'Transaction reverted.' });
    }
  };

  /**
   * Smart unstake: detect where user has staked balance
   */
  const handleUnstake = async () => {
    const amount = parseFloat(unstakeAmount);
    if (!amount || amount <= 0) {
      toast.error('Invalid amount', { description: 'Please enter a valid amount to unstake.' });
      return;
    }

    const userStakedNow = userData?.totalStaked ?? 0;
    if (amount > userStakedNow) {
      toast.error('Insufficient staked balance', { description: `You only have ${userStakedNow.toFixed(2)} DHB staked.` });
      return;
    }

    setIsUnstaking(true);
    try {
      const walletAddress = await getWalletAddress();
      if (!walletAddress) {
        toast.error('Not connected', { description: 'Please connect your wallet first.' });
        return;
      }

      const { error } = await supabase
        .from('staking_records')
        .insert({
          wallet_address: walletAddress.toLowerCase(),
          amount,
          chain: 'unified',
          action: 'unstake',
          tx_hash: `unstake-request-${Date.now()}`,
        });

      if (error) throw error;

      toast.success('Unstake request submitted! ✅', { description: `${unstakeAmount} DHB added to unstake queue.` });
      setUnstakeAmount('');
      refetchStats();
      refetchUser();
    } catch (err: any) {
      console.error('[Staking] Unstake error:', err);
      toast.error('Unstake failed', { description: err?.message || 'Unknown error' });
    } finally {
      setIsUnstaking(false);
    }
  };

  const handleClaim = async () => {
    setIsClaiming(true);
    try {
      const walletAddress = await getWalletAddress();
      if (!walletAddress) {
        toast.error('Not connected', { description: 'Please connect your wallet first.' });
        return;
      }

      toast.loading('Claiming rewards...', { description: 'Please confirm the transaction.' });
      const result = await claimBNBRewards();
      const receipt = await result.wait();

      if (receipt.status === 1) {
        toast.dismiss();
        toast.success('Rewards claimed! 🎉', { description: 'Your staking rewards have been sent to your wallet.' });
        refetchUser();
      } else {
        toast.dismiss();
        toast.error('Claim failed', { description: 'Transaction reverted.' });
      }
    } catch (err: any) {
      console.error('[Staking] Claim error:', err);
      toast.dismiss();
      toast.error('Claim failed', { description: err?.message || 'Unknown error' });
    } finally {
      setIsClaiming(false);
    }
  };

  const userStaked = userData?.totalStaked ?? 0;
  const userUnstaked = userData?.totalUnstaked ?? 0;
  const userEarned = userData ? parseFloat(userData.bnbEarned) : 0;

  return (
    <div className={cn("min-h-screen pb-24 px-3 sm:px-4 max-w-5xl mx-auto", isCollapsed && "pt-16 md:pt-0")}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center justify-between py-5 sm:py-6"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center flex-shrink-0">
            <img src={dehubCoin} alt="DHB" className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Staking</h1>
            <p className="text-xs text-white/40">Stake to unlock profit share, lower fees, superpowers and more!</p>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors flex-shrink-0"
        >
          <RefreshCw className="w-4 h-4 text-white/60" />
        </button>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard icon={Lock} label="Total Staked" value={statsLoading ? '—' : formatNumber(stats?.totalStaked ?? '0')} subtitle="DHB across all chains" accent="bg-blue-500" delay={0} />
        <StatCard icon={DollarSign} label="Total Value Locked" value={statsLoading ? '—' : formatUSD(tvl)} subtitle={`@ $${dhbPrice.toFixed(6)}/DHB`} accent="bg-emerald-500" delay={0.05} />
        <StatCard icon={TrendingUp} label="Est. APY" value={`${ESTIMATED_APY}%`} subtitle="Variable rate" accent="bg-purple-500" delay={0.1} />
        <StatCard icon={Activity} label="Unstake Events" value={queueLoading ? '—' : `${unstakeQueue?.length ?? 0}`} subtitle="Recent unstakes" accent="bg-rose-500" delay={0.15} />
      </div>

      {/* Multi-chain notice */}
      {userData?.hasBothChains && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-start gap-2.5 p-3 rounded-xl border border-amber-500/20 bg-amber-500/5 mb-4"
        >
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300/80">
            You have DHB on both BNB and Base chains. Staking will process one chain at a time — come back after to stake the other.
          </p>
        </motion.div>
      )}

      {/* Stake / Unstake Actions */}
      <div className={cn("grid gap-4 mb-6", userStaked > 0 ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1")}>
        {/* Stake */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-5"
        >
          <div className="flex items-center gap-2 mb-4">
            <ArrowDownToLine className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider">Stake DHB</h2>
          </div>
          <p className="text-xs text-white/40 mb-4">
            Stake your DHB tokens to earn rewards. The correct chain will be detected automatically.
          </p>
          <div className="flex gap-2">
            <div className="relative flex-1 min-w-0">
              <input
                type="number"
                placeholder={userUnstaked > 0 ? `${formatNumber(userUnstaked)} DHB` : 'Amount DHB'}
                value={stakeAmount}
                onChange={(e) => setStakeAmount(e.target.value)}
                className="w-full px-3 py-2.5 pr-14 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-white/30"
              />
              <button
                type="button"
                onClick={() => setStakeAmount(userUnstaked.toString())}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-1 text-white/50 text-[10px] font-bold uppercase hover:text-white transition-colors"
              >
                Max
              </button>
            </div>
            <button
              onClick={handleStake}
              disabled={isStaking || isApproving || !stakeAmount}
              className={cn(
                "px-5 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 transition-all flex-shrink-0",
                (isStaking || isApproving)
                  ? "bg-white/10 text-white/40 cursor-not-allowed"
                  : "bg-white/10 text-white hover:bg-white/20 border border-white/15"
              )}
            >
              {isApproving ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Approving...</>
              ) : isStaking ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> {stakingChainLabel || 'Staking'}...</>
              ) : (
                <><ArrowDownToLine className="w-4 h-4" /> Stake</>
              )}
            </button>
          </div>
        </motion.div>

        {/* Unstake — only visible when user has staked balance */}
        {userStaked > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-5"
          >
            <div className="flex items-center gap-2 mb-4">
              <ArrowUpFromLine className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider">Unstake DHB</h2>
            </div>
            <p className="text-xs text-white/40 mb-4">
              Withdraw your staked DHB. Tokens will be returned to your wallet.
            </p>
            <div className="flex gap-2">
              <div className="relative flex-1 min-w-0">
                <input
                  type="number"
                  placeholder={`${userStaked.toLocaleString()} DHB`}
                  value={unstakeAmount}
                  onChange={(e) => setUnstakeAmount(e.target.value)}
                  className="w-full px-3 py-2.5 pr-14 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-amber-500/50"
                />
                <button
                  type="button"
                  onClick={() => setUnstakeAmount(userStaked.toString())}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-amber-400 text-[10px] font-bold uppercase hover:text-amber-300 transition-colors"
                >
                  Max
                </button>
              </div>
              <button
                onClick={handleUnstake}
                disabled={isUnstaking || !unstakeAmount}
                className={cn(
                  "px-5 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 transition-all flex-shrink-0",
                  isUnstaking
                    ? "bg-amber-500/20 text-amber-400/60 cursor-not-allowed"
                    : "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border border-amber-500/20"
                )}
              >
                {isUnstaking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />}
                Unstake
              </button>
            </div>
          </motion.div>
        )}
      </div>

      {/* User Balance Row — Staked + Unstaked + Rewards + Claim */}
      {userData && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6"
        >
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 sm:p-4 flex items-center gap-2.5">
            <Lock className="w-4 h-4 sm:w-5 sm:h-5 text-white/70 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] text-white/40 uppercase tracking-wider">Your Staked</p>
              <p className="text-sm font-bold text-white truncate">{formatNumber(userStaked)} <span className="text-white/40 text-xs">DHB</span></p>
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 sm:p-4 flex items-center gap-2.5">
            <Wallet className="w-4 h-4 sm:w-5 sm:h-5 text-white/70 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] text-white/40 uppercase tracking-wider">Unstaking</p>
              <p className="text-sm font-bold text-white truncate">{formatNumber(userData?.totalUnstakeQueued ?? 0)} <span className="text-white/40 text-xs">DHB</span></p>
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 sm:p-4 flex items-center gap-2.5">
            <Gift className="w-4 h-4 sm:w-5 sm:h-5 text-white/70 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] text-white/40 uppercase tracking-wider">Rewards</p>
              <p className="text-sm font-bold text-white truncate">{formatNumber(userEarned, 2)} <span className="text-white/40 text-xs">DHB</span></p>
            </div>
          </div>
          <button
            onClick={handleClaim}
            disabled={isClaiming || userEarned <= 0}
            className={cn(
              "rounded-xl border p-3 sm:p-4 flex items-center justify-center gap-2 text-sm font-medium transition-all",
              isClaiming || userEarned <= 0
                ? "bg-white/[0.02] border-white/5 text-white/30 cursor-not-allowed"
                : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20"
            )}
          >
            {isClaiming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gift className="w-4 h-4" />}
            Claim
          </button>
        </motion.div>
      )}

      {/* Unstake Queue */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
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
            <div className="hidden sm:grid grid-cols-[1fr_1fr_80px_80px_40px] gap-2 px-5 py-2 text-xs text-white/30 uppercase tracking-wider">
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
                className="px-4 sm:px-5 py-3 hover:bg-white/[0.02] transition-colors"
              >
                <div className="hidden sm:grid grid-cols-[1fr_1fr_80px_80px_40px] gap-2 items-center">
                  <span className="text-sm text-white/70 font-mono">{truncateAddress(event.wallet)}</span>
                  <span className="text-sm text-white font-medium text-right">{event.amount} <span className="text-white/40 text-xs">DHB</span></span>
                  <span className="text-center">
                    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", event.chain === 'BNB' ? "bg-yellow-500/10 text-yellow-400/80" : "bg-zinc-500/10 text-zinc-300")}>{event.chain}</span>
                  </span>
                  <span className="text-xs text-white/40 text-right">{timeAgo(event.timestamp)}</span>
                  <a href={getExplorerUrl(event.txHash, event.chain)} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center w-7 h-7 rounded-lg hover:bg-white/10 transition-colors">
                    <ExternalLink className="w-3.5 h-3.5 text-white/30" />
                  </a>
                </div>
                <div className="flex sm:hidden items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-sm text-white/70 font-mono block">{truncateAddress(event.wallet)}</span>
                    <span className="text-xs text-white/40">{timeAgo(event.timestamp)}</span>
                  </div>
                  <div className="text-right flex items-center gap-2 flex-shrink-0">
                    <div>
                      <span className="text-sm text-white font-medium block">{event.amount} DHB</span>
                      <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium", event.chain === 'BNB' ? "bg-yellow-500/10 text-yellow-400/80" : "bg-zinc-500/10 text-zinc-300")}>{event.chain}</span>
                    </div>
                    <a href={getExplorerUrl(event.txHash, event.chain)} target="_blank" rel="noopener noreferrer" className="w-7 h-7 flex items-center justify-center">
                      <ExternalLink className="w-3.5 h-3.5 text-white/30" />
                    </a>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Why Stake Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl overflow-hidden"
      >
        <div className="p-5 border-b border-white/5">
          <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider">Why Stake?</h2>
          <p className="text-xs text-white/30 mt-1">Unlock powerful benefits by staking your DHB tokens</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-5 items-start">
          {/* Profit Share */}
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4 space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center">
                <DollarSign className="w-4 h-4 text-white" />
              </div>
              <h3 className="text-sm font-semibold text-white">Profit Share</h3>
            </div>
            <p className="text-xs text-white/50 leading-relaxed">
              Earn a share of platform revenue distributed to stakers. The more you stake, the larger your share of the rewards pool.
            </p>
          </div>

          {/* Reduced Fees */}
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4 space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center">
                <Percent className="w-4 h-4 text-white" />
              </div>
              <h3 className="text-sm font-semibold text-white">Reduced Fees</h3>
            </div>
            <p className="text-xs text-white/50 leading-relaxed mb-2">
              Higher badge tiers unlock lower platform fees — down to just 1%.
            </p>
            <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
              {BADGE_LEVELS.map((b, i) => {
                const fee = i === BADGE_LEVELS.length - 1 ? 1 : parseFloat((10 - i * 0.69).toFixed(2));
                const badgeUrl = getBadgeUrl(b.min);
                return (
                  <div key={b.name} className="flex items-center justify-between py-1 px-2 rounded-md bg-white/[0.02]">
                    <div className="flex items-center gap-2">
                      {badgeUrl && <img src={badgeUrl} alt={b.name} className="w-4 h-4" />}
                      <span className="text-[11px] text-white/60">{b.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-white/30">{b.min.toLocaleString()} DHB</span>
                      <span className="text-[11px] font-medium text-white/80">{fee}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Super Powers */}
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4 space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center">
                <Zap className="w-4 h-4 text-white" />
              </div>
              <h3 className="text-sm font-semibold text-white">Super Powers</h3>
            </div>
            <ul className="space-y-1.5 text-xs text-white/50">
              <li className="flex items-center gap-2">
                <Rocket className="w-3 h-3 text-white/30 flex-shrink-0" />
                <span>Trending boosts — your content ranks higher</span>
              </li>
              <li className="flex items-center gap-2">
                <TrendingUp className="w-3 h-3 text-white/30 flex-shrink-0" />
                <span>Timeline exposure — more visibility in feeds</span>
              </li>
            </ul>
          </div>

          {/* Increased Limits */}
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4 space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center">
                <Crown className="w-4 h-4 text-white" />
              </div>
              <h3 className="text-sm font-semibold text-white">Increased Limits & Better Features</h3>
            </div>
            <p className="text-xs text-white/50 leading-relaxed">
              Higher staking tiers unlock increased transaction limits, priority support, exclusive features, and stronger governance voting power.
            </p>
          </div>

          {/* Early Access */}
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4 space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center">
                <Clock className="w-4 h-4 text-white" />
              </div>
              <h3 className="text-sm font-semibold text-white">Early Access to Features</h3>
            </div>
            <p className="text-xs text-white/50 leading-relaxed">
              Be the first to try new platform features before they roll out to everyone. Stakers get priority access to beta releases and upcoming tools.
            </p>
          </div>

          {/* Enhanced Experience */}
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4 space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-white" />
              </div>
              <h3 className="text-sm font-semibold text-white">Enhanced Experience</h3>
            </div>
            <p className="text-xs text-white/50 leading-relaxed">
              Enjoy a premium experience with ad-free browsing, higher upload limits, and exclusive UI customizations.
            </p>
          </div>

          {/* Airdrops */}
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4 space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center">
                <Gift className="w-4 h-4 text-white" />
              </div>
              <h3 className="text-sm font-semibold text-white">Airdrops</h3>
            </div>
            <p className="text-xs text-white/50 leading-relaxed">
              Stakers are eligible for exclusive token airdrops and bonus reward distributions. The more you stake, the more you receive.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
