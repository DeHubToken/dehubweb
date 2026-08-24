import { useState, useEffect } from 'react';
import { Plus, X, Loader2, Star, Clock, DollarSign, FileText, Gift, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useUpdatePlan } from '@/hooks/use-subscriptions';
import { type SubscriptionPlan, planPrice, isPlanPublished } from '@/lib/api/dehub';
import dehubCoin from '@/assets/dehub-coin.png';

interface EditPlanModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: SubscriptionPlan;
}

/**
 * Whole months, lifetime = 0 — the same list the create dialog offers.
 *
 * This file used to measure duration in *days* (7/30/90/365) while creation
 * measured it in months (1/3/6/12) and the API stored 999 for lifetime. Three
 * units for one field: opening this dialog on a 1-month plan showed no preset
 * selected, and saving wrote `duration: 30` — a plan the contract rejects.
 */
const DURATION_PRESETS = [
  { label: '1 Month', months: 1 },
  { label: '3 Months', months: 3 },
  { label: '6 Months', months: 6 },
  { label: '1 Year', months: 12 },
  { label: 'Lifetime', months: 0 },
];

/** Legacy lifetime value, so an existing 999 plan still lights up "Lifetime". */
function toPresetMonths(duration: number): number {
  return duration === 999 ? 0 : duration;
}

export function EditPlanModal({ open, onOpenChange, plan }: EditPlanModalProps) {
  const [name, setName] = useState(plan.name);
  const [description, setDescription] = useState(plan.description || '');
  // `plan.price` is only populated for plans the API has flattened; the price
  // otherwise lives inside `chains`. `String(undefined)` put the literal text
  // "undefined" in the price box.
  const [price, setPrice] = useState(String(planPrice(plan) ?? ''));
  const [duration, setDuration] = useState(toPresetMonths(plan.duration));
  const [benefits, setBenefits] = useState<string[]>(plan.benefits?.length ? plan.benefits : ['']);

  const updatePlanMutation = useUpdatePlan();
  const planId = plan.id || plan._id || '';
  const published = isPlanPublished(plan);

  // Sync form when plan prop changes
  useEffect(() => {
    setName(plan.name);
    setDescription(plan.description || '');
    setPrice(String(planPrice(plan) ?? ''));
    setDuration(toPresetMonths(plan.duration));
    setBenefits(plan.benefits?.length ? plan.benefits : ['']);
  }, [plan]);

  const priceChanged = parseFloat(price) !== planPrice(plan);
  const durationChanged = duration !== toPresetMonths(plan.duration);

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
    if (!name.trim() || !planId) return;
    if (!price || parseFloat(price) <= 0) return;

    const filteredBenefits = benefits.filter(b => b.trim());

    await updatePlanMutation.mutateAsync({
      planId: String(planId),
      data: {
        name: name.trim(),
        description: description.trim() || undefined,
        price: parseFloat(price),
        duration,
        // Always sent, including empty. `undefined` means "leave alone" to the
        // API, so a creator who deleted every benefit saw them all come back.
        benefits: filteredBenefits,
      },
    });

    onOpenChange(false);
  };

  const isValid = name.trim() && price && parseFloat(price) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-black/60 backdrop-blur-[24px] border border-white/10 shadow-2xl text-white max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Star className="w-5 h-5 text-yellow-400" />
            Edit Plan
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
                  onClick={() => setDuration(preset.months)}
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

          {/* The "Plan Active" toggle that used to sit here wrote an `isActive`
              field the API has never had and the Plans schema does not define,
              so it silently did nothing. Whether a plan can be bought is
              decided on chain — which is what this says instead. */}
          {published && (priceChanged || durationChanged) && (
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3">
              <p className="text-xs text-amber-200/90">
                Changing the {priceChanged && durationChanged ? 'price and duration' : priceChanged ? 'price' : 'duration'}{' '}
                takes this plan off sale until you publish it again — buyers are charged
                what the chain holds, not what's shown here.
              </p>
            </div>
          )}

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={!isValid || updatePlanMutation.isPending}
            className="w-full rounded-xl bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-black font-semibold"
          >
            {updatePlanMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
