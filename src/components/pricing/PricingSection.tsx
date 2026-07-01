import { useState } from 'react';
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

interface Plan {
  id: string;
  name: string;
  discount: string;
  tagline: string;
  headline: string;
  breakdown: string[];
  monthly: number;
  annual: number;
  perLabel: string;
  cta: string;
  savings?: string;
  seats?: string;
  featured?: boolean;
  groups: { title: string; items: string[] }[];
  freeGens?: { label: string; note: string }[];
}

const plans: Plan[] = [
  {
    id: 'ultra',
    name: 'Ultra',
    discount: '23% OFF',
    tagline: 'Best value',
    headline: 'For creators building AI projects',
    breakdown: [
      '3,000 credits/mo.',
      '= 1,500 Nano Banana Pro Generations',
      '~ 133 Seedance 2.0 videos',
    ],
    monthly: 129,
    annual: 99,
    perLabel: 'per month, billed annually',
    cta: 'Change Commitment',
    featured: true,
    groups: [
      {
        title: 'Included',
        items: [
          'Parallel generations: up to 8 videos, 8 images',
          'Access to Supercomputer',
          'Access to all Seedance models',
          'Access to all models & features',
          'Early access to advanced AI features',
          'Access to unlimited marketplace',
          'Lowest cost per credit',
        ],
      },
      {
        title: 'Seedance 2.0',
        items: ['Seedance 2.0 — Full access', 'Seedance 2.0 Fast — Full access'],
      },
    ],
    freeGens: [
      { label: 'Nano Banana Pro', note: '2K · 7 days unlimited' },
      { label: 'Nano Banana 2', note: '2K · 7 days unlimited' },
      { label: 'Kling 3.0', note: '7 days unlimited' },
    ],
  },
  {
    id: 'team',
    name: 'Team',
    discount: '18% OFF',
    tagline: '',
    headline: 'For agencies and small teams to create faster',
    breakdown: [
      '2,000 credits in total/mo',
      '= 1,000 Nano Banana Pro images  ·  ~ 89 Seedance 2.0 videos',
      '1,000 credits per seat/mo',
    ],
    monthly: 79,
    annual: 65,
    perLabel: 'per seat/mo, billed annually',
    cta: 'Get Team',
    savings: 'Save $168 compared to monthly',
    seats: '2 seats',
    groups: [
      {
        title: 'Workspace & Collaboration',
        items: [
          '2 to 9 members in one shared workspace',
          'Parallel generations: up to 16 video & 16 image',
          'Access to all features & models',
          'Shared credit pool',
          'Shared workspace for your team',
          'Early access to advanced AI features',
          'Access to Seedance 2.0',
          'Access to Supercomputer',
        ],
      },
      {
        title: 'Analytics & Support',
        items: ['Basic analytics', 'Priority support'],
      },
      {
        title: 'Admin & Control',
        items: ['SSO', 'Admin spend control', 'Priority queue'],
      },
      {
        title: 'Security & Compliance',
        items: [
          'Delegated top-up access',
          'Indemnification',
          'No training on your data',
          'SOC 2 security (coming soon)',
          'AI Educator & Slack support',
        ],
      },
    ],
  },
  {
    id: 'scale',
    name: 'Scale',
    discount: '30% OFF',
    tagline: '',
    headline: 'Designed for growing creative teams',
    breakdown: [
      '12,500 credits/mo',
      '= 6,250 Nano Banana Pro images  ·  ~ 556 Seedance 2.0 videos',
      '2,500 credits per seat/mo',
    ],
    monthly: 215,
    annual: 150,
    perLabel: 'per seat/mo, billed annually',
    cta: 'Get Scale',
    savings: 'Save $228 compared to monthly',
    seats: '5 seats',
    groups: [
      {
        title: 'Workspace & Collaboration',
        items: [
          '5 to 15 members in one shared workspace',
          'Parallel generations: up to 20 videos & 24 images',
          'Access to all features & models',
          'Shared credit pool',
          'Shared workspace for your team',
          'Early access to advanced AI features',
          'Access to Seedance 2.0',
          'Access to Supercomputer',
        ],
      },
      {
        title: 'Analytics & Support',
        items: ['Detailed analytics', 'Priority support'],
      },
      {
        title: 'Admin & Control',
        items: ['SSO', 'Admin spend control', 'Priority queue for faster task processing'],
      },
      {
        title: 'Security & Compliance',
        items: [
          'Delegated top-up access',
          'Indemnification',
          'No training on your data',
          'SOC 2 security (coming soon)',
          'AI Educator & Slack support',
        ],
      },
    ],
  },
];

