/**
 * Stores Page
 * ============
 * Peer-to-peer marketplace: Browse listings and manage your store.
 */

import { useState } from 'react';
import { Store, ShoppingBag, Plus, PackagePlus } from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';
import { BrowseTab } from '@/components/app/stores/BrowseTab';
import { MyStoreTab } from '@/components/app/stores/MyStoreTab';
import { LiquidGlassBubble2 } from '@/components/ui/liquid-glass-bubble-2';
import { useMyStores } from '@/hooks/use-stores';
import { useAuth } from '@/contexts/AuthContext';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export default function StoresPage() {
  const [tab, setTab] = useState('browse');
  const { isAuthenticated } = useAuth();
  const { data: stores = [] } = useMyStores();
  const [createListingOpen, setCreateListingOpen] = useState(false);
  const [createStoreOpen, setCreateStoreOpen] = useState(false);

  const hasStores = stores.length > 0;
  const storeLabel = stores.length > 1 ? 'My Stores' : 'My Store';

  return (
    <>
      <SEOHead title="Stores | DeHub" description="Browse and sell items on the DeHub peer-to-peer marketplace. Trade digital goods, merch, art, and services using DHB." />
      <div className="w-full max-w-4xl mx-auto px-4 py-4 space-y-4">
        <div className="flex items-center gap-3">
          <Store className="w-6 h-6 text-primary-foreground" />
          <h1 className="text-xl font-bold text-muted">Stores</h1>
        </div>

        {/* Tab buttons + create menu */}
        <div className="flex items-center gap-2">
          <LiquidGlassBubble2
            label="Browse"
            icon={<ShoppingBag className="w-4 h-4" />}
            onClick={() => setTab('browse')}
            width="auto"
            height="38px"
            className={tab === 'browse' ? 'ring-1 ring-primary/50' : 'opacity-60'}
          />
          <LiquidGlassBubble2
            label={storeLabel}
            icon={<Store className="w-4 h-4" />}
            onClick={() => setTab('my-store')}
            width="auto"
            height="38px"
            className={tab === 'my-store' ? 'ring-1 ring-primary/50' : 'opacity-60'}
          />

          {isAuthenticated && (
            <div className="ml-auto">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <div>
                    <LiquidGlassBubble2
                      label=""
                      icon={<Plus className="w-4 h-4" />}
                      onClick={() => {}}
                      width="38px"
                      height="38px"
                    />
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-zinc-900 border-white/10">
                  <DropdownMenuItem onClick={() => { setCreateStoreOpen(true); setTab('my-store'); }}>
                    <Store className="w-4 h-4 mr-2" /> New Store
                  </DropdownMenuItem>
                  {hasStores && (
                    <DropdownMenuItem onClick={() => { setCreateListingOpen(true); setTab('my-store'); }}>
                      <PackagePlus className="w-4 h-4 mr-2" /> New Listing
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>

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
      </div>
    </>
  );
}
