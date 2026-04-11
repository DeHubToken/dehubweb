/**
 * Stores Page
 * ============
 * Peer-to-peer marketplace: Browse listings and manage your store.
 */

import { useState } from 'react';
import { Store, ShoppingBag } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { SEOHead } from '@/components/SEOHead';
import { BrowseTab } from '@/components/app/stores/BrowseTab';
import { MyStoreTab } from '@/components/app/stores/MyStoreTab';

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

        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="bg-white/5 border border-white/10">
            <TabsTrigger value="browse" className="flex items-center gap-1.5">
              <ShoppingBag className="w-3.5 h-3.5" />
              Browse
            </TabsTrigger>
            <TabsTrigger value="my-store" className="flex items-center gap-1.5">
              <Store className="w-3.5 h-3.5" />
              My Store
            </TabsTrigger>
          </TabsList>

          <TabsContent value="browse">
            <BrowseTab />
          </TabsContent>

          <TabsContent value="my-store">
            <MyStoreTab />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
