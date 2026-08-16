/**
 * Stream Shop Manager
 * ===================
 * Host-side controls: attach listings to the stream, put one "on air", and
 * watch orders land while broadcasting.
 *
 * Only ever rendered for the stream's own creator, but that is a convenience
 * rather than the security boundary — every mutation here is re-checked in the
 * stream-products function against the token's minter, because the wallet
 * address this client sends is not signed.
 */

import { useState } from 'react';
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ShoppingBag, Plus, Trash2, Radio, ImageIcon, Loader2, PackageOpen, Store,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useMyListings } from '@/hooks/use-stores';
import {
  useStreamProducts, useStreamProductActions, useStreamOrders, effectivePrice,
} from '@/hooks/use-stream-shopping';
import { GLASS_STYLES } from '@/constants/app.constants';
import { formatDistanceToNow } from 'date-fns';
import dehubCoin from '@/assets/dehub-coin.png';
import { cn } from '@/lib/utils';

interface Props {
  tokenId: string | null;
}

function Thumb({ src, className }: { src?: string; className?: string }) {
  return (
    <div className={cn('bg-white/5 overflow-hidden shrink-0 flex items-center justify-center', className)}>
      {src ? (
        <img src={src} alt="" className="w-full h-full object-cover" loading="lazy" />
      ) : (
        <ImageIcon className="w-4 h-4 text-zinc-600" />
      )}
    </div>
  );
}

