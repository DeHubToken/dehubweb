/**
 * 3D generation paywall.
 * ======================
 * Mirrors VideoPaywallModal: pick the model, confirm the DHB cost, settle on
 * chain, and only then hand the options back so the mesh job can start. The
 * payment sequence here is deliberately identical to the video one — it carries
 * fixes that were paid for in real money (receipt status is checked, the loading
 * toast is always dismissed on an early return, and the drawer cannot be closed
 * mid-transfer).
 */
import { useEffect, useState } from 'react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Box, AlertCircle, ChevronDown, Hash, Lightbulb, Sparkles } from 'lucide-react';
import {
  MODEL3D_MODELS,
  MODEL3D_MODEL_OPTIONS,
  FACE_LIMIT_PRESETS,
  getModel3dCostUsd,
  getModel3dCostDhb,
  type Model3dModel,
  type Model3dModelKey,
  type TextureQuality,
} from '@/constants/model3d-models.constants';
import { supabase } from '@/integrations/supabase/client';
import dhbCoinImage from '@/assets/dehub-coin.png';
import { useAuth } from '@/contexts/AuthContext';
import { useAiCredits } from '@/hooks/use-ai-credits';
import { toast } from 'sonner';

export interface Model3dGenerationOptions {
  textureQuality?: TextureQuality;
  pbr?: boolean;
  faceLimit?: number;
  quad?: boolean;
  seed?: number;
  exportFormat?: 'glb' | 'usdz' | 'fbx' | 'obj' | 'stl';
}

interface Model3dPaywallModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  model: Model3dModel;
  selectedModelKey: Model3dModelKey;
  onModelChange: (key: Model3dModelKey) => void;
  onConfirm: (options?: Model3dGenerationOptions) => void;
  isGenerating?: boolean;
  /** True when a reference image is attached, so image-only models stay pickable. */
  hasReference?: boolean;
}

