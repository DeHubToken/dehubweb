/**
 * Usernames Page
 * ==============
 * The handle marketplace: browse what is for sale, or put yours up.
 *
 * Shares the shell the Stores page uses — the sticky bento, the swallow clip,
 * the two glass tabs — because it is the same kind of surface and a
 * marketplace that looks like a different product for no reason is just noise.
 */

import { useRef, useState } from 'react';
import { AtSign, Search, Tag } from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';
import { useFeedSwallowClip } from '@/hooks/use-feed-swallow-clip';
import { LiquidGlassBubble2 } from '@/components/ui/liquid-glass-bubble-2';
import { BrowseTab } from '@/components/app/usernames/BrowseTab';
import { SellTab } from '@/components/app/usernames/SellTab';

const JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'DeHub Username Marketplace',
  description:
    'Buy and sell DeHub usernames with DHB. Search handles for sale, list your own, and transfer instantly on-chain.',
  url: 'https://dehub.io/usernames',
};

export default function UsernamesPage() {
  const [tab, setTab] = useState<'browse' | 'sell'>('browse');

  // Swallow the content at the sticky header bento's top edge under the glass
  // themes, exactly like the home feed cuts at its nav pill.
  const contentRef = useRef<HTMLDivElement>(null);
  useFeedSwallowClip(contentRef, '[data-feed-nav-outer] > [data-page-bento]');

  return (
    <div className="min-h-screen">
      <SEOHead
        title="Username Marketplace | DeHub"
        description="Buy and sell DeHub usernames with DHB. Search short, numeric and original handles for sale, or list your own — the transfer happens on-chain the moment payment clears."
        image="https://dehub.io/og/usernames.jpg"
        url="https://dehub.io/usernames"
        jsonLd={JSON_LD}
      />

      {/* Sticky nav pill.
          No max-width here or on the content below: the listings are
          full-width rows, so the page fills the middle column the way Explore
          and Music do. max-w-4xl left ~150px of dead space either side at
          desktop widths, which is what made the listings read as a small blob
          in the middle of an empty page. */}
      <div
        data-feed-nav-outer
        className="sticky top-11 lg:top-0 z-50 bg-black px-2 pt-1 pb-0 sm:px-3 sm:pt-1 sm:pb-0 lg:pt-2"
      >
        <div data-page-bento className="bg-zinc-900 rounded-2xl px-4 py-3 space-y-3">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 shrink-0 rounded-xl bg-white/10 flex items-center justify-center">
              <AtSign className="w-5 h-5 text-white" />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-white">Usernames</h1>
              <p className="text-[11px] text-zinc-500 truncate">Handles for sale, priced in DHB</p>
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
