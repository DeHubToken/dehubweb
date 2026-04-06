/**
 * Voice Credit Purchase Modal
 * ===========================
 * Lets users buy prepaid voice exchange bundles (10, 100, 500).
 * Payment via DHB transfer, similar to VideoPaywallModal.
 */

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, AudioLines, AlertCircle, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import dhbCoinImage from '@/assets/dehub-coin.png';
import { useAuth } from '@/contexts/AuthContext';
import { useDeHubProfile } from '@/hooks/use-dehub-profile';
import { toast } from 'sonner';
import { dhbText } from '@/lib/dhb-toast';
import { Interface } from 'ethers';
import { writeContractAA, getWalletAddress, getERC20Balance, switchChain, parseTxError } from '@/lib/contracts/aa-utils';
import { DHB_TOKEN, toWei, getChainConfig, BASE_CHAIN_ID, BNB_CHAIN_ID } from '@/lib/contracts/dhb-token';
import type { ChainId } from '@/components/app/ChainSelector';
import { VOICE_BUNDLES, type VoiceBundle, type VoiceBundleSize, getBundleCostDhb } from '@/hooks/use-voice-credits';

const DEHUB_AI_TREASURY = '0xbf3039b0bb672b268e8384e30d81b1e6a8a43b2c';
const erc20TransferInterface = new Interface([
  'function transfer(address to, uint256 amount) returns (bool)',
]);

interface VoiceCreditPurchaseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentCredits: number;
  onPurchaseComplete: (bundleSize: VoiceBundleSize) => void;
}

