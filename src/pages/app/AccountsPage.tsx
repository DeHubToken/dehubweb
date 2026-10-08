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

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SEOHead } from '@/components/SEOHead';
import { PageBody, PageIsland, PageTabs } from '@/components/app/page-kit/PageKit';
import { BrowseTab } from '@/components/app/accounts/BrowseTab';
import { SellTab } from '@/components/app/accounts/SellTab';

const JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'DeHub Account Marketplace',
  description:
    'Buy and sell established DeHub accounts with tokens. Browse accounts by followers, uploads and age, or list your own — payment goes wallet-to-wallet.',
  url: 'https://dehub.io/accounts',
};

export default function AccountsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'browse' | 'sell'>('browse');

  return (
    <div className="min-h-screen">
      <SEOHead
        title={t('accounts.seoTitle')}
        description={t('accounts.seoDescription')}
        image="https://dehub.io/og/accounts.jpg"
        url="https://dehub.io/accounts"
        jsonLd={JSON_LD}
      />

      <PageIsland
        icon="accounts"
        title={t('accounts.title')}
        subtitle={t('accounts.subtitle')}
        tabs={
          <PageTabs
            value={tab}
            onChange={setTab}
            tabs={[
              { id: 'browse', label: t('accounts.tabBrowse'), icon: 'search' },
              { id: 'sell', label: t('accounts.tabSell'), icon: 'accounts' },
            ]}
          />
        }
      />

      <PageBody>
        {/* Browse fills the column; Sell is a form, and a text input stretched
            across a wide desktop column is unreadable, so it keeps a measure. */}
        {tab === 'browse' ? <BrowseTab /> : (
          <div className="max-w-2xl">
            <SellTab />
          </div>
        )}
      </PageBody>
    </div>
  );
}
