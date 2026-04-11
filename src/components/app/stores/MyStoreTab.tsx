/**
 * My Store Tab
 * =============
 * Seller dashboard: manage listings and view orders across multiple stores.
 */

import { useState, useCallback } from 'react';
import { Package, ShoppingBag, MoreVertical, Archive, CheckCircle, Pencil, Settings, Store as StoreIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useTokenPrices } from '@/hooks/use-token-prices';
import dehubCoin from '@/assets/dehub-coin.png';
import { useMyStores, useMyListings, useMyOrders, useUpdateListing, useUpdateOrderStatus } from '@/hooks/use-stores';
import { SetupStoreFlow } from './SetupStoreFlow';
import { CreateListingDrawer } from './CreateListingDrawer';
import { EditListingDrawer } from './EditListingDrawer';
import { EditStoreDrawer } from './EditStoreDrawer';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useTabIndicator } from '@/hooks/use-tab-indicator';
import { GlassIndicator } from '@/components/app/feeds/GlassIndicator';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LiquidGlassBubble } from '@/components/ui/liquid-glass-bubble';

type StoreSubTab = 'listings' | 'orders' | 'purchases';

interface MyStoreTabProps {
  createListingOpen?: boolean;
  onCreateListingClose?: () => void;
  createStoreOpen?: boolean;
  onCreateStoreClose?: () => void;
}

