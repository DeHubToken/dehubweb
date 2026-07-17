/**
 * Stores Page
 * ============
 * Peer-to-peer marketplace: Browse listings and manage your store.
 */

import { useState, useRef } from 'react';
import { Store, ShoppingBag, Plus, PackagePlus } from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';
import { useFeedSwallowClip } from '@/hooks/use-feed-swallow-clip';
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

  // Swallow the store content at the sticky header bento's top edge under the
  // glass themes, exactly like the home feed cuts at its nav pill.
  const contentRef = useRef<HTMLDivElement>(null);
  useFeedSwallowClip(contentRef, '[data-feed-nav-outer] > [data-page-bento]');

  return (
    <div className="min-h-screen">
      <SEOHead title="Stores | DeHub" description="Browse and sell items on the DeHub peer-to-peer marketplace. Trade digital goods, merch, art, and services using DHB." />
      {/* Sticky nav pill */}
      <div data-feed-nav-outer className="sticky top-11 lg:top-0 z-50 bg-black px-2 pt-1 pb-0 sm:px-3 sm:pt-1 sm:pb-0 lg:pt-2 max-w-4xl mx-auto">
        <div data-page-bento className="bg-zinc-900 rounded-2xl px-4 py-3 space-y-3">
          <div className="flex items-center gap-3">
            <Store className="w-6 h-6 text-white" />
            <h1 className="text-xl font-bold text-white">Stores</h1>
          </div>

          {/* Tab buttons + create menu */}
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
              label={storeLabel}
              icon={<Store className="w-4 h-4" />}
              onClick={() => setTab('my-store')}
              width="auto"
              height="38px"
              active={tab === 'my-store'}
              className={tab === 'my-store' ? undefined : 'opacity-60'}
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
        </div>
      </div>

      {/* Content */}
      <div ref={contentRef} className="w-full max-w-4xl mx-auto px-2 sm:px-3 pt-3 pb-6 space-y-4">
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
    </div>
  );
}
