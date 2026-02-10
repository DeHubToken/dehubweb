import { useState } from 'react';
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
import dehubCoin from '@/assets/dehub-coin.png';

interface CreatePlanModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DURATION_PRESETS = [
  { label: '1 Month', months: 1, tier: 1 },
  { label: '3 Months', months: 3, tier: 2 },
  { label: '6 Months', months: 6, tier: 3 },
  { label: '1 Year', months: 12, tier: 4 },
];

// DHB token addresses per chain
const DHB_TOKENS: Record<number, string> = {
  8453: '0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c', // Base
  56: '0x680D3113caf77B61b510f332D5Ef4cf5b41A761D',   // BSC
};

export function CreatePlanModal({ open, onOpenChange }: CreatePlanModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [duration, setDuration] = useState(1);
  const [tier, setTier] = useState(1);
  const [benefits, setBenefits] = useState<string[]>(['']);
  
  const createPlanMutation = useCreatePlan();

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

    const filteredBenefits = benefits.filter(b => b.trim());
    
    try {
      const priceNum = parseFloat(price);
      await createPlanMutation.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        duration,
        tier,
        benefits: filteredBenefits.length > 0 ? filteredBenefits : undefined,
        chains: [
          { chainId: 8453, token: DHB_TOKENS[8453], price: priceNum },
        ],
      });

      // Reset form
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900/95 backdrop-blur-xl border-white/10 text-white max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Star className="w-5 h-5 text-yellow-400" />
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
          <Button
            onClick={handleSubmit}
            disabled={!isValid || createPlanMutation.isPending}
            className="w-full rounded-xl bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-black font-semibold"
          >
            {createPlanMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Star className="w-4 h-4 mr-2" />
                Create Plan
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
