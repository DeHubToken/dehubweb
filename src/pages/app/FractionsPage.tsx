/**
 * Fractions Page
 * ==============
 * The fraction marketplace: browse every listing, manage what you hold, and
 * read the tape.
 *
 * A minted post is 1000 ERC-1155 units of one token id, so every minted post
 * on Riftn is already divisible — but until this page the only way to trade
 * them was a panel on `/app/post/:id/info`, which meant you had to know which
 * post you wanted before you could discover it was for sale. This is the front
 * door that was missing.
 *
 * The NFT market lives here too, as the NFTs tab (`?tab=nfts`, sub views in
 * `?view=`). /nfts and /app/nfts redirect to it.
 */

import { Suspense, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ShoppingBag, Activity, Gem, Loader2 } from "lucide-react";
import Wallet from "@/components/ui/cut-icons/wallet";

import { SEOHead } from '@/components/SEOHead';
import { PageBody, PageIsland, PageTabs } from '@/components/app/page-kit/PageKit';
import { BrowseFractionsTab } from '@/components/app/fractions/BrowseFractionsTab';
import { PortfolioTab } from '@/components/app/fractions/PortfolioTab';
import { ActivityTab } from '@/components/app/fractions/ActivityTab';
import { useOpenTrades } from '@/hooks/use-fraction-marketplace';
import { useAuth } from '@/contexts/AuthContext';
import { BrandIcon } from '@/components/app/war/WarHudIcon';
import { lazyWithRetry } from '@/lib/lazy-with-retry';

// The market is the heavier half (Seaport builder, viem); load it on first visit.
const NftMarket = lazyWithRetry(() => import('@/pages/app/NftMarketPage'));

type Tab = 'browse' | 'nfts' | 'portfolio' | 'activity';
const TABS: Tab[] = ['browse', 'nfts', 'portfolio', 'activity'];

const NFT_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'Riftn NFT Market',
  description: 'Buy, sell and make offers on NFTs on BNB Chain, Base and Ethereum. Every trade swaps the NFT and the payment in one step.',
  url: 'https://riftn.com/fractions?tab=nfts',
};

export default function FractionsPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [tab, setTabState] = useState<Tab>(() => {
    const asked = params.get('tab') as Tab | null;
    return asked && TABS.includes(asked) ? asked : 'browse';
  });
  // The island slot the NFT market portals its own tabs and filters into.
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  const setTab = (next: Tab) => {
    setTabState(next);
    const p = new URLSearchParams(window.location.search);
    if (next === 'browse') p.delete('tab');
    else p.set('tab', next);
    // Market-only params do not belong to the other tabs.
    if (next !== 'nfts') ['view', 'chain', 'contract', 'token'].forEach((k) => p.delete(k));
    setParams(p, { replace: true });
  };
  const { walletAddress } = useAuth();
  const { data: openTrades } = useOpenTrades(walletAddress);

  // Anything with a clock on it gets a count on the tab, so a delivery window
  // cannot quietly run out while the user is on a different tab.
  const needsAction =
    (openTrades?.toDeliver.length || 0) + (openTrades?.toPay.length || 0);

  return (
    <div className="min-h-screen">
      {tab === 'nfts' ? (
        <SEOHead
          title={t('nftMarket.seoTitle', { defaultValue: 'NFT Market: buy and sell NFTs on BNB and Base | Riftn' })}
          description={t('nftMarket.seoDescription', {
            defaultValue: 'Buy, sell and make offers on NFTs on BNB Chain and Base. Pay in BNB, ETH or DHB. Every trade swaps the NFT and the payment in one step.',
          })}
          url="https://riftn.com/fractions?tab=nfts"
          image="https://riftn.com/og/nfts.jpg"
          jsonLd={NFT_JSON_LD}
        />
      ) : (
        <SEOHead
          title={t('fractions.seoTitle')}
          description={t('fractions.seoDescription')}
          url="https://riftn.com/app/fractions"
          image="https://riftn.com/og/fractions.jpg"
        />
      )}

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
        subtitle={tab === 'nfts' ? t('fractions.nftsSubtitle', { defaultValue: 'Any NFT, one-step swaps' }) : t('fractions.perUpload')}
        tabs={
          <PageTabs
            value={tab}
            onChange={setTab}
            tabs={[
              { id: 'browse', label: t('fractions.title'), icon: <ShoppingBag className="h-4 w-4" /> },
              { id: 'nfts', label: t('nftMarket.shortTitle', { defaultValue: 'NFTs' }), icon: <Gem className="h-4 w-4" /> },
              {
                id: 'portfolio',
                label: needsAction > 0 ? t('fractions.tabPortfolioCount', { count: needsAction }) : t('fractions.tabPortfolio'),
                icon: <Wallet className="h-4 w-4" />,
              },
              { id: 'activity', label: t('fractions.tabActivity'), icon: <Activity className="h-4 w-4" /> },
            ]}
          />
        }
      >
        {tab === 'nfts' ? <div ref={setSlot} data-nft-island-slot className="space-y-2.5" /> : null}
      </PageIsland>

      <PageBody className="max-w-4xl mx-auto">
        {tab === 'browse' && <BrowseFractionsTab />}
        {tab === 'nfts' && (
          <Suspense fallback={<div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-zinc-500" /></div>}>
            <NftMarket embedded islandSlot={slot} />
          </Suspense>
        )}
        {tab === 'portfolio' && <PortfolioTab />}
        {tab === 'activity' && <ActivityTab />}
      </PageBody>
    </div>
  );
}
