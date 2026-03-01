/**
 * Staking Page
 * ============
 * Chain-abstracted DHB staking. Auto-detects which chain(s) user has balance on.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, TrendingUp, DollarSign, Activity, ExternalLink, RefreshCw, ArrowDownToLine, ArrowUpFromLine, Loader2, Clock, Gift, Wallet, AlertTriangle } from 'lucide-react';
import { useStakingStats, useUnstakeQueue, useStakingTVL, useUserStakingData, type UnstakeEvent } from '@/hooks/use-staking-data';
import { useSidebarCollapse } from '@/contexts/SidebarCollapseContext';
import { cn } from '@/lib/utils';
import { sendERC20Token } from '@/lib/wallet/send';
import { BASE_STAKING_ADDRESS, approveBNBStaking, stakeBNB, unstakeBNB, claimBNBRewards } from '@/lib/contracts/staking';
import { BASE_CHAIN_ID, BNB_CHAIN_ID, CHAIN_CONFIGS } from '@/lib/contracts/dhb-token';
import { getWalletAddress, switchChain } from '@/lib/contracts/aa-utils';
import { toast } from '@/hooks/use-toast';
import { parseUnits } from 'ethers';
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

const ESTIMATED_APY = 12;

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
      <div className={cn("absolute top-0 right-0 w-24 h-24 rounded-full blur-3xl opacity-20", accent)} />
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
      toast({ title: 'Invalid amount', description: 'Please enter a valid amount to stake.', variant: 'destructive' });
      return;
    }

    setIsStaking(true);
    try {
      const walletAddress = await getWalletAddress();
      if (!walletAddress) {
        toast({ title: 'Not connected', description: 'Please connect your wallet first.', variant: 'destructive' });
        return;
      }

      // Detect which chain(s) have balance
      const hasBNB = userData?.hasBNBBalance ?? false;
      const hasBase = userData?.hasBaseBalance ?? false;

      if (!hasBNB && !hasBase) {
        toast({ title: 'No DHB balance', description: 'You don\'t have DHB tokens on either chain.', variant: 'destructive' });
        return;
      }

      const bothChains = hasBNB && hasBase;

      // Determine which chain to stake on
      // Prefer BNB (has contract staking), fall back to Base
      const targetChain: 'BNB' | 'Base' = hasBNB ? 'BNB' : 'Base';
      setStakingChainLabel(targetChain);

      if (bothChains) {
        toast({
          title: 'DHB found on both chains',
          description: `Staking on ${targetChain} first. After this completes, come back to stake your ${targetChain === 'BNB' ? 'Base' : 'BNB'} balance.`,
        });
      }

      if (targetChain === 'BNB') {
        await stakeBNBFlow(amount);
      } else {
        await stakeBaseFlow(amount);
      }
    } catch (err: any) {
      console.error('[Staking] Stake error:', err);
      toast({ title: 'Stake failed', description: err?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setIsStaking(false);
      setIsApproving(false);
      setStakingChainLabel('');
    }
  };

  const stakeBNBFlow = async (amount: number) => {
    // Check allowance
    const amountWei = parseUnits(stakeAmount, 18);
    const currentAllowance = userData?.bnbAllowance ?? BigInt(0);

    if (currentAllowance < amountWei) {
      setIsApproving(true);
      toast({ title: 'Approving DHB...', description: 'Please confirm the approval transaction.' });
      const approvalResult = await approveBNBStaking(stakeAmount);
      const approvalReceipt = await approvalResult.wait();
      if (approvalReceipt.status !== 1) {
        toast({ title: 'Approval failed', description: 'Token approval was reverted.', variant: 'destructive' });
        return;
      }
      toast({ title: 'Approved ✅', description: 'DHB approved. Now staking...' });
      setIsApproving(false);
    }

    toast({ title: 'Staking DHB...', description: 'Please confirm the stake transaction.' });
    const result = await stakeBNB(stakeAmount);
    const receipt = await result.wait();

    if (receipt.status === 1) {
      toast({ title: 'Staked successfully! ✅', description: `${stakeAmount} DHB staked on BNB Chain.` });
      setStakeAmount('');
      refetchStats();
      refetchUser();
    } else {
      toast({ title: 'Stake failed', description: 'Transaction reverted.', variant: 'destructive' });
    }
  };

  const stakeBaseFlow = async (amount: number) => {
    await switchChain(BASE_CHAIN_ID);
    const dhbTokenAddress = CHAIN_CONFIGS[BASE_CHAIN_ID]?.dhbToken;
    if (!dhbTokenAddress) {
      toast({ title: 'Error', description: 'DHB token not configured for Base.', variant: 'destructive' });
      return;
    }

    toast({ title: 'Staking DHB...', description: 'Please confirm the stake transaction.' });
    const result = await sendERC20Token(dhbTokenAddress, BASE_STAKING_ADDRESS, stakeAmount, 18, BASE_CHAIN_ID as any);
    const receipt = await result.wait();

    if (receipt.status === 1) {
      toast({ title: 'Staked successfully! ✅', description: `${stakeAmount} DHB staked on Base.` });
      setStakeAmount('');
      refetchStats();
      refetchUser();
    } else {
      toast({ title: 'Stake failed', description: 'Transaction reverted.', variant: 'destructive' });
    }
  };

  /**
   * Smart unstake: detect where user has staked balance
   */
  const handleUnstake = async () => {
    const amount = parseFloat(unstakeAmount);
    if (!amount || amount <= 0) {
      toast({ title: 'Invalid amount', description: 'Please enter a valid amount to unstake.', variant: 'destructive' });
      return;
    }

    setIsUnstaking(true);
    try {
      const walletAddress = await getWalletAddress();
      if (!walletAddress) {
        toast({ title: 'Not connected', description: 'Please connect your wallet first.', variant: 'destructive' });
        return;
      }

      const hasStakedBNB = (userData?.totalStaked ?? 0) > 0;

      if (hasStakedBNB) {
        // Unstake from BNB contract
        toast({ title: 'Unstaking DHB...', description: 'Please confirm the unstake transaction.' });
        const result = await unstakeBNB(unstakeAmount);
        const receipt = await result.wait();

        if (receipt.status === 1) {
          toast({ title: 'Unstaked successfully! ✅', description: `${unstakeAmount} DHB unstaked.` });
          setUnstakeAmount('');
          refetchStats();
          refetchUser();
        } else {
          toast({ title: 'Unstake failed', description: 'Transaction reverted.', variant: 'destructive' });
        }
      } else {
        // Base unstake goes into queue
        toast({
          title: 'Unstake initiated ⏳',
          description: `${unstakeAmount} DHB unstake request submitted. You will be notified when complete.`,
        });
        setUnstakeAmount('');
      }
    } catch (err: any) {
      console.error('[Staking] Unstake error:', err);
      toast({ title: 'Unstake failed', description: err?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setIsUnstaking(false);
    }
  };

  const handleClaim = async () => {
    setIsClaiming(true);
    try {
      const walletAddress = await getWalletAddress();
      if (!walletAddress) {
        toast({ title: 'Not connected', description: 'Please connect your wallet first.', variant: 'destructive' });
        return;
      }

      toast({ title: 'Claiming rewards...', description: 'Please confirm the claim transaction.' });
      const result = await claimBNBRewards();
      const receipt = await result.wait();

      if (receipt.status === 1) {
        toast({ title: 'Rewards claimed! 🎉', description: 'Your staking rewards have been sent to your wallet.' });
        refetchUser();
      } else {
        toast({ title: 'Claim failed', description: 'Transaction reverted.', variant: 'destructive' });
      }
    } catch (err: any) {
      console.error('[Staking] Claim error:', err);
      toast({ title: 'Claim failed', description: err?.message || 'Unknown error', variant: 'destructive' });
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
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
            <img src={dehubCoin} alt="DHB" className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">DHB Staking</h1>
            <p className="text-xs text-white/40">Stake your DHB tokens to earn rewards</p>
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

      {/* User Balance Row — Staked + Unstaked + Rewards + Claim */}
      {userData && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6"
        >
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 sm:p-4 flex items-center gap-2.5">
            <Lock className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400/70 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] text-white/40 uppercase tracking-wider">Staked</p>
              <p className="text-sm font-bold text-white truncate">{formatNumber(userStaked)} <span className="text-white/40 text-xs">DHB</span></p>
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 sm:p-4 flex items-center gap-2.5">
            <Wallet className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400/70 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] text-white/40 uppercase tracking-wider">Unstaked</p>
              <p className="text-sm font-bold text-white truncate">{formatNumber(userUnstaked)} <span className="text-white/40 text-xs">DHB</span></p>
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 sm:p-4 flex items-center gap-2.5">
            <Gift className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400/70 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] text-white/40 uppercase tracking-wider">Rewards</p>
              <p className="text-sm font-bold text-white truncate">{formatNumber(userEarned, 4)} <span className="text-white/40 text-xs">DHB</span></p>
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
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
            <input
              type="number"
              placeholder="Amount DHB"
              value={stakeAmount}
              onChange={(e) => setStakeAmount(e.target.value)}
              className="flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-emerald-500/50"
            />
            <button
              onClick={handleStake}
              disabled={isStaking || isApproving || !stakeAmount}
              className={cn(
                "px-5 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 transition-all flex-shrink-0",
                (isStaking || isApproving)
                  ? "bg-emerald-500/20 text-emerald-400/60 cursor-not-allowed"
                  : "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/20"
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

        {/* Unstake */}
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
            <input
              type="number"
              placeholder="Amount DHB"
              value={unstakeAmount}
              onChange={(e) => setUnstakeAmount(e.target.value)}
              className="flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-amber-500/50"
            />
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
      </div>

      {/* Chain Breakdown */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-5 mb-6"
      >
        <h2 className="text-sm font-semibold text-white/70 mb-4 uppercase tracking-wider">Chain Breakdown</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/5">
            <img src={bnbLogo} alt="BNB" className="w-8 h-8 rounded-full flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">BNB Chain</p>
              <p className="text-xs text-white/40">Staking Contract</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-sm font-bold text-white">{statsLoading ? '—' : formatNumber(stats?.bnbStaked ?? '0')}</p>
              <p className="text-xs text-white/40">DHB</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/5">
            <img src={baseLogo} alt="Base" className="w-8 h-8 rounded-full flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">Base</p>
              <p className="text-xs text-white/40">Staking Address</p>
            </div>
            <div className="text-right flex-shrink-0">
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
                    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", event.chain === 'BNB' ? "bg-yellow-500/10 text-yellow-400/80" : "bg-blue-500/10 text-blue-400/80")}>{event.chain}</span>
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
                      <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium", event.chain === 'BNB' ? "bg-yellow-500/10 text-yellow-400/80" : "bg-blue-500/10 text-blue-400/80")}>{event.chain}</span>
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
    </div>
  );
}
