import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { PremiumCheckoutModal } from '@/components/premium/PremiumCheckoutModal';
import { toast } from 'sonner';

type Billing = 'monthly' | 'annual';

const metallicBg =
  'linear-gradient(135deg, rgba(255,255,255,0.92) 0%, rgba(228,228,231,0.85) 22%, rgba(161,161,170,0.75) 50%, rgba(212,212,216,0.85) 78%, rgba(255,255,255,0.92) 100%)';

const metallicStyle: React.CSSProperties = {
  backgroundImage: metallicBg,
  backgroundColor: 'rgba(228,228,231,0.6)',
  backdropFilter: 'blur(14px) saturate(160%)',
  WebkitBackdropFilter: 'blur(14px) saturate(160%)',
  boxShadow:
    'inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 0 rgba(0,0,0,0.12), 0 4px 18px rgba(0,0,0,0.35)',
};

/** A translated line: a key plus whatever numbers or model names it interpolates. */
interface Line {
  key: string;
  vars?: Record<string, string | number>;
}

interface Plan {
  id: string;
  /** Product tier name. Not translated — it is what the plan is called. */
  name: string;
  discountPct: number;
  taglineKey?: string;
  headlineKey: string;
  breakdown: Line[];
  monthly: number;
  annual: number;
  perLabelKey: string;
  cta: Line;
  savingsUsd?: number;
  seats?: number;
  featured?: boolean;
  groups: { titleKey: string; items: Line[] }[];
  monthlyPriceId: string;
  annualPriceId: string;
}

/**
 * Allowances are DHB, and the numbers below have to match AI_PLANS in
 * supabase/functions/_shared/ai-plans.ts — that file is what actually sends
 * the tokens when an invoice is paid. They are real DHB delivered to the
 * subscriber's wallet, not a balance held here: there is no credit ledger any
 * more, and a job is paid for by a transfer signed at the moment it runs.
 *
 * The previous copy ("3,500 credits/mo = 1,750 Nano Banana Pro Generations")
 * was inherited from a competitor whose credit unit is not ours. Nothing ever
 * granted it, which was lucky: at our cost basis that is $525 of retail sold
 * for $129. These figures are rebuilt from what we pay providers, at the
 * gateway peg of 1,000 DHB = $1 of generation. The per-model counts in each
 * breakdown are at current server pricing (ai-pricing.ts, including the veo
 * markup band) and go stale if a provider reprices — recompute, don't copy.
 *
 * Every number is a variable rather than part of the sentence, so a translator
 * never has to retype a price to translate the line it sits in.
 */
