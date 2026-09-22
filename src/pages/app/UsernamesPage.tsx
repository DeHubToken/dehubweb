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
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEOHead } from '@/components/SEOHead';
import { useFeedSwallowClip } from '@/hooks/use-feed-swallow-clip';
import { LiquidGlassBubble2 } from '@/components/ui/liquid-glass-bubble-2';
import { BrowseTab } from '@/components/app/usernames/BrowseTab';
import { SellTab } from '@/components/app/usernames/SellTab';
import { OffersTab } from '@/components/app/usernames/OffersTab';
import { UsernameVault } from '@/components/app/usernames/UsernameVault';
import { ThemedIcon } from '@/components/app/war/WarHudIcon';

const JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'DeHub Username Marketplace',
  description:
    'Buy and sell DeHub usernames with DHB. Search handles for sale, list your own, and transfer instantly on-chain.',
  url: 'https://dehub.io/usernames',
};

export default function UsernamesPage() {
  const { t } = useTranslation();
  // Offer notifications link straight here, so the tab is readable off the
  // URL. Held in state after that rather than written back on every switch:
  // a tab press is not a navigation worth putting in the back stack.
  const [params] = useSearchParams();
  const [tab, setTab] = useState<'browse' | 'mine' | 'sell' | 'offers'>(() => {
    const asked = params.get('tab');
    if (asked === 'offers' || asked === 'sell' || asked === 'mine') return asked;
    return 'browse';
  });

  // Which of your names the Sell form should open on. The vault hands it over
  // when you press "sell" on a row, and the URL carries it when Settings links
  // in from the other side of the app.
  const [sellingUsername, setSellingUsername] = useState<string | null>(params.get('username'));

  const sellName = (username: string) => {
    setSellingUsername(username);
    setTab('sell');
  };

  // Swallow the content at the sticky header bento's top edge under the glass
  // themes, exactly like the home feed cuts at its nav pill.
  const contentRef = useRef<HTMLDivElement>(null);
  useFeedSwallowClip(contentRef, '[data-feed-nav-outer] > [data-page-bento]');

  return (
    <div className="min-h-screen">
      <SEOHead
        title={t('usernames.seoTitle')}
        description={t('usernames.seoDescription')}
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
            <ThemedIcon icon="usernames" alt="" className="w-10 h-10 shrink-0 object-contain" />
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-white">{t('usernames.title')}</h1>
              <p className="text-[11px] text-zinc-500 truncate">{t('usernames.subtitle')}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <LiquidGlassBubble2
              label={t('usernames.tabBrowse')}
              icon={<ThemedIcon icon="search" alt="" className="w-4 h-4 object-contain" />}
              onClick={() => setTab('browse')}
              width="auto"
              height="38px"
              active={tab === 'browse'}
              className={tab === 'browse' ? undefined : 'opacity-60'}
            />
            {/* What you own. Sits next to Browse rather than inside Sell
                because owning a handle and selling one stopped being the same
                thing the moment an account could hold more than one. */}
            <LiquidGlassBubble2
              label={t('usernames.tabMine')}
              icon={<ThemedIcon icon="usernames" alt="" className="w-4 h-4 object-contain" />}
              onClick={() => setTab('mine')}
              width="auto"
              height="38px"
              active={tab === 'mine'}
              className={tab === 'mine' ? undefined : 'opacity-60'}
            />
            <LiquidGlassBubble2
              label={t('usernames.tabSell')}
              icon={<ThemedIcon icon="usernames" alt="" className="w-4 h-4 object-contain" />}
              onClick={() => setTab('sell')}
              width="auto"
              height="38px"
              active={tab === 'sell'}
              className={tab === 'sell' ? undefined : 'opacity-60'}
            />
            <LiquidGlassBubble2
              label={t('usernames.tabOffers')}
              icon={<ThemedIcon icon="stores" alt="" className="w-4 h-4 object-contain" />}
              onClick={() => setTab('offers')}
              width="auto"
              height="38px"
              active={tab === 'offers'}
              className={tab === 'offers' ? undefined : 'opacity-60'}
            />
          </div>
        </div>
      </div>

      <div ref={contentRef} className="w-full px-2 sm:px-3 pt-3 pb-6 space-y-4">
        {/* Browse fills the column; Sell is a form, and a text input stretched
            across a wide desktop column is unreadable, so it keeps a measure. */}
        {tab === 'browse' ? <BrowseTab /> : tab === 'offers' ? <OffersTab /> : tab === 'mine' ? (
          <div className="max-w-2xl">
            <UsernameVault onSell={sellName} />
          </div>
        ) : (
          <div className="max-w-2xl">
            <SellTab username={sellingUsername} onUsernameChange={setSellingUsername} />
          </div>
        )}
      </div>
    </div>
  );
}
