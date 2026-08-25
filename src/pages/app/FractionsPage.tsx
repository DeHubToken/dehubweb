/**
 * Fractions Page
 * ==============
 * The fraction marketplace: browse every listing, manage what you hold, and
 * read the tape.
 *
 * Every upload is minted as 1000 ERC-1155 units of one token id, so every post
 * on DeHub is already divisible — but until this page the only way to trade
 * them was a panel on `/app/post/:id/info`, which meant you had to know which
 * post you wanted before you could discover it was for sale. This is the front
 * door that was missing.
 */

import { useRef, useState } from 'react';
import { ShoppingBag, Wallet, Activity } from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';
import { useFeedSwallowClip } from '@/hooks/use-feed-swallow-clip';
import { LiquidGlassBubble2 } from '@/components/ui/liquid-glass-bubble-2';
import { BrowseFractionsTab } from '@/components/app/fractions/BrowseFractionsTab';
import { PortfolioTab } from '@/components/app/fractions/PortfolioTab';
import { ActivityTab } from '@/components/app/fractions/ActivityTab';
import { useOpenTrades } from '@/hooks/use-fraction-marketplace';
import { useAuth } from '@/contexts/AuthContext';
import { BrandIcon } from '@/components/app/war/WarHudIcon';

type Tab = 'browse' | 'portfolio' | 'activity';

export default function FractionsPage() {
  const [tab, setTab] = useState<Tab>('browse');
  const { walletAddress } = useAuth();
  const { data: openTrades } = useOpenTrades(walletAddress);

  // Anything with a clock on it gets a count on the tab, so a delivery window
  // cannot quietly run out while the user is on a different tab.
  const needsAction =
    (openTrades?.toDeliver.length || 0) + (openTrades?.toPay.length || 0);

  // Swallow the content at the sticky header bento's top edge under the glass
  // themes, exactly like the home feed cuts at its nav pill.
  const contentRef = useRef<HTMLDivElement>(null);
  useFeedSwallowClip(contentRef, '[data-feed-nav-outer] > [data-page-bento]');

  return (
    <div className="min-h-screen">
      <SEOHead
        title="Fractions | DeHub"
        description="Buy and sell fractions of DeHub posts. Every upload is 1000 on-chain fractions — own a slice of a video, track, or image and trade it in DHB."
        url="https://dehub.io/app/fractions"
      />

      {/* Sticky nav pill */}
      <div
        data-feed-nav-outer
        className="sticky top-11 lg:top-0 z-50 bg-black px-2 pt-1 pb-0 sm:px-3 sm:pt-1 sm:pb-0 lg:pt-2 max-w-4xl mx-auto"
      >
        <div data-page-bento className="bg-zinc-900 rounded-2xl px-4 py-3 space-y-3">
          <div className="flex items-center gap-3">
            <BrandIcon
              src="/theme-icons/system/fractions.webp"
              alt=""
              className="w-10 h-10 shrink-0 object-contain"
            />
            <h1 className="text-xl font-bold text-white">Fractions</h1>
            <span className="text-xs text-white/40">1000 per upload</span>
          </div>

          <div className="flex items-center gap-2">
            <LiquidGlassBubble2
              label="Browse"
              icon={<ShoppingBag className="w-4 h-4" />}
              onClick={() => setTab('browse')}
              width="auto"
              height="38px"
              active={tab === 'browse'}
              className={tab === 'browse' ? undefined : 'opacity-60'}
            />
            <LiquidGlassBubble2
              label={needsAction > 0 ? `Portfolio (${needsAction})` : 'Portfolio'}
              icon={<Wallet className="w-4 h-4" />}
              onClick={() => setTab('portfolio')}
              width="auto"
              height="38px"
              active={tab === 'portfolio'}
              className={tab === 'portfolio' ? undefined : 'opacity-60'}
            />
            <LiquidGlassBubble2
              label="Activity"
              icon={<Activity className="w-4 h-4" />}
              onClick={() => setTab('activity')}
              width="auto"
              height="38px"
              active={tab === 'activity'}
              className={tab === 'activity' ? undefined : 'opacity-60'}
            />
          </div>
        </div>
      </div>

      <div ref={contentRef} className="max-w-4xl mx-auto px-2 sm:px-3 pt-3 pb-24">
        {tab === 'browse' && <BrowseFractionsTab />}
        {tab === 'portfolio' && <PortfolioTab />}
        {tab === 'activity' && <ActivityTab />}
      </div>
    </div>
  );
}
