import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { Plus, X, Loader2, Star, Clock, FileText, Gift, Settings2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCreatePlan } from '@/hooks/use-subscriptions';
import { BASE_CHAIN_ID, BNB_CHAIN_ID, isSubscriptionChain } from '@/lib/contracts';
import { useTokenPrices } from '@/hooks/use-token-prices';
import { dhbForUsd, formatDhbEstimate, subscriptionPaymentToken } from '@/lib/subscription-pricing';
import dehubCoin from '@/assets/dehub-coin.png';
import baseLogo from '@/assets/icons/base-logo.png';
import bnbLogo from '@/assets/icons/bnb-logo.png';
import solanaLogo from '@/assets/icons/solana-logo.png';
import robinhoodLogo from '@/assets/icons/robinhood-chain-logo.svg';
import { SOLANA_MAINNET_CHAIN_ID } from '@/lib/chains/constants';
import { ROBINHOOD_CHAIN_ID } from '@/lib/chains/robinhood';

interface CreatePlanModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
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
  { labelKey: 'subscriptions.preset1Month', months: 1, tier: 1 },
  { labelKey: 'subscriptions.preset3Months', months: 3, tier: 2 },
  { labelKey: 'subscriptions.preset6Months', months: 6, tier: 3 },
  { labelKey: 'subscriptions.preset1Year', months: 12, tier: 4 },
  { labelKey: 'subscriptions.presetLifetime', months: 0, tier: 5 },
];

