import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Coins, Video, AlertCircle } from 'lucide-react';
import { VideoModel, getVideoCostUsd, getVideoCostDhb } from '@/constants/video-models.constants';
import { supabase } from '@/integrations/supabase/client';
import dhbCoinImage from '@/assets/dehub-coin.png';

interface VideoPaywallModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  model: VideoModel;
  onConfirm: () => void;
  isGenerating?: boolean;
}

export function VideoPaywallModal({ 
  open, 
  onOpenChange, 
  model, 
  onConfirm,
  isGenerating = false 
}: VideoPaywallModalProps) {
  const [dhbPrice, setDhbPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Mock user balance (in a real app, this would come from the database)
  const [userBalance] = useState(50000); // 50,000 DHB mock balance

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
      if (data?.price) {
        setDhbPrice(data.price);
      } else {
        throw new Error('Failed to get DHB price');
      }
    } catch (err) {
      console.error('Error fetching DHB price:', err);
      setError('Failed to fetch DHB price. Using fallback.');
      // Fallback price if API fails
      setDhbPrice(0.0006191);
    } finally {
      setLoading(false);
    }
  };

  const costUsd = getVideoCostUsd(model);
  const costDhb = dhbPrice ? getVideoCostDhb(model, dhbPrice) : 0;
  const hasEnoughBalance = userBalance >= costDhb;

  const formatDhb = (amount: number) => {
    if (amount >= 1000000) {
      return `${(amount / 1000000).toFixed(2)}M`;
    }
    if (amount >= 1000) {
      return `${(amount / 1000).toFixed(1)}K`;
    }
    return amount.toFixed(0);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Video className="w-5 h-5 text-purple-400" />
            Generate Video
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Confirm payment to generate your video
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Model Info */}
          <div className="bg-zinc-800/50 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{model.emoji}</span>
              <div>
                <p className="font-medium text-white">{model.name}</p>
                <p className="text-sm text-zinc-500">{model.description}</p>
              </div>
            </div>
          </div>

          {/* Cost Breakdown */}
          <div className="bg-zinc-800/50 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-400">Base Cost</span>
              <span className="text-zinc-300">${model.baseCostUsd.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-400">Platform Fee (100%)</span>
              <span className="text-zinc-300">${model.baseCostUsd.toFixed(2)}</span>
            </div>
            <div className="border-t border-zinc-700 pt-3">
              <div className="flex items-center justify-between">
                <span className="text-zinc-300 font-medium">Total</span>
                <span className="text-white font-semibold">${costUsd.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* DHB Cost */}
          <div className="bg-gradient-to-r from-purple-900/30 to-pink-900/30 rounded-xl p-4 border border-purple-500/20">
            {loading ? (
              <div className="flex items-center justify-center py-2">
                <Loader2 className="w-5 h-5 animate-spin text-purple-400" />
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
            className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:opacity-90"
            onClick={onConfirm}
            disabled={loading || !hasEnoughBalance || isGenerating}
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Coins className="w-4 h-4 mr-2" />
                Pay & Generate
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
