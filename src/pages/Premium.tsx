import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, Crown, Sparkles, Users, Zap, Shield, PlayCircle, ImageIcon, Video, MessageSquare, Palette, Eye, Lock, Rocket, Heart, Infinity as InfinityIcon } from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { PaymentTestModeBanner } from '@/components/PaymentTestModeBanner';
import { PremiumCheckoutModal } from '@/components/premium/PremiumCheckoutModal';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

/**
 * Each perk, deep-dive and question is one key stem: `…Label`/`…Detail` for a
 * perk, `…Title`/`…Body` for a deep-dive, `…Q`/`…A` for a question. Keeping the
 * pair together means a translator sees the heading and the sentence under it
 * as one unit rather than two entries that happen to sit next to each other.
 */
const EXTRA_PERKS = [
  { icon: Shield, key: 'adFree' },
  { icon: PlayCircle, key: 'background' },
  { icon: Crown, key: 'badge' },
  { icon: Palette, key: 'themes' },
  { icon: Eye, key: 'profileInsights' },
  { icon: Heart, key: 'followerInsights' },
  { icon: Lock, key: 'sneakPeeks' },
  { icon: Rocket, key: 'boost' },
  { icon: MessageSquare, key: 'assistantMsgs' },
  { icon: ImageIcon, key: 'aiImages' },
  { icon: Video, key: 'aiVideo' },
];

const FAMILY_PERKS = [
  { icon: Users, key: 'fiveSeats' },
  { icon: Zap, key: 'perksPerSeat' },
  { icon: Shield, key: 'oneBill' },
];

const XL_PERKS = [
  { icon: Users, key: 'twentySeats' },
  { icon: Rocket, key: 'maxBoosts' },
  { icon: InfinityIcon, key: 'skyHighAi' },
  { icon: Lock, key: 'unlimitedPeeks' },
  { icon: Palette, key: 'allThemes' },
  { icon: Eye, key: 'proProfileInsights' },
  { icon: Heart, key: 'proFollowerInsights' },
];

const DEEP_DIVES = [
  { icon: Shield, key: 'adFree' },
  { icon: PlayCircle, key: 'background' },
  { icon: Sparkles, key: 'ai' },
];

const FAQ_KEYS = ['whatIsAnAd', 'switchPlans', 'familySeats', 'topTierStaker', 'payInDhb'];

/** `adFree` → `premium.diveAdFreeTitle` — one helper so the stems stay short. */
function stem(prefix: string, key: string, suffix: string) {
  return `premium.${prefix}${key[0].toUpperCase()}${key.slice(1)}${suffix}`;
}

function GlassCard({ children, highlight = false }: { children: React.ReactNode; highlight?: boolean }) {
  const { t } = useTranslation();
  return (
    <div
      className={[
        'relative rounded-2xl bg-black/60 backdrop-blur-[24px] border p-6 sm:p-8',
        highlight ? 'border-white/30 shadow-[0_0_60px_-20px_rgba(255,255,255,0.25)]' : 'border-white/10',
      ].join(' ')}
    >
      {highlight && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-white text-black text-[11px] font-semibold tracking-wide uppercase">
          {t('premium.bestValue')}
        </div>
      )}
      {children}
    </div>
  );
}

function PerkRow({ icon: Icon, perkKey }: { icon: React.ElementType; perkKey: string }) {
  const { t } = useTranslation();
  return (
    <li className="flex items-start gap-3">
      <div className="shrink-0 w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
        <Icon className="w-4 h-4 text-white" />
      </div>
      <div className="min-w-0">
        <div className="text-sm font-medium text-white">{t(`premium.${perkKey}Label`)}</div>
        <div className="text-xs text-zinc-400">{t(`premium.${perkKey}Detail`)}</div>
      </div>
    </li>
  );
}