const CHAIN_OPTIONS: { chainId: number; label: string; icon: string }[] = [
  { chainId: BASE_CHAIN_ID, label: 'Base', icon: baseLogo },
  { chainId: BNB_CHAIN_ID, label: 'BNB', icon: bnbLogo },
  { chainId: ROBINHOOD_CHAIN_ID, label: 'Robinhood', icon: robinhoodLogo },
  { chainId: SOLANA_MAINNET_CHAIN_ID, label: 'Solana', icon: solanaLogo },
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

export function CreatePlanModal({ open, onOpenChange, onCreated }: CreatePlanModalProps) {
  const { t } = useTranslation();
  const draft = loadDraft();
  const [name, setName] = useState(draft?.name ?? '');
  const [description, setDescription] = useState(draft?.description ?? '');
  const [price, setPrice] = useState(draft?.price ?? '');
  const [duration, setDuration] = useState(draft?.duration ?? 1);
  const [tier, setTier] = useState(draft?.tier ?? 1);
  const savedChainId = Number(draft?.chainId);
  const [chainId, setChainId] = useState<number>(
    isSubscriptionChain(savedChainId) ? savedChainId : BASE_CHAIN_ID,
  );
  const [benefits, setBenefits] = useState<string[]>(draft?.benefits ?? ['']);

  const createPlanMutation = useCreatePlan();
  const { data: tokenPrices = {} } = useTokenPrices();
  const numericPrice = Number(price);
  const dhbEstimate = dhbForUsd(numericPrice, Number(tokenPrices.DHB));
  const selectedChain = CHAIN_OPTIONS.find((option) => option.chainId === chainId) || CHAIN_OPTIONS[0];

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
    const paymentToken = subscriptionPaymentToken(chainId);
    if (!paymentToken) return;

    const filteredBenefits = benefits.filter(b => b.trim());

    try {
      await createPlanMutation.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        duration,
        tier,
        benefits: filteredBenefits.length > 0 ? filteredBenefits : undefined,
        chains: [
          {
            chainId,
            token: paymentToken.address,
            price: parseFloat(price),
            currency: paymentToken.symbol,
            decimals: paymentToken.decimals,
          },
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
      onCreated?.();
      onOpenChange(false);
    } catch (err) {
      console.error('[CreatePlanModal] Plan creation failed:', err);
    }
  };

  const isValid = name.trim() && price && parseFloat(price) > 0;
  const busy = createPlanMutation.isPending;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        glass
        hideHandle
        column
        className="text-white max-h-[85dvh] overflow-hidden flex flex-col px-4 pb-6"
      >
        <DrawerHeader className="relative pb-4 border-b border-white/10 shrink-0 px-0 text-left">
          <div className="flex items-center justify-between gap-2">
            <DrawerTitle className="flex items-center gap-2 text-xl text-white">
              <Star className="w-5 h-5 text-white" />
              {t('subscriptions.createPlanTitle')}
            </DrawerTitle>
            {/* Drawer has no built-in close affordance the way Dialog did, and the
                scrim alone is not discoverable enough for a form this long. */}
            <div className="flex items-center gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Subscription network: ${selectedChain.label}`}
                    className="relative p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    <Settings2 className="w-5 h-5" />
                    <img
                      src={selectedChain.icon}
                      alt=""
                      className="absolute -right-0.5 -bottom-0.5 w-3 h-3 rounded-full border border-zinc-900 object-cover"
                    />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60 bg-zinc-950/95 border-white/10 text-white backdrop-blur-xl">
                  <DropdownMenuLabel>Subscription network</DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-white/10" />
                  {CHAIN_OPTIONS.map((option) => {
                    const available = isSubscriptionChain(option.chainId);
                    return (
                      <DropdownMenuItem
                        key={option.chainId}
                        disabled={!available}
                        onSelect={() => available && setChainId(option.chainId)}
                        className="flex items-center gap-3 py-2.5"
                      >
                        <img src={option.icon} alt="" className="w-6 h-6 rounded-md object-cover" />
                        <span className="flex-1">{option.label}</span>
                        {available ? (
                          option.chainId === chainId && <Check className="w-4 h-4" />
                        ) : (
                          <span className="text-[10px] uppercase tracking-wide text-zinc-500">Soon</span>
                        )}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
              <button
                onClick={() => onOpenChange(false)}
                aria-label={t('subscriptions.close')}
                className="p-2 -mr-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </DrawerHeader>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pt-4">
          {/* Plan Name */}
          <div>
            <label className="text-sm text-zinc-400 mb-1.5 block">{t('subscriptions.planName')}</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('subscriptions.planNamePlaceholder')}
              className="bg-white/5 border-white/10 text-white placeholder:text-zinc-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-sm text-zinc-400 mb-1.5 block flex items-center gap-1">
              <FileText className="w-3.5 h-3.5" />
              {t('subscriptions.descriptionOptional')}
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('subscriptions.descriptionPlaceholder')}
              rows={3}
              className="bg-white/5 border-white/10 text-white placeholder:text-zinc-500 resize-none"
            />
          </div>

          {/* Price */}
          <div>
            <label className="text-sm text-zinc-400 mb-1.5 block">
              {t('subscriptions.price')} (USD)
            </label>
            <div className="relative">
              <Input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
                min="0"
                step="0.01"
                className="bg-white/5 border-white/10 text-white placeholder:text-zinc-500 pr-40"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-xs text-zinc-400 pointer-events-none">
                <img src={dehubCoin} alt="DHB" className="w-4 h-4" />
                <span>{price ? formatDhbEstimate(dhbEstimate) : 'DHB'}</span>
              </div>
            </div>
            <p className="text-xs text-zinc-500 mt-1.5">
              {t('subscriptions.youReceiveInFull')}
            </p>
          </div>

          {/* Duration */}
          <div>
            <label className="text-sm text-zinc-400 mb-1.5 block flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {t('subscriptions.duration')}
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
                  {t(preset.labelKey)}
                </button>
              ))}
            </div>
            <p className="text-xs text-zinc-500 mt-1.5">
              {t('subscriptions.onePlanPerDuration')}
            </p>
          </div>

          {/* Benefits */}
          <div>
            <label className="text-sm text-zinc-400 mb-1.5 block flex items-center gap-1">
              <Gift className="w-3.5 h-3.5" />
              {t('subscriptions.benefitsOptional')}
            </label>
            <div className="space-y-2">
              {benefits.map((benefit, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    value={benefit}
                    onChange={(e) => handleBenefitChange(index, e.target.value)}
                    placeholder={t('subscriptions.benefitN', { number: index + 1 })}
                    className="bg-white/5 border-white/10 text-white placeholder:text-zinc-500 flex-1"
                  />
                  {benefits.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveBenefit(index)}
                      className="text-zinc-400 hover:text-white shrink-0"
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
                {t('subscriptions.addBenefit')}
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
                  {createPlanMutation.stageLabel || t('subscriptions.creating')}
                </>
              ) : (
                <>
                  <Star className="w-4 h-4" />
                  {t('subscriptions.createAndPublish')}
                </>
              )}
            </span>
          </button>
          <p className="text-xs text-zinc-500 text-center">
            {t('subscriptions.publishingIsOnChain')}
          </p>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
