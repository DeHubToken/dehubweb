import { useState, useEffect } from 'react';
import { Plus, X, Loader2, Star, Clock, DollarSign, FileText, Gift } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCreatePlan } from '@/hooks/use-subscriptions';
import { getChainConfig, BASE_CHAIN_ID, BNB_CHAIN_ID, isSubscriptionChain } from '@/lib/contracts';
import type { ChainId } from '@/components/app/ChainSelector';
import dehubCoin from '@/assets/dehub-coin.png';
import baseLogo from '@/assets/icons/base-logo.png';
import bnbLogo from '@/assets/icons/bnb-logo.png';

interface CreatePlanModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Durations are whole months, and **lifetime is 0**.
 *
 * Not a stylistic choice — the contract reverts with "Duration should be
 * between 0 to 12 (0 for lifetime)" on anything else, so the old 6-month=6,
 * lifetime=0 list was half right and the API's lifetime=999 was unbuyable.
 * The `tier` alongside is only a label; the API keys plans by duration.
 */
const DURATION_PRESETS = [
  { label: '1 Month', months: 1, tier: 1 },
  { label: '3 Months', months: 3, tier: 2 },
  { label: '6 Months', months: 6, tier: 3 },
  { label: '1 Year', months: 12, tier: 4 },
  { label: 'Lifetime', months: 0, tier: 5 },
];

const CHAIN_OPTIONS: { chainId: ChainId; label: string; icon: string }[] = [
  { chainId: BASE_CHAIN_ID as ChainId, label: 'Base', icon: baseLogo },
  { chainId: BNB_CHAIN_ID as ChainId, label: 'BNB', icon: bnbLogo },
];

const CACHE_KEY = 'create_plan_draft';

interface PlanDraft {
  name: string;
  description: string;
  price: string;
  duration: number;
  tier: number;
  chainId: number;
  benefits: string[];
}

function loadDraft(): PlanDraft | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveDraft(draft: PlanDraft) {
  sessionStorage.setItem(CACHE_KEY, JSON.stringify(draft));
}

function clearDraft() {
  sessionStorage.removeItem(CACHE_KEY);
}

