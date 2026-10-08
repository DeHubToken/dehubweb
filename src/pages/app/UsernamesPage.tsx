/**
 * Usernames Page
 * ==============
 * The handle marketplace: browse what is for sale, or put yours up.
 *
 * Built on the page kit like the other marketplaces, because it is the same kind of surface and a
 * marketplace that looks like a different product for no reason is just noise.
 */

import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEOHead } from '@/components/SEOHead';
import { PageBody, PageIsland, PageTabs } from '@/components/app/page-kit/PageKit';
import { BrowseTab } from '@/components/app/usernames/BrowseTab';
import { SellTab } from '@/components/app/usernames/SellTab';
import { OffersTab } from '@/components/app/usernames/OffersTab';
import { UsernameVault } from '@/components/app/usernames/UsernameVault';

const JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'DeHub Username Marketplace',
  description:
    'Buy and sell DeHub usernames with tokens. Search handles for sale, list your own, and transfer instantly on-chain.',
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

  return (
    <div className="min-h-screen">
      <SEOHead
        title={t('usernames.seoTitle')}
        description={t('usernames.seoDescription')}
        image="https://dehub.io/og/usernames.jpg"
        url="https://dehub.io/usernames"
        jsonLd={JSON_LD}
      />

      <PageIsland
        icon="usernames"
        title={t('usernames.title')}
        subtitle={t('usernames.subtitle')}
        tabs={
          <PageTabs
            value={tab}
            onChange={setTab}
            tabs={[
              { id: 'browse', label: t('usernames.tabBrowse'), icon: 'search' },
              // What you own. Next to Browse rather than inside Sell because
              // an account can hold more than one handle.
              { id: 'mine', label: t('usernames.tabMine'), icon: 'usernames' },
              { id: 'sell', label: t('usernames.tabSell'), icon: 'usernames' },
              { id: 'offers', label: t('usernames.tabOffers'), icon: 'stores' },
            ]}
          />
        }
      />

      <PageBody>
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
      </PageBody>
    </div>
  );
}
