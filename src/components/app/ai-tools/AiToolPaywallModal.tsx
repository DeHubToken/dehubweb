import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle, ChevronDown } from 'lucide-react';
import { AiToolModel, AiToolCategory, getToolCostUsd, getToolCostDhb, getToolsByCategory, CATEGORY_LABELS } from '@/constants/ai-tools.constants';
import { supabase } from '@/integrations/supabase/client';
import dhbCoinImage from '@/assets/dehub-coin.png';
import { useAuth } from '@/contexts/AuthContext';
import { useJobQuote } from '@/hooks/use-ai-quote';
import { payForJob, useSpendableDhb } from '@/lib/ai-payment';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { dhbText } from '@/lib/dhb-toast';

interface AiToolPaywallModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  model: AiToolModel;
  selectedModelId: string;
  onModelChange: (modelId: string) => void;
  /** Receives the hash of the transfer that paid for this run. */
  onConfirm: (txHash: string) => void;
  isProcessing?: boolean;
  category: AiToolCategory;
}

export function AiToolPaywallModal({
  open,
  onOpenChange,
  model,
  selectedModelId,
  onModelChange,
  onConfirm,
  isProcessing = false,
  category,
}: AiToolPaywallModalProps) {
  const [dhbPrice, setDhbPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const [isPaying, setIsPaying] = useState(false);

  const { walletAddress } = useAuth();
  // What the wallet actually holds on the two chains the treasury accepts —
  // the only balance there is now. The run is paid for by a transfer signed
  // here and verified on chain by fal-ai-tools.
  const { walletDhb, isLoading: isWalletLoading } = useSpendableDhb();
  const navigate = useNavigate();

  const categoryInfo = CATEGORY_LABELS[category];
  const categoryModels = getToolsByCategory(category);

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
    } catch (err) {
      console.error('Error fetching DHB price:', err);
      setError('Failed to fetch DHB price. Using fallback.');
      setDhbPrice(0.001);
    } finally {
      setLoading(false);
    }
  };

  const costUsd = getToolCostUsd(model);
  // Priced by the server, not from the constants. The wallet transfers exactly
  // this number and fal-ai-tools checks the transfer against its own quote, so
  // a client price that drifted would fail at the chain rather than look wrong.
  const { priceDhb: costDhb, isLoading: isQuoting, error: quoteError } = useJobQuote(
    { kind: 'tool', modelId: selectedModelId },
    open,
  );
  // Offering a payment someone cannot make would only fail at the signature,
  // so a wallet short of the price is sent to buy instead.
  const needsTokens = !isWalletLoading && costDhb > 0 && walletDhb < costDhb;

  const formatDhb = (amount: number) => {
    if (amount >= 1000000) return `${(amount / 1000000).toFixed(2)}M`;
    if (amount >= 1000) return `${(amount / 1000).toFixed(1)}K`;
    return amount.toFixed(0);
  };

  const handlePayAndExecute = async () => {
    if (costDhb <= 0) return;
    setIsPaying(true);
    try {
      if (needsTokens) {
        toast.dismiss('ai-tool-payment');
        onOpenChange(false);
        navigate('/app/buy');
        setIsPaying(false);
        return;
      }

      toast.loading(`Paying ${formatDhb(costDhb)} DHB...`, { id: 'ai-tool-payment' });
      const txHash = await payForJob(costDhb);

      toast.dismiss('ai-tool-payment');
      onConfirm(txHash);
    } catch (err: unknown) {
      console.error('[AiToolPaywall] Tool setup failed:', err);
      toast.dismiss('ai-tool-payment');
      toast.error(err instanceof Error ? err.message : 'Could not start the tool.');
    } finally {
      setIsPaying(false);
    }
  };

  const gradientColors: Record<string, string> = {
    purple: 'from-purple-900/30 to-pink-900/30 border-purple-500/20',
    cyan: 'from-cyan-900/30 to-blue-900/30 border-cyan-500/20',
    green: 'from-green-900/30 to-emerald-900/30 border-green-500/20',
    amber: 'from-amber-900/30 to-orange-900/30 border-amber-500/20',
    blue: 'from-blue-900/30 to-indigo-900/30 border-blue-500/20',
  };

  return (
    // Locked shut while a transfer is in flight: it cannot be recalled once
    // signed, and a modal that unmounts mid-payment takes the hash with it.
    <Dialog open={open} onOpenChange={(next) => { if (!isPaying) onOpenChange(next); }}>
      <DialogContent className="bg-black/60 backdrop-blur-[24px] border border-white/10 shadow-2xl max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <span className="text-xl">{categoryInfo.emoji}</span>
            {categoryInfo.label}
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Select a model and confirm payment
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Model Selector */}
          {categoryModels.length > 1 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setModelSelectorOpen(!modelSelectorOpen)}
                className="w-full bg-zinc-800/50 hover:bg-zinc-800 transition-colors rounded-xl p-4 text-left"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{model.emoji}</span>
                    <div>
                      <p className="font-medium text-white">{model.name}</p>
                      <p className="text-sm text-zinc-500">{model.description}</p>
                    </div>
                  </div>
                  <ChevronDown className={`w-5 h-5 text-zinc-400 transition-transform ${modelSelectorOpen ? 'rotate-180' : ''}`} />
                </div>
              </button>

              {modelSelectorOpen && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden z-10 max-h-64 overflow-y-auto">
                  {categoryModels.map((option) => {
                    const optionCostUsd = getToolCostUsd(option);
                    const optionCostDhb = dhbPrice ? getToolCostDhb(option, dhbPrice) : 0;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => {
                          onModelChange(option.id);
                          setModelSelectorOpen(false);
                        }}
                        className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-zinc-700 transition-colors ${
                          selectedModelId === option.id ? 'bg-zinc-700/50' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xl">{option.emoji}</span>
                          <div>
                            <p className="font-medium text-white text-sm">{option.name}</p>
                            <p className="text-xs text-zinc-500">{option.description}</p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-medium text-white">${optionCostUsd.toFixed(2)}</p>
                          <p className="text-xs text-zinc-500">{formatDhb(optionCostDhb)} DHB</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Single model display */}
          {categoryModels.length === 1 && (
            <div className="bg-zinc-800/50 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{model.emoji}</span>
                <div>
                  <p className="font-medium text-white">{model.name}</p>
                  <p className="text-sm text-zinc-500">{model.description}</p>
                </div>
              </div>
            </div>
          )}

          {/* Cost Breakdown */}
          <div className="bg-zinc-800/50 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-400">{categoryInfo.label} Cost</span>
              <span className="text-zinc-300">${costUsd.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-400">Staker Discount</span>
              <span className="text-white font-bold">0%</span>
            </div>
            <div className="border-t border-zinc-700 pt-3">
              <div className="flex items-center justify-between">
                <span className="text-zinc-300 font-medium">Total</span>
                <span className="text-white font-semibold">${costUsd.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* DHB Cost */}
          <div className={`bg-gradient-to-r ${gradientColors[categoryInfo.color] || gradientColors.purple} rounded-xl p-4 border`}>
            {loading || isQuoting ? (
              <div className="flex items-center justify-center py-2">
                <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
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
                {(error || quoteError) && (
                  <div className="flex items-center gap-2 mt-2 text-yellow-500 text-xs">
                    <AlertCircle className="w-3 h-3" />
                    <span>{quoteError || error}</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Wallet balance */}
          <div className="flex items-center justify-between text-sm bg-zinc-800/30 rounded-lg p-3">
            <span className="text-zinc-400">Your DHB</span>
            <div className="flex items-center gap-2">
              <img src={dhbCoinImage} alt="DHB" className="w-4 h-4" />
              {isWalletLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
              ) : (
                <span className={needsTokens ? 'text-red-400' : 'text-white font-bold'}>
                  {formatDhb(walletDhb)} DHB
                </span>
              )}
            </div>
          </div>

          {needsTokens && !loading && (
            <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3 flex flex-col items-center gap-2">
              <p className="text-red-400 text-sm text-center">
                Insufficient DHB balance. You need {formatDhb(costDhb - walletDhb)} more DHB.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="bg-emerald-600/20 border-emerald-500/40 text-emerald-400 hover:bg-emerald-600/30 text-xs"
                onClick={() => { onOpenChange(false); window.history.pushState({}, '', '/app/buy'); window.dispatchEvent(new PopStateEvent('popstate')); }}
              >
                Buy DHB
              </Button>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1 bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700"
            onClick={() => onOpenChange(false)}
            disabled={isProcessing}
          >
            Cancel
          </Button>
          <Button
            variant="glass"
            className="flex-1 font-medium"
            onClick={handlePayAndExecute}
            disabled={loading || isQuoting || isWalletLoading || isProcessing || isPaying}
          >
            {isPaying ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Paying...
              </>
            ) : isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              'Confirm & Pay'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