export function CreatePlanModal({ open, onOpenChange }: CreatePlanModalProps) {
  const draft = loadDraft();
  const [name, setName] = useState(draft?.name ?? '');
  const [description, setDescription] = useState(draft?.description ?? '');
  const [price, setPrice] = useState(draft?.price ?? '');
  const [duration, setDuration] = useState(draft?.duration ?? 1);
  const [tier, setTier] = useState(draft?.tier ?? 1);
  const [chainId, setChainId] = useState<ChainId>((draft?.chainId as ChainId) ?? (BASE_CHAIN_ID as ChainId));
  const [benefits, setBenefits] = useState<string[]>(draft?.benefits ?? ['']);

  const createPlanMutation = useCreatePlan();

  // Auto-save draft on changes
  useEffect(() => {
    saveDraft({ name, description, price, duration, tier, chainId, benefits });
  }, [name, description, price, duration, tier, chainId, benefits]);

  const handleAddBenefit = () => {
    setBenefits([...benefits, '']);
  };

  const handleRemoveBenefit = (index: number) => {
    setBenefits(benefits.filter((_, i) => i !== index));
  };

  const handleBenefitChange = (index: number, value: string) => {
    const updated = [...benefits];
    updated[index] = value;
    setBenefits(updated);
  };

  const handleSubmit = async () => {
    if (!name.trim()) return;
    if (!price || parseFloat(price) <= 0) return;
    if (!isSubscriptionChain(chainId)) return;

    const filteredBenefits = benefits.filter(b => b.trim());

    try {
      await createPlanMutation.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        duration,
        tier,
        benefits: filteredBenefits.length > 0 ? filteredBenefits : undefined,
        // The token is pinned to that chain's DHB — the API rejects anything
        // else, because the contract will charge in whatever it is handed.
        chains: [
          { chainId, token: getChainConfig(chainId).dhbToken, price: parseFloat(price) },
        ],
      });

      // Reset form and clear draft
      clearDraft();
      setName('');
      setDescription('');
      setPrice('');
      setDuration(1);
      setTier(1);
      setBenefits(['']);
      onOpenChange(false);
    } catch (err) {
      console.error('[CreatePlanModal] Plan creation failed:', err);
    }
  };

  const isValid = name.trim() && price && parseFloat(price) > 0;
  const busy = createPlanMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-black/60 backdrop-blur-[24px] border-white/10 text-white max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Star className="w-5 h-5 text-white" />
            Create Subscription Plan
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Plan Name */}
          <div>
            <label className="text-sm text-zinc-400 mb-1.5 block">Plan Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Basic, Premium, VIP"
              className="bg-white/5 border-white/10 text-white placeholder:text-zinc-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-sm text-zinc-400 mb-1.5 block flex items-center gap-1">
              <FileText className="w-3.5 h-3.5" />
              Description (optional)
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what subscribers get..."
              rows={3}
              className="bg-white/5 border-white/10 text-white placeholder:text-zinc-500 resize-none"
            />
          </div>

          {/* Price */}
          <div>
            <label className="text-sm text-zinc-400 mb-1.5 block flex items-center gap-1">
              <DollarSign className="w-3.5 h-3.5" />
              Price
            </label>
            <div className="relative">
              <Input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
                min="0"
                step="0.01"
                className="bg-white/5 border-white/10 text-white placeholder:text-zinc-500 pr-16"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                <img src={dehubCoin} alt="DHB" className="w-4 h-4" />
                <span className="text-sm text-zinc-400">DHB</span>
              </div>
            </div>
            <p className="text-xs text-zinc-500 mt-1.5">
              You receive this in full. Subscribers pay a platform fee on top.
            </p>
          </div>

          {/* Chain */}
          <div>
            <label className="text-sm text-zinc-400 mb-1.5 block">Chain</label>
            <div className="grid grid-cols-2 gap-2">
              {CHAIN_OPTIONS.map((option) => (
                <button
                  key={option.chainId}
                  onClick={() => setChainId(option.chainId)}
                  className={`flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all border ${
                    chainId === option.chainId
                      ? 'bg-white/20 border-white/30 text-white'
                      : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10'
                  }`}
                >
                  <img src={option.icon} alt="" className="w-4 h-4 rounded-full" />
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="text-sm text-zinc-400 mb-1.5 block flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              Duration
            </label>
            <div className="grid grid-cols-3 gap-2">
              {DURATION_PRESETS.map((preset) => (
                <button
                  key={preset.months}
                  onClick={() => { setDuration(preset.months); setTier(preset.tier); }}
                  className={`px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                    duration === preset.months
                      ? 'bg-white/20 border-white/30 text-white'
                      : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10'
                  } border`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-zinc-500 mt-1.5">
              One plan per duration — the chain stores plans by creator and duration.
            </p>
          </div>

          {/* Benefits */}
          <div>
            <label className="text-sm text-zinc-400 mb-1.5 block flex items-center gap-1">
              <Gift className="w-3.5 h-3.5" />
              Benefits (optional)
            </label>
            <div className="space-y-2">
              {benefits.map((benefit, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    value={benefit}
                    onChange={(e) => handleBenefitChange(index, e.target.value)}
                    placeholder={`Benefit ${index + 1}`}
                    className="bg-white/5 border-white/10 text-white placeholder:text-zinc-500 flex-1"
                  />
                  {benefits.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveBenefit(index)}
                      className="text-zinc-400 hover:text-red-400 shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleAddBenefit}
                className="text-zinc-400 hover:text-white gap-1"
              >
                <Plus className="w-4 h-4" />
                Add benefit
              </Button>
            </div>
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!isValid || busy}
            className="relative group w-full overflow-hidden rounded-2xl border border-white/30 bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(255,255,255,0.1)] px-4 py-3 text-white font-semibold text-sm transition-all hover:from-white/25 hover:via-white/15 hover:to-white/10 disabled:opacity-40 disabled:pointer-events-none"
          >
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 pointer-events-none" />
            <span className="relative z-10 flex items-center justify-center gap-2">
              {busy ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {createPlanMutation.stageLabel || 'Creating...'}
                </>
              ) : (
                <>
                  <Star className="w-4 h-4" />
                  Create &amp; Publish
                </>
              )}
            </span>
          </button>
          <p className="text-xs text-zinc-500 text-center">
            Publishing is an on-chain transaction — you'll be asked to confirm it in your wallet.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