const plans: Plan[] = [
  {
    id: 'creator',
    name: 'Creator',
    monthlyPriceId: 'creator_monthly',
    annualPriceId: 'creator_annual',
    discountPct: 21,
    headlineKey: 'pricing.headlineCreator',
    breakdown: [
      { key: 'pricing.dhbPerMonth', vars: { amount: '23,000' } },
      { key: 'pricing.equivalence', vars: { videos: 54, videoModel: 'Veo 3.1 Fast', images: 212, imageModel: 'Nano Banana Pro' } },
      { key: 'pricing.realDhbSpendAnywhere' },
    ],
    monthly: 19,
    annual: 15,
    perLabelKey: 'pricing.perMonthBilledAnnually',
    cta: { key: 'pricing.ctaGet', vars: { plan: 'Creator' } },
    groups: [
      {
        titleKey: 'pricing.groupIncluded',
        items: [
          { key: 'pricing.accessAllModels' },
          { key: 'pricing.parallelGenerations', vars: { videos: 4, images: 4 } },
          { key: 'pricing.topUpAnyTime' },
          { key: 'pricing.publishStraightToDehub' },
        ],
      },
    ],
  },
  {
    id: 'ultra',
    name: 'Ultra',
    monthlyPriceId: 'ultra_monthly',
    annualPriceId: 'ultra_annual',
    discountPct: 23,
    taglineKey: 'pricing.bestValue',
    headlineKey: 'pricing.headlineUltra',
    breakdown: [
      { key: 'pricing.dhbPerMonth', vars: { amount: '130,000' } },
      { key: 'pricing.equivalence', vars: { videos: 78, videoModel: 'Veo 3.1', images: '1,203', imageModel: 'Nano Banana Pro' } },
      { key: 'pricing.realDhbNeverExpires' },
    ],
    monthly: 129,
    annual: 99,
    perLabelKey: 'pricing.perMonthBilledAnnually',
    cta: { key: 'pricing.ctaChangeCommitment' },
    featured: true,
    groups: [
      {
        titleKey: 'pricing.groupIncluded',
        items: [
          { key: 'pricing.parallelGenerations', vars: { videos: 8, images: 8 } },
          { key: 'pricing.accessSupercomputer' },
          { key: 'pricing.accessAllSeedance' },
          { key: 'pricing.accessAllModels' },
          { key: 'pricing.earlyAccess' },
          { key: 'pricing.unlimitedMarketplace' },
          // 'Lowest cost per credit' used to sit here. Creator at $15 for
          // 23,000 DHB beats Ultra's $99 for 130,000 per credit, so the
          // claim became false the day Creator was listed.
        ],
      },
      {
        titleKey: 'pricing.groupSeedance20',
        items: [
          { key: 'pricing.seedanceFullAccess', vars: { model: 'Seedance 2.0' } },
          { key: 'pricing.seedanceFullAccess', vars: { model: 'Seedance 2.0 Fast' } },
        ],
      },
    ],
  },
  {
    id: 'team',
    name: 'Team',
    monthlyPriceId: 'team_monthly',
    annualPriceId: 'team_annual',
    discountPct: 18,
    headlineKey: 'pricing.headlineTeam',
    breakdown: [
      { key: 'pricing.dhbPerSeat', vars: { amount: '88,000' } },
      { key: 'pricing.equivalence', vars: { videos: 53, videoModel: 'Veo 3.1', images: 814, imageModel: 'Nano Banana Pro' } },
      { key: 'pricing.pooledNeverExpires' },
    ],
    monthly: 79,
    annual: 65,
    perLabelKey: 'pricing.perSeatBilledAnnually',
    cta: { key: 'pricing.ctaGet', vars: { plan: 'Team' } },
    savingsUsd: 168,
    seats: 2,
    groups: [
      {
        titleKey: 'pricing.groupWorkspace',
        items: [
          { key: 'pricing.membersRange', vars: { min: 2, max: 9 } },
          { key: 'pricing.parallelGenerations', vars: { videos: 16, images: 16 } },
          { key: 'pricing.accessAllFeatures' },
          { key: 'pricing.sharedDhbPool' },
          { key: 'pricing.sharedWorkspace' },
          { key: 'pricing.earlyAccess' },
          { key: 'pricing.accessSeedance20' },
          { key: 'pricing.accessSupercomputer' },
        ],
      },
      {
        titleKey: 'pricing.groupAnalytics',
        items: [{ key: 'pricing.basicAnalytics' }, { key: 'pricing.prioritySupport' }],
      },
      {
        titleKey: 'pricing.groupAdmin',
        items: [{ key: 'pricing.sso' }, { key: 'pricing.adminSpendControl' }, { key: 'pricing.priorityQueue' }],
      },
      {
        titleKey: 'pricing.groupSecurity',
        items: [
          { key: 'pricing.delegatedTopUp' },
          { key: 'pricing.indemnification' },
          { key: 'pricing.noTraining' },
          { key: 'pricing.soc2' },
          { key: 'pricing.aiEducator' },
        ],
      },
    ],
  },
  {
    id: 'scale',
    name: 'Scale',
    monthlyPriceId: 'scale_monthly',
    annualPriceId: 'scale_annual',
    discountPct: 30,
    headlineKey: 'pricing.headlineScale',
    breakdown: [
      { key: 'pricing.dhbPerSeat', vars: { amount: '210,000' } },
      { key: 'pricing.equivalence', vars: { videos: 126, videoModel: 'Veo 3.1', images: '1,944', imageModel: 'Nano Banana Pro' } },
      { key: 'pricing.pooledNeverExpires' },
    ],
    monthly: 215,
    annual: 150,
    perLabelKey: 'pricing.perSeatBilledAnnually',
    cta: { key: 'pricing.ctaGet', vars: { plan: 'Scale' } },
    // (215 − 150) × 12 — the $228 that sat here before reconciled with
    // nothing on the card.
    savingsUsd: 780,
    seats: 5,
    groups: [
      {
        titleKey: 'pricing.groupWorkspace',
        items: [
          { key: 'pricing.membersRange', vars: { min: 5, max: 15 } },
          { key: 'pricing.parallelGenerations', vars: { videos: 20, images: 24 } },
          { key: 'pricing.accessAllFeatures' },
          { key: 'pricing.sharedDhbPool' },
          { key: 'pricing.sharedWorkspace' },
          { key: 'pricing.earlyAccess' },
          { key: 'pricing.accessSeedance20' },
          { key: 'pricing.accessSupercomputer' },
        ],
      },
      {
        titleKey: 'pricing.groupAnalytics',
        items: [{ key: 'pricing.detailedAnalytics' }, { key: 'pricing.prioritySupport' }],
      },
      {
        titleKey: 'pricing.groupAdmin',
        items: [{ key: 'pricing.sso' }, { key: 'pricing.adminSpendControl' }, { key: 'pricing.priorityQueueFast' }],
      },
      {
        titleKey: 'pricing.groupSecurity',
        items: [
          { key: 'pricing.delegatedTopUp' },
          { key: 'pricing.indemnification' },
          { key: 'pricing.noTraining' },
          { key: 'pricing.soc2' },
          { key: 'pricing.aiEducator' },
        ],
      },
    ],
  },
];

