import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, CreditCard, Wallet, Loader2, Check, AlertCircle, Zap, CheckCircle2, XCircle, TrendingUp, Activity, Package, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGate } from '@/components/app/AuthGate';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { ShimmerHoverEffect } from '@/components/ui/shimmer-hover-effect';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getDPayPrice,
  getDPayPriceByChain,
  getAvailableTokens,
  getAvailableGasTokens,
  getTokenAvailableSupply,
  createCheckoutSession,
  getDPaySessionStatus,
  getDPayTransactions,
  getAllDPayTransactions,
  getDPayTotal,
  type DPayToken,
  type DPayTransaction,
} from '@/lib/api/dpay';
import dehubCoin from '@/assets/dehub-coin.png';
import { LiquidGlassBubble } from '@/components/ui/liquid-glass-bubble';
import { format } from 'date-fns';

const PRESET_AMOUNTS = [10, 25, 50, 100, 250, 500];

const CHAINS = [
  { id: 8453, name: 'Base', color: '#0052FF' },
  { id: 56, name: 'BNB', color: '#F0B90B' },
];

type PaymentMethod = 'card';

export default function BuyCoinsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { isAuthenticated, walletAddress } = useAuth();
  const [selectedAmount, setSelectedAmount] = useState<number>(50);
  const [customAmount, setCustomAmount] = useState('');
  const [selectedToken] = useState<DPayToken | null>(null);
  const [selectedChainId, setSelectedChainId] = useState(8453);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card');

  // Post-purchase state
  const [purchaseStatus, setPurchaseStatus] = useState<'idle' | 'polling' | 'success' | 'failed'>('idle');
  const [purchaseSessionId, setPurchaseSessionId] = useState<string | null>(null);
  const [txSearch, setTxSearch] = useState('');
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch available tokens
  const { data: tokens, isLoading: tokensLoading } = useQuery({
    queryKey: ['dpay', 'tokens'],
    queryFn: getAvailableTokens,
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch gas tokens
  const { data: gasTokens } = useQuery({
    queryKey: ['dpay', 'gasTokens'],
    queryFn: getAvailableGasTokens,
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch paginated platform purchase history (public)
  const {
    data: purchasePages,
    isLoading: historyLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['dpay', 'all-transactions'],
    queryFn: ({ pageParam = 1 }) => getAllDPayTransactions({ page: pageParam, limit: 10 }),
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.page + 1 : undefined,
    initialPageParam: 1,
    staleTime: 60_000,
  });

  const purchaseHistory = useMemo(
    () => purchasePages?.pages.flatMap(p => p.transactions) ?? [],
    [purchasePages]
  );

  const purchaseListRef = useRef<HTMLDivElement>(null);

  // Fetch platform-wide stats
  const { data: platformStats } = useQuery({
    queryKey: ['dpay', 'total'],
    queryFn: getDPayTotal,
    enabled: isAuthenticated,
    staleTime: 5 * 60_000,
  });

  // Pre-fetch token supply so we can validate before checkout (prevents 406)
  const { data: availableSupply } = useQuery({
    queryKey: ['dpay', 'supply', 'DHB'],
    queryFn: () => getTokenAvailableSupply('DHB'),
    enabled: isAuthenticated,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  // Fetch chain-specific price
  const { data: chainPriceData, isLoading: priceLoading } = useQuery({
    queryKey: ['dpay', 'price', selectedChainId],
    queryFn: () => getDPayPriceByChain(selectedChainId),
    enabled: isAuthenticated,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
  });

  // Fallback to general price if chain price fails
  const { data: generalPriceData } = useQuery({
    queryKey: ['dpay', 'price'],
    queryFn: getDPayPrice,
    enabled: isAuthenticated && !chainPriceData,
    staleTime: 30 * 1000,
  });


  // Invalidate wallet balances helper
  const refreshWalletBalances = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['wallet-tokens'] });
  }, [queryClient]);

  // Poll for session status after Stripe checkout
  const startPolling = useCallback((sessionId: string) => {
    setPurchaseSessionId(sessionId);
    setPurchaseStatus('polling');

    // Clear any existing polling
    if (pollingRef.current) clearInterval(pollingRef.current);

    let attempts = 0;
    const maxAttempts = 60; // 3 minutes at 3s intervals

    pollingRef.current = setInterval(async () => {
      attempts++;
      if (attempts > maxAttempts) {
        clearInterval(pollingRef.current!);
        pollingRef.current = null;
        setPurchaseStatus('failed');
        toast.error('Purchase verification timed out. Check your wallet later.');
        return;
      }

      try {
        const status = await getDPaySessionStatus(sessionId);
          console.log('[Buy] Polling session status:', JSON.stringify(status));

          const sendStatus = (status.tokenSendStatus || '').toLowerCase();
          const stripeStatus = (status.status_stripe || '').toLowerCase();

          // Success: tokens delivered
          if (sendStatus === 'sent' || sendStatus === 'completed' || sendStatus === 'success') {
            clearInterval(pollingRef.current!);
            pollingRef.current = null;
            setPurchaseStatus('success');
            toast.success('Tokens delivered to your wallet!');
            refreshWalletBalances();
          } else if (sendStatus === 'failed' || stripeStatus === 'failed' || stripeStatus === 'canceled' || stripeStatus === 'expired') {
            clearInterval(pollingRef.current!);
            pollingRef.current = null;
            setPurchaseStatus('failed');
            toast.error('Purchase failed. Please try again.');
          } else if (stripeStatus === 'succeeded' || stripeStatus === 'complete' || stripeStatus === 'paid') {
            // Payment succeeded, tokens still processing — keep polling
          }
      } catch (err) {
        console.warn('[Buy] Polling error:', err);
      }
    }, 3000);
  }, [refreshWalletBalances]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  // Handle return from Stripe (via URL params)
  useEffect(() => {
    const paymentStatus = searchParams.get('payment');
    const sessionId = searchParams.get('session_id');

    if (paymentStatus === 'success' && sessionId) {
      // Clear URL params
      setSearchParams({}, { replace: true });
      startPolling(sessionId);
    } else if (paymentStatus === 'cancel') {
      setSearchParams({}, { replace: true });
      toast.info('Payment cancelled.');
    }
  }, [searchParams, setSearchParams, startPolling]);

  // Create checkout session mutation
  const checkoutMutation = useMutation({
    mutationFn: createCheckoutSession,
    onSuccess: (data) => {
      if (data.checkoutUrl) {
        // Start polling immediately — user will complete in the new tab
        if (data.sessionId) {
          startPolling(data.sessionId);
        }
        window.open(data.checkoutUrl, '_blank');
        toast.success(t('buyCoins.redirecting'));
      } else if (data.sessionId) {
        toast.success(t('buyCoins.sessionCreated'));
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || t('buyCoins.failedPurchase'));
    },
  });


  const priceData = chainPriceData || generalPriceData;
  const effectiveAmount = customAmount ? Number(customAmount) : selectedAmount;
  const tokenPrice = priceData?.price || 0;
  const estimatedTokens = tokenPrice > 0 ? effectiveAmount / tokenPrice : 0;
  const isPending = checkoutMutation.isPending;

  const handlePurchase = () => {
    if (!walletAddress) {
      toast.error(t('buyCoins.walletNotConnected'));
      return;
    }
    if (effectiveAmount < 5) {
      toast.error(t('buyCoins.minPurchase'));
      return;
    }

    const symbol = selectedToken?.symbol || 'DHB';
    const tokensToReceive = Math.floor(estimatedTokens);

    {
      // Pre-check available supply to avoid 406 from the checkout API
      const supply = availableSupply ?? Infinity;
      if (tokensToReceive > supply) {
        toast.error(
          `Only ${supply.toLocaleString()} ${symbol} available. Please reduce your purchase amount.`
        );
        return;
      }

      const webRedirect = `${window.location.origin}/app/buy?payment=success&session_id=__SESSION_ID__`;
      checkoutMutation.mutate({
        amount: effectiveAmount,
        tokenSymbol: symbol,
        walletAddress,
        chainId: selectedChainId,
        tokensToReceive,
        redirect: webRedirect,
      });
    }
  };

  if (!isAuthenticated) {
    return <AuthGate description={t('buyCoins.loginDescription')} />;
  }

  return (
    <div className="min-h-screen p-3 sm:p-4">
      <div className="max-w-lg mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="text-white hover:bg-zinc-800"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold text-white">{t('buyCoins.title')}</h1>
        </div>

        {/* Chain Selection */}
        <div className="bg-zinc-900 rounded-2xl p-4">
          <label className="text-sm text-zinc-400 mb-2 block">{t('buyCoins.network')}</label>
          <div className="flex gap-2">
            {CHAINS.map((chain) => {
              const isActive = selectedChainId === chain.id;
              return (
                <button
                  key={chain.id}
                  onClick={() => setSelectedChainId(chain.id)}
                  className={`relative flex-1 py-3 rounded-xl font-medium transition-colors text-sm ${
                    isActive ? 'text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="buy-chain-toggle"
                      className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30 shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(255,255,255,0.1)]"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className="relative z-[2]">{chain.name}</span>
                </button>
              );
            })}
          </div>
        </div>


        {/* Amount Selection */}
        <div className="bg-zinc-900 rounded-2xl p-4 space-y-4">
          <label className="text-sm text-zinc-400 block">{t('buyCoins.amountUsd')}</label>
          
          <div className="grid grid-cols-3 gap-2">
            {PRESET_AMOUNTS.map((amount) => {
              const isActive = selectedAmount === amount && !customAmount;
              return (
                <button
                  key={amount}
                  onClick={() => {
                    setSelectedAmount(amount);
                    setCustomAmount('');
                  }}
                  className={`relative py-3 rounded-xl font-medium transition-colors ${
                    isActive ? 'text-white' : 'bg-zinc-800 text-white hover:bg-zinc-700'
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="buy-amount-toggle"
                      className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30 shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(255,255,255,0.1)]"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className="relative z-[2]">${amount}</span>
                </button>
              );
            })}
          </div>

          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 font-medium">$</span>
            <Input
              type="number"
              placeholder={t('buyCoins.customAmount')}
              value={customAmount}
              onChange={(e) => {
                setCustomAmount(e.target.value);
                if (e.target.value) setSelectedAmount(0);
              }}
              className="pl-8 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 rounded-xl"
            />
          </div>

          {effectiveAmount < 5 && effectiveAmount > 0 && (
            <p className="text-amber-400 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {t('buyCoins.minPurchase')}
            </p>
          )}
          {paymentMethod === 'card' &&
            availableSupply !== undefined &&
            availableSupply !== Infinity &&
            Math.floor(estimatedTokens) > availableSupply && (
            <p className="text-red-400 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {t('buyCoins.supplyWarning', { supply: availableSupply!.toLocaleString(), symbol: selectedToken?.symbol || 'DHB' })}
            </p>
          )}
        </div>

        {/* Price Summary */}
        <div className="bg-zinc-900 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-zinc-400">{t('buyCoins.youPay')}</span>
            <span className="text-white font-semibold text-lg">${effectiveAmount.toFixed(2)}</span>
          </div>
          
          <div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">{t('buyCoins.youReceive')}</span>
              <div className="flex items-center gap-2">
                {priceLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
                ) : (
                  <>
                    <img src={dehubCoin} alt="DHB" className="w-5 h-5" />
                    <span className="text-white font-semibold text-lg">
                      {estimatedTokens.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </span>
                  </>
                )}
              </div>
            </div>
            {tokenPrice > 0 && (
              <p className="text-xs text-zinc-500 mt-1 text-right">
                1 {selectedToken?.symbol || 'DHB'} ≈ ${tokenPrice.toFixed(5)}
                {priceData?.change24h != null && (
                  <span className={priceData.change24h >= 0 ? 'text-emerald-400 ml-2' : 'text-red-400 ml-2'}>
                    {priceData.change24h >= 0 ? '+' : ''}{priceData.change24h.toFixed(2)}%
                  </span>
                )}
              </p>
            )}
          </div>

          {/* Available Supply */}
          {availableSupply !== undefined && availableSupply !== Infinity && availableSupply > 0 && (
            <div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400 flex items-center gap-1.5">
                  <Package className="w-4 h-4" />
                  Available to buy now
                </span>
                <div className="flex items-center gap-2">
                  <img src={dehubCoin} alt="DHB" className="w-5 h-5" />
                  <span className="text-white font-semibold">
                    {Math.floor(availableSupply).toLocaleString()} DHB
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Gas token info */}
          {gasTokens && gasTokens.length > 0 && (
            <div>
              <p className="text-xs text-zinc-500 flex items-center gap-1">
                <Zap className="w-3 h-3" />
                Gas: {gasTokens.map(g => g.symbol).join(', ')} available on {CHAINS.find(c => c.id === selectedChainId)?.name}
              </p>
            </div>
          )}
        </div>

        {/* Payment Methods */}
        <div className="bg-zinc-900 rounded-2xl p-4 space-y-3">
          <label className="text-sm text-zinc-400 block">{t('buyCoins.paymentMethod')}</label>
          
          <button
            onClick={() => setPaymentMethod('card')}
            className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors ${
              paymentMethod === 'card'
                ? 'bg-white/10 border border-white/20'
                : 'bg-zinc-800 hover:bg-zinc-700 border border-transparent'
            }`}
          >
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-white font-medium">{t('buyCoins.cardBank')}</p>
              <p className="text-xs text-zinc-400">{t('buyCoins.cardBankDesc')}</p>
            </div>
            {paymentMethod === 'card' && <Check className="w-5 h-5 text-primary" />}
          </button>

        </div>

        {/* Buy Button */}
        <div className="relative group">
          <Button
            onClick={handlePurchase}
            disabled={
              effectiveAmount < 5 ||
              isPending ||
              (paymentMethod === 'card' && estimatedTokens <= 0) ||
              (paymentMethod === 'card' &&
                availableSupply !== undefined &&
                availableSupply !== Infinity &&
                Math.floor(estimatedTokens) > availableSupply)
            }
            variant="glass"
            className="w-full py-6 text-lg font-semibold rounded-xl disabled:opacity-50 overflow-hidden"
          >
            {isPending ? (
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
            ) : (
              <Wallet className="w-5 h-5 mr-2" />
            )}
            {isPending ? t('buyCoins.processing') : t('buyCoins.buy', { symbol: selectedToken?.symbol || 'DHB' })}
            <ShimmerHoverEffect />
          </Button>
        </div>

        {/* Purchase Status Overlay */}
        {purchaseStatus !== 'idle' && (
          <div className="rounded-xl border border-white/[0.12] bg-white/[0.03] backdrop-blur-[24px] p-6 text-center flex flex-col items-center justify-center min-h-[180px]">
            {purchaseStatus === 'polling' && (
              <div className="flex flex-col items-center justify-center gap-3 animate-fade-in">
                <Loader2 className="w-10 h-10 animate-spin text-white" />
                <h3 className="text-white font-semibold text-lg">Processing Purchase</h3>
                <p className="text-sm text-white/60">
                  Payment received! Delivering tokens to your wallet...
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1 text-white/40 hover:text-white/70 text-xs"
                  onClick={() => {
                    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
                    setPurchaseStatus('idle');
                    refreshWalletBalances();
                  }}
                >
                  Dismiss — check wallet manually
                </Button>
              </div>
            )}
            {purchaseStatus === 'success' && (
              <>
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                <h3 className="text-white font-semibold text-lg">Purchase Complete!</h3>
                <p className="text-sm text-zinc-400">
                  Tokens have been delivered to your wallet.
                </p>
                <Button
                  variant="glass"
                  className="mt-2"
                  onClick={() => {
                    setPurchaseStatus('idle');
                    navigate('/app/wallet');
                  }}
                >
                  View Wallet
                </Button>
              </>
            )}
            {purchaseStatus === 'failed' && (
              <>
                <XCircle className="w-10 h-10 text-red-400 mx-auto" />
                <h3 className="text-white font-semibold text-lg">Purchase Failed</h3>
                <p className="text-sm text-zinc-400">
                  Something went wrong. Please try again or contact support.
                </p>
                <Button
                  variant="glass"
                  className="mt-2"
                  onClick={() => setPurchaseStatus('idle')}
                >
                  Try Again
                </Button>
              </>
            )}
          </div>
        )}

        {/* Platform Stats Banner */}
        {platformStats && (platformStats.totalVolume > 0 || platformStats.totalTransactions > 0) && (
          <div className="bg-zinc-900 rounded-2xl p-4 flex items-center justify-around border border-zinc-800">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <span className="text-xs text-zinc-400">Total Volume</span>
              </div>
              <span className="text-white font-semibold">
                ${platformStats.totalVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </div>
            <div className="w-px h-10 bg-zinc-800" />
            <div className="text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Activity className="w-4 h-4 text-blue-400" />
                <span className="text-xs text-zinc-400">Transactions</span>
              </div>
              <span className="text-white font-semibold">
                {platformStats.totalTransactions.toLocaleString()}
              </span>
            </div>
          </div>
        )}


        {/* Purchase History */}
        <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800">
          <h3 className="text-white font-semibold mb-3 text-center">Recent Purchases</h3>
          
          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <Input
              type="text"
              placeholder="Search wallet address..."
              value={txSearch}
              onChange={(e) => setTxSearch(e.target.value)}
              className="pl-9 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 rounded-xl h-9 text-sm"
            />
          </div>

          {historyLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
            </div>
          ) : purchaseHistory.length === 0 ? (
            <p className="text-zinc-500 text-sm text-center py-4">No purchases yet. Be the first!</p>
          ) : (() => {
            const filtered = txSearch.trim()
              ? purchaseHistory.filter(tx =>
                  tx.receiverAddress?.toLowerCase().includes(txSearch.trim().toLowerCase())
                )
              : purchaseHistory;
            return filtered.length === 0 ? (
              <p className="text-zinc-500 text-sm text-center py-4">No transactions found for that address.</p>
            ) : (
                <div
                  ref={purchaseListRef}
                  className="space-y-0 max-h-[400px] overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                onScroll={(e) => {
                  const el = e.currentTarget;
                  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100 && hasNextPage && !isFetchingNextPage) {
                    fetchNextPage();
                  }
                }}
              >
                {filtered.map((tx) => {
                  const dateStr = tx.createdAt ? format(new Date(tx.createdAt), 'dd MMM yyyy') : '';
                  const shortAddr = tx.receiverAddress
                    ? `${tx.receiverAddress.slice(0, 6)}...${tx.receiverAddress.slice(-4)}`
                    : null;
                  const isClickable = tx.status === 'completed' && tx.txHash;
                  const explorerUrl = tx.txHash ? `https://basescan.org/tx/${tx.txHash}` : null;
                  const rowClass = `flex items-center py-2.5 first:pt-0 last:pb-0 ${isClickable ? 'hover:bg-white/5 rounded-lg px-1 -mx-1 cursor-pointer transition-colors' : ''}`;
                  const content = (
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-zinc-300">
                        {tx.status === 'completed' ? '✅' : tx.status === 'failed' ? '❌' : '⏳'}{' '}
                        ${tx.amount} — {tx.approxTokensToReceive ? `~${Number(tx.approxTokensToReceive).toLocaleString()} DHB` : `${tx.tokenSymbol}`}
                        {tx.status === 'failed' && (tx as any).failureReason && (
                          <span className="text-xs text-red-400/70 ml-1 capitalize whitespace-nowrap">({(tx as any).failureReason})</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        {shortAddr && (
                          <span className="text-xs text-zinc-500 font-mono">{shortAddr}</span>
                        )}
                        <span className="text-zinc-500 text-xs whitespace-nowrap ml-auto">{dateStr}</span>
                      </div>
                    </div>
                  );
                  return isClickable ? (
                    <a key={tx.id} href={explorerUrl!} target="_blank" rel="noopener noreferrer" className={rowClass}>
                      {content}
                    </a>
                  ) : (
                    <div key={tx.id} className={rowClass}>
                      {content}
                    </div>
                  );
                })}
                {isFetchingNextPage && (
                  <div className="flex items-center justify-center py-3">
                    <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* Disclaimer */}
        <p className="text-xs text-zinc-500 text-center px-4">
          {t('buyCoins.disclaimer')}
        </p>
      </div>

    </div>
  );
}
