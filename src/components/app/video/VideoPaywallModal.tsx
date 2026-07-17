import { useState, useEffect, useRef } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Loader2, Video, AlertCircle, ChevronDown, Volume2, Upload, X, Image, Music, Film, Hash, Plus, Lightbulb } from 'lucide-react';
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
import { ScrollArea } from '@/components/ui/scroll-area';

const DEHUB_AI_TREASURY = '0xbf3039b0bb672b268e8384e30d81b1e6a8a43b2c';
const erc20TransferInterface = new Interface([
  'function transfer(address to, uint256 amount) returns (bool)',
]);

export interface VideoGenerationOptions {
  duration?: number;
  resolution?: '480p' | '720p' | '1080p';
  negativePrompt?: string;
  referenceImageUrls?: string[];
  endFrameUrl?: string;
  audioUrls?: string[];
  videoUrls?: string[];
  seed?: number;
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

/** Upload a file to Supabase storage and return its public URL */
async function uploadToStorage(file: File, folder: string): Promise<string> {
  const ext = file.name.split('.').pop() || 'bin';
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from('ai-media-uploads').upload(path, file);
  if (error) throw error;
  const { data } = supabase.storage.from('ai-media-uploads').getPublicUrl(path);
  return data.publicUrl;
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

  // Basic Seedance 2.0 options
  const [duration, setDuration] = useState(model.defaultDuration || 5);
  const [resolution, setResolution] = useState<'480p' | '720p' | '1080p'>('720p');
  const [negativePrompt, setNegativePrompt] = useState('');

  // Advanced Seedance 2.0 options
  const [referenceImages, setReferenceImages] = useState<{ file: File; preview: string }[]>([]);
  const [endFrameFile, setEndFrameFile] = useState<{ file: File; preview: string } | null>(null);
  const [audioFiles, setAudioFiles] = useState<File[]>([]);
  const [videoFiles, setVideoFiles] = useState<File[]>([]);
  const [seed, setSeed] = useState<string>('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const refImageInputRef = useRef<HTMLInputElement>(null);
  const endFrameInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const { walletAddress } = useAuth();
  const { data: profile, isLoading: profileLoading } = useDeHubProfile({ userId: walletAddress || undefined, enabled: !!walletAddress });
  const userBalance = profile?.badgeBalance ?? 0;

  // Reset options when model changes
  useEffect(() => {
    setDuration(model.defaultDuration || 5);
    setResolution('720p');
    setNegativePrompt('');
    setReferenceImages([]);
    setEndFrameFile(null);
    setAudioFiles([]);
    setVideoFiles([]);
    setSeed('');
    setShowAdvanced(false);
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

  const hasAdvancedFeatures = model.supportsReferenceImages || model.supportsEndFrame || model.supportsAudioInput || model.supportsVideoInput || model.supportsSeed;

  const formatDhb = (amount: number) => {
    if (amount >= 1000000) return `${(amount / 1000000).toFixed(2)}M`;
    if (amount >= 1000) return `${(amount / 1000).toFixed(1)}K`;
    return amount.toFixed(0);
  };

  const handleAddReferenceImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const maxAllowed = (model.maxReferenceImages || 9) - referenceImages.length;
    const toAdd = files.slice(0, maxAllowed);
    const newItems = toAdd.map(file => ({ file, preview: URL.createObjectURL(file) }));
    setReferenceImages(prev => [...prev, ...newItems]);
    e.target.value = '';
  };

  const handleRemoveReferenceImage = (idx: number) => {
    setReferenceImages(prev => {
      URL.revokeObjectURL(prev[idx].preview);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const handleEndFrame = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (endFrameFile) URL.revokeObjectURL(endFrameFile.preview);
      setEndFrameFile({ file, preview: URL.createObjectURL(file) });
    }
    e.target.value = '';
  };

  const handleAudioFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, 3 - audioFiles.length);
    setAudioFiles(prev => [...prev, ...files]);
    e.target.value = '';
  };

  const handleVideoFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, 3 - videoFiles.length);
    setVideoFiles(prev => [...prev, ...files]);
    e.target.value = '';
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
      toast.success('Payment confirmed! Uploading assets...', { id: 'video-gen-payment' });

      // Upload files if any
      setIsUploading(true);
      const options: VideoGenerationOptions = {};
      if (model.minDuration && model.maxDuration) options.duration = duration;
      if (model.supportsResolution) options.resolution = resolution;
      if (model.supportsNegativePrompt && negativePrompt.trim()) options.negativePrompt = negativePrompt.trim();
      if (model.supportsSeed && seed.trim()) options.seed = parseInt(seed.trim()) || undefined;

      // Upload reference images
      if (referenceImages.length > 0) {
        toast.loading('Uploading reference images...', { id: 'video-gen-payment' });
        const urls = await Promise.all(referenceImages.map(r => uploadToStorage(r.file, 'video-ref-images')));
        options.referenceImageUrls = urls;
      }

      // Upload end frame
      if (endFrameFile) {
        toast.loading('Uploading end frame...', { id: 'video-gen-payment' });
        const url = await uploadToStorage(endFrameFile.file, 'video-end-frames');
        options.endFrameUrl = url;
      }

      // Upload audio files
      if (audioFiles.length > 0) {
        toast.loading('Uploading audio...', { id: 'video-gen-payment' });
        const urls = await Promise.all(audioFiles.map(f => uploadToStorage(f, 'video-audio')));
        options.audioUrls = urls;
      }

      // Upload video files
      if (videoFiles.length > 0) {
        toast.loading('Uploading video references...', { id: 'video-gen-payment' });
        const urls = await Promise.all(videoFiles.map(f => uploadToStorage(f, 'video-refs')));
        options.videoUrls = urls;
      }

      setIsUploading(false);
      toast.success('Generating video...', { id: 'video-gen-payment' });
      onConfirm(options);
    } catch (err: unknown) {
      console.error('[VideoPaywall] Payment failed:', err);
      const msg = parseTxError(err);
      toast.dismiss('video-gen-payment');
      toast.error(msg || 'Payment failed.');
    } finally {
      setIsPaying(false);
      setIsUploading(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent glass hideHandle={false} className="max-h-[85vh]">
        <DrawerHeader className="text-left pb-2">
          <DrawerTitle className="flex items-center gap-2 text-white">
            <Video className="w-5 h-5 text-purple-400" />
            Generate Video
          </DrawerTitle>
          <DrawerDescription className="text-zinc-400">
            Select a model and confirm payment
          </DrawerDescription>
        </DrawerHeader>

        <ScrollArea className="flex-1 overflow-y-auto px-4">
          <div className="space-y-3 pb-4">
            {/* Model Selector */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setModelSelectorOpen(!modelSelectorOpen)}
                className="w-full bg-zinc-800/50 hover:bg-zinc-800 transition-colors rounded-xl p-3 text-left"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{model.emoji}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-white text-sm">{model.name}</p>
                        {model.hasAudio && (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 bg-purple-500/20 text-purple-400 text-[10px] rounded-md">
                            <Volume2 className="w-2.5 h-2.5" />
                            Audio
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-500">{model.description}</p>
                    </div>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform ${modelSelectorOpen ? 'rotate-180' : ''}`} />
                </div>
              </button>
              
              {modelSelectorOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden z-10 max-h-52 overflow-y-auto">
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
                        className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-zinc-700 transition-colors ${
                          selectedModelKey === option.id ? 'bg-zinc-700/50' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="text-lg">{option.emoji}</span>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="font-medium text-white text-xs">{option.name}</p>
                              {option.hasAudio && (
                                <span className="flex items-center gap-0.5 px-1 py-0.5 bg-purple-500/20 text-purple-400 text-[9px] rounded">
                                  <Volume2 className="w-2 h-2" />
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-zinc-500">{option.description}</p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-medium text-white">
                            {optionModel.perSecondCostUsd 
                              ? `$${(optionModel.perSecondCostUsd * 2).toFixed(2)}/s`
                              : `$${optionCostUsd.toFixed(2)}`
                            }
                          </p>
                          <p className="text-[10px] text-zinc-500">{formatDhb(optionCostDhb)} DHB</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Duration Slider (for models with configurable duration) */}
            {model.minDuration && model.maxDuration && (
              <div className="bg-zinc-800/50 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-400">Duration</span>
                  <span className="text-white font-medium">
                    {duration}s
                    {isPerSecond && <span className="text-zinc-500 ml-1 text-[10px]">(${(model.perSecondCostUsd! * 2 * duration).toFixed(2)})</span>}
                  </span>
                </div>
                <Slider
                  value={[duration]}
                  onValueChange={([v]) => setDuration(v)}
                  min={model.minDuration}
                  max={model.maxDuration}
                  step={1}
                  className="py-1"
                />
                <div className="flex justify-between text-[10px] text-zinc-500">
                  <span>{model.minDuration}s</span>
                  <span>{model.maxDuration}s</span>
                </div>
              </div>
            )}

            {/* Resolution Toggle (for supported models) */}
            {model.supportsResolution && (
              <div className="bg-zinc-800/50 rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-400">Resolution</span>
                  <div className="flex gap-1.5">
                    {(['480p', '720p', '1080p'] as const).map((res) => (
                      <button
                        key={res}
                        type="button"
                        onClick={() => setResolution(res)}
                        className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                          resolution === res
                            ? 'bg-purple-500/30 text-purple-300 border border-purple-500/40'
                            : 'bg-zinc-700/50 text-zinc-400 border border-zinc-600/30 hover:bg-zinc-700'
                        }`}
                      >
                        {res}
                        {res === '480p' && <span className="ml-0.5 text-[9px] opacity-60">fast</span>}
                        {res === '1080p' && <span className="ml-0.5 text-[9px] opacity-60">2K</span>}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Model Tips */}
            {model.tips && model.tips.length > 0 && (
              <div className="bg-gradient-to-br from-blue-900/20 to-purple-900/20 rounded-xl p-3 border border-blue-500/10">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Lightbulb className="w-3.5 h-3.5 text-yellow-400" />
                  <span className="text-xs font-medium text-zinc-300">Tips for {model.name}</span>
                </div>
                <div className="space-y-0.5">
                  {model.tips.map((tip, idx) => (
                    <p key={idx} className="text-[11px] text-zinc-400 leading-relaxed">{tip}</p>
                  ))}
                </div>
              </div>
            )}

            {/* Negative Prompt (for supported models) */}
            {model.supportsNegativePrompt && (
              <div className="bg-zinc-800/50 rounded-xl p-3 space-y-1.5">
                <label className="text-sm text-zinc-400">Negative Prompt <span className="text-zinc-600">(optional)</span></label>
                <textarea
                  value={negativePrompt}
                  onChange={(e) => setNegativePrompt(e.target.value)}
                  placeholder="Elements to exclude, e.g. blur, watermark, low quality..."
                  className="w-full bg-zinc-900/60 border border-zinc-700/50 rounded-lg p-2 text-sm text-white placeholder:text-zinc-600 resize-none focus:outline-none focus:border-purple-500/40"
                  rows={2}
                  maxLength={500}
                />
              </div>
            )}

            {/* Advanced Options Toggle */}
            {hasAdvancedFeatures && (
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full flex items-center justify-between text-sm text-purple-400 hover:text-purple-300 transition-colors px-1"
              >
                <span className="font-medium">Advanced Options</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
              </button>
            )}

            {showAdvanced && hasAdvancedFeatures && (
              <div className="space-y-2.5">
                {/* Reference Images */}
                {model.supportsReferenceImages && (
                  <div className="bg-zinc-800/50 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-zinc-300 font-medium flex items-center gap-1.5">
                          <Image className="w-3.5 h-3.5 text-blue-400" />
                          Reference Images
                        </p>
                        <p className="text-[10px] text-zinc-500 mt-0.5">
                          Use <code className="text-purple-400">@Image1</code>–<code className="text-purple-400">@Image9</code> in prompt
                        </p>
                      </div>
                      {referenceImages.length < (model.maxReferenceImages || 9) && (
                        <button
                          type="button"
                          onClick={() => refImageInputRef.current?.click()}
                          className="p-1.5 bg-zinc-700/50 hover:bg-zinc-700 rounded-lg transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5 text-zinc-300" />
                        </button>
                      )}
                    </div>
                    <input
                      ref={refImageInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={handleAddReferenceImages}
                    />
                    {referenceImages.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {referenceImages.map((img, idx) => (
                          <div key={idx} className="relative group w-12 h-12 rounded-lg overflow-hidden border border-zinc-600/50">
                            <img src={img.preview} alt={`Ref ${idx + 1}`} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <button type="button" onClick={() => handleRemoveReferenceImage(idx)} className="text-white">
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                            <span className="absolute bottom-0 left-0 right-0 text-center text-[7px] bg-black/70 text-purple-300 py-0.5">
                              @Image{idx + 1}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* End Frame Image */}
                {model.supportsEndFrame && (
                  <div className="bg-zinc-800/50 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-zinc-300 font-medium flex items-center gap-1.5">
                          <Film className="w-3.5 h-3.5 text-green-400" />
                          End Frame
                        </p>
                        <p className="text-[10px] text-zinc-500 mt-0.5">AI interpolates between start & end</p>
                      </div>
                      {!endFrameFile && (
                        <button
                          type="button"
                          onClick={() => endFrameInputRef.current?.click()}
                          className="p-1.5 bg-zinc-700/50 hover:bg-zinc-700 rounded-lg transition-colors"
                        >
                          <Upload className="w-3.5 h-3.5 text-zinc-300" />
                        </button>
                      )}
                    </div>
                    <input
                      ref={endFrameInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleEndFrame}
                    />
                    {endFrameFile && (
                      <div className="relative group w-16 h-12 rounded-lg overflow-hidden border border-zinc-600/50">
                        <img src={endFrameFile.preview} alt="End frame" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <button type="button" onClick={() => { URL.revokeObjectURL(endFrameFile.preview); setEndFrameFile(null); }} className="text-white">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Audio Input (Lip-sync) */}
                {model.supportsAudioInput && (
                  <div className="bg-zinc-800/50 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-zinc-300 font-medium flex items-center gap-1.5">
                          <Music className="w-3.5 h-3.5 text-pink-400" />
                          Audio Input
                        </p>
                        <p className="text-[10px] text-zinc-500 mt-0.5">Lip-sync / music-reactive (up to 3)</p>
                      </div>
                      {audioFiles.length < 3 && (
                        <button
                          type="button"
                          onClick={() => audioInputRef.current?.click()}
                          className="p-1.5 bg-zinc-700/50 hover:bg-zinc-700 rounded-lg transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5 text-zinc-300" />
                        </button>
                      )}
                    </div>
                    <input
                      ref={audioInputRef}
                      type="file"
                      accept="audio/*"
                      multiple
                      className="hidden"
                      onChange={handleAudioFiles}
                    />
                    {audioFiles.length > 0 && (
                      <div className="space-y-1">
                        {audioFiles.map((f, idx) => (
                          <div key={idx} className="flex items-center justify-between bg-zinc-900/50 rounded-lg px-2.5 py-1.5 text-xs">
                            <span className="text-zinc-300 truncate max-w-[180px]">{f.name}</span>
                            <button type="button" onClick={() => setAudioFiles(prev => prev.filter((_, i) => i !== idx))} className="text-zinc-500 hover:text-white ml-2">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Video Input (Restyling) */}
                {model.supportsVideoInput && (
                  <div className="bg-zinc-800/50 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-zinc-300 font-medium flex items-center gap-1.5">
                          <Video className="w-3.5 h-3.5 text-orange-400" />
                          Video Input
                        </p>
                        <p className="text-[10px] text-zinc-500 mt-0.5">Restyle existing video (up to 3)</p>
                      </div>
                      {videoFiles.length < 3 && (
                        <button
                          type="button"
                          onClick={() => videoInputRef.current?.click()}
                          className="p-1.5 bg-zinc-700/50 hover:bg-zinc-700 rounded-lg transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5 text-zinc-300" />
                        </button>
                      )}
                    </div>
                    <input
                      ref={videoInputRef}
                      type="file"
                      accept="video/*"
                      multiple
                      className="hidden"
                      onChange={handleVideoFiles}
                    />
                    {videoFiles.length > 0 && (
                      <div className="space-y-1">
                        {videoFiles.map((f, idx) => (
                          <div key={idx} className="flex items-center justify-between bg-zinc-900/50 rounded-lg px-2.5 py-1.5 text-xs">
                            <span className="text-zinc-300 truncate max-w-[180px]">{f.name}</span>
                            <button type="button" onClick={() => setVideoFiles(prev => prev.filter((_, i) => i !== idx))} className="text-zinc-500 hover:text-white ml-2">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Seed */}
                {model.supportsSeed && (
                  <div className="bg-zinc-800/50 rounded-xl p-3">
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <p className="text-sm text-zinc-300 font-medium flex items-center gap-1.5">
                          <Hash className="w-3.5 h-3.5 text-yellow-400" />
                          Seed <span className="text-zinc-600 text-xs font-normal">(optional)</span>
                        </p>
                        <p className="text-[10px] text-zinc-500 mt-0.5">Same seed + prompt = same result</p>
                      </div>
                      <input
                        type="number"
                        value={seed}
                        onChange={(e) => setSeed(e.target.value)}
                        placeholder="Random"
                        className="w-24 bg-zinc-900/60 border border-zinc-700/50 rounded-lg px-2 py-1.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Cost Breakdown */}
            <div className="bg-zinc-800/50 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-400">Video Cost</span>
                <span className="text-zinc-300">
                  ${costUsd.toFixed(2)}
                  {isPerSecond && <span className="text-zinc-500 ml-1 text-[10px]">({duration}s × ${(model.perSecondCostUsd! * 2).toFixed(2)}/s)</span>}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-400">Staker Discount</span>
                <span className="text-white font-bold">0%</span>
              </div>
              <div className="border-t border-zinc-700 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-300 font-medium text-sm">Total</span>
                  <span className="text-white font-semibold">${costUsd.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* DHB Cost */}
            <div className="bg-gradient-to-r from-purple-900/30 to-pink-900/30 rounded-xl p-3 border border-purple-500/20">
              {loading ? (
                <div className="flex items-center justify-center py-2">
                  <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                  <span className="ml-2 text-zinc-400 text-sm">Fetching live price...</span>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <img src={dhbCoinImage} alt="DHB" className="w-5 h-5" />
                      <span className="text-white font-medium text-sm">Pay with DHB</span>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-white">{formatDhb(costDhb)} DHB</p>
                      <p className="text-[10px] text-zinc-500">@ ${dhbPrice?.toFixed(6)}/DHB</p>
                    </div>
                  </div>
                  {error && (
                    <div className="flex items-center gap-2 mt-1.5 text-yellow-500 text-xs">
                      <AlertCircle className="w-3 h-3" />
                      <span>{error}</span>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* User Balance */}
            <div className="flex items-center justify-between text-sm bg-zinc-800/30 rounded-lg p-2.5">
              <span className="text-zinc-400">Your Balance</span>
              <div className="flex items-center gap-2">
                <img src={dhbCoinImage} alt="DHB" className="w-4 h-4" />
                {isBalanceLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" />
                ) : (
                  <span className={hasEnoughBalance ? 'text-white font-bold' : 'text-red-400'}>
                    {formatDhb(userBalance)} DHB
                  </span>
                )}
              </div>
            </div>

            {!hasEnoughBalance && !loading && !isBalanceLoading && (
              <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-2.5 flex flex-col items-center gap-1.5">
                <p className="text-red-400 text-xs text-center">
                  Insufficient DHB. Need {formatDhb(costDhb - userBalance)} more DHB.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-emerald-600/20 border-emerald-500/40 text-emerald-400 hover:bg-emerald-600/30 text-xs h-7"
                  onClick={() => { onOpenChange(false); window.history.pushState({}, '', '/app/buy'); window.dispatchEvent(new PopStateEvent('popstate')); }}
                >
                  Buy DHB
                </Button>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Actions - sticky footer */}
        <div className="flex gap-3 p-4 pt-2 border-t border-white/5">
          <Button
            variant="outline"
            className="flex-1 bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700 h-10"
            onClick={() => onOpenChange(false)}
            disabled={isGenerating}
          >
            Cancel
          </Button>
          <Button
            variant="glass"
            className="flex-1 font-medium h-10"
            onClick={handlePayAndGenerate}
            disabled={loading || isBalanceLoading || !hasEnoughBalance || isGenerating || isPaying || isUploading}
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : isPaying ? (
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
      </DrawerContent>
    </Drawer>
  );
}
