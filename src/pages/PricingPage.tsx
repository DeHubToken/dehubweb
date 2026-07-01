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
      />
      <div className="min-h-[100dvh] bg-black text-white">
        <header className="flex items-center justify-between px-4 py-4 sm:px-8">
          <Link to="/" className="flex items-center gap-2">
            <img src={dehubLogo} alt="DeHub" className="h-6 w-auto" />
          </Link>
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
