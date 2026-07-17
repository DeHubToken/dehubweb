import { SEOHead } from '@/components/SEOHead';
import { PricingSection } from '@/components/pricing/PricingSection';
import { Link } from 'react-router-dom';
import dehubLogo from '@/assets/dehub-logo-white.png';

export default function PricingPage() {
  return (
    <>
      <SEOHead
        title="DeHub Pricing — Plans for every creator workflow"
        description="Choose Ultra, Team or Scale. Credits, seats and access to all DeHub AI models including Seedance 2.0, Nano Banana Pro and Kling 3.0."
        jsonLd={{
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'Product',
              name: 'DeHub Ultra',
              description: 'For creators building AI projects — 3,500 credits/mo, access to all models including Seedance 2.0 and Nano Banana Pro.',
              brand: { '@type': 'Brand', name: 'DeHub' },
              offers: {
                '@type': 'Offer',
                price: '99',
                priceCurrency: 'GBP',
                url: 'https://dehub.io/pricing',
                availability: 'https://schema.org/InStock',
                priceSpecification: {
                  '@type': 'UnitPriceSpecification',
                  price: '99',
                  priceCurrency: 'GBP',
                  unitCode: 'MON',
                  referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: 'MON' },
                },
              },
            },
            {
              '@type': 'Product',
              name: 'DeHub Team',
              description: 'For agencies and small teams — 2,500 shared credits/mo, 2–9 seats, shared workspace and priority support.',
              brand: { '@type': 'Brand', name: 'DeHub' },
              offers: {
                '@type': 'Offer',
                price: '65',
                priceCurrency: 'GBP',
                url: 'https://dehub.io/pricing',
                availability: 'https://schema.org/InStock',
                priceSpecification: {
                  '@type': 'UnitPriceSpecification',
                  price: '65',
                  priceCurrency: 'GBP',
                  unitCode: 'MON',
                  referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: 'MON' },
                },
              },
            },
            {
              '@type': 'Product',
              name: 'DeHub Scale',
              description: 'Designed for growing creative teams — 15,000 credits/mo, 5–15 seats, SSO, priority queue and advanced admin controls.',
              brand: { '@type': 'Brand', name: 'DeHub' },
              offers: {
                '@type': 'Offer',
                price: '150',
                priceCurrency: 'GBP',
                url: 'https://dehub.io/pricing',
                availability: 'https://schema.org/InStock',
                priceSpecification: {
                  '@type': 'UnitPriceSpecification',
                  price: '150',
                  priceCurrency: 'GBP',
                  unitCode: 'MON',
                  referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: 'MON' },
                },
              },
            },
          ],
        }}
      />
      <div className="min-h-[100dvh] bg-black text-white">
        <header className="flex items-center justify-between px-4 py-4 sm:px-8">
          <Link to="/" className="flex items-center gap-2">
            <img src={dehubLogo} alt="DeHub logo white" className="h-6 w-auto" />
          </Link>
          <h1 className="sr-only">DeHub Pricing — Choose Your Creator Plan</h1>
          <Link
            to="/creator"
            className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-white hover:bg-white/10"
          >
            Open Creator
          </Link>
        </header>
        <main>
          <PricingSection />
        </main>
      </div>
    </>
  );
}
