/**
 * My Store Tab
 * =============
 * Seller dashboard: manage listings and view orders.
 */

import { useState } from 'react';
import { Plus, Package, ShoppingBag, MoreVertical, Archive, CheckCircle, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { useMyStore, useMyListings, useMyOrders, useUpdateListing, useUpdateOrderStatus } from '@/hooks/use-stores';
import { SetupStoreFlow } from './SetupStoreFlow';
import { CreateListingDrawer } from './CreateListingDrawer';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

export function MyStoreTab() {
  const { isAuthenticated, openLoginModal } = useAuth();
  const { data: store, isLoading: loadingStore } = useMyStore();
  const { data: listings = [] } = useMyListings();
  const { data: sellerOrders = [] } = useMyOrders('seller');
  const { data: buyerOrders = [] } = useMyOrders('buyer');
  const updateListing = useUpdateListing();
  const updateOrderStatus = useUpdateOrderStatus();
  const [createOpen, setCreateOpen] = useState(false);
  const [editListing, setEditListing] = useState<any>(null);

  if (!isAuthenticated) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground text-sm mb-4">Sign in to manage your store</p>
        <Button onClick={openLoginModal}>Sign In</Button>
      </div>
    );
  }

  if (loadingStore) {
    return <div className="py-16 text-center text-muted-foreground text-sm">Loading...</div>;
  }

  if (!store) {
    return <SetupStoreFlow />;
  }

  const handleArchive = (id: string) => {
    updateListing.mutate({ id, status: 'archived' }, { onSuccess: () => toast.success('Listing archived') });
  };

  const handleMarkSold = (id: string) => {
    updateListing.mutate({ id, status: 'sold' }, { onSuccess: () => toast.success('Marked as sold') });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">{store.name}</h2>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-1" />
          New Listing
        </Button>
      </div>

      <Tabs defaultValue="listings" className="w-full">
        <TabsList className="bg-white/5 border border-white/10">
          <TabsTrigger value="listings">My Listings ({listings.length})</TabsTrigger>
          <TabsTrigger value="orders">Orders ({sellerOrders.length})</TabsTrigger>
          <TabsTrigger value="purchases">My Purchases ({buyerOrders.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="listings">
          {listings.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No listings yet. Create your first one!
            </div>
          ) : (
            <div className="space-y-2">
              {listings.map((l: any) => (
                <div key={l.id} className="flex items-center gap-3 p-3 rounded-lg border border-white/10 bg-white/5">
                  <div className="w-12 h-12 rounded-lg bg-white/10 overflow-hidden shrink-0">
                    {(l.images as string[])?.[0] && <img src={(l.images as string[])[0]} className="w-full h-full object-cover" alt="" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{l.title}</p>
                    <p className="text-xs text-muted-foreground">{Number(l.price).toLocaleString()} DHB · <span className="capitalize">{l.status}</span></p>
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
          )}
        </TabsContent>

        <TabsContent value="orders">
          {sellerOrders.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">No orders received yet</div>
          ) : (
            <div className="space-y-2">
              {sellerOrders.map((o: any) => (
                <OrderRow key={o.id} order={o} type="seller" onUpdateStatus={(id, status) => updateOrderStatus.mutate({ id, status })} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="purchases">
          {buyerOrders.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">No purchases yet</div>
          ) : (
            <div className="space-y-2">
              {buyerOrders.map((o: any) => (
                <OrderRow key={o.id} order={o} type="buyer" onUpdateStatus={(id, status) => updateOrderStatus.mutate({ id, status })} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <CreateListingDrawer open={createOpen} onClose={() => setCreateOpen(false)} storeId={store.id} />
      <EditListingDrawer open={!!editListing} onClose={() => setEditListing(null)} listing={editListing} />
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
        <p className="text-sm font-medium text-foreground truncate">{listing?.title || 'Listing'}</p>
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
