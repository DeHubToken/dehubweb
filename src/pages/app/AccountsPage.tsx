/**
 * Accounts Page
 * =============
 * The account marketplace: browse established accounts for sale, or put
 * yours up.
 *
 * Shares the shell the Usernames page uses — the sticky bento, the swallow
 * clip, the two glass tabs — because it is the same kind of surface and a
 * marketplace that looks like a different product for no reason is just noise.
 */

import { useRef, useState } from 'react';
import { Search, Tag, Users } from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';
import { useFeedSwallowClip } from '@/hooks/use-feed-swallow-clip';
import { LiquidGlassBubble2 } from '@/components/ui/liquid-glass-bubble-2';
import { BrowseTab } from '@/components/app/accounts/BrowseTab';
import { SellTab } from '@/components/app/accounts/SellTab';

const JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'DeHub Account Marketplace',
  description:
    'Buy and sell established DeHub accounts with DHB. Browse accounts by followers, uploads and age, or list your own — payment goes wallet-to-wallet.',
  url: 'https://dehub.io/accounts',
};

export default function AccountsPage() {
  const [tab, setTab] = useState<'browse' | 'sell'>('browse');

  // Swallow the content at the sticky header bento's top edge under the glass
  // themes, exactly like the home feed cuts at its nav pill.
  const contentRef = useRef<HTMLDivElement>(null);
  useFeedSwallowClip(contentRef, '[data-feed-nav-outer] > [data-page-bento]');

  return (
    <div className="min-h-screen">
      <SEOHead
        title="Account Marketplace — DeHub"
        description="Buy and sell established DeHub accounts for DHB. Browse accounts by followers, uploads and age — the handle, posts, followers and badge entitlements all transfer, and payment goes straight to the seller."
        image="https://dehub.io/og/dehub-social-share.png"
        url="https://dehub.io/accounts"
        jsonLd={JSON_LD}
      />

      {/* Sticky nav pill. Full width like Usernames: the listings are
          full-width rows, so the page fills the middle column. */}
      <div
        data-feed-nav-outer
        className="sticky top-11 lg:top-0 z-50 bg-black px-2 pt-1 pb-0 sm:px-3 sm:pt-1 sm:pb-0 lg:pt-2"
      >
        <div data-page-bento className="bg-zinc-900 rounded-2xl px-4 py-3 space-y-3">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 shrink-0 rounded-xl bg-white/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-white" />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-white">Accounts</h1>
              <p className="text-[11px] text-zinc-500 truncate">Whole accounts for sale, priced in DHB</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <LiquidGlassBubble2
              label="Browse"
              icon={<Search className="w-4 h-4" />}
              onClick={() => setTab('browse')}
              width="auto"
              height="38px"
              active={tab === 'browse'}
              className={tab === 'browse' ? undefined : 'opacity-60'}
            />
            <LiquidGlassBubble2
              label="Sell"
              icon={<Tag className="w-4 h-4" />}
              onClick={() => setTab('sell')}
              width="auto"
              height="38px"
              active={tab === 'sell'}
              className={tab === 'sell' ? undefined : 'opacity-60'}
            />
          </div>
        </div>
      </div>

      <div ref={contentRef} className="w-full px-2 sm:px-3 pt-3 pb-6 space-y-4">
        {/* Browse fills the column; Sell is a form, and a text input stretched
            across a wide desktop column is unreadable, so it keeps a measure. */}
        {tab === 'browse' ? <BrowseTab /> : (
          <div className="max-w-2xl">
            <SellTab />
          </div>
        )}
      </div>
    </div>
  );
}