/** Picker for the host's own listings, with an optional live-only price. */
function AddProductSheet({ tokenId, attachedIds }: { tokenId: string | null; attachedIds: Set<string> }) {
  const { data: listings = [], isLoading } = useMyListings();
  const { attach } = useStreamProductActions(tokenId);
  const [open, setOpen] = useState(false);
  const [livePrices, setLivePrices] = useState<Record<string, string>>({});
  const navigate = useNavigate();

  // `any` matches how the rest of the stores surface types listing rows: the
  // generated Row types `images` as Json, which fights every consumer.
  const available = (listings as any[]).filter(
    l => l.status === 'active' && !attachedIds.has(l.id),
  );

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Add
        </Button>
      </DrawerTrigger>
      <DrawerContent className={GLASS_STYLES.drawer}>
        <DrawerHeader>
          <DrawerTitle>Add to this stream</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-6 space-y-2 max-h-[70vh] overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
            </div>
          ) : !listings.length ? (
            <div className="text-center py-8 space-y-3">
              <Store className="w-8 h-8 mx-auto text-zinc-600" />
              <p className="text-sm text-zinc-400">You don't have any listings yet.</p>
              <Button size="sm" variant="outline" onClick={() => { setOpen(false); navigate('/app/stores'); }}>
                Open your store
              </Button>
            </div>
          ) : !available.length ? (
            <p className="text-sm text-zinc-400 text-center py-8">
              Everything active in your store is already on this stream.
            </p>
          ) : (
            available.map(listing => (
              <div key={listing.id} className="flex items-center gap-3 p-2 rounded-xl border border-white/10 bg-white/5">
                <Thumb src={listing.images?.[0]} className="w-12 h-12 rounded-lg" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white truncate">{listing.title}</p>
                  <p className="text-xs text-zinc-500">${Number(listing.price).toLocaleString()}</p>
                </div>
                <div className="w-24">
                  <Label className="text-[10px] text-zinc-500">Live price</Label>
                  <Input
                    value={livePrices[listing.id] ?? ''}
                    onChange={e => setLivePrices(p => ({ ...p, [listing.id]: e.target.value }))}
                    placeholder="optional"
                    inputMode="decimal"
                    className="h-8 bg-white/5 border-white/10 text-xs"
                  />
                </div>
                <Button
                  size="sm"
                  disabled={attach.isPending}
                  onClick={() => {
                    const raw = livePrices[listing.id];
                    const parsed = raw ? Number(raw) : null;
                    attach.mutate({
                      listingId: listing.id,
                      livePrice: parsed && Number.isFinite(parsed) ? parsed : null,
                    });
                  }}
                >
                  Add
                </Button>
              </div>
            ))
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

/** Orders from this stream, newest first, arriving over realtime. */
function LiveOrders({ tokenId }: { tokenId: string | null }) {
  const { data: orders = [], isLoading } = useStreamOrders(tokenId, true);

  if (isLoading) return null;
  if (!orders.length) {
    return (
      <div className="text-center py-6 space-y-1.5">
        <PackageOpen className="w-6 h-6 mx-auto text-zinc-600" />
        <p className="text-xs text-zinc-500">No orders yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {orders.map(order => (
        <div key={order.id} className="flex items-center gap-2.5 p-2 rounded-lg bg-white/5">
          <Thumb src={order.store_listings?.images?.[0] ?? undefined} className="w-8 h-8 rounded-md" />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-white truncate">{order.store_listings?.title || 'Item'}</p>
            <p className="text-[10px] text-zinc-500">
              {order.buyer_address.slice(0, 6)}…{order.buyer_address.slice(-4)} ·{' '}
              {formatDistanceToNow(new Date(order.created_at), { addSuffix: true })}
            </p>
          </div>
          <span className="flex items-center gap-1 text-xs font-semibold text-white shrink-0">
            <img src={dehubCoin} alt="" className="w-3.5 h-3.5" />
            {order.paid_token_amount != null
              ? Number(order.paid_token_amount).toLocaleString(undefined, { maximumFractionDigits: 0 })
              : `$${Number(order.amount).toLocaleString()}`}
          </span>
        </div>
      ))}
    </div>
  );
}

export function StreamShopManager({ tokenId }: Props) {
  const { products } = useStreamProducts(tokenId);
  const { detach, pin, unpin } = useStreamProductActions(tokenId);
  const [tab, setTab] = useState<'products' | 'orders'>('products');

  const attachedIds = new Set(products.map(p => p.listing_id));

  return (
    <div className="mt-3 rounded-2xl border border-white/[0.12] bg-white/[0.03] p-3">
      <div className="flex items-center gap-2 mb-3">
        <ShoppingBag className="w-4 h-4 text-zinc-400" />
        <h3 className="text-sm font-semibold text-white">Stream shop</h3>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={() => setTab('products')}
            className={cn(
              'px-2.5 py-1 rounded-lg text-xs transition-colors',
              tab === 'products' ? 'bg-white/15 text-white' : 'text-zinc-500 hover:text-zinc-300',
            )}
          >
            Products
          </button>
          <button
            onClick={() => setTab('orders')}
            className={cn(
              'px-2.5 py-1 rounded-lg text-xs transition-colors',
              tab === 'orders' ? 'bg-white/15 text-white' : 'text-zinc-500 hover:text-zinc-300',
            )}
          >
            Orders
          </button>
          <AddProductSheet tokenId={tokenId} attachedIds={attachedIds} />
        </div>
      </div>

      {tab === 'orders' ? (
        <LiveOrders tokenId={tokenId} />
      ) : !products.length ? (
        <p className="text-xs text-zinc-500 text-center py-6">
          Add something from your store and viewers can buy it without leaving the stream.
        </p>
      ) : (
        <div className="space-y-1.5">
          {products.map(product => {
            const soldOut = product.store_listings?.stock_quantity === 0;
            return (
              <div
                key={product.id}
                className={cn(
                  'flex items-center gap-2.5 p-2 rounded-lg border transition-colors',
                  product.is_pinned ? 'border-white/30 bg-white/10' : 'border-white/10 bg-white/5',
                )}
              >
                <Thumb src={product.store_listings?.images?.[0]} className="w-10 h-10 rounded-lg" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-white truncate">{product.store_listings?.title}</p>
                  <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                    <span>${effectivePrice(product).toLocaleString()}</span>
                    {product.live_price != null && <span className="text-white">live price</span>}
                    {soldOut && <span className="text-amber-400">sold out</span>}
                  </div>
                </div>

                {/* One product is "on air" at a time — the partial unique index
                    in the schema is what actually guarantees that, so pressing
                    this on a second product moves the pin rather than stacking. */}
                <button
                  onClick={() => (product.is_pinned ? unpin.mutate() : pin.mutate(product.listing_id))}
                  disabled={soldOut || pin.isPending || unpin.isPending}
                  title={product.is_pinned ? 'Take off air' : 'Put on air'}
                  className={cn(
                    'shrink-0 flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wide transition-colors disabled:opacity-40',
                    product.is_pinned
                      ? 'bg-white text-black'
                      : 'bg-white/10 text-zinc-300 hover:bg-white/20',
                  )}
                >
                  <Radio className="w-3 h-3" />
                  {product.is_pinned ? 'On air' : 'Air'}
                </button>

                <button
                  onClick={() => detach.mutate(product.listing_id)}
                  disabled={detach.isPending}
                  aria-label="Remove from stream"
                  className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-zinc-500 hover:text-red-400 hover:bg-white/10 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
