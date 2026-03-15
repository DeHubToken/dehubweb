/**
 * Bridge Page
 * ===========
 * Bridge DHB tokens between Base and BNB Chain.
 * Transfers go to the bridge relay address on both chains.
 */

import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowDownUp, RefreshCw, Loader2, ArrowRight, Search, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

import { useSidebarCollapse } from '@/contexts/SidebarCollapseContext';
import { cn } from '@/lib/utils';
import { sendERC20Token } from '@/lib/wallet/send';
import { BASE_CHAIN_ID, BNB_CHAIN_ID, CHAIN_CONFIGS } from '@/lib/contracts/dhb-token';
import { getWalletAddress, switchChain } from '@/lib/contracts/aa-utils';
import { toast } from 'sonner';
import { LiquidGlassBubble } from '@/components/ui/liquid-glass-bubble';
import { LiquidGlassBubble2 } from '@/components/ui/liquid-glass-bubble-2';
import { useAllChainsTokens } from '@/hooks/use-wallet-tokens';
import { useTranslation } from 'react-i18next';
import dehubCoin from '@/assets/dehub-coin.png';

const BRIDGE_ADDRESS = '0x11D79aE9a0F8a8f9Fcf5BE71e403ed203EC2394d';

type BridgeDirection = 'base-to-bnb' | 'bnb-to-base';

function formatNumber(val: string | number, decimals = 0): string {
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return '0';
  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(2) + 'B';
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(2) + 'K';
  return num.toFixed(decimals);
}

function StatCard({ label, value, subtitle, delay = 0 }: { label: string; value: string; subtitle?: string; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-3 sm:p-4 lg:p-3"
    >
      <div className="absolute top-0 right-0 w-24 h-24 rounded-full blur-3xl opacity-10 bg-white" />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] sm:text-xs lg:text-[10px] text-white/50 uppercase tracking-wider mb-1 truncate">{label}</p>
        <p className="text-lg sm:text-xl lg:text-base font-bold text-white break-all leading-tight">{value}</p>
        {subtitle && <p className="text-[10px] sm:text-xs lg:text-[10px] text-white/40 mt-0.5 truncate">{subtitle}</p>}
      </div>
    </motion.div>
  );
}

