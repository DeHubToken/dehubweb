import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, ImageIcon, AlertCircle, ChevronDown } from 'lucide-react';
import { ImageModel, ImageModelKey, IMAGE_MODELS, IMAGE_MODEL_OPTIONS, getImageCostUsd } from '@/constants/image-models.constants';
import dhbCoinImage from '@/assets/dehub-coin.png';
import { toast } from 'sonner';
import { useAiCredits, useJobQuote, formatDhb, DHB_USD_PEG } from '@/hooks/use-ai-credits';
import { payAsYouGo, useSpendableDhb } from '@/lib/ai-payg';
import { useNavigate } from 'react-router-dom';

interface ImagePaywallModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  model: ImageModel;
  selectedModelKey: ImageModelKey;
  onModelChange: (modelKey: ImageModelKey) => void;
  onConfirm: () => void;
  isGenerating?: boolean;
  /**
   * How many images this run will produce. The studio composer lets creators
   * batch up to 4, and each one costs a full generation, so the charge scales.
   */
  quantity?: number;
}

export function ImagePaywallModal({
  open,
  onOpenChange,
  model,
  selectedModelKey,
  onModelChange,
  onConfirm,
  isGenerating = false,
  quantity = 1,
}: ImagePaywallModalProps) {
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const navigate = useNavigate();

  const count = Math.max(1, Math.floor(quantity));
  const unitCostUsd = getImageCostUsd(model);
  const costUsd = unitCostUsd * count;

  // Priced by the server, so the figure shown here is the figure charged.
  const { priceDhb: costDhb, isLoading: isQuoting, error: quoteError } = useJobQuote(
    { kind: 'image', modelId: selectedModelKey, quantity: count },
    open,
  );
  const { balanceDhb, isLoading: isBalanceLoading, refresh } = useAiCredits();
  const { walletDhb, isLoading: isWalletLoading } = useSpendableDhb();

  const hasEnoughBalance = balanceDhb >= costDhb;
  const shortfall = Math.max(0, costDhb - balanceDhb);
  // Three states, not two. Someone holding neither credit nor DHB cannot
  // pay-as-you-go either, so the honest answer is to send them to buy rather
  // than offer a payment that is guaranteed to fail.
  const canPayAsYouGo = !hasEnoughBalance && walletDhb >= shortfall;
  const needsTokens = !hasEnoughBalance && !canPayAsYouGo && !isWalletLoading;

  /**
   * Two ways to pay, and the balance decides which.
   *
   * With enough credit this just hands over — the generate function debits the
   * balance itself, no signature and no gas. Without, it falls back to
   * pay-as-you-go: sign for the shortfall, have it credited, then generate.
   * Either way the charge happens server-side against a verified balance,
   * which the old flow did not do at all.
   */
  const handlePayAndGenerate = async () => {
    if (costDhb <= 0) return;

    if (hasEnoughBalance) {
      onConfirm();
      return;
    }

    if (needsTokens) {
      onOpenChange(false);
      navigate('/app/buy');
      return;
    }

    setIsPaying(true);
    try {
      toast.loading(`Paying ${formatDhb(shortfall)} DHB...`, { id: 'image-gen-payment' });
      await payAsYouGo(shortfall);
      refresh();
      toast.success('Payment confirmed. Generating...', { id: 'image-gen-payment' });
      onConfirm();
    } catch (err) {
      toast.dismiss('image-gen-payment');
      toast.error(err instanceof Error ? err.message : 'Payment failed.');
    } finally {
      setIsPaying(false);
    }
  };

  return (
    // The modal no longer needs to lock itself shut. Payment used to be an
    // on-chain transfer that could not be recalled once signed; the debit now
    // happens inside the generate call, so closing early simply cancels.
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-black/60 backdrop-blur-[24px] border border-white/10 shadow-2xl max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <ImageIcon className="w-5 h-5 text-cyan-400" />
            Generate Image
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Select a model and confirm payment
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Model Selector */}
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
                {IMAGE_MODEL_OPTIONS.map((option) => {
                  const optionModel = IMAGE_MODELS[option.id as ImageModelKey];
                  // Per-option figures are indicative; the selected model is
                  // re-quoted by the server above before anything is charged.
                  const optionCostUsd = getImageCostUsd(optionModel) * count;
                  const optionCostDhb = Math.ceil(optionCostUsd / DHB_USD_PEG);

                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        onModelChange(option.id as ImageModelKey);
                        setModelSelectorOpen(false);
                      }}
                      className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-zinc-700 transition-colors ${
                        selectedModelKey === option.id ? 'bg-zinc-700/50' : ''
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

          {/* Cost Breakdown */}
          <div className="bg-zinc-800/50 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-400">
                {count > 1 ? `Image Cost (${count} × $${unitCostUsd.toFixed(2)})` : 'Image Cost'}
              </span>
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
          <div className="bg-gradient-to-r from-cyan-900/30 to-blue-900/30 rounded-xl p-4 border border-cyan-500/20">
            {isQuoting ? (
              <div className="flex items-center justify-center py-2">
                <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
                <span className="ml-2 text-zinc-400">Pricing this run...</span>
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
                    <p className="text-xs text-zinc-500">≈ ${costUsd.toFixed(3)}</p>
                  </div>
                </div>

                {quoteError && (
                  <div className="flex items-center gap-2 mt-2 text-yellow-500 text-xs">
                    <AlertCircle className="w-3 h-3" />
                    <span>{quoteError}</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Credit Balance */}
          <div className="flex items-center justify-between text-sm bg-zinc-800/30 rounded-lg p-3">
            <span className="text-zinc-400">Your Credit</span>
            <div className="flex items-center gap-2">
              <img src={dhbCoinImage} alt="DHB" className="w-4 h-4" />
              {isBalanceLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
              ) : (
                <span className={hasEnoughBalance ? 'text-white font-bold' : 'text-red-400'}>
                  {formatDhb(balanceDhb)} DHB
                </span>
              )}
            </div>
          </div>

          {count > 1 && (
            <p className="text-xs text-zinc-400 text-center">
              All {count} images are charged now and generate independently. If one fails, the
              others still run.
            </p>
          )}

          {canPayAsYouGo && !isQuoting && (
            <p className="text-xs text-zinc-400 text-center">
              No credit balance — you'll pay {formatDhb(shortfall)} DHB from your wallet for this
              run. Buy credit in bulk to skip the signature and the gas.
            </p>
          )}

          {needsTokens && !isQuoting && !isBalanceLoading && (
            <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3">
              <p className="text-red-400 text-sm text-center">
                This costs {formatDhb(costDhb)} DHB and you have no credit and no DHB to pay with.
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
            disabled={isGenerating || isPaying}
          >
            Cancel
          </Button>
          <Button
            variant="glass"
            className="flex-1 font-medium"
            onClick={handlePayAndGenerate}
            disabled={isQuoting || isBalanceLoading || isWalletLoading || isGenerating || isPaying}
          >
            {isPaying ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Paying...
              </>
            ) : isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : needsTokens ? (
              'Buy DHB'
            ) : canPayAsYouGo ? (
              `Pay ${formatDhb(shortfall)} DHB & Generate`
            ) : (
              'Generate'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
