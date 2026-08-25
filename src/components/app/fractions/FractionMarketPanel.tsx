/**
 * Fraction Market Panel
 * =====================
 * One post's order book: asks, bids, and your position in it.
 *
 * Lifted out of PostInfoPage so the post page and the marketplace are the same
 * code. They were never going to stay in step otherwise — the panel on the post
 * page was the only fraction UI that existed, and everything it got wrong
 * (whole-listing buys, unverified settlement, a balance read from a five-minute
 * cache) would have had to be got wrong twice.
 */

import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Loader2, Tag, HandCoins, Plus } from 'lucide-react';
import {
  useFractionListings,
  useFractionOffers,
  useCancelListing,
  useCancelOffer,
  useSellerStatsBatch,
  TOTAL_FRACTIONS,
  type FractionListing,
  type FractionOffer,
} from '@/hooks/use-fraction-marketplace';
import { useOfferResponse, type PostSnapshot } from '@/hooks/use-fraction-checkout';
import { useFractionBalance } from '@/hooks/use-fraction-balance';
import { useAuth } from '@/contexts/AuthContext';
import { truncateAddress } from '@/lib/api/token-holders';
import { toast } from 'sonner';
import { BuyFractionDrawer } from './BuyFractionDrawer';
import { MakeOfferDrawer } from './MakeOfferDrawer';
import { SellFractionsDrawer } from './SellFractionsDrawer';
import { SellerTrustBadge } from './SellerTrustBadge';
import { SettlementRail } from './SettlementRail';
import dehubCoin from '@/assets/dehub-coin.png';

interface FractionMarketPanelProps {
  tokenId: string;
  chainId?: number;
  post?: PostSnapshot;
}

