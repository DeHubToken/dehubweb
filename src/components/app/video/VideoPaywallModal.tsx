import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Video, AlertCircle, ChevronDown, Volume2 } from 'lucide-react';
import { VideoModel, VideoModelKey, VIDEO_MODELS, VIDEO_MODEL_OPTIONS, getVideoCostUsd, getVideoCostDhb } from '@/constants/video-models.constants';
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
import { Slider } from '@/components/ui/slider';

const DEHUB_AI_TREASURY = '0xbf3039b0bb672b268e8384e30d81b1e6a8a43b2c';
const erc20TransferInterface = new Interface([
  'function transfer(address to, uint256 amount) returns (bool)',
]);

export interface VideoGenerationOptions {
  duration?: number;
  resolution?: '480p' | '720p';
  negativePrompt?: string;
}

interface VideoPaywallModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  model: VideoModel;
  selectedModelKey: VideoModelKey;
  onModelChange: (modelKey: VideoModelKey) => void;
  onConfirm: (options?: VideoGenerationOptions) => void;
  isGenerating?: boolean;
}

export function VideoPaywallModal({ 
  open, 
  onOpenChange, 
  model, 
  selectedModelKey,
  onModelChange,
  onConfirm,
  isGenerating = false 
}: VideoPaywallModalProps) {
  const [dhbPrice, setDhbPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const [isPaying, setIsPaying] = useState(false);

  // Seedance 2.0 options
  const [duration, setDuration] = useState(model.defaultDuration || 5);
  const [resolution, setResolution] = useState<'480p' | '720p'>('720p');
  const [negativePrompt, setNegativePrompt] = useState('');

  const { walletAddress } = useAuth();
  const { data: profile, isLoading: profileLoading } = useDeHubProfile({ userId: walletAddress || undefined, enabled: !!walletAddress });
  const userBalance = profile?.badgeBalance ?? 0;

  // Reset options when model changes
  useEffect(() => {
    setDuration(model.defaultDuration || 5);
    setResolution('720p');
    setNegativePrompt('');
  }, [selectedModelKey]);

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

  const isPerSecond = !!model.perSecondCostUsd;
  const costUsd = getVideoCostUsd(model, isPerSecond ? duration : undefined);
  const costDhb = dhbPrice ? getVideoCostDhb(model, dhbPrice, isPerSecond ? duration : undefined) : 0;
  const isBalanceLoading = profileLoading;
  const hasEnoughBalance = userBalance >= costDhb;

  const formatDhb = (amount: number) => {
    if (amount >= 1000000) return `${(amount / 1000000).toFixed(2)}M`;
    if (amount >= 1000) return `${(amount / 1000).toFixed(1)}K`;
    return amount.toFixed(0);
  };

  const handlePayAndGenerate = async () => {
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

      toast.loading('Processing payment...', { id: 'video-gen-payment' });
      const result = await writeContractAA(
        chainConfig.dhbToken,
        erc20TransferInterface,
        'transfer',
        [DEHUB_AI_TREASURY, amountWei],
        { context: 'AI video generation payment', chainId: payChainId }
      );
      await result.wait(1);
      toast.success('Payment confirmed! Generating video...', { id: 'video-gen-payment' });

      const options: VideoGenerationOptions = {};
      if (isPerSecond) options.duration = duration;
      if (model.supportsResolution) options.resolution = resolution;
      if (model.supportsNegativePrompt && negativePrompt.trim()) options.negativePrompt = negativePrompt.trim();

      onConfirm(options);
    } catch (err: unknown) {
      console.error('[VideoPaywall] Payment failed:', err);
      const msg = parseTxError(err);
      toast.dismiss('video-gen-payment');
      toast.error(msg || 'Payment failed.');
    } finally {
      setIsPaying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-black/60 backdrop-blur-[24px] border border-white/10 shadow-2xl max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Video className="w-5 h-5 text-purple-400" />
            Generate Video
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
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-white">{model.name}</p>
                      {model.hasAudio && (
                        <span className="flex items-center gap-1 px-1.5 py-0.5 bg-purple-500/20 text-purple-400 text-xs rounded-md">
                          <Volume2 className="w-3 h-3" />
                          Audio
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-zinc-500">{model.description}</p>
                  </div>
                </div>
                <ChevronDown className={`w-5 h-5 text-zinc-400 transition-transform ${modelSelectorOpen ? 'rotate-180' : ''}`} />
              </div>
            </button>
            
            {modelSelectorOpen && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden z-10 max-h-64 overflow-y-auto">
                {VIDEO_MODEL_OPTIONS.map((option) => {
                  const optionModel = VIDEO_MODELS[option.id as VideoModelKey];
                  const optionCostUsd = getVideoCostUsd(optionModel);
                  const optionCostDhb = dhbPrice ? getVideoCostDhb(optionModel, dhbPrice) : 0;
                  
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        onModelChange(option.id as VideoModelKey);
                        setModelSelectorOpen(false);
                      }}
                      className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-zinc-700 transition-colors ${
                        selectedModelKey === option.id ? 'bg-zinc-700/50' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{option.emoji}</span>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-white text-sm">{option.name}</p>
                            {option.hasAudio && (
                              <span className="flex items-center gap-0.5 px-1 py-0.5 bg-purple-500/20 text-purple-400 text-[10px] rounded">
                                <Volume2 className="w-2.5 h-2.5" />
                                Audio
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-zinc-500">{option.description}</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-medium text-white">
                          {optionModel.perSecondCostUsd 
                            ? `$${(optionModel.perSecondCostUsd * 2).toFixed(2)}/s`
                            : `$${optionCostUsd.toFixed(2)}`
                          }
                        </p>
                        <p className="text-xs text-zinc-500">{formatDhb(optionCostDhb)} DHB</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Duration Slider (for per-second models) */}
          {isPerSecond && model.minDuration && model.maxDuration && (
            <div className="bg-zinc-800/50 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-400">Duration</span>
                <span className="text-white font-medium">{duration}s</span>
              </div>
              <Slider
                value={[duration]}
                onValueChange={([v]) => setDuration(v)}
                min={model.minDuration}
                max={model.maxDuration}
                step={1}
                className="py-1"
              />
              <div className="flex justify-between text-xs text-zinc-500">
                <span>{model.minDuration}s</span>
                <span>{model.maxDuration}s</span>
              </div>
            </div>
          )}

          {/* Resolution Toggle (for supported models) */}
          {model.supportsResolution && (
            <div className="bg-zinc-800/50 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-400">Resolution</span>
                <div className="flex gap-2">
                  {(['480p', '720p'] as const).map((res) => (
                    <button
                      key={res}
                      type="button"
                      onClick={() => setResolution(res)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                        resolution === res
                          ? 'bg-purple-500/30 text-purple-300 border border-purple-500/40'
                          : 'bg-zinc-700/50 text-zinc-400 border border-zinc-600/30 hover:bg-zinc-700'
                      }`}
                    >
                      {res}
                      {res === '480p' && <span className="ml-1 text-[10px] opacity-60">faster</span>}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Negative Prompt (for supported models) */}
          {model.supportsNegativePrompt && (
            <div className="bg-zinc-800/50 rounded-xl p-4 space-y-2">
              <label className="text-sm text-zinc-400">Negative Prompt <span className="text-zinc-600">(optional)</span></label>
              <textarea
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                placeholder="Elements to exclude, e.g. blur, watermark, low quality..."
                className="w-full bg-zinc-900/60 border border-zinc-700/50 rounded-lg p-2.5 text-sm text-white placeholder:text-zinc-600 resize-none focus:outline-none focus:border-purple-500/40"
                rows={2}
                maxLength={500}
              />
            </div>
          )}

          {/* Cost Breakdown */}
          <div className="bg-zinc-800/50 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-400">Video Cost</span>
              <span className="text-zinc-300">
                ${costUsd.toFixed(2)}
                {isPerSecond && <span className="text-zinc-500 ml-1 text-xs">({duration}s × ${(model.perSecondCostUsd! * 2).toFixed(2)}/s)</span>}
              </span>
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
              {isBalanceLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
              ) : (
                <span className={hasEnoughBalance ? 'text-white font-bold' : 'text-red-400'}>
                  {formatDhb(userBalance)} DHB
                </span>
              )}
            </div>
          </div>

          {!hasEnoughBalance && !loading && !isBalanceLoading && (
            <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3 flex flex-col items-center gap-2">
              <p className="text-red-400 text-sm text-center">
                Insufficient DHB balance. You need {formatDhb(costDhb - userBalance)} more DHB.
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
            disabled={isGenerating}
          >
            Cancel
          </Button>
          <Button
            variant="glass"
            className="flex-1 font-medium"
            onClick={handlePayAndGenerate}
            disabled={loading || isBalanceLoading || !hasEnoughBalance || isGenerating || isPaying}
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
            ) : (
              'Generate'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
