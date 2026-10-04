/**
 * Fractions Page
 * ==============
 * The fraction marketplace: browse every listing, manage what you hold, and
 * read the tape.
 *
 * A minted post is 1000 ERC-1155 units of one token id, so every minted post
 * on DeHub is already divisible — but until this page the only way to trade
 * them was a panel on `/app/post/:id/info`, which meant you had to know which
 * post you wanted before you could discover it was for sale. This is the front
 * door that was missing.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShoppingBag, Wallet, Activity } from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';
import { PageBody, PageIsland, PageTabs } from '@/components/app/page-kit/PageKit';
import { BrowseFractionsTab } from '@/components/app/fractions/BrowseFractionsTab';
import { PortfolioTab } from '@/components/app/fractions/PortfolioTab';
import { ActivityTab } from '@/components/app/fractions/ActivityTab';
import { useOpenTrades } from '@/hooks/use-fraction-marketplace';
import { useAuth } from '@/contexts/AuthContext';
import { BrandIcon } from '@/components/app/war/WarHudIcon';

type Tab = 'browse' | 'portfolio' | 'activity';

export default function FractionsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('browse');
  const { walletAddress } = useAuth();
  const { data: openTrades } = useOpenTrades(walletAddress);

  // Anything with a clock on it gets a count on the tab, so a delivery window
  // cannot quietly run out while the user is on a different tab.
  const needsAction =
    (openTrades?.toDeliver.length || 0) + (openTrades?.toPay.length || 0);

  return (
    <div className="min-h-screen">
      <SEOHead
        title={t('fractions.seoTitle')}
        description={t('fractions.seoDescription')}
        url="https://dehub.io/app/fractions"
        image="https://dehub.io/og/fractions.jpg"
      />

      <PageIsland
        className="max-w-4xl mx-auto"
        icon={
          <BrandIcon
            src="/theme-icons/system/fractions.webp"
            alt=""
            className="h-8 w-8 shrink-0 object-contain"
          />
        }
        title={t('fractions.title')}
        subtitle={t('fractions.perUpload')}
        tabs={
          <PageTabs
            value={tab}
            onChange={setTab}
            tabs={[
              { id: 'browse', label: t('fractions.tabBrowse'), icon: <ShoppingBag className="h-4 w-4" /> },
              {
                id: 'portfolio',
                label: needsAction > 0 ? t('fractions.tabPortfolioCount', { count: needsAction }) : t('fractions.tabPortfolio'),
                icon: <Wallet className="h-4 w-4" />,
              },
              { id: 'activity', label: t('fractions.tabActivity'), icon: <Activity className="h-4 w-4" /> },
            ]}
          />
        }
      />

      <PageBody className="max-w-4xl mx-auto">
        {tab === 'browse' && <BrowseFractionsTab />}
        {tab === 'portfolio' && <PortfolioTab />}
        {tab === 'activity' && <ActivityTab />}
      </PageBody>
    </div>
  );
}
