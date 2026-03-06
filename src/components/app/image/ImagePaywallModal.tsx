import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, ImageIcon, AlertCircle, ChevronDown } from 'lucide-react';
import { ImageModel, ImageModelKey, IMAGE_MODELS, IMAGE_MODEL_OPTIONS, getImageCostUsd, getImageCostDhb } from '@/constants/image-models.constants';
import { supabase } from '@/integrations/supabase/client';
import dhbCoinImage from '@/assets/dehub-coin.png';

interface ImagePaywallModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  model: ImageModel;
  selectedModelKey: ImageModelKey;
  onModelChange: (modelKey: ImageModelKey) => void;
  onConfirm: () => void;
  isGenerating?: boolean;
}

export function ImagePaywallModal({ 
  open, 
  onOpenChange, 
  model, 
  selectedModelKey,
  onModelChange,
  onConfirm,
  isGenerating = false 
}: ImagePaywallModalProps) {
  const [dhbPrice, setDhbPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);

  // Mock user balance
  const [userBalance] = useState(50000);

  useEffect(() => {
    if (open) {
      fetchDhbPrice();
    }
  }, [open]);

  const fetchDhbPrice = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase.functions.invoke('get-dhb-price');
      if (fetchError) throw fetchError;
      const price = data?.prices?.DHB;
      if (price) {
        setDhbPrice(price);
      } else {
        throw new Error('Failed to get DHB price');
      }
    } catch (err) {
      console.error('Error fetching DHB price:', err);
      setError('Failed to fetch DHB price. Using fallback.');
      setDhbPrice(0.0006191);
    } finally {
      setLoading(false);
    }
  };

  const costUsd = getImageCostUsd(model);
  const costDhb = dhbPrice ? getImageCostDhb(model, dhbPrice) : 0;
  const hasEnoughBalance = userBalance >= costDhb;

  const formatDhb = (amount: number) => {
    if (amount >= 1000000) return `${(amount / 1000000).toFixed(2)}M`;
    if (amount >= 1000) return `${(amount / 1000).toFixed(1)}K`;
    return amount.toFixed(0);
  };

  return (
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
                  const optionCostUsd = getImageCostUsd(optionModel);
                  const optionCostDhb = dhbPrice ? getImageCostDhb(optionModel, dhbPrice) : 0;
                  
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
              <span className="text-zinc-400">Image Cost</span>
              <span className="text-zinc-300">${costUsd.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-400">Staker Discount</span>
              <span className="text-green-400">0%</span>
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
                    <p className="text-xs text-zinc-500">
                      @ ${dhbPrice?.toFixed(6)}/DHB
                    </p>
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
              <span className={hasEnoughBalance ? 'text-green-400' : 'text-red-400'}>
                {formatDhb(userBalance)} DHB
              </span>
            </div>
          </div>

          {!hasEnoughBalance && !loading && (
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
            disabled={isGenerating}
          >
            Cancel
          </Button>
          <Button
            variant="glass"
            className="flex-1 font-medium"
            onClick={onConfirm}
            disabled={loading || !hasEnoughBalance || isGenerating}
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              'Generate'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