interface Props {
  showHeader?: boolean;
}

export function PricingSection({ showHeader = true }: Props) {
  const { t } = useTranslation();
  const [billing, setBilling] = useState<Billing>('annual');
  const { walletAddress, user, openLoginModal } = useAuth() as any;
  const [checkoutPriceId, setCheckoutPriceId] = useState<string | null>(null);

  const handleSelect = (priceId: string) => {
    if (!walletAddress) {
      toast.error(t('pricing.signInToSubscribe'));
      openLoginModal?.();
      return;
    }
    setCheckoutPriceId(priceId);
  };

  return (
    <section className="w-full px-3 py-10 sm:px-6 sm:py-14">
      {showHeader && (
        <div className="mx-auto mb-8 max-w-3xl text-center">
          <h2 className="text-3xl font-black tracking-tight text-white sm:text-5xl">
            {t('pricing.plansForEveryWorkflow')}
          </h2>
          <p className="mt-3 text-sm text-white/60 sm:text-base">
            {t('pricing.findTheRightFit')}
          </p>

          <div
            className="mx-auto mt-6 inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1 backdrop-blur-xl"
          >
            <BillingToggle billing={billing} setBilling={setBilling} value="monthly" label={t('pricing.monthly')} />
            <BillingToggle billing={billing} setBilling={setBilling} value="annual" label={t('pricing.annual')} />
          </div>
        </div>
      )}

      <div
        className={cn(
          'mx-auto grid max-w-7xl gap-4',
          // Four plans since Creator was listed: 2x2 until xl on every
          // surface. The old compact/full split (3-up at md vs lg) only made
          // sense with three cards.
          'md:grid-cols-2 xl:grid-cols-4'
        )}
      >
        {plans.map((plan) => (
          <PlanCard key={plan.id} plan={plan} billing={billing} onSelect={handleSelect} />
        ))}
      </div>

      <PremiumCheckoutModal
        open={!!checkoutPriceId}
        onOpenChange={(o) => { if (!o) setCheckoutPriceId(null); }}
        priceId={checkoutPriceId ?? ''}
        walletAddress={walletAddress ?? ''}
        customerEmail={user?.email}
      />
    </section>
  );
}