export default function BridgePage() {
  const { t } = useTranslation();
  const { isCollapsed } = useSidebarCollapse();
  const queryClient = useQueryClient();
  const { allTokens } = useAllChainsTokens();

  const [direction, setDirection] = useState<BridgeDirection>('base-to-bnb');
  const [amount, setAmount] = useState('');
  const [isBridging, setIsBridging] = useState(false);

  // Derive DHB balances per chain
  const baseDHB = allTokens?.find(t => t.symbol === 'DHB' && t.chainId === BASE_CHAIN_ID);
  const bnbDHB = allTokens?.find(t => t.symbol === 'DHB' && t.chainId === BNB_CHAIN_ID);

  const sourceBalance = direction === 'base-to-bnb'
    ? parseFloat(baseDHB?.formattedBalance ?? '0')
    : parseFloat(bnbDHB?.formattedBalance ?? '0');

  const sourceChainLabel = direction === 'base-to-bnb' ? 'Base' : 'BNB Chain';
  const destChainLabel = direction === 'base-to-bnb' ? 'BNB Chain' : 'Base';
  const sourceChainId = direction === 'base-to-bnb' ? BASE_CHAIN_ID : BNB_CHAIN_ID;

  const toggleDirection = () => {
    setDirection(d => d === 'base-to-bnb' ? 'bnb-to-base' : 'base-to-bnb');
    setAmount('');
  };

  const handleBridge = async () => {
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      toast.error('Invalid amount', { description: 'Please enter a valid amount to bridge.' });
      return;
    }

    if (parsedAmount > sourceBalance) {
      toast.error('Insufficient balance', { description: `You only have ${formatNumber(sourceBalance, 2)} DHB on ${sourceChainLabel}.` });
      return;
    }

    setIsBridging(true);
    try {
      const walletAddress = await getWalletAddress();
      if (!walletAddress) {
        toast.error('Not connected', { description: 'Please connect your wallet first.' });
        return;
      }

      await switchChain(sourceChainId);

      const dhbTokenAddress = CHAIN_CONFIGS[sourceChainId]?.dhbToken;
      if (!dhbTokenAddress) {
        toast.error('Error', { description: `DHB token not configured on ${sourceChainLabel}.` });
        return;
      }

      toast.loading('Confirming bridge transaction...');
      const result = await sendERC20Token(dhbTokenAddress, BRIDGE_ADDRESS, amount, 18, sourceChainId as any);

      toast.loading('Transaction submitted', { description: 'Waiting for confirmation...' });
      const receipt = await result.wait();

      if (receipt.status === 1) {
        toast.dismiss();
        toast.success('Bridge initiated!', {
          description: `${amount} DHB sent from ${sourceChainLabel} to ${destChainLabel}. Tokens will arrive shortly.`,
        });
        setAmount('');
        queryClient.invalidateQueries({ queryKey: ['wallet-tokens'] });
      } else {
        toast.dismiss();
        toast.error('Bridge failed', { description: 'Transaction reverted.' });
      }
    } catch (err: any) {
      console.error('[Bridge] Error:', err);
      toast.dismiss();
      toast.error('Bridge failed', { description: err?.message || 'Unknown error' });
    } finally {
      setIsBridging(false);
    }
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['wallet-tokens'] });
  };

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
            <h1 className="text-xl font-bold text-white">Bridge</h1>
            <p className="text-xs text-white/40">Transfer DHB between chains</p>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors flex-shrink-0"
        >
          <RefreshCw className="w-4 h-4 text-white/60" />
        </button>
      </motion.div>

      {/* Balance Stats */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <StatCard label="Base Balance" value={formatNumber(parseFloat(baseDHB?.formattedBalance ?? '0'), 2)} subtitle="DHB on Base" delay={0} />
        <StatCard label="BNB Chain Balance" value={formatNumber(parseFloat(bnbDHB?.formattedBalance ?? '0'), 2)} subtitle="DHB on BNB Chain" delay={0.05} />
      </div>

      {/* Bridge Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-5 mb-6"
      >
        {/* Direction display */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="flex-1 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-center">
            <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">From</p>
            <p className="text-sm font-semibold text-white">{sourceChainLabel}</p>
          </div>

          <button
            onClick={toggleDirection}
            className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors flex-shrink-0"
          >
            <ArrowDownUp className="w-4 h-4 text-white/60" />
          </button>

          <div className="flex-1 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-center">
            <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">To</p>
            <p className="text-sm font-semibold text-white">{destChainLabel}</p>
          </div>
        </div>

        {/* Available balance */}
        <p className="text-xs text-white/40 mb-4">
          Available: <span className="text-white/70 font-medium">{formatNumber(sourceBalance, 2)} DHB</span> on {sourceChainLabel}
        </p>

        {/* Input + Bridge button */}
        <div className="flex gap-2">
          <LiquidGlassBubble
            shimmer={false}
            noBorder
            className="flex-1 min-w-0 h-[42px] [&>div]:!rounded-xl [&>div]:!h-full [&>div]:before:!rounded-xl [&>div]:after:!rounded-xl"
          >
            <div className="relative flex items-center h-full">
              <input
                type="number"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-transparent text-white text-sm placeholder:text-white/30 focus:outline-none pr-10"
              />
              <button
                type="button"
                onClick={() => setAmount(sourceBalance.toString())}
                className="absolute right-0 top-1/2 -translate-y-1/2 px-1 text-white/50 text-[10px] font-bold uppercase hover:text-white transition-colors"
              >
                MAX
              </button>
            </div>
          </LiquidGlassBubble>
          <LiquidGlassBubble2
            label="Bridge"
            icon={<ArrowRight className="w-4 h-4" />}
            loading={isBridging}
            loadingLabel="Bridging..."
            disabled={!amount}
            onClick={handleBridge}
          />
        </div>
      </motion.div>

      {/* Info */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-5"
      >
        <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider mb-3">How it works</h3>
        <div className="space-y-3">
          {[
            { step: '1', text: 'Select the chain you want to bridge from and enter the amount.' },
            { step: '2', text: 'Confirm the transaction in your wallet.' },
            { step: '3', text: 'Your DHB tokens will be delivered on the destination chain shortly.' },
          ].map((item) => (
            <div key={item.step} className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
                <span className="text-[10px] font-bold text-white/60">{item.step}</span>
              </div>
              <p className="text-xs text-white/50 leading-relaxed">{item.text}</p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Bridge Queue */}
      <BridgeQueue />
    </div>
  );
}

/* ─── Bridge Queue Component ─── */

interface BridgeTransfer {
  txHash: string;
  from: string;
  amount: string;
  chain: string;
  chainId: number;
  explorerUrl: string;
  blockNumber: number;
  timestamp: number;
}

function useBridgeTransfers() {
  return useQuery({
    queryKey: ['bridge-transfers'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('bridge-transfers');
      if (error) throw error;
      return (data?.transfers ?? []) as BridgeTransfer[];
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}

function timeAgo(unix: number): string {
  const diff = Math.floor(Date.now() / 1000) - unix;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function shortenAddress(addr: string): string {
  return addr.slice(0, 6) + '…' + addr.slice(-4);
}

const PAGE_SIZE = 10;

function BridgeQueue() {
  const { data: transfers, isLoading, error } = useBridgeTransfers();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    if (!transfers) return [];
    if (!search.trim()) return transfers;
    const q = search.toLowerCase();
    return transfers.filter(t =>
      t.from.toLowerCase().includes(q) ||
      t.txHash.toLowerCase().includes(q) ||
      t.amount.toLowerCase().includes(q) ||
      t.chain.toLowerCase().includes(q)
    );
  }, [transfers, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Reset page when search changes
  const handleSearch = (val: string) => {
    setSearch(val);
    setPage(0);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.4 }}
      className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-5 mt-6"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider">Bridge Queue</h3>
        <span className="text-[10px] text-white/30">{transfers?.length ?? 0} transfers (7d)</span>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
        <input
          type="text"
          placeholder="Search by address, tx hash, chain..."
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          className="w-full bg-white/[0.03] border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder:text-white/25 focus:outline-none focus:border-white/20 transition-colors"
        />
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-5 h-5 text-white/30 animate-spin" />
        </div>
      ) : error ? (
        <p className="text-xs text-white/30 text-center py-6">Failed to load bridge transfers.</p>
      ) : paginated.length === 0 ? (
        <p className="text-xs text-white/30 text-center py-6">
          {search ? 'No transfers match your search.' : 'No bridge transfers found in the last 7 days.'}
        </p>
      ) : (
        <div className="space-y-2">
          {paginated.map((t) => (
            <a
              key={`${t.txHash}-${t.from}`}
              href={t.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] transition-colors px-3 py-2.5 group"
            >
              {/* Chain badge */}
              <div className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-[10px] font-bold',
                t.chainId === 8453
                  ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                  : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
              )}>
                {t.chainId === 8453 ? 'B' : 'BNB'}
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-white truncate">{shortenAddress(t.from)}</span>
                  <ArrowRight className="w-3 h-3 text-white/20 flex-shrink-0" />
                  <span className="text-xs text-white/40 truncate">Bridge</span>
                </div>
                <p className="text-[10px] text-white/25 mt-0.5 truncate">{t.txHash.slice(0, 18)}…</p>
              </div>

              {/* Amount + time */}
              <div className="text-right flex-shrink-0">
                <p className="text-xs font-semibold text-white">{t.amount} DHB</p>
                <p className="text-[10px] text-white/25">{timeAgo(t.timestamp)}</p>
              </div>

              <ExternalLink className="w-3 h-3 text-white/10 group-hover:text-white/30 transition-colors flex-shrink-0" />
            </a>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-3 py-1 rounded-lg text-[10px] font-medium bg-white/5 border border-white/10 text-white/50 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Prev
          </button>
          <span className="text-[10px] text-white/30">
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-1 rounded-lg text-[10px] font-medium bg-white/5 border border-white/10 text-white/50 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </motion.div>
  );
}
