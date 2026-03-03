import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, CreditCard, Wallet, Loader2, Check, ChevronDown, AlertCircle, Zap, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGate } from '@/components/app/AuthGate';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getDPayPrice,
  getDPayPriceByChain,
  getAvailableTokens,
  getAvailableGasTokens,
  getTokenAvailableSupply,
  createCheckoutSession,
  getDPaySessionStatus,
  type DPayToken,
} from '@/lib/api/dpay';
import dehubCoin from '@/assets/dehub-coin.png';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';

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
  const [isTokenDrawerOpen, setIsTokenDrawerOpen] = useState(false);
  const [selectedToken, setSelectedToken] = useState<DPayToken | null>(null);
  const [selectedChainId, setSelectedChainId] = useState(8453);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card');

  // Post-purchase state
  const [purchaseStatus, setPurchaseStatus] = useState<'idle' | 'polling' | 'success' | 'failed'>('idle');
  const [purchaseSessionId, setPurchaseSessionId] = useState<string | null>(null);
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

  // Pre-fetch token supply so we can validate before checkout (prevents 406)
  const { data: availableSupply } = useQuery({
    queryKey: ['dpay', 'supply', selectedToken?.symbol],
    queryFn: () => getTokenAvailableSupply(selectedToken?.symbol || 'DHB'),
    enabled: isAuthenticated && !!selectedToken,
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

  // Set default token when tokens load
  useEffect(() => {
    if (tokens && tokens.length > 0 && !selectedToken) {
      const dhbToken = tokens.find(t => t.symbol === 'DHB');
      setSelectedToken(dhbToken || tokens[0]);
    }
  }, [tokens, selectedToken]);

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
        console.log('[Buy] Polling session status:', status);

        if (status.tokenSendStatus === 'sent') {
          clearInterval(pollingRef.current!);
          pollingRef.current = null;
          setPurchaseStatus('success');
          toast.success('Tokens delivered to your wallet!');
          refreshWalletBalances();
        } else if (status.tokenSendStatus === 'failed' || status.status_stripe === 'failed' || status.status_stripe === 'canceled' || status.status_stripe === 'expired') {
          clearInterval(pollingRef.current!);
          pollingRef.current = null;
          setPurchaseStatus('failed');
          toast.error('Purchase failed. Please try again.');
        } else if (status.status_stripe === 'succeeded' && (!status.tokenSendStatus || status.tokenSendStatus === 'queued' || status.tokenSendStatus === 'sending')) {
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
            {CHAINS.map((chain) => (
              <button
                key={chain.id}
                onClick={() => setSelectedChainId(chain.id)}
                className={`flex-1 py-3 rounded-xl font-medium transition-all text-sm ${
                  selectedChainId === chain.id
                    ? 'bg-white text-black'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                {chain.name}
              </button>
            ))}
          </div>
        </div>

        {/* Token Selection */}
        <div className="bg-zinc-900 rounded-2xl p-4">
          <label className="text-sm text-zinc-400 mb-2 block">{t('buyCoins.token')}</label>
          <button
            onClick={() => setIsTokenDrawerOpen(true)}
            className="w-full flex items-center justify-between p-3 bg-zinc-800 rounded-xl hover:bg-zinc-700 transition-colors"
          >
            <div className="flex items-center gap-3">
              {selectedToken?.logoUrl ? (
                <img src={selectedToken.logoUrl} alt={selectedToken.symbol} className="w-8 h-8 rounded-xl" />
              ) : (
                <img src={dehubCoin} alt="DHB" className="w-8 h-8" />
              )}
              <div className="text-left">
                <p className="text-white font-medium">{selectedToken?.symbol || 'DHB'}</p>
                <p className="text-xs text-zinc-400">{selectedToken?.name || 'DeHub Token'}</p>
              </div>
            </div>
            <ChevronDown className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        {/* Amount Selection */}
        <div className="bg-zinc-900 rounded-2xl p-4 space-y-4">
          <label className="text-sm text-zinc-400 block">{t('buyCoins.amountUsd')}</label>
          
          <div className="grid grid-cols-3 gap-2">
            {PRESET_AMOUNTS.map((amount) => (
              <button
                key={amount}
                onClick={() => {
                  setSelectedAmount(amount);
                  setCustomAmount('');
                }}
                className={`py-3 rounded-xl font-medium transition-all ${
                  selectedAmount === amount && !customAmount
                    ? 'bg-white text-black'
                    : 'bg-zinc-800 text-white hover:bg-zinc-700'
                }`}
              >
                ${amount}
              </button>
            ))}
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
          
          <div className="border-t border-zinc-800 pt-3">
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

          {/* Gas token info */}
          {gasTokens && gasTokens.length > 0 && (
            <div className="border-t border-zinc-800 pt-3">
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
          className="w-full py-6 text-lg font-semibold rounded-xl disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
          ) : (
            <Wallet className="w-5 h-5 mr-2" />
          )}
          {isPending ? t('buyCoins.processing') : t('buyCoins.buy', { symbol: selectedToken?.symbol || 'DHB' })}
        </Button>

        {/* Purchase Status Overlay */}
        {purchaseStatus !== 'idle' && (
          <div className="bg-zinc-900 rounded-2xl p-6 text-center space-y-3 border border-white/10">
            {purchaseStatus === 'polling' && (
              <>
                <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
                <h3 className="text-white font-semibold text-lg">Processing Purchase</h3>
                <p className="text-sm text-zinc-400">
                  Payment received! Delivering tokens to your wallet...
                </p>
              </>
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

        {/* Disclaimer */}
        <p className="text-xs text-zinc-500 text-center px-4">
          {t('buyCoins.disclaimer')}
        </p>
      </div>

      {/* Token Selection Drawer */}
      <Drawer open={isTokenDrawerOpen} onOpenChange={setIsTokenDrawerOpen}>
        <DrawerContent glass className="max-h-[70vh]">
          <DrawerHeader className="border-b border-white/10">
            <DrawerTitle className="text-white">{t('buyCoins.selectToken')}</DrawerTitle>
          </DrawerHeader>
          <div className="p-4 space-y-2 overflow-y-auto">
            {tokensLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
              </div>
            ) : tokens && tokens.length > 0 ? (
              tokens.map((token) => (
                <button
                  key={token.symbol}
                  onClick={() => {
                    setSelectedToken(token);
                    setIsTokenDrawerOpen(false);
                  }}
                  className={`w-full flex items-center justify-between p-3 rounded-xl transition-colors ${
                    selectedToken?.symbol === token.symbol
                      ? 'bg-white/10 border border-white/20'
                      : 'hover:bg-zinc-800'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {token.logoUrl ? (
                      <img src={token.logoUrl} alt={token.symbol} className="w-10 h-10 rounded-xl" />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-zinc-700 flex items-center justify-center text-white font-medium">
                        {token.symbol[0]}
                      </div>
                    )}
                    <div className="text-left">
                      <p className="text-white font-medium">{token.symbol}</p>
                      <p className="text-sm text-zinc-400">{token.name}</p>
                    </div>
                  </div>
                  {selectedToken?.symbol === token.symbol && (
                    <Check className="w-5 h-5 text-primary" />
                  )}
                </button>
              ))
            ) : (
              <div className="text-center py-8 text-zinc-400">
                <p>{t('buyCoins.noTokens')}</p>
              </div>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