function BillingToggle({
  billing,
  setBilling,
  value,
  label,
}: {
  billing: Billing;
  setBilling: (b: Billing) => void;
  value: Billing;
  label: string;
}) {
  const { t } = useTranslation();
  const active = billing === value;
  return (
    <button
      type="button"
      onClick={() => setBilling(value)}
      className={cn(
        'rounded-full px-5 py-1.5 text-sm font-semibold transition',
        active ? 'text-black' : 'text-white/70 hover:text-white'
      )}
      style={active ? metallicStyle : undefined}
    >
      {label}
      {value === 'annual' && (
        <span className={cn('ml-2 text-[10px] font-bold', active ? 'text-black/70' : 'text-white/50')}>
          {/* Annual discounts range 18–30% across the tiers (each card wears
              its own), so the toggle can only honestly claim the ceiling. */}
          {t('pricing.upToDiscount', { pct: 30 })}
        </span>
      )}
    </button>
  );
}

function PlanCard({ plan, billing, onSelect }: { plan: Plan; billing: Billing; onSelect: (priceId: string) => void }) {
  const { t } = useTranslation();
  const price = billing === 'annual' ? plan.annual : plan.monthly;
  const strike = billing === 'annual' ? plan.monthly : null;
  const priceId = billing === 'annual' ? plan.annualPriceId : plan.monthlyPriceId;

  return (
    <div
      className={cn(
        'relative flex flex-col overflow-hidden rounded-2xl border p-6 backdrop-blur-2xl',
        plan.featured
          ? 'border-white/20 bg-white/[0.06]'
          : 'border-white/10 bg-black/40'
      )}
    >
      {plan.featured && (
        <div
          className="absolute right-4 top-4 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest text-black"
          style={metallicStyle}
        >
          {t(plan.taglineKey ?? 'pricing.featured')}
        </div>
      )}

      <div className="flex items-center gap-2">
        <h3 className="text-2xl font-black uppercase tracking-tight text-white">{plan.name}</h3>
        <span className="rounded-md border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-bold text-white/80">
          {t('pricing.percentOff', { pct: plan.discountPct })}
        </span>
      </div>

      <p className="mt-2 text-sm text-white/60">{t(plan.headlineKey)}</p>

      <div className="mt-5 space-y-1 text-xs text-white/70">
        {plan.breakdown.map((line) => (
          <div key={line.key + JSON.stringify(line.vars ?? {})}>{t(line.key, line.vars)}</div>
        ))}
      </div>

      <div className="mt-5 flex items-end gap-2">
        {strike !== null && (
          <span className="text-lg text-white/40 line-through">${strike}</span>
        )}
        <span className="text-4xl font-black text-white">${price}</span>
      </div>
      <div className="text-xs text-white/50">{t(plan.perLabelKey)}</div>
      {plan.savingsUsd !== undefined && (
        <div className="mt-1 text-xs text-white/60">{t('pricing.savings', { amount: plan.savingsUsd })}</div>
      )}
      {plan.seats !== undefined && (
        <div className="mt-1 text-xs text-white/60">{t('pricing.seats', { count: plan.seats })}</div>
      )}

      <button
        type="button"
        onClick={() => onSelect(priceId)}
        className={cn(
          'mt-5 w-full rounded-2xl py-3 text-sm font-bold transition',
          plan.featured
            ? 'text-black hover:opacity-90'
            : 'border border-white/15 bg-white/5 text-white hover:bg-white/10'
        )}
        style={plan.featured ? metallicStyle : undefined}
      >
        {t(plan.cta.key, plan.cta.vars)}
      </button>

      <div className="mt-6 space-y-5">
        {plan.groups.map((group) => (
          <div key={group.titleKey}>
            <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-white/40">
              {t(group.titleKey)}
            </div>
            <ul className="space-y-1.5">
              {group.items.map((item) => (
                <li key={item.key + JSON.stringify(item.vars ?? {})} className="flex items-start gap-2 text-xs text-white/75">
                  <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-white/60" />
                  <span>{t(item.key, item.vars)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

export default PricingSection;