interface Props {
  compact?: boolean;
  showHeader?: boolean;
}

export function PricingSection({ compact = false, showHeader = true }: Props) {
  const [billing, setBilling] = useState<Billing>('annual');

  return (
    <section className="w-full px-3 py-10 sm:px-6 sm:py-14">
      {showHeader && (
        <div className="mx-auto mb-8 max-w-3xl text-center">
          <h2 className="text-3xl font-black tracking-tight text-white sm:text-5xl">
            Plans for every workflow
          </h2>
          <p className="mt-3 text-sm text-white/60 sm:text-base">
            From individuals to enterprise teams, find the right fit
          </p>

          <div
            className="mx-auto mt-6 inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1 backdrop-blur-xl"
          >
            <BillingToggle billing={billing} setBilling={setBilling} value="monthly" label="Monthly" />
            <BillingToggle billing={billing} setBilling={setBilling} value="annual" label="Annual" />
          </div>
        </div>
      )}

      <div
        className={cn(
          'mx-auto grid max-w-7xl gap-4',
          compact ? 'md:grid-cols-3' : 'lg:grid-cols-3'
        )}
      >
        {plans.map((plan) => (
          <PlanCard key={plan.id} plan={plan} billing={billing} />
        ))}
      </div>
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
          −23%
        </span>
      )}
    </button>
  );
}

function PlanCard({ plan, billing }: { plan: Plan; billing: Billing }) {
  const price = billing === 'annual' ? plan.annual : plan.monthly;
  const strike = billing === 'annual' ? plan.monthly : null;

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
          {plan.tagline || 'Featured'}
        </div>
      )}

      <div className="flex items-center gap-2">
        <h3 className="text-2xl font-black uppercase tracking-tight text-white">{plan.name}</h3>
        <span className="rounded-md border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-bold text-white/80">
          {plan.discount}
        </span>
      </div>

      <p className="mt-2 text-sm text-white/60">{plan.headline}</p>

      <div className="mt-5 space-y-1 text-xs text-white/70">
        {plan.breakdown.map((line) => (
          <div key={line}>{line}</div>
        ))}
      </div>

      <div className="mt-5 flex items-end gap-2">
        {strike !== null && (
          <span className="text-lg text-white/40 line-through">${strike}</span>
        )}
        <span className="text-4xl font-black text-white">${price}</span>
      </div>
      <div className="text-xs text-white/50">{plan.perLabel}</div>
      {plan.savings && <div className="mt-1 text-xs text-white/60">{plan.savings}</div>}
      {plan.seats && <div className="mt-1 text-xs text-white/60">{plan.seats}</div>}

      <button
        type="button"
        className={cn(
          'mt-5 w-full rounded-2xl py-3 text-sm font-bold transition',
          plan.featured
            ? 'text-black hover:opacity-90'
            : 'border border-white/15 bg-white/5 text-white hover:bg-white/10'
        )}
        style={plan.featured ? metallicStyle : undefined}
      >
        {plan.cta}
      </button>

      <div className="mt-6 space-y-5">
        {plan.groups.map((group) => (
          <div key={group.title}>
            <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-white/40">
              {group.title}
            </div>
            <ul className="space-y-1.5">
              {group.items.map((item) => (
                <li key={item} className="flex items-start gap-2 text-xs text-white/75">
                  <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-white/60" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}

        {plan.freeGens && (
          <div>
            <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-white/40">
              Unlimited & Free Gens
            </div>
            <ul className="space-y-1.5">
              {plan.freeGens.map((f) => (
                <li key={f.label} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/80">
                  <span className="font-semibold">{f.label}</span>
                  <span className="text-white/50">{f.note}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export default PricingSection;