export default function Premium() {
  const { t } = useTranslation();
  const { walletAddress, user, openLoginModal } = useAuth() as any;
  const [checkoutPriceId, setCheckoutPriceId] = useState<string | null>(null);

  const startCheckout = (priceId: string) => {
    if (!walletAddress) {
      toast.error(t('premium.connectWalletToSubscribe'));
      try { openLoginModal?.(); } catch {}
      return;
    }
    setCheckoutPriceId(priceId);
  };

  return (
    <div data-glass-page className="min-h-screen bg-[#0a0a0a] text-white">
      <SEOHead
        title={t('premium.seoTitle')}
        description={t('premium.seoDescription')}
        url="https://dehub.io/premium"
      />

      <PaymentTestModeBanner />

      {/* Ambient backdrop */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[1200px] h-[1200px] rounded-full bg-white/[0.04] blur-3xl" />
        <div className="absolute bottom-[-30%] right-[-10%] w-[800px] h-[800px] rounded-full bg-white/[0.03] blur-3xl" />
      </div>

      {/* Top nav */}
      <header className="sticky top-0 z-20 backdrop-blur-xl bg-black/40 border-b border-white/5">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <Link to="/" className="text-sm font-semibold tracking-tight text-white">DeHub</Link>
          <Link
            to="/app"
            className="text-xs text-zinc-300 hover:text-white transition-colors"
          >
            {t('premium.openApp')}
          </Link>
        </div>
      </header>


      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-12 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-zinc-300 mb-6">
          <Sparkles className="w-3.5 h-3.5" /> {t('premium.introducing')}
        </div>
        <h1 className="text-4xl sm:text-6xl font-bold tracking-tight leading-[1.05]">
          {t('premium.heroLineOne')}<br />
          <span className="bg-gradient-to-r from-white via-white/80 to-white/40 bg-clip-text text-transparent">
            {t('premium.heroLineTwo')}
          </span>
        </h1>
        <p className="mt-5 text-zinc-400 max-w-xl mx-auto text-base sm:text-lg">
          {t('premium.heroBlurb')}
        </p>
        <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => startCheckout('dehub_extra_monthly')}
            className="px-6 py-3 rounded-2xl bg-white text-black text-sm font-semibold hover:bg-white/90 transition-colors"
          >
            {t('premium.getDehubExtra')}
          </button>
          <a
            href="#tiers"
            className="px-6 py-3 rounded-2xl bg-white/5 border border-white/10 text-sm font-semibold hover:bg-white/10 transition-colors"
          >
            {t('premium.comparePlans')}
          </a>
        </div>

        <p className="mt-5 text-xs text-zinc-500">
          {t('premium.alreadyTopStaker')}{' '}
          <Link to="/app/stake" className="underline underline-offset-2 hover:text-white">{t('premium.itsOnUs')}</Link>
        </p>
      </section>

      {/* Tiers */}
      <section id="tiers" className="max-w-6xl mx-auto px-4 sm:px-6 py-12 grid md:grid-cols-3 gap-5">
        {/* Extra */}
        <GlassCard>
          <div className="flex items-center gap-2 mb-2">
            <Crown className="w-4 h-4 text-white" />
            <h2 className="text-lg font-semibold">DeHub Extra</h2>
          </div>
          <p className="text-sm text-zinc-400">{t('premium.extraTagline')}</p>
          <div className="mt-5 flex items-baseline gap-1">
            <span className="text-4xl font-bold">$4.99</span>
            <span className="text-zinc-400 text-sm">{t('premium.perMonth')}</span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">{t('premium.freeForTop7')}</p>
          <ul className="mt-6 space-y-3">
            {EXTRA_PERKS.map((p) => <PerkRow key={p.key} icon={p.icon} perkKey={p.key} />)}
          </ul>
          <button
            type="button"
            onClick={() => startCheckout('dehub_extra_monthly')}
            className="mt-7 w-full text-center px-5 py-3 rounded-2xl bg-white/10 border border-white/15 text-sm font-semibold hover:bg-white/15 transition-colors"
          >
            {t('premium.getExtra')}
          </button>
        </GlassCard>


        {/* Family */}
        <GlassCard highlight>
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-white" />
            <h2 className="text-lg font-semibold">DeHub Family</h2>
          </div>
          <p className="text-sm text-zinc-400">{t('premium.familyTagline')}</p>
          <div className="mt-5 flex items-baseline gap-1">
            <span className="text-4xl font-bold">$11.99</span>
            <span className="text-zinc-400 text-sm">{t('premium.perMonth')}</span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">{t('premium.freeForTop4')}</p>

          <div className="mt-6 rounded-xl bg-white/5 border border-white/10 p-3 text-xs text-zinc-300">
            {t('premium.familyIncludes')}
          </div>

          <ul className="mt-5 space-y-3">
            {FAMILY_PERKS.map((p) => <PerkRow key={p.key} icon={p.icon} perkKey={p.key} />)}
          </ul>
          <button
            type="button"
            onClick={() => startCheckout('dehub_family_monthly')}
            className="mt-7 w-full text-center px-5 py-3 rounded-2xl bg-white text-black text-sm font-semibold hover:bg-white/90 transition-colors"
          >
            {t('premium.getFamily')}
          </button>
        </GlassCard>


        {/* Extra Large */}
        <GlassCard>
          <div className="flex items-center gap-2 mb-2">
            <Rocket className="w-4 h-4 text-white" />
            <h2 className="text-lg font-semibold">DeHub Extra Large</h2>
          </div>
          <p className="text-sm text-zinc-400">{t('premium.xlTagline')}</p>
          <div className="mt-5 flex items-baseline gap-1">
            <span className="text-4xl font-bold">$50.00</span>
            <span className="text-zinc-400 text-sm">{t('premium.perMonth')}</span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">{t('premium.freeForTop2')}</p>

          <div className="mt-4 rounded-xl bg-white/10 border border-white/25 p-3 text-xs text-white">
            <div className="flex items-center gap-1.5 font-semibold uppercase tracking-wide text-[10px] text-white/80 mb-1">
              <Sparkles className="w-3 h-3" /> {t('premium.firstFiftyOnly')}
            </div>
            {t('premium.cashback')}
          </div>


          <div className="mt-3 rounded-xl bg-white/5 border border-white/10 p-3 text-xs text-zinc-300">
            {t('premium.xlIncludes')}
          </div>


          <ul className="mt-5 space-y-3">
            {XL_PERKS.map((p) => <PerkRow key={p.key} icon={p.icon} perkKey={p.key} />)}
          </ul>
          <button
            type="button"
            onClick={() => startCheckout('dehub_xl_monthly')}
            className="mt-7 w-full text-center px-5 py-3 rounded-2xl bg-white/10 border border-white/15 text-sm font-semibold hover:bg-white/15 transition-colors"
          >
            {t('premium.getExtraLarge')}
          </button>

        </GlassCard>
      </section>


      {/* Deep-dive perks */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-16 space-y-12">
        {DEEP_DIVES.map((b, i) => (
          <div
            key={b.key}
            className={[
              'grid md:grid-cols-[80px_1fr] gap-5 items-start',
              i % 2 === 1 ? 'md:[direction:rtl]' : '',
            ].join(' ')}
          >
            <div className="md:[direction:ltr] w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
              <b.icon className="w-7 h-7 text-white" />
            </div>
            <div className="md:[direction:ltr]">
              <h3 className="text-2xl font-semibold tracking-tight">{t(stem('dive', b.key, 'Title'))}</h3>
              <p className="mt-2 text-zinc-400 leading-relaxed max-w-xl">{t(stem('dive', b.key, 'Body'))}</p>
            </div>
          </div>
        ))}
      </section>

      {/* Staker reward */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        <div className="rounded-2xl bg-black/60 backdrop-blur-[24px] border border-white/10 p-6 sm:p-10 text-center">
          <div className="inline-flex items-center gap-2 text-xs text-zinc-400 mb-3">
            <Crown className="w-3.5 h-3.5" /> {t('premium.stakerThankYou')}
          </div>
          <h3 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            {t('premium.stakeGetPremium')}
          </h3>
          <p className="mt-3 text-zinc-400 max-w-lg mx-auto text-sm sm:text-base">
            {t('premium.stakeBlurb')}
          </p>
          <Link
            to="/app/stake"
            className="inline-block mt-6 px-5 py-3 rounded-2xl bg-white/10 border border-white/15 text-sm font-semibold hover:bg-white/15 transition-colors"
          >
            {t('premium.viewStakingTiers')}
          </Link>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
        <h3 className="text-2xl font-semibold tracking-tight text-center mb-8">{t('premium.questions')}</h3>
        <Accordion type="single" collapsible className="space-y-2">
          {FAQ_KEYS.map((k, i) => (
            <AccordionItem
              key={k}
              value={`faq-${i}`}
              className="rounded-xl bg-white/[0.03] border border-white/10 px-4"
            >
              <AccordionTrigger className="text-left text-sm font-medium hover:no-underline">
                {t(stem('faq', k, 'Q'))}
              </AccordionTrigger>
              <AccordionContent className="text-sm text-zinc-400 leading-relaxed">
                {t(stem('faq', k, 'A'))}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      {/* Footer CTA */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-16">
        <div className="rounded-2xl bg-gradient-to-b from-white/[0.06] to-white/[0.02] border border-white/10 p-8 sm:p-12 text-center">
          <h3 className="text-3xl sm:text-4xl font-semibold tracking-tight">
            {t('premium.readyWhenYouAre')}
          </h3>
          <p className="mt-3 text-zinc-400 text-sm sm:text-base">
            {t('premium.readyBlurb')}
          </p>
          <div className="mt-7 flex items-center justify-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => startCheckout('dehub_extra_monthly')}
              className="px-6 py-3 rounded-2xl bg-white text-black text-sm font-semibold hover:bg-white/90 transition-colors"
            >
              {t('premium.tryDehubExtra')}
            </button>
            <a
              href="#tiers"
              className="px-6 py-3 rounded-2xl bg-white/5 border border-white/10 text-sm font-semibold hover:bg-white/10 transition-colors"
            >
              {t('premium.comparePlans')}
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/5 py-8 text-center text-xs text-zinc-500">
        <p>{t('premium.footerNote')}</p>
        {/* /premium (Extra membership) vs /pricing (Creator Studio AI plans) are
            different products — disambiguate for both users and search. */}
        <p className="mt-2">
          {t('premium.lookingForCreatorPlans')}{' '}
          <Link to="/pricing" className="text-zinc-300 underline underline-offset-4 hover:text-white">
            {t('premium.seeCreatorPricing')}
          </Link>
        </p>
      </footer>

      <PremiumCheckoutModal
        open={!!checkoutPriceId}
        onOpenChange={(o) => { if (!o) setCheckoutPriceId(null); }}
        priceId={checkoutPriceId ?? 'dehub_extra_monthly'}
        walletAddress={walletAddress ?? ''}
        customerEmail={user?.email}
      />
    </div>
  );
}
