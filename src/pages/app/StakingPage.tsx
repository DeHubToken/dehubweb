/**
 * Staking Page
 * ============
 * Chain-abstracted DHB staking. Auto-detects which chain(s) user has balance on.
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Interface, parseUnits } from 'ethers';
import { Lock, TrendingUp, DollarSign, Activity, ExternalLink, RefreshCw, ArrowDownToLine, ArrowUpFromLine, Loader2, Clock, Gift, Wallet, AlertTriangle, Percent, Zap, Crown, Rocket, X, Copy } from 'lucide-react';
import { BADGE_LEVELS, getBadgeUrl } from '@/lib/staking-badges';
import { useStakingStats, useUnstakeQueue, useStakingTVL, useUserStakingData, getUserDHBBalance, type UnstakeEvent } from '@/hooks/use-staking-data';
import { useSidebarCollapse } from '@/contexts/SidebarCollapseContext';
import { cn } from '@/lib/utils';
import { sendERC20Token } from '@/lib/wallet/send';
import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { STAKING_ADDRESS, claimBNBRewards } from '@/lib/contracts/staking';
import { BASE_CHAIN_ID, BNB_CHAIN_ID, CHAIN_CONFIGS, fromWei } from '@/lib/contracts/dhb-token';
import { getWalletAddress, switchChain } from '@/lib/contracts/aa-utils';
import { toast } from 'sonner';
import { LiquidGlassBubble } from '@/components/ui/liquid-glass-bubble';
import { LiquidGlassBubble2 } from '@/components/ui/liquid-glass-bubble-2';
import { useTranslation } from 'react-i18next';

import dehubCoin from '@/assets/dehub-coin.png';

const UNSTAKE_COOLDOWN_DAYS = 12;
const UNSTAKE_COOLDOWN_MS = UNSTAKE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

function UnstakeCountdown({ timestamp }: { timestamp: number }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const createdAt = timestamp * 1000;
  const endTime = createdAt + UNSTAKE_COOLDOWN_MS;
  const remaining = endTime - now;

  if (remaining <= 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/20 text-emerald-400">
        Ready
      </span>
    );
  }

  const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
  const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const mins = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
  const secs = Math.floor((remaining % (1000 * 60)) / 1000);

  const progress = 1 - remaining / UNSTAKE_COOLDOWN_MS;

  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-amber-400/80">
      <Clock className="w-3 h-3 shrink-0" />
      {days}d {String(hours).padStart(2, '0')}h {String(mins).padStart(2, '0')}m {String(secs).padStart(2, '0')}s
      <span className="w-12 h-1 rounded-full bg-white/10 overflow-hidden">
        <span className="block h-full rounded-full bg-amber-400/60 transition-all" style={{ width: `${(progress * 100).toFixed(1)}%` }} />
      </span>
    </span>
  );
}

function formatNumber(val: string | number, decimals = 0): string {
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return '0';
  if (num >= 1_000_000_000) return (Math.floor(num / 1_000_000_000 * 100) / 100).toFixed(2) + 'B';
  if (num >= 1_000_000) return (Math.floor(num / 1_000_000 * 100) / 100).toFixed(2) + 'M';
  if (num >= 1_000) return (Math.floor(num / 1_000 * 100) / 100).toFixed(2) + 'K';
  const factor = Math.pow(10, decimals);
  return (Math.floor(num * factor) / factor).toFixed(decimals);
}

function formatUSD(val: number): string {
  if (val >= 1_000_000) return '$' + (val / 1_000_000).toFixed(2) + 'M';
  if (val >= 1_000) return '$' + (val / 1_000).toFixed(2) + 'K';
  return '$' + val.toFixed(2);
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
  const { t } = useTranslation();
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
  const [stakingChainLabel, setStakingChainLabel] = useState('');
  const [currentWallet, setCurrentWallet] = useState('');
  const [cancellingTx, setCancellingTx] = useState<string | null>(null);

  function timeAgo(timestamp: number): string {
    if (!timestamp) return '—';
    const now = Math.floor(Date.now() / 1000);
    const diff = now - timestamp;
    if (diff < 60) return t('staking.justNow');
    if (diff < 3600) return t('staking.minutesAgo', { count: Math.floor(diff / 60) });
    if (diff < 86400) return t('staking.hoursAgo', { count: Math.floor(diff / 3600) });
    return t('staking.daysAgo', { count: Math.floor(diff / 86400) });
  }

  useEffect(() => {
    getWalletAddress().then(addr => {
      if (addr) setCurrentWallet(addr.toLowerCase());
    });
  }, []);

  const handleRefresh = () => {
    refetchStats();
    refetchQueue();
    refetchUser();
  };

  const handleCancelUnstake = async (txHash: string) => {
    setCancellingTx(txHash);
    try {
      const { error } = await withWalletHeader(
        supabase
          .from('staking_records')
          .delete()
          .eq('tx_hash', txHash),
        currentWallet
      );

      if (error) throw error;

      toast.success(t('toasts.unstake_cancelled'), { description: t('toasts.unstake_request_removed') });
      refetchQueue();
      refetchUser();
      refetchStats();
    } catch (err: any) {
      console.error('[Staking] Cancel unstake error:', err);
      toast.error(t('toasts.failed_to_cancel'), { description: err?.message || 'Unknown error' });
    } finally {
      setCancellingTx(null);
    }
  };

  const hasVerifiedStakeTransfer = async (
    txHash: string,
    tokenAddress: string,
    fromAddress: string,
    expectedAmount: number,
    chainId: typeof BNB_CHAIN_ID | typeof BASE_CHAIN_ID
  ): Promise<boolean> => {
    const rpcUrl = CHAIN_CONFIGS[chainId]?.rpcUrl;
    if (!rpcUrl) return false;

    const transferInterface = new Interface([
      'event Transfer(address indexed from, address indexed to, uint256 value)',
    ]);

    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getTransactionReceipt',
        params: [txHash],
      }),
    });

    const payload = await response.json();
    const logs = payload?.result?.logs;
    if (!Array.isArray(logs)) return false;

    const fromLower = fromAddress.toLowerCase();
    const toLower = STAKING_ADDRESS.toLowerCase();
    const tokenLower = tokenAddress.toLowerCase();
    const expected = parseUnits(String(expectedAmount), 18);

    for (const log of logs as any[]) {
      if ((log?.address ?? '').toLowerCase() !== tokenLower) continue;
      try {
        const parsed = transferInterface.parseLog({
          topics: log.topics,
          data: log.data,
        });

        if (parsed?.name !== 'Transfer') continue;

        const transferFrom = String(parsed.args?.from ?? '').toLowerCase();
        const transferTo = String(parsed.args?.to ?? '').toLowerCase();
        const transferValue = BigInt(parsed.args?.value?.toString?.() ?? '0');

        if (transferFrom === fromLower && transferTo === toLower && transferValue === expected) {
          return true;
        }
      } catch {
        // ignore unrelated logs
      }
    }

    return false;
  };

  const handleStake = async () => {
    const amount = parseFloat(stakeAmount);
    if (!amount || amount <= 0) {
      toast.error(t('toasts.invalid_amount'), { description: t('toasts.please_enter_valid_amount_stake') });
      return;
    }

    setIsStaking(true);
    try {
      const walletAddress = await getWalletAddress();
      if (!walletAddress) {
        toast.error(t('toasts.not_connected'), { description: t('toasts.please_connect_wallet_first') });
        return;
      }

      // Fresh on-chain balance check (never rely on cached data)
      toast.loading(t('toasts.checking_balance', 'Checking balance...'));
      const [bnbBalRaw, baseBalRaw] = await Promise.all([
        getUserDHBBalance(walletAddress, BNB_CHAIN_ID),
        getUserDHBBalance(walletAddress, BASE_CHAIN_ID),
      ]);

      const bnbBal = parseFloat(fromWei(bnbBalRaw));
      const baseBal = parseFloat(fromWei(baseBalRaw));

      toast.dismiss();

      if (bnbBal <= 0 && baseBal <= 0) {
        toast.error(t('toasts.no_dhb_balance'), { description: t('toasts.no_dhb_tokens_either_chain') });
        return;
      }

      // Pick chain with sufficient balance
      const bothChains = bnbBal > 0 && baseBal > 0;
      let targetChain: 'BNB' | 'Base';

      if (bnbBal >= amount) {
        targetChain = 'BNB';
      } else if (baseBal >= amount) {
        targetChain = 'Base';
      } else {
        // Neither chain has enough for the full amount
        const maxBal = Math.max(bnbBal, baseBal);
        const maxChain = bnbBal >= baseBal ? 'BNB Chain' : 'Base';
        toast.error(t('toasts.insufficient_balance', 'Insufficient balance'), {
          description: t('toasts.max_available_on_chain', 'Max available: {{amount}} DHB on {{chain}}', { amount: maxBal.toFixed(2), chain: maxChain }),
        });
        return;
      }

      setStakingChainLabel(targetChain);

      if (bothChains && bnbBal >= amount && baseBal >= amount) {
        toast.info(t('toasts.dhb_found_on_both_chains'), { description: t('toasts.staking_on_chain_first', { chain: targetChain }) });
      }

      if (targetChain === 'BNB') {
        await stakeTransferFlow(amount, BNB_CHAIN_ID, 'BNB Chain', walletAddress);
      } else {
        await stakeTransferFlow(amount, BASE_CHAIN_ID, 'Base', walletAddress);
      }
    } catch (err: any) {
      console.error('[Staking] Stake error:', err);
      toast.dismiss();
      toast.error(t('toasts.stake_failed'), { description: err?.message || 'Unknown error' });
    } finally {
      setIsStaking(false);
      setIsApproving(false);
      setStakingChainLabel('');
    }
  };

  const stakeTransferFlow = async (
    amount: number,
    chainId: typeof BNB_CHAIN_ID | typeof BASE_CHAIN_ID,
    chainLabel: string,
    walletAddress: string
  ) => {
    await switchChain(chainId);
    const dhbTokenAddress = CHAIN_CONFIGS[chainId]?.dhbToken;
    if (!dhbTokenAddress) {
      toast.error(t('toasts.error'), { description: t('toasts.dhb_token_not_configured', { chain: chainLabel }) });
      return;
    }

    toast.loading(t('toasts.confirming_transaction'));
    const result = await sendERC20Token(dhbTokenAddress, STAKING_ADDRESS, String(amount), 18, chainId as any);

    toast.loading(t('toasts.transaction_submitted'), { description: t('toasts.waiting_for_confirmation') });
    const receipt = await result.wait();

    if (receipt.status === 1) {
      const hasTransfer = await hasVerifiedStakeTransfer(
        receipt.hash,
        dhbTokenAddress,
        walletAddress,
        amount,
        chainId
      );

      if (!hasTransfer) {
        toast.dismiss();
        toast.error(t('toasts.stake_failed'), {
          description: 'No confirmed on-chain transfer to staking address was found for this transaction.',
        });
        return;
      }

      const chainName = chainId === BNB_CHAIN_ID ? 'BNB' : 'Base';
      try {
        await supabase.from('staking_records').insert({
          wallet_address: walletAddress.toLowerCase(),
          amount,
          chain: chainName,
          tx_hash: receipt.hash || '',
          action: 'stake',
        });
      } catch (dbErr) {
        console.error('[Staking] Failed to record stake in DB:', dbErr);
      }
      toast.dismiss();
      toast.success(t('toasts.staked_successfully'), { description: t('toasts.dhb_staked_on_chain', { amount: String(amount), chain: chainLabel }) });
      setStakeAmount('');
      refetchStats();
      refetchUser();
    } else {
      toast.dismiss();
      toast.error(t('toasts.stake_failed'), { description: t('toasts.transaction_reverted') });
    }
  };

  const handleUnstake = async () => {
    const amount = parseFloat(unstakeAmount);
    if (!amount || amount <= 0) {
      toast.error(t('toasts.invalid_amount'), { description: t('toasts.please_enter_valid_amount_unstake') });
      return;
    }

    const userStakedNow = userData?.totalStaked ?? 0;
    if (amount > userStakedNow) {
      toast.error(t('toasts.insufficient_staked_balance'), { description: t('toasts.only_have_dhb_staked', { amount: userStakedNow.toFixed(2) }) });
      return;
    }

    setIsUnstaking(true);
    try {
      const walletAddress = await getWalletAddress();
      if (!walletAddress) {
        toast.error(t('toasts.not_connected'), { description: t('toasts.please_connect_wallet_first') });
        return;
      }

      const { error } = await supabase
        .from('staking_records')
        .insert({
          wallet_address: walletAddress.toLowerCase(),
          amount,
          chain: 'Base',
          action: 'unstake',
          tx_hash: `unstake-request-${Date.now()}`,
        });

      if (error) throw error;

      toast.success(t('toasts.unstake_request_submitted'), { description: t('toasts.dhb_added_to_unstake_queue', { amount: unstakeAmount, tokenWord: parseFloat(unstakeAmount) === 1 ? 'token' : 'tokens' }) });
      setUnstakeAmount('');
      refetchStats();
      refetchUser();
      refetchQueue();
    } catch (err: any) {
      console.error('[Staking] Unstake error:', err);
      toast.error(t('toasts.unstake_failed'), { description: err?.message || 'Unknown error' });
    } finally {
      setIsUnstaking(false);
    }
  };

  const handleClaim = async () => {
    setIsClaiming(true);
    try {
      const walletAddress = await getWalletAddress();
      if (!walletAddress) {
        toast.error(t('toasts.not_connected'), { description: t('toasts.please_connect_wallet_first') });
        return;
      }

      toast.loading(t('toasts.claiming_rewards'), { description: t('toasts.please_confirm_transaction') });
      const result = await claimBNBRewards();
      const receipt = await result.wait();

      if (receipt.status === 1) {
        toast.dismiss();
        toast.success(t('toasts.rewards_claimed'), { description: t('toasts.rewards_sent_to_wallet') });
        refetchUser();
      } else {
        toast.dismiss();
        toast.error(t('toasts.claim_failed'), { description: t('toasts.transaction_reverted') });
      }
    } catch (err: any) {
      console.error('[Staking] Claim error:', err);
      toast.dismiss();
      toast.error(t('toasts.claim_failed'), { description: err?.message || 'Unknown error' });
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
            <h1 className="text-xl font-bold text-white">{t('staking.title')}</h1>
            <p className="text-xs text-white/40">{t('staking.subtitle')}</p>
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
        <StatCard icon={Lock} label={t('staking.totalStaked')} value={statsLoading ? '—' : formatNumber(stats?.totalStaked ?? '0')} subtitle={statsLoading ? '' : `${((Number(stats?.totalStaked ?? 0) / 4_200_000_000) * 100).toFixed(2)}% ${t('staking.ofSupply')}`} accent="bg-white/20" delay={0} />
        <StatCard icon={DollarSign} label={t('staking.totalValueLocked')} value={statsLoading ? '—' : formatUSD(tvl)} subtitle={`@ $${dhbPrice.toFixed(6)}/DHB`} accent="bg-white/20" delay={0.05} />
        <StatCard icon={TrendingUp} label={t('staking.estApy')} value={`${ESTIMATED_APY}%`} subtitle={t('staking.variableRate')} accent="bg-white/20" delay={0.1} />
        <StatCard icon={Activity} label={t('staking.unstakeEvents')} value={queueLoading ? '—' : `${unstakeQueue?.length ?? 0}`} subtitle={t('staking.recentUnstakes')} accent="bg-white/20" delay={0.15} />
      </div>

      {/* Multi-chain notice */}
      {userData?.hasBothChains && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-start gap-2.5 p-3 rounded-xl border border-white/10 bg-white/5 mb-4"
        >
          <AlertTriangle className="w-4 h-4 text-white/60 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-white/60">
            {t('staking.multiChainNotice')}
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
            <ArrowDownToLine className="w-4 h-4 text-white" />
            <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider">{t('staking.stakeDhb')}</h2>
          </div>
          <p className="text-xs text-white/40 mb-4">
            {t('staking.stakeDesc')}
          </p>
          <div className="flex gap-2">
            <LiquidGlassBubble
              shimmer={false}
              noBorder
              className="flex-1 min-w-0 h-[42px] [&>div]:!rounded-xl [&>div]:!h-full [&>div]:before:!rounded-xl [&>div]:after:!rounded-xl"
            >
              <div className="relative flex items-center h-full">
                <input
                  type="number"
                  placeholder={userUnstaked > 0 ? formatNumber(userUnstaked) : '0'}
                  value={stakeAmount}
                  onChange={(e) => setStakeAmount(e.target.value)}
                  className="w-full bg-transparent text-white text-sm placeholder:text-white/30 focus:outline-none pr-10"
                />
                <button
                  type="button"
                  onClick={() => {
                    // Use raw string balances for full precision
                    const bnbBal = userData?.bnbBalance ?? '0';
                    const baseBal = userData?.baseBalance ?? '0';
                    const total = parseFloat(bnbBal) + parseFloat(baseBal);
                    setStakeAmount(total.toFixed(18).replace(/\.?0+$/, ''));
                  }}
                  className="absolute right-0 top-1/2 -translate-y-1/2 px-1 text-white/50 text-[10px] font-bold uppercase hover:text-white transition-colors"
                >
                  {t('staking.max')}
                </button>
              </div>
            </LiquidGlassBubble>
            <LiquidGlassBubble2
              label={t('staking.stake')}
              icon={<ArrowDownToLine className="w-4 h-4" />}
              loading={isApproving || isStaking}
              loadingLabel={isApproving ? t('staking.approving') : t('staking.staking')}
              disabled={!stakeAmount}
              onClick={handleStake}
            />
          </div>

          {/* Alternative manual deposit */}
          <div className="mt-4 flex items-center justify-center gap-2 text-[11px] text-white/40">
            <span>Alternatively, send your tokens directly to</span>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(STAKING_ADDRESS);
                toast.success('Deposit address copied!');
              }}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 transition-colors font-mono text-[10px]"
            >
              {STAKING_ADDRESS.slice(0, 6)}...{STAKING_ADDRESS.slice(-4)}
              <Copy className="w-3 h-3" />
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
              <ArrowUpFromLine className="w-4 h-4 text-white" />
              <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider">{t('staking.unstakeDhb')}</h2>
            </div>
            <p className="text-xs text-white/40 mb-4">
              {t('staking.unstakeDesc')}
            </p>
            <div className="flex gap-2">
              <LiquidGlassBubble
                shimmer={false}
                noBorder
                className="flex-1 min-w-0 h-[42px] [&>div]:!rounded-xl [&>div]:!h-full [&>div]:before:!rounded-xl [&>div]:after:!rounded-xl"
              >
                <div className="relative flex items-center h-full">
                  <input
                    type="number"
                    placeholder={formatNumber(userStaked)}
                    value={unstakeAmount}
                    onChange={(e) => setUnstakeAmount(e.target.value)}
                    className="w-full bg-transparent text-white text-sm placeholder:text-white/30 focus:outline-none pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setUnstakeAmount(userStaked.toString())}
                    className="absolute right-0 top-1/2 -translate-y-1/2 text-white/50 text-[10px] font-bold uppercase hover:text-white transition-colors"
                  >
                    {t('staking.max')}
                  </button>
                </div>
              </LiquidGlassBubble>
              <LiquidGlassBubble2
                label={t('staking.unstake')}
                icon={<ArrowUpFromLine className="w-[18px] h-[18px]" />}
                loading={isUnstaking}
                disabled={!unstakeAmount}
                onClick={handleUnstake}
              />
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
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 sm:p-4">
            <p className="text-[10px] text-white/40 uppercase tracking-wider">{t('staking.yourStaked')}</p>
            <p className="text-sm font-bold text-white truncate">{formatNumber(userStaked)}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 sm:p-4">
            <p className="text-[10px] text-white/40 uppercase tracking-wider">{t('staking.unstaking')}</p>
            <p className="text-sm font-bold text-white truncate">{formatNumber(userData?.totalUnstakeQueued ?? 0)}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 sm:p-4">
            <p className="text-[10px] text-white/40 uppercase tracking-wider">{t('staking.rewards')}</p>
            <p className="text-sm font-bold text-white truncate">{formatNumber(userEarned, 2)}</p>
          </div>
          <LiquidGlassBubble
            shimmer
            noBorder
            onClick={(isClaiming || userEarned <= 0) ? undefined : handleClaim}
            className={cn(
              "cursor-pointer [&>div]:!rounded-xl [&>div]:!h-full [&>div]:before:!rounded-xl [&>div]:after:!rounded-xl [&>div]:!flex [&>div]:!items-center [&>div]:!justify-center",
              (isClaiming || userEarned <= 0) && "opacity-40 cursor-not-allowed"
            )}
          >
            <span className="flex items-center justify-center gap-2 text-white text-sm font-medium">
              {isClaiming && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
              {t('staking.claim')}
            </span>
          </LiquidGlassBubble>
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
          <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider">{t('staking.unstakeQueue')}</h2>
          <p className="text-xs text-white/30 mt-1">{t('staking.recentUnstakeTransactions')}</p>
        </div>

        {queueLoading ? (
          <div className="p-8 text-center">
            <RefreshCw className="w-5 h-5 text-white/30 animate-spin mx-auto mb-2" />
            <p className="text-xs text-white/30">{t('staking.loadingEvents')}</p>
          </div>
        ) : !unstakeQueue?.length ? (
          <div className="p-8 text-center">
            <Activity className="w-6 h-6 text-white/20 mx-auto mb-2" />
            <p className="text-sm text-white/30">{t('staking.noRecentUnstakeEvents')}</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            <div className="hidden sm:grid grid-cols-[1fr_1fr_80px_minmax(100px,1fr)_80px_40px] gap-2 px-5 py-2 text-xs text-white/30 uppercase tracking-wider">
              <span>{t('staking.wallet')}</span>
              <span className="text-right">{t('staking.amount')}</span>
              <span className="text-center">{t('staking.chain')}</span>
              <span className="text-center">Countdown</span>
              <span className="text-right">{t('staking.when')}</span>
              <span />
            </div>
            {unstakeQueue.map((event: UnstakeEvent, idx: number) => {
              const isOwn = currentWallet && event.wallet.toLowerCase() === currentWallet;
              const isCancelling = cancellingTx === event.txHash;
              const explorerBase = event.chain === 'BNB' ? 'https://bscscan.com/address/' : 'https://basescan.org/address/';
              return (
                <motion.div
                  key={event.txHash + idx}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.02 * idx }}
                  className="px-4 sm:px-5 py-3 hover:bg-white/[0.02] transition-colors"
                >
                  <div className="hidden sm:grid grid-cols-[1fr_1fr_80px_minmax(100px,1fr)_80px_40px] gap-2 items-center">
                    <a
                      href={`${explorerBase}${event.wallet}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-white/70 font-mono hover:text-white hover:underline transition-colors"
                    >
                      {truncateAddress(event.wallet)}
                    </a>
                    <span className="text-sm text-white font-medium text-right">{event.amount} <span className="text-white/40 text-xs">DHB</span></span>
                    <span className="text-center">
                      <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", event.chain === 'BNB' ? "bg-white/10 text-white/70" : "bg-white/10 text-white/70")}>{event.chain}</span>
                    </span>
                    <div className="flex flex-col items-center gap-0.5">
                      <UnstakeCountdown timestamp={event.timestamp} />
                    </div>
                    <span className="text-xs text-white/40 text-right">{timeAgo(event.timestamp)}</span>
                    {isOwn ? (
                      <button
                        onClick={() => handleCancelUnstake(event.txHash)}
                        disabled={isCancelling}
                        className="flex items-center justify-center w-7 h-7 rounded-lg hover:bg-red-500/20 transition-colors group"
                        title={t('staking.cancelUnstake')}
                      >
                        {isCancelling ? <Loader2 className="w-3.5 h-3.5 text-white/30 animate-spin" /> : <X className="w-3.5 h-3.5 text-white/30 group-hover:text-red-400" />}
                      </button>
                    ) : <span />}
                  </div>
                  <div className="flex sm:hidden items-center justify-between gap-2">
                    <div className="min-w-0">
                      <a href={`${explorerBase}${event.wallet}`} target="_blank" rel="noopener noreferrer" className="text-sm text-white/70 font-mono block hover:text-white hover:underline transition-colors">{truncateAddress(event.wallet)}</a>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-white/40">{timeAgo(event.timestamp)}</span>
                        <UnstakeCountdown timestamp={event.timestamp} />
                      </div>
                    </div>
                    <div className="text-right flex items-center gap-2 flex-shrink-0">
                      <div>
                        <span className="text-sm text-white font-medium block">{event.amount} DHB</span>
                        <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium", event.chain === 'BNB' ? "bg-white/10 text-white/70" : "bg-white/10 text-white/70")}>{event.chain}</span>
                      </div>
                      {isOwn ? (
                        <button
                          onClick={() => handleCancelUnstake(event.txHash)}
                          disabled={isCancelling}
                          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-500/20 transition-colors"
                        >
                          {isCancelling ? <Loader2 className="w-3.5 h-3.5 text-white/30 animate-spin" /> : <X className="w-3.5 h-3.5 text-white/40" />}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </motion.div>

      {/* Why Stake Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl overflow-hidden"
      >
        <div className="p-5 border-b border-white/5">
          <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider">{t('staking.whyStake')}</h2>
          <p className="text-xs text-white/30 mt-1">{t('staking.unlockBenefits')}</p>
        </div>

        <div className="p-5 columns-1 sm:columns-2 gap-4 space-y-4">
          {/* Profit Share */}
          <div className="break-inside-avoid rounded-xl border border-white/10 bg-white/[0.04] p-4 space-y-2">
            <h3 className="text-sm font-semibold text-white">{t('staking.profitShare')}</h3>
            <p className="text-xs text-white/50 leading-relaxed">
              {t('staking.profitShareDesc')}
            </p>
          </div>

          {/* Super Powers */}
          <div className="break-inside-avoid rounded-xl border border-white/10 bg-white/[0.04] p-4 space-y-2">
            <h3 className="text-sm font-semibold text-white">{t('staking.superPowers')}</h3>
            <ul className="space-y-1.5 text-xs text-white/50">
              <li>• {t('staking.trendingBoosts')}</li>
              <li>• {t('staking.timelineExposure')}</li>
            </ul>
          </div>

          {/* Increased Limits */}
          <div className="break-inside-avoid rounded-xl border border-white/10 bg-white/[0.04] p-4 space-y-2">
            <h3 className="text-sm font-semibold text-white">{t('staking.increasedLimits')}</h3>
            <p className="text-xs text-white/50 leading-relaxed">
              {t('staking.increasedLimitsDesc')}
            </p>
          </div>

          {/* Early Access */}
          <div className="break-inside-avoid rounded-xl border border-white/10 bg-white/[0.04] p-4 space-y-2">
            <h3 className="text-sm font-semibold text-white">{t('staking.earlyAccess')}</h3>
            <p className="text-xs text-white/50 leading-relaxed">
              {t('staking.earlyAccessDesc')}
            </p>
          </div>

          {/* Enhanced Experience */}
          <div className="break-inside-avoid rounded-xl border border-white/10 bg-white/[0.04] p-4 space-y-2">
            <h3 className="text-sm font-semibold text-white">{t('staking.enhancedExperience')}</h3>
            <p className="text-xs text-white/50 leading-relaxed">
              {t('staking.enhancedExperienceDesc')}
            </p>
          </div>

          {/* Airdrops */}
          <div className="break-inside-avoid rounded-xl border border-white/10 bg-white/[0.04] p-4 space-y-2">
            <h3 className="text-sm font-semibold text-white">{t('staking.airdrops')}</h3>
            <p className="text-xs text-white/50 leading-relaxed">
              {t('staking.airdropsDesc')}
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
