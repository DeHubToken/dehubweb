/**
 * Stores Page
 * ============
 * Peer-to-peer marketplace: Browse listings and manage your store.
 */

import { useState } from 'react';
import { Store, ShoppingBag } from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';
import { BrowseTab } from '@/components/app/stores/BrowseTab';
import { MyStoreTab } from '@/components/app/stores/MyStoreTab';
import { LiquidGlassBubble2 } from '@/components/ui/liquid-glass-bubble-2';

export default function StoresPage() {
  const [tab, setTab] = useState('browse');

  return (
    <>
      <SEOHead title="Stores | DeHub" description="Browse and sell items on the DeHub peer-to-peer marketplace. Trade digital goods, merch, art, and services using DHB." />
      <div className="w-full max-w-4xl mx-auto px-4 py-4 space-y-4">
        <div className="flex items-center gap-3">
          <Store className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-bold text-foreground">Stores</h1>
        </div>

        {/* Tab buttons */}
        <div className="flex gap-2">
          <LiquidGlassBubble2
            label="Browse"
            icon={<ShoppingBag className="w-4 h-4" />}
            onClick={() => setTab('browse')}
            width="auto"
            height="38px"
            className={tab === 'browse' ? 'ring-1 ring-primary/50' : 'opacity-60'}
          />
          <LiquidGlassBubble2
            label="My Store"
            icon={<Store className="w-4 h-4" />}
            onClick={() => setTab('my-store')}
            width="auto"
            height="38px"
            className={tab === 'my-store' ? 'ring-1 ring-primary/50' : 'opacity-60'}
          />
        </div>

        {tab === 'browse' ? <BrowseTab /> : <MyStoreTab />}
      </div>
    </>
  );
}