export function Model3dPaywallModal({
  open,
  onOpenChange,
  model,
  selectedModelKey,
  onModelChange,
  onConfirm,
  isGenerating = false,
  hasReference = false,
}: Model3dPaywallModalProps) {
  const [dhbPrice, setDhbPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const [isPaying, setIsPaying] = useState(false);

  const [textureQuality, setTextureQuality] = useState<TextureQuality>('standard');
  const [faceLimit, setFaceLimit] = useState<number>(30_000);
  const [quad, setQuad] = useState(false);
  const [seed, setSeed] = useState('');
  const [exportFormat, setExportFormat] = useState<'glb' | 'usdz' | 'fbx' | 'obj' | 'stl'>('glb');

  const { walletAddress } = useAuth();
  // Credit balance, not the wallet's on-chain holding — the generate function
  // charges credit, and holding DHB is not the same as having topped it up.
  const { balanceDhb, isLoading: profileLoading } = useAiCredits();
  const userBalance = balanceDhb;

  // Reset the options whenever the model changes; they are not all portable
  // between families and a stale face limit on a model that ignores it is just
  // a confusing control.
  useEffect(() => {
    setTextureQuality('standard');
    setFaceLimit(30_000);
    setQuad(false);
    setSeed('');
    setExportFormat('glb');
  }, [selectedModelKey]);

  useEffect(() => {
    if (open) void fetchDhbPrice();
  }, [open]);

  const fetchDhbPrice = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase.functions.invoke('get-dhb-price');
      if (fetchError) throw fetchError;
      const price = data?.prices?.DHB;
      if (!price) throw new Error('Failed to get DHB price');
      setDhbPrice(price);
    } catch (err) {
      console.error('Error fetching DHB price:', err);
      setError('Failed to fetch DHB price. Using fallback.');
      setDhbPrice(0.001);
    } finally {
      setLoading(false);
    }
  };

  const textured = textureQuality !== 'none';
  // Priced on the exact texture quality, so the Total moves when the toggle
  // does and the charge always matches the number on screen.
  const costUsd = getModel3dCostUsd(model, textureQuality);
  const costDhb = dhbPrice ? getModel3dCostDhb(model, dhbPrice, textureQuality) : 0;
  const hasEnoughBalance = userBalance >= costDhb;

  const formatDhb = (amount: number) => {
    if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M`;
    if (amount >= 1000) return `${(amount / 1000).toFixed(1)}K`;
    return amount.toFixed(0);
  };

  const buildOptions = (): Model3dGenerationOptions => {
    const options: Model3dGenerationOptions = {};
    if (model.supportsTexture) options.textureQuality = textureQuality;
    if (model.supportsPbr) options.pbr = textured;
    if (model.supportsFaceLimit) options.faceLimit = faceLimit;
    if (model.supportsQuad && quad) options.quad = true;
    if (model.supportsSeed && seed.trim()) {
      const parsed = Number.parseInt(seed.trim(), 10);
      if (Number.isFinite(parsed)) options.seed = parsed;
    }
    if (model.exportFormats?.length) options.exportFormat = exportFormat;
    return options;
  };

  const handlePayAndGenerate = async () => {
    if (costDhb <= 0) return;
    setIsPaying(true);
    try {
      const options = buildOptions();

      // No transfer here any more. generate-3d debits the DHB credit balance
      // itself, so signing one here as well would charge twice.
      if (userBalance < costDhb) {
        toast.dismiss('model3d-gen-payment');
        toast.error(
          `Not enough credit. This costs ${formatDhb(costDhb)} DHB and you have ${formatDhb(userBalance)}.`,
        );
        setIsPaying(false);
        return;
      }

      toast.dismiss('model3d-gen-payment');
      onConfirm(options);
    } catch (err: unknown) {
      console.error('[Model3dPaywall] Generation setup failed:', err);
      toast.dismiss('model3d-gen-payment');
      toast.error(err instanceof Error ? err.message : 'Could not start the generation.');
    } finally {
      setIsPaying(false);
    }
  };

  return (
    // Locked while paying: dismissing mid-transfer only unmounts the UI, it
    // cannot recall the on-chain transfer, and the generation would be lost with
    // the money already gone.
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next && isPaying) return;
        onOpenChange(next);
      }}
    >
      <DrawerContent glass hideHandle={false} className="max-h-[85vh]">
        <DrawerHeader className="text-left pb-2">
          <DrawerTitle className="flex items-center gap-2 text-white">
            <Box className="w-5 h-5 text-cyan-400" />
            Generate 3D Model
          </DrawerTitle>
          <DrawerDescription className="text-zinc-400">
            Select a model and confirm payment
          </DrawerDescription>
        </DrawerHeader>

        <ScrollArea className="flex-1 overflow-y-auto px-4">
          <div className="space-y-3 pb-4">
            {/* Model selector */}
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
                      <p className="font-medium text-white text-sm">{model.name}</p>
                      <p className="text-xs text-zinc-500">{model.description}</p>
                    </div>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-zinc-400 transition-transform ${modelSelectorOpen ? 'rotate-180' : ''}`}
                  />
                </div>
              </button>

              {modelSelectorOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden z-10 max-h-52 overflow-y-auto">
                  {MODEL3D_MODEL_OPTIONS.map((option) => {
                    const optionModel = MODEL3D_MODELS[option.id as Model3dModelKey];
                    const optionCostDhb = dhbPrice ? getModel3dCostDhb(optionModel, dhbPrice) : 0;
                    // An image-only model with nothing attached would fail after
                    // payment, so it is unselectable rather than merely warned about.
                    const needsImage = !optionModel.supports.includes('text-to-3d');
                    const unavailable = needsImage && !hasReference;

                    return (
                      <button
                        key={option.id}
                        type="button"
                        disabled={unavailable}
                        onClick={() => {
                          onModelChange(option.id as Model3dModelKey);
                          setModelSelectorOpen(false);
                        }}
                        className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors ${
                          unavailable
                            ? 'opacity-40 cursor-not-allowed'
                            : 'hover:bg-zinc-700'
                        } ${selectedModelKey === option.id ? 'bg-zinc-700/50' : ''}`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="text-lg">{option.emoji}</span>
                          <div>
                            <p className="font-medium text-white text-xs">{option.name}</p>
                            <p className="text-[10px] text-zinc-500">
                              {unavailable ? 'Needs an attached image' : option.description}
                            </p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-medium text-white">
                            ${getModel3dCostUsd(optionModel).toFixed(2)}
                          </p>
                          <p className="text-[10px] text-zinc-500">{formatDhb(optionCostDhb)} DHB</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Texture quality */}
            {model.supportsTexture && (
              <div className="bg-zinc-800/50 rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm text-zinc-400">Texture</span>
                    {textured && (
                      <p className="text-[10px] text-zinc-500 mt-0.5">
                        {`$${getModel3dCostUsd(model, 'none').toFixed(2)} untextured · `}
                        {`$${getModel3dCostUsd(model, 'standard').toFixed(2)} standard · `}
                        {`$${getModel3dCostUsd(model, 'HD').toFixed(2)} HD`}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1.5">
                    {(['none', 'standard', 'HD'] as const).map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setTextureQuality(q)}
                        className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                          textureQuality === q
                            ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/40'
                            : 'bg-zinc-700/50 text-zinc-400 border border-zinc-600/30 hover:bg-zinc-700'
                        }`}
                      >
                        {q === 'none' ? 'None' : q === 'standard' ? 'Standard' : 'HD'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Polygon budget */}
            {model.supportsFaceLimit && (
              <div className="bg-zinc-800/50 rounded-xl p-3 space-y-2">
                <span className="text-sm text-zinc-400">Detail</span>
                <div className="grid grid-cols-2 gap-1.5">
                  {FACE_LIMIT_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => setFaceLimit(preset.value)}
                      className={`rounded-lg px-2.5 py-1.5 text-left transition-colors ${
                        faceLimit === preset.value
                          ? 'bg-cyan-500/25 border border-cyan-500/40'
                          : 'bg-zinc-700/40 border border-zinc-600/30 hover:bg-zinc-700'
                      }`}
                    >
                      <p className="text-xs font-medium text-white">{preset.label}</p>
                      <p className="text-[10px] text-zinc-500">{preset.detail}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quad topology */}
            {model.supportsQuad && (
              <label className="flex items-center justify-between bg-zinc-800/50 rounded-xl p-3 cursor-pointer">
                <div>
                  <p className="text-sm text-zinc-300 font-medium">Quad topology</p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">
                    Cleaner edge loops for editing in Blender or Maya
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={quad}
                  onChange={(e) => setQuad(e.target.checked)}
                  className="h-4 w-4 accent-cyan-500"
                />
              </label>
            )}

            {/* Export format */}
            {model.exportFormats && model.exportFormats.length > 0 && (
              <div className="bg-zinc-800/50 rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm text-zinc-400">Format</span>
                    {exportFormat !== 'glb' && (
                      <p className="text-[10px] text-amber-400/80 mt-0.5">
                        Only GLB previews in the browser — others download only
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 justify-end">
                    {model.exportFormats.map((format) => (
                      <button
                        key={format}
                        type="button"
                        onClick={() => setExportFormat(format as typeof exportFormat)}
                        className={`px-2 py-1 text-xs font-medium rounded-lg uppercase transition-colors ${
                          exportFormat === format
                            ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/40'
                            : 'bg-zinc-700/50 text-zinc-400 border border-zinc-600/30 hover:bg-zinc-700'
                        }`}
                      >
                        {format}
                      </button>
                    ))}
                  </div>
                </div>
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
                    <p className="text-[10px] text-zinc-500 mt-0.5">Same seed + prompt = same mesh</p>
                  </div>
                  <input
                    type="number"
                    value={seed}
                    onChange={(e) => setSeed(e.target.value)}
                    placeholder="Random"
                    className="w-24 bg-zinc-900/60 border border-zinc-700/50 rounded-lg px-2 py-1.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
              </div>
            )}

            {/* Tips */}
            {model.tips && model.tips.length > 0 && (
              <div className="bg-gradient-to-br from-cyan-900/20 to-blue-900/20 rounded-xl p-3 border border-cyan-500/10">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Lightbulb className="w-3.5 h-3.5 text-yellow-400" />
                  <span className="text-xs font-medium text-zinc-300">Tips for {model.name}</span>
                </div>
                <div className="space-y-0.5">
                  {model.tips.map((tip, idx) => (
                    <p key={idx} className="text-[11px] text-zinc-400 leading-relaxed">
                      {tip}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* Cost */}
            <div className="bg-zinc-800/50 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-400">Model Cost</span>
                <span className="text-zinc-300">${costUsd.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-400">Typical wait</span>
                <span className="text-zinc-300">{model.typicalDuration}</span>
              </div>
              <div className="border-t border-zinc-700 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-300 font-medium text-sm">Total</span>
                  <span className="text-white font-semibold">${costUsd.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* DHB cost */}
            <div className="bg-gradient-to-r from-cyan-900/30 to-blue-900/30 rounded-xl p-3 border border-cyan-500/20">
              {loading ? (
                <div className="flex items-center justify-center py-2">
                  <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
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

            {/* Balance */}
            <div className="flex items-center justify-between text-sm bg-zinc-800/30 rounded-lg p-2.5">
              <span className="text-zinc-400">Your Balance</span>
              <div className="flex items-center gap-2">
                <img src={dhbCoinImage} alt="DHB" className="w-4 h-4" />
                {profileLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" />
                ) : (
                  <span className={hasEnoughBalance ? 'text-white font-bold' : 'text-red-400'}>
                    {formatDhb(userBalance)} DHB
                  </span>
                )}
              </div>
            </div>

            {!hasEnoughBalance && !loading && !profileLoading && (
              <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-2.5 flex flex-col items-center gap-1.5">
                <p className="text-red-400 text-xs text-center">
                  Insufficient DHB. Need {formatDhb(costDhb - userBalance)} more DHB.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-emerald-600/20 border-emerald-500/40 text-emerald-400 hover:bg-emerald-600/30 text-xs h-7"
                  onClick={() => {
                    onOpenChange(false);
                    window.history.pushState({}, '', '/app/buy');
                    window.dispatchEvent(new PopStateEvent('popstate'));
                  }}
                >
                  Buy DHB
                </Button>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="flex gap-3 p-4 pt-2 border-t border-white/5">
          <Button
            variant="outline"
            className="flex-1 bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700 h-10"
            onClick={() => onOpenChange(false)}
            disabled={isGenerating || isPaying}
          >
            Cancel
          </Button>
          <Button
            variant="glass"
            className="flex-1 font-medium h-10"
            onClick={handlePayAndGenerate}
            disabled={loading || profileLoading || !hasEnoughBalance || isGenerating || isPaying}
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
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Generate
              </>
            )}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