export function MyStoreTab({ createListingOpen = false, onCreateListingClose, createStoreOpen = false, onCreateStoreClose }: MyStoreTabProps) {
  const { isAuthenticated, openLoginModal } = useAuth();
  const { data: stores = [], isLoading: loadingStores } = useMyStores();
  const { data: listings = [] } = useMyListings();
  const { data: sellerOrders = [] } = useMyOrders('seller');
  const { data: buyerOrders = [] } = useMyOrders('buyer');
  const updateListing = useUpdateListing();
  const updateOrderStatus = useUpdateOrderStatus();
  const { data: prices } = useTokenPrices();
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [editListing, setEditListing] = useState<any>(null);
  const [editStore, setEditStore] = useState<any>(null);
  const [subTab, setSubTab] = useState<StoreSubTab>('listings');
  const [enableTransition, setEnableTransition] = useState(false);
  const [showSetupFlow, setShowSetupFlow] = useState(false);

  const { layerRef, setRef, rect } = useTabIndicator(subTab);

  const handleTabClick = useCallback((tab: StoreSubTab) => {
    setEnableTransition(true);
    setSubTab(tab);
    setTimeout(() => setEnableTransition(false), 450);
  }, []);

  // Resolve active store
  const activeStore = stores.find(s => s.id === selectedStoreId) || stores[0] || null;
  const activeStoreId = activeStore?.id;

  // Filter listings for the active store
  const storeListings = activeStoreId ? listings.filter((l: any) => l.store_id === activeStoreId) : listings;

  if (!isAuthenticated) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground text-sm mb-4">Sign in to manage your store</p>
        <Button onClick={openLoginModal}>Sign In</Button>
      </div>
    );
  }

  if (loadingStores) {
    return <div className="py-16 text-center text-muted-foreground text-sm">Loading...</div>;
  }

  // Show setup flow if no stores or explicitly requested
  if (stores.length === 0 || createStoreOpen || showSetupFlow) {
    return (
      <SetupStoreFlow
        onComplete={() => { setShowSetupFlow(false); onCreateStoreClose?.(); }}
        onCancel={stores.length > 0 ? () => { setShowSetupFlow(false); onCreateStoreClose?.(); } : undefined}
      />
    );
  }

  const handleArchive = (id: string) => {
    updateListing.mutate({ id, status: 'archived' }, { onSuccess: () => toast.success('Listing archived') });
  };

  const handleMarkSold = (id: string) => {
    updateListing.mutate({ id, status: 'sold' }, { onSuccess: () => toast.success('Marked as sold') });
  };

  const TABS: { key: StoreSubTab; label: string; count: number }[] = [
    { key: 'listings', label: 'My Listings', count: storeListings.length },
    { key: 'orders', label: 'Orders', count: sellerOrders.length },
    { key: 'purchases', label: 'Purchases', count: buyerOrders.length },
  ];

  return (
    <div className="space-y-4">
      {/* Store header with avatar + info + edit */}
      <LiquidGlassBubble shimmer noBorder className="[&>div]:!rounded-xl overflow-hidden">
        <div className="relative">
          {/* Banner */}
          <div className="aspect-[3/1] w-full overflow-hidden">
            {activeStore?.banner_url ? (
              <img src={activeStore.banner_url} className="w-full h-full object-cover" alt="" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-white/5 to-white/[0.02]" />
            )}
          </div>
          {/* Avatar + Info overlay */}
          <div className="flex items-center gap-3 p-3 -mt-6 relative z-10">
            {activeStore?.avatar_url ? (
              <img src={activeStore.avatar_url} className="w-14 h-14 rounded-full object-cover border-2 border-black/60 shrink-0" alt="" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-black/60 border-2 border-black/60 flex items-center justify-center text-lg font-bold text-primary-foreground shrink-0">
                {(activeStore?.name || 'S')[0].toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              {stores.length > 1 ? (
                <Select value={activeStoreId || ''} onValueChange={setSelectedStoreId}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-primary-foreground w-full h-8 text-sm">
                    <SelectValue placeholder="Select store" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-white/10">
                    {stores.map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <h2 className="text-sm font-semibold text-primary-foreground truncate">{activeStore?.name}</h2>
              )}
              <p className="text-[10px] text-zinc-500 font-mono mt-0.5">
                Owner: {activeStore?.wallet_address?.slice(0, 6)}...{activeStore?.wallet_address?.slice(-4)}
              </p>
            </div>
            <button
              onClick={() => setEditStore(activeStore)}
              className="shrink-0 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
            >
              <Settings className="w-4 h-4 text-zinc-400" />
            </button>
          </div>
        </div>
      </LiquidGlassBubble>

      {/* Toggle bar with glass indicator */}
      <div className="bg-zinc-900 rounded-xl p-1">
        <div ref={layerRef} className="relative">
          <GlassIndicator rect={rect} borderRadius="0.5rem" enableTransition={enableTransition} />
          <div className="relative z-20 flex">
            {TABS.map(t => (
              <button
                key={t.key}
                ref={setRef(t.key)}
                onClick={() => handleTabClick(t.key)}
                className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
                  subTab === t.key ? 'text-white' : 'text-zinc-400'
                }`}
              >
                {t.label} ({t.count})
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      {subTab === 'listings' && (
        storeListings.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            No listings yet. Create your first one!
          </div>
        ) : (
          <div className="space-y-2">
            {storeListings.map((l: any) => (
              <div key={l.id} className="flex items-center gap-3 p-3 rounded-lg border border-white/10 bg-white/5">
                <div className="w-12 h-12 rounded-lg bg-white/10 overflow-hidden shrink-0">
                  {(l.images as string[])?.[0] && <img src={(l.images as string[])[0]} className="w-full h-full object-cover" alt="" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate text-primary-foreground">{l.title}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    {(() => {
                      const usd = Number(l.price);
                      const dhb = prices?.DHB && prices.DHB > 0 ? Math.ceil(usd / prices.DHB) : null;
                      return dhb ? (<><img src={dehubCoin} alt="DHB" className="w-3.5 h-3.5 inline" />{dhb.toLocaleString()} · ${usd.toFixed(2)}</>) : `$${usd.toFixed(2)}`;
                    })()}
                     · <span className="capitalize">{l.status}</span>
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="w-4 h-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => setEditListing(l)}>
                      <Pencil className="w-4 h-4 mr-2" /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleMarkSold(l.id)}>
                      <CheckCircle className="w-4 h-4 mr-2" /> Mark Sold
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleArchive(l.id)}>
                      <Archive className="w-4 h-4 mr-2" /> Archive
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        )
      )}

      {subTab === 'orders' && (
        sellerOrders.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">No orders received yet</div>
        ) : (
          <div className="space-y-2">
            {sellerOrders.map((o: any) => (
              <OrderRow key={o.id} order={o} type="seller" onUpdateStatus={(id, status) => updateOrderStatus.mutate({ id, status })} />
            ))}
          </div>
        )
      )}

      {subTab === 'purchases' && (
        buyerOrders.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">No purchases yet</div>
        ) : (
          <div className="space-y-2">
            {buyerOrders.map((o: any) => (
              <OrderRow key={o.id} order={o} type="buyer" onUpdateStatus={(id, status) => updateOrderStatus.mutate({ id, status })} />
            ))}
          </div>
        )
      )}

      {activeStoreId && (
        <>
          <CreateListingDrawer open={createListingOpen} onClose={() => onCreateListingClose?.()} storeId={activeStoreId} />
          <EditListingDrawer open={!!editListing} onClose={() => setEditListing(null)} listing={editListing} />
          <EditStoreDrawer store={editStore} open={!!editStore} onClose={() => setEditStore(null)} />
        </>
      )}
    </div>
  );
}

function OrderRow({ order, type, onUpdateStatus }: { order: any; type: 'buyer' | 'seller'; onUpdateStatus: (id: string, status: string) => void }) {
  const listing = order.store_listings;
  const statusColors: Record<string, string> = {
    paid: 'bg-yellow-500/20 text-yellow-400',
    shipped: 'bg-blue-500/20 text-blue-400',
    completed: 'bg-green-500/20 text-green-400',
    cancelled: 'bg-red-500/20 text-red-400',
    disputed: 'bg-orange-500/20 text-orange-400',
  };

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-white/10 bg-white/5">
      <div className="w-10 h-10 rounded-lg bg-white/10 overflow-hidden shrink-0">
        {(listing?.images as string[])?.[0] && <img src={(listing.images as string[])[0]} className="w-full h-full object-cover" alt="" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate text-primary-foreground">{listing?.title || 'Listing'}</p>
        <p className="text-xs text-muted-foreground">{Number(order.amount).toLocaleString()} DHB</p>
      </div>
      <span className={`text-[10px] px-2 py-0.5 rounded-full capitalize ${statusColors[order.status] || 'bg-white/10 text-muted-foreground'}`}>
        {order.status}
      </span>
      {type === 'seller' && order.status === 'paid' && (
        <Button size="sm" variant="outline" onClick={() => onUpdateStatus(order.id, 'shipped')} className="text-xs h-7">
          <Package className="w-3 h-3 mr-1" /> Ship
        </Button>
      )}
      {type === 'buyer' && order.status === 'shipped' && (
        <Button size="sm" variant="outline" onClick={() => onUpdateStatus(order.id, 'completed')} className="text-xs h-7">
          <ShoppingBag className="w-3 h-3 mr-1" /> Received
        </Button>
      )}
    </div>
  );
}
