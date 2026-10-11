import { useTranslation as _useCopy } from 'react-i18next';
import { SEOHead } from '@/components/SEOHead';
import { PricingSection } from '@/components/pricing/PricingSection';
import { Link } from 'react-router-dom';
import dehubLogo from '@/assets/dehub-logo-white.png';
import { getAiPlanOffer, type AiPlanTier } from '@/lib/ai-plan-offers';

const monthlyTokens = (tier: AiPlanTier, billing: 'annual' | 'monthly') =>
  getAiPlanOffer(tier, billing).monthlyAllowanceDhb.toLocaleString('en-US');

export default function PricingPage() {
  const { t: _copy } = _useCopy();
  return (
    <>
      <SEOHead
        title={_copy("copy.5d627221715e", { defaultValue: "Pricing — DeHub Creator Studio" })}
        description={_copy("copy.cb8e92496287", { defaultValue: "DeHub Creator Studio pricing in USD. Creator, Ultra, Team and Scale plans with monthly tokens for AI image, video, music and poster generation." })}
        url="https://dehub.io/pricing"
        jsonLd={{
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'Product',
              name: 'DeHub Ultra',
              description: `For creators building AI projects — ${monthlyTokens('ultra', 'annual')} tokens/mo with annual billing, or ${monthlyTokens('ultra', 'monthly')} tokens/mo with monthly billing. Access to all models including Seedance 2.0 and Nano Banana Pro.`,
              brand: { '@type': 'Brand', name: 'DeHub' },
              offers: {
                '@type': 'Offer',
                price: String(getAiPlanOffer('ultra', 'annual').displayPriceUsd),
                priceCurrency: 'USD',
                url: 'https://dehub.io/pricing',
                availability: 'https://schema.org/InStock',
                priceSpecification: {
                  '@type': 'UnitPriceSpecification',
                  price: String(getAiPlanOffer('ultra', 'annual').displayPriceUsd),
                  priceCurrency: 'USD',
                  unitCode: 'MON',
                  referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: 'MON' },
                },
              },
            },
            {
              '@type': 'Product',
              name: 'DeHub Team',
              description: `For agencies and small teams — ${monthlyTokens('team', 'annual')} tokens per seat/mo with annual billing, or ${monthlyTokens('team', 'monthly')} with monthly billing. 2–9 seats, shared workspace and priority support.`,
              brand: { '@type': 'Brand', name: 'DeHub' },
              offers: {
                '@type': 'Offer',
                price: String(getAiPlanOffer('team', 'annual').displayPriceUsd),
                priceCurrency: 'USD',
                url: 'https://dehub.io/pricing',
                availability: 'https://schema.org/InStock',
                priceSpecification: {
                  '@type': 'UnitPriceSpecification',
                  price: String(getAiPlanOffer('team', 'annual').displayPriceUsd),
                  priceCurrency: 'USD',
                  unitCode: 'MON',
                  referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: 'MON' },
                },
              },
            },
            {
              '@type': 'Product',
              name: 'DeHub Scale',
              description: `Designed for growing creative teams — ${monthlyTokens('scale', 'annual')} tokens per seat/mo with annual billing, or ${monthlyTokens('scale', 'monthly')} with monthly billing. 5–15 seats, SSO, priority queue and advanced admin controls.`,
              brand: { '@type': 'Brand', name: 'DeHub' },
              offers: {
                '@type': 'Offer',
                price: String(getAiPlanOffer('scale', 'annual').displayPriceUsd),
                priceCurrency: 'USD',
                url: 'https://dehub.io/pricing',
                availability: 'https://schema.org/InStock',
                priceSpecification: {
                  '@type': 'UnitPriceSpecification',
                  price: String(getAiPlanOffer('scale', 'annual').displayPriceUsd),
                  priceCurrency: 'USD',
                  unitCode: 'MON',
                  referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: 'MON' },
                },
              },
            },
            {
              '@type': 'Product',
              name: 'DeHub Creator',
              description: `For getting started with AI creation — ${monthlyTokens('creator', 'annual')} tokens/mo with annual billing, or ${monthlyTokens('creator', 'monthly')} tokens/mo with monthly billing. Access to all models and features.`,
              brand: { '@type': 'Brand', name: 'DeHub' },
              offers: {
                '@type': 'Offer',
                price: String(getAiPlanOffer('creator', 'annual').displayPriceUsd),
                priceCurrency: 'USD',
                url: 'https://dehub.io/pricing',
                availability: 'https://schema.org/InStock',
                priceSpecification: {
                  '@type': 'UnitPriceSpecification',
                  price: String(getAiPlanOffer('creator', 'annual').displayPriceUsd),
                  priceCurrency: 'USD',
                  unitCode: 'MON',
                  referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: 'MON' },
                },
              },
            },
          ],
        }}
      />
      <div data-glass-page className="min-h-[100dvh] bg-black text-white">
        <header className="flex items-center justify-between px-4 py-4 sm:px-8">
          <Link to="/" className="flex items-center gap-2">
            <img src={dehubLogo} alt={_copy("copy.3bb419b67da4", { defaultValue: "DeHub logo white" })} className="h-6 w-auto" />
          </Link>
          <h1 className="sr-only">{_copy("copy.aa0ccc121485", { defaultValue: "DeHub Pricing — Choose Your Creator Plan" })}</h1>
          <Link
            to="/creator"
            className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-white hover:bg-white/10"
          >{_copy("copy.3132d47e432c", { defaultValue: "Open Creator" })}</Link>
        </header>
        <main>
          <PricingSection />
          {/* /pricing (Creator Studio AI plans) and /premium (DeHub Extra social
              membership) are different products — disambiguate for both users
              and search. */}
          <p className="mx-auto max-w-3xl px-4 pb-12 text-center text-sm text-white/60">{_copy("copy.0274668420cd", { defaultValue: "Looking for the DeHub Extra social membership instead?" })}{' '}
            <Link to="/premium" className="text-white underline underline-offset-4 hover:text-white/80">{_copy("copy.91adb89491e6", { defaultValue: "See Premium plans" })}</Link>
          </p>
        </main>
      </div>
    </>
  );
}
