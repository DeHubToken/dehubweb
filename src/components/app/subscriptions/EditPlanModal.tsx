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
import { type SubscriptionPlan } from '@/lib/api/dehub';
import dehubCoin from '@/assets/dehub-coin.png';

interface EditPlanModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: SubscriptionPlan;
}

const DURATION_PRESETS = [
  { label: '1 Week', days: 7 },
  { label: '1 Month', days: 30 },
  { label: '3 Months', days: 90 },
  { label: '1 Year', days: 365 },
  { label: 'Lifetime', days: 0 },
];

export function EditPlanModal({ open, onOpenChange, plan }: EditPlanModalProps) {
  const [name, setName] = useState(plan.name);
  const [description, setDescription] = useState(plan.description || '');
  const [price, setPrice] = useState(String(plan.price));
  const [duration, setDuration] = useState(plan.duration);
  const [benefits, setBenefits] = useState<string[]>(plan.benefits?.length ? plan.benefits : ['']);
  const [isActive, setIsActive] = useState(plan.isActive !== false);

  const updatePlanMutation = useUpdatePlan();
  const planId = plan._id || plan.id || '';

  // Sync form when plan prop changes
  useEffect(() => {
    setName(plan.name);
    setDescription(plan.description || '');
    setPrice(String(plan.price));
    setDuration(plan.duration);
    setBenefits(plan.benefits?.length ? plan.benefits : ['']);
    setIsActive(plan.isActive !== false);
  }, [plan]);

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
      planId,
      data: {
        name: name.trim(),
        description: description.trim() || undefined,
        price: parseFloat(price),
        currency: 'DHB',
        duration,
        benefits: filteredBenefits.length > 0 ? filteredBenefits : undefined,
        isActive,
      },
    });

    onOpenChange(false);
  };

  const handleToggleActive = async () => {
    if (!planId) return;
    const newActive = !isActive;
    setIsActive(newActive);
    await updatePlanMutation.mutateAsync({
      planId,
      data: { isActive: newActive },
    });
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
            <div className="grid grid-cols-4 gap-2">
              {DURATION_PRESETS.map((preset) => (
                <button
                  key={preset.days}
                  onClick={() => setDuration(preset.days)}
                  className={`px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                    duration === preset.days
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

          {/* Active toggle */}
          <div className="flex items-center justify-between rounded-xl bg-white/5 border border-white/10 p-3">
            <div>
              <p className="text-sm text-white font-medium">Plan Active</p>
              <p className="text-xs text-zinc-500">Deactivated plans can't be purchased</p>
            </div>
            <button
              onClick={handleToggleActive}
              className={`w-11 h-6 rounded-full transition-colors relative ${
                isActive ? 'bg-green-500' : 'bg-zinc-600'
              }`}
            >
              <span
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                  isActive ? 'left-[22px]' : 'left-0.5'
                }`}
              />
            </button>
          </div>

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
