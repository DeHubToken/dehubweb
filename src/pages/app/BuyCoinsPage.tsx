import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CreditCard, Wallet, Loader2, Check, ChevronDown, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGate } from '@/components/app/AuthGate';
import { toast } from 'sonner';
import { useQuery, useMutation } from '@tanstack/react-query';
import { 
  getDPayPrice, 
  getAvailableTokens, 
  createCheckoutSession,
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

export default function BuyCoinsPage() {
  const navigate = useNavigate();
  const { isAuthenticated, walletAddress } = useAuth();
  const [selectedAmount, setSelectedAmount] = useState<number>(50);
  const [customAmount, setCustomAmount] = useState('');
  const [isTokenDrawerOpen, setIsTokenDrawerOpen] = useState(false);
  const [selectedToken, setSelectedToken] = useState<DPayToken | null>(null);

  // Fetch available tokens
  const { data: tokens, isLoading: tokensLoading } = useQuery({
    queryKey: ['dpay', 'tokens'],
    queryFn: getAvailableTokens,
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch DHB price
  const { data: priceData, isLoading: priceLoading } = useQuery({
    queryKey: ['dpay', 'price'],
    queryFn: getDPayPrice,
    enabled: isAuthenticated,
    staleTime: 30 * 1000, // Refresh price every 30s
    refetchInterval: 30 * 1000,
  });

  // Set default token when tokens load
  useEffect(() => {
    if (tokens && tokens.length > 0 && !selectedToken) {
      // Default to DHB or first token
      const dhbToken = tokens.find(t => t.symbol === 'DHB');
      setSelectedToken(dhbToken || tokens[0]);
    }
  }, [tokens, selectedToken]);

  // Create checkout session mutation
  const createSessionMutation = useMutation({
    mutationFn: createCheckoutSession,
    onSuccess: (data) => {
      if (data.checkoutUrl) {
        // Redirect to payment provider
        window.open(data.checkoutUrl, '_blank');
        toast.success('Redirecting to payment...');
      } else if (data.sessionId) {
        toast.success('Session created', { description: `Session ID: ${data.sessionId}` });
      }
    },
    onError: (error: Error) => {
      toast.error('Failed to start purchase', { description: error.message });
    },
  });

  const effectiveAmount = customAmount ? Number(customAmount) : selectedAmount;
  const tokenPrice = priceData?.price || 0;
  const estimatedTokens = tokenPrice > 0 ? effectiveAmount / tokenPrice : 0;

  const handlePurchase = () => {
    if (!walletAddress) {
      toast.error('Wallet not connected');
      return;
    }
    if (effectiveAmount < 5) {
      toast.error('Minimum purchase is $5');
      return;
    }

    createSessionMutation.mutate({
      amount: effectiveAmount,
      tokenSymbol: selectedToken?.symbol || 'DHB',
      walletAddress,
    });
  };

  if (!isAuthenticated) {
    return <AuthGate description="Log in to purchase coins." />;
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
          <h1 className="text-xl font-bold text-white">Buy Coins</h1>
        </div>

        {/* Token Selection */}
        <div className="bg-zinc-900 rounded-2xl p-4">
          <label className="text-sm text-zinc-400 mb-2 block">Token</label>
          <button
            onClick={() => setIsTokenDrawerOpen(true)}
            className="w-full flex items-center justify-between p-3 bg-zinc-800 rounded-xl hover:bg-zinc-700 transition-colors"
          >
            <div className="flex items-center gap-3">
              {selectedToken?.logoUrl ? (
                <img src={selectedToken.logoUrl} alt={selectedToken.symbol} className="w-8 h-8 rounded-full" />
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
          <label className="text-sm text-zinc-400 block">Amount (USD)</label>
          
          {/* Preset amounts */}
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

          {/* Custom amount */}
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 font-medium">$</span>
            <Input
              type="number"
              placeholder="Custom amount"
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
              Minimum purchase is $5
            </p>
          )}
        </div>

        {/* Price Summary */}
        <div className="bg-zinc-900 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-zinc-400">You pay</span>
            <span className="text-white font-semibold text-lg">${effectiveAmount.toFixed(2)}</span>
          </div>
          
          <div className="border-t border-zinc-800 pt-3">
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">You receive (est.)</span>
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
                1 {selectedToken?.symbol || 'DHB'} ≈ ${tokenPrice.toFixed(4)}
              </p>
            )}
          </div>
        </div>

        {/* Payment Methods */}
        <div className="bg-zinc-900 rounded-2xl p-4 space-y-3">
          <label className="text-sm text-zinc-400 block">Payment Method</label>
          
          <button className="w-full flex items-center gap-3 p-3 bg-white/10 border border-white/20 rounded-xl">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-white font-medium">Card / Bank</p>
              <p className="text-xs text-zinc-400">Visa, Mastercard, Apple Pay</p>
            </div>
            <Check className="w-5 h-5 text-primary" />
          </button>
        </div>

        {/* Buy Button */}
        <Button
          onClick={handlePurchase}
          disabled={effectiveAmount < 5 || createSessionMutation.isPending}
          className="w-full py-6 text-lg font-semibold bg-white text-black hover:bg-zinc-200 rounded-xl disabled:opacity-50"
        >
          {createSessionMutation.isPending ? (
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
          ) : (
            <Wallet className="w-5 h-5 mr-2" />
          )}
          {createSessionMutation.isPending ? 'Processing...' : `Buy ${selectedToken?.symbol || 'DHB'}`}
        </Button>

        {/* Disclaimer */}
        <p className="text-xs text-zinc-500 text-center px-4">
          By purchasing, you agree to our terms of service. Cryptocurrency purchases are non-refundable.
        </p>
      </div>

      {/* Token Selection Drawer */}
      <Drawer open={isTokenDrawerOpen} onOpenChange={setIsTokenDrawerOpen}>
        <DrawerContent glass className="max-h-[70vh]">
          <DrawerHeader className="border-b border-white/10">
            <DrawerTitle className="text-white">Select Token</DrawerTitle>
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
                      <img src={token.logoUrl} alt={token.symbol} className="w-10 h-10 rounded-full" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center text-white font-medium">
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
                <p>No tokens available</p>
              </div>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
