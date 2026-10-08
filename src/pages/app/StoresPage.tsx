/**
 * Stores Page
 * ============
 * Peer-to-peer marketplace: Browse listings and manage your store.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SEOHead } from '@/components/SEOHead';
import { BrowseTab } from '@/components/app/stores/BrowseTab';
import { MyStoreTab } from '@/components/app/stores/MyStoreTab';
import { IslandAction, PageBody, PageIsland, PageTabs } from '@/components/app/page-kit/PageKit';
import { useMyStores } from '@/hooks/use-stores';
import { useAuth } from '@/contexts/AuthContext';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ThemedIcon } from '@/components/app/war/WarHudIcon';

export default function StoresPage() {
  const [tab, setTab] = useState('browse');
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const { data: stores = [] } = useMyStores();
  const [createListingOpen, setCreateListingOpen] = useState(false);
  const [createStoreOpen, setCreateStoreOpen] = useState(false);

  const hasStores = stores.length > 0;
  const storeLabel = stores.length > 1 ? t('stores.myStores') : t('stores.myStore');

  return (
    <div className="min-h-screen">
      <SEOHead
        title="Stores | DeHub"
        description="Browse and sell items on the DeHub peer-to-peer marketplace. Trade digital goods, merch, art, and services using tokens."
        url="https://dehub.io/app/stores"
        image="https://dehub.io/og/stores.jpg"
      />
      <PageIsland
        className="max-w-4xl mx-auto"
        icon="stores"
        title={t('stores.title')}
        actions={
          isAuthenticated ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <div>
                  <IslandAction label={t('stores.newStore')}>
                    <ThemedIcon icon="stores" alt="" className="h-[18px] w-[18px] object-contain" />
                  </IslandAction>
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-zinc-900 border-white/10">
                <DropdownMenuItem onClick={() => { setCreateStoreOpen(true); setTab('my-store'); }}>
                  <ThemedIcon icon="stores" alt="" className="w-5 h-5 mr-2 object-contain" /> {t('stores.newStore')}
                </DropdownMenuItem>
                {hasStores && (
                  <DropdownMenuItem onClick={() => { setCreateListingOpen(true); setTab('my-store'); }}>
                    <ThemedIcon icon="stores" alt="" className="w-5 h-5 mr-2 object-contain" /> {t('stores.newListing')}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : undefined
        }
        tabs={
          <PageTabs
            value={tab}
            onChange={setTab}
            tabs={[
              { id: 'browse', label: t('stores.browse'), icon: 'stores' },
              { id: 'my-store', label: storeLabel, icon: 'profile' },
            ]}
          />
        }
      />

      {/* Content */}
      <PageBody className="max-w-4xl mx-auto">
        {tab === 'browse' ? (
          <BrowseTab />
        ) : (
          <MyStoreTab
            createListingOpen={createListingOpen}
            onCreateListingClose={() => setCreateListingOpen(false)}
            createStoreOpen={createStoreOpen}
            onCreateStoreClose={() => setCreateStoreOpen(false)}
          />
        )}
      </PageBody>
    </div>
  );
}