export function FractionMarketPanel({ tokenId, chainId = 8453, post }: FractionMarketPanelProps) {
  const { walletAddress } = useAuth();
  const [sellOpen, setSellOpen] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const [buyListing, setBuyListing] = useState<FractionListing | null>(null);

  const { data: listings = [], isLoading: loadingListings } = useFractionListings(tokenId);
  const { data: offers = [], isLoading: loadingOffers } = useFractionOffers(tokenId);
  const { data: balance } = useFractionBalance(tokenId, chainId);
  const { data: sellerStats = {} } = useSellerStatsBatch(listings.map(l => l.seller_address));
  const cancelListing = useCancelListing();
  const cancelOffer = useCancelOffer();
  const { accept, reject } = useOfferResponse();

  const held = balance ?? 0;
  const holdsFractions = held > 0;
  const holdsEverything = held >= TOTAL_FRACTIONS;

  const handleCancelListing = async (listing: FractionListing) => {
    try {
      await cancelListing.mutateAsync({ listingId: listing.id, tokenId: listing.token_id });
      toast.success('Listing cancelled');
    } catch (err) {
      toast.error((err as Error)?.message || 'Failed to cancel');
    }
  };

  const handleCancelOffer = async (offer: FractionOffer) => {
    try {
      await cancelOffer.mutateAsync({ offerId: offer.id, tokenId: offer.token_id });
      toast.success('Offer withdrawn');
    } catch (err) {
      toast.error((err as Error)?.message || 'Failed to withdraw');
    }
  };

  return (
    <div className="space-y-4">
      <SettlementRail tokenId={tokenId} />

      <section className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
        <SellFractionsDrawer
          tokenId={tokenId}
          chainId={chainId}
          post={post}
          open={sellOpen}
          onOpenChange={setSellOpen}
        />
        <BuyFractionDrawer
          listing={buyListing}
          open={!!buyListing}
          onOpenChange={(v) => { if (!v) setBuyListing(null); }}
        />
        <MakeOfferDrawer
          tokenId={tokenId}
          chainId={chainId}
          open={offerOpen}
          onOpenChange={setOfferOpen}
        />

        <Tabs defaultValue="listings" className="w-full">
          <TabsList
            data-keep-square
            className="w-full bg-transparent border-b border-white/10 rounded-none h-auto p-0"
          >
            <TabsTrigger
              value="listings"
              data-keep-square
              className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-white data-[state=active]:bg-transparent bg-transparent py-3 text-white/60 data-[state=active]:text-white"
            >
              <Tag className="w-4 h-4 mr-2" />
              For sale {listings.length > 0 && `(${listings.length})`}
            </TabsTrigger>
            <TabsTrigger
              value="offers"
              data-keep-square
              className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-white data-[state=active]:bg-transparent bg-transparent py-3 text-white/60 data-[state=active]:text-white"
            >
              <HandCoins className="w-4 h-4 mr-2" />
              Offers {offers.length > 0 && `(${offers.length})`}
            </TabsTrigger>
          </TabsList>

          {/* Asks */}
          <TabsContent value="listings" className="p-4 mt-0">
            {loadingListings ? (
              <div className="flex justify-center py-6">
                <Loader2 className="w-5 h-5 text-white/40 animate-spin" />
              </div>
            ) : listings.length === 0 ? (
              <div className="text-center py-8">
                <Tag className="w-8 h-8 text-white/20 mx-auto mb-2" />
                <p className="text-white/40 text-sm">Nothing for sale yet</p>
              </div>
            ) : (
              <div className="space-y-3 mb-4">
                {listings.map((listing) => {
                  const isMine =
                    walletAddress?.toLowerCase() === listing.seller_address.toLowerCase();
                  const available = listing.quantity - listing.filled_quantity;
                  return (
                    <div
                      key={listing.id}
                      className="bg-white/5 rounded-xl p-3 border border-white/10"
                    >
                      <div className="flex items-center justify-between mb-2 gap-2">
                        <span className="text-xs font-mono text-white/60 flex items-center gap-2 min-w-0">
                          <span className="truncate">{truncateAddress(listing.seller_address)}</span>
                          {isMine && <span className="text-primary shrink-0">(you)</span>}
                        </span>
                        <SellerTrustBadge
                          stats={sellerStats[listing.seller_address.toLowerCase()]}
                          compact
                        />
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-white font-medium">{available} fractions</p>
                          <p className="text-xs text-white/60">
                            {listing.price_per_fraction} DHB each ·{' '}
                            {((available / TOTAL_FRACTIONS) * 100).toFixed(1)}% of the post
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-white font-bold">
                            {(available * listing.price_per_fraction).toLocaleString(undefined, {
                              maximumFractionDigits: 2,
                            })}{' '}
                            DHB
                          </p>
                          {isMine ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-400 hover:text-red-300 text-xs mt-1 h-7 px-2"
                              onClick={() => handleCancelListing(listing)}
                              disabled={cancelListing.isPending}
                            >
                              Cancel
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              className="bg-white/10 hover:bg-white/20 text-white text-xs mt-1 h-7 px-3"
                              onClick={() => setBuyListing(listing)}
                            >
                              Buy
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="space-y-2">
              {holdsFractions && (
                <Button
                  onClick={() => setSellOpen(true)}
                  className="w-full bg-white/10 hover:bg-white/20 text-white border border-white/20"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Sell your fractions ({held} held)
                </Button>
              )}
              {!holdsEverything && (
                <Button
                  onClick={() => setOfferOpen(true)}
                  variant="ghost"
                  className="w-full text-white/60 hover:text-white"
                >
                  <HandCoins className="w-4 h-4 mr-2" />
                  Make an offer
                </Button>
              )}
            </div>
          </TabsContent>

          {/* Bids */}
          <TabsContent value="offers" className="p-4 mt-0">
            {loadingOffers ? (
              <div className="flex justify-center py-6">
                <Loader2 className="w-5 h-5 text-white/40 animate-spin" />
              </div>
            ) : offers.length === 0 ? (
              <div className="text-center py-8">
                <HandCoins className="w-8 h-8 text-white/20 mx-auto mb-2" />
                <p className="text-white/40 text-sm">No offers yet</p>
              </div>
            ) : (
              <div className="space-y-3 mb-4">
                {offers.map((offer) => {
                  const isBuyer =
                    walletAddress?.toLowerCase() === offer.buyer_address.toLowerCase();
                  // Only a holder can fill a bid, and only for as much as they
                  // hold — the old panel offered Accept to anyone with any
                  // balance and let the transfer revert.
                  const canFill = holdsFractions && !isBuyer && held >= offer.quantity;
                  const isAccepting = accept.isPending && accept.variables?.id === offer.id;
                  return (
                    <div key={offer.id} className="bg-white/5 rounded-xl p-3 border border-white/10">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-mono text-white/60">
                          {truncateAddress(offer.buyer_address)}
                          {isBuyer && <span className="text-primary ml-1">(you)</span>}
                        </span>
                        {offer.target_seller && (
                          <span className="px-2 py-0.5 text-[10px] rounded-full bg-white/10 text-white/50">
                            Directed
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-white font-medium">{offer.quantity} fractions</p>
                          <p className="text-xs text-white/60">
                            {offer.price_per_fraction} DHB each
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-white font-bold flex items-center gap-1 justify-end">
                            <img src={dehubCoin} alt="DHB" className="w-3.5 h-3.5" />
                            {(offer.quantity * offer.price_per_fraction).toLocaleString(undefined, {
                              maximumFractionDigits: 2,
                            })}
                          </p>
                          {isBuyer ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-400 hover:text-red-300 text-xs mt-1 h-7 px-2"
                              onClick={() => handleCancelOffer(offer)}
                              disabled={cancelOffer.isPending}
                            >
                              Withdraw
                            </Button>
                          ) : canFill ? (
                            <div className="flex gap-1 mt-1 justify-end">
                              <Button
                                size="sm"
                                className="bg-green-500/20 hover:bg-green-500/30 text-green-400 text-xs h-7 px-2"
                                onClick={() => accept.mutate(offer)}
                                disabled={isAccepting}
                              >
                                {isAccepting ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  'Sell'
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-red-400 hover:text-red-300 text-xs h-7 px-2"
                                onClick={() =>
                                  reject.mutate({ offerId: offer.id, tokenId: offer.token_id })
                                }
                                disabled={isAccepting || reject.isPending}
                              >
                                Reject
                              </Button>
                            </div>
                          ) : holdsFractions && !isBuyer ? (
                            <p className="text-[10px] text-white/30 mt-1">
                              Needs {offer.quantity}, you hold {held}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="space-y-2">
              {!holdsEverything && (
                <Button
                  onClick={() => setOfferOpen(true)}
                  className="w-full bg-white/10 hover:bg-white/20 text-white border border-white/20"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Make an offer
                </Button>
              )}
              {holdsFractions && (
                <Button
                  onClick={() => setSellOpen(true)}
                  variant="ghost"
                  className="w-full text-white/60 hover:text-white"
                >
                  <Tag className="w-4 h-4 mr-2" />
                  Sell your fractions ({held} held)
                </Button>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </section>
    </div>
  );
}