export function VoiceCreditPurchaseModal({
  open,
  onOpenChange,
  currentCredits,
  onPurchaseComplete,
}: VoiceCreditPurchaseModalProps) {
  const [dhbPrice, setDhbPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedBundle, setSelectedBundle] = useState<VoiceBundleSize>(100);
  const [isPaying, setIsPaying] = useState(false);

  const { walletAddress } = useAuth();
  const { data: profile, isLoading: profileLoading } = useDeHubProfile({ userId: walletAddress || undefined, enabled: !!walletAddress });
  const userBalance = profile?.badgeBalance ?? 0;

  useEffect(() => {
    if (open) fetchDhbPrice();
  }, [open]);

  const fetchDhbPrice = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase.functions.invoke('get-dhb-price');
      if (fetchError) throw fetchError;
      const price = data?.prices?.DHB;
      if (price) setDhbPrice(price);
      else throw new Error('Failed to get DHB price');
    } catch {
      setError('Failed to fetch DHB price. Using fallback.');
      setDhbPrice(0.0006191);
    } finally {
      setLoading(false);
    }
  };

  const bundle = VOICE_BUNDLES.find(b => b.size === selectedBundle)!;
  const costDhb = dhbPrice ? getBundleCostDhb(bundle, dhbPrice) : 0;
  const hasEnoughBalance = userBalance >= costDhb;

  const formatDhb = (amount: number) => {
    if (amount >= 1000000) return `${(amount / 1000000).toFixed(2)}M`;
    if (amount >= 1000) return `${(amount / 1000).toFixed(1)}K`;
    return amount.toFixed(0);
  };

  const handlePurchase = async () => {
    if (costDhb <= 0) return;
    setIsPaying(true);
    try {
      const signerAddress = await getWalletAddress();
      const amountWei = toWei(costDhb, DHB_TOKEN.decimals);

      const baseConfig = getChainConfig(BASE_CHAIN_ID);
      const bnbConfig = getChainConfig(BNB_CHAIN_ID);
      const [baseBalance, bnbBalance] = await Promise.all([
        getERC20Balance(baseConfig.dhbToken, signerAddress, BASE_CHAIN_ID),
        getERC20Balance(bnbConfig.dhbToken, signerAddress, BNB_CHAIN_ID),
      ]);

      let payChainId: ChainId;
      if (baseBalance >= amountWei) {
        payChainId = BASE_CHAIN_ID;
      } else if (bnbBalance >= amountWei) {
        payChainId = BNB_CHAIN_ID;
      } else {
        const baseDhb = Number(baseBalance) / 1e18;
        const bnbDhb = Number(bnbBalance) / 1e18;
        toast.error(`Insufficient DHB. Need ${formatDhb(costDhb)} DHB (Base: ${formatDhb(baseDhb)}, BNB: ${formatDhb(bnbDhb)})`);
        setIsPaying(false);
        return;
      }

      const chainConfig = getChainConfig(payChainId);
      await switchChain(payChainId);

      toast.loading(dhbText('Processing DHB payment...'), { id: 'voice-credit-payment' });
      const result = await writeContractAA(
        chainConfig.dhbToken,
        erc20TransferInterface,
        'transfer',
        [DEHUB_AI_TREASURY, amountWei],
        { context: 'Voice credits purchase', chainId: payChainId }
      );
      await result.wait(1);
      toast.success(`${bundle.size} voice credits purchased!`, { id: 'voice-credit-payment' });
      onPurchaseComplete(bundle.size);
      onOpenChange(false);
    } catch (err: unknown) {
      console.error('[VoiceCredits] Payment failed:', err);
      const msg = parseTxError(err);
      toast.dismiss('voice-credit-payment');
      toast.error(msg || 'Payment failed.');
    } finally {
      setIsPaying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-black/60 backdrop-blur-[24px] border border-white/10 shadow-2xl max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <AudioLines className="w-5 h-5 text-cyan-400" />
            Voice Chat Credits
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Buy voice exchange bundles — each exchange uses Whisper STT + Dia TTS
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Current Credits */}
          {currentCredits > 0 && (
            <div className="bg-cyan-900/20 border border-cyan-500/20 rounded-xl p-3 flex items-center justify-between">
              <span className="text-cyan-400 text-sm">Current Credits</span>
              <span className="text-white font-semibold">{currentCredits}</span>
            </div>
          )}

          {/* Bundle Selection */}
          <div className="space-y-2">
            {VOICE_BUNDLES.map((b) => {
              const bCostDhb = dhbPrice ? getBundleCostDhb(b, dhbPrice) : 0;
              const isSelected = selectedBundle === b.size;
              return (
                <button
                  key={b.size}
                  type="button"
                  onClick={() => setSelectedBundle(b.size)}
                  className={`w-full flex items-center justify-between p-4 rounded-xl transition-all ${
                    isSelected
                      ? 'bg-cyan-500/10 border border-cyan-500/30'
                      : 'bg-zinc-800/50 border border-transparent hover:bg-zinc-800'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {isSelected && <Check className="w-4 h-4 text-white shrink-0" />}
                    <div className="text-left">
                      <p className="font-medium text-white">{b.label}</p>
                      <p className="text-xs text-zinc-500">
                        ${b.perExchangeUsd.toFixed(3)}/exchange
                        {b.discount > 0 && (
                          <span className="ml-1.5 text-white font-bold">({b.discount}% off)</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-medium text-white">${b.totalUsd.toFixed(2)}</p>
                    {!loading && <p className="text-xs text-zinc-500">{formatDhb(bCostDhb)} DHB</p>}
                  </div>
                </button>
              );
            })}
          </div>

          {/* DHB Payment Section */}
          <div className="bg-gradient-to-r from-cyan-900/30 to-purple-900/30 rounded-xl p-4 border border-cyan-500/20">
            {loading ? (
              <div className="flex items-center justify-center py-2">
                <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
                <span className="ml-2 text-zinc-400">Fetching live price...</span>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <img src={dhbCoinImage} alt="DHB" className="w-6 h-6" />
                    <span className="text-white font-medium">Pay with DHB</span>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-white">{formatDhb(costDhb)} DHB</p>
                    <p className="text-xs text-zinc-500">@ ${dhbPrice?.toFixed(6)}/DHB</p>
                  </div>
                </div>
                {error && (
                  <div className="flex items-center gap-2 mt-2 text-yellow-500 text-xs">
                    <AlertCircle className="w-3 h-3" />
                    <span>{error}</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* User Balance */}
          <div className="flex items-center justify-between text-sm bg-zinc-800/30 rounded-lg p-3">
            <span className="text-zinc-400">Your Balance</span>
            <div className="flex items-center gap-2">
              <img src={dhbCoinImage} alt="DHB" className="w-4 h-4" />
              {profileLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
              ) : (
                <span className={hasEnoughBalance ? 'text-white font-bold' : 'text-red-400'}>
                  {formatDhb(userBalance)} DHB
                </span>
              )}
            </div>
          </div>

          {!hasEnoughBalance && !loading && !profileLoading && (
            <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3">
              <p className="text-red-400 text-sm text-center">
                Insufficient DHB balance. You need {formatDhb(costDhb - userBalance)} more DHB.
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1 bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700"
            onClick={() => onOpenChange(false)}
            disabled={isPaying}
          >
            Cancel
          </Button>
          <Button
            variant="glass"
            className="flex-1 font-medium"
            onClick={handlePurchase}
            disabled={loading || profileLoading || !hasEnoughBalance || isPaying}
          >
            {isPaying ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Paying...
              </>
            ) : (
              `Buy ${selectedBundle} Credits`
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
