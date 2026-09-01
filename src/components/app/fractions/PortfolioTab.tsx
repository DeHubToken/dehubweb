/**
 * Portfolio
 * =========
 * What you hold, what you have listed, and what you owe.
 *
 * The settlement rail sits at the top on purpose: an open trade is the one
 * thing on this page that has a clock on it, and burying it under a grid of
 * holdings is how a seller misses a delivery window and takes a strike they
 * did not mean to take.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Loader2, Tag, Wallet, ImageIcon, HandCoins, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cdnImage } from '@/lib/media-url';
import { useAuth } from '@/contexts/AuthContext';
import { useFractionPortfolio, type PortfolioPosition } from '@/hooks/use-fraction-portfolio';
import {
  useMyListings,
  useMyOffers,
  useCancelListing,
  useCancelOffer,
  TOTAL_FRACTIONS,
} from '@/hooks/use-fraction-marketplace';
import { SellFractionsDrawer } from './SellFractionsDrawer';
import { SettlementRail } from './SettlementRail';
import { toast } from 'sonner';
import dehubCoin from '@/assets/dehub-coin.png';

function PositionCard({
  position,
  onSell,
  onOpen,
}: {
  position: PortfolioPosition;
  onSell: () => void;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const thumb = position.imageUrl ? cdnImage(position.imageUrl, { width: 300 }) : '';
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
      <button onClick={onOpen} className="w-full text-left">
        <div className="aspect-square bg-white/5 relative overflow-hidden">
          {thumb ? (
            <img
              src={thumb}
              alt={position.title || t('fractions.postNumber', { id: position.tokenId })}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/20">
              <ImageIcon className="w-8 h-8" />
            </div>
          )}
          <span className="absolute top-2 left-2 text-[10px] font-semibold bg-black/70 text-white/90 px-1.5 py-0.5 rounded backdrop-blur-sm">
            {position.balance} / {TOTAL_FRACTIONS}
          </span>
          {position.isCreator && (
            <span className="absolute top-2 right-2 text-[10px] font-semibold bg-white/90 text-black px-1.5 py-0.5 rounded">
              {t('fractions.yours')}
            </span>
          )}
        </div>
        <div className="p-3 pb-1.5">
          <h3 className="text-sm font-medium text-white truncate">
            {position.title || t('fractions.postNumber', { id: position.tokenId })}
          </h3>
          <p className="text-xs text-zinc-400">{t('fractions.pctOfPost', { pct: position.percentage.toFixed(1) })}</p>
        </div>
      </button>
      <div className="px-3 pb-3">
        <Button
          size="sm"
          onClick={onSell}
          className="w-full bg-white/10 hover:bg-white/20 text-white border border-white/20 text-xs h-8"
        >
          <Tag className="w-3.5 h-3.5 mr-1.5" />
          {t('fractions.sell')}
        </Button>
      </div>
    </div>
  );
}

export function PortfolioTab() {
  const { t } = useTranslation();
  const { walletAddress, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [selling, setSelling] = useState<PortfolioPosition | null>(null);

  const { data: positions = [], isLoading } = useFractionPortfolio(walletAddress);
  const { data: listings = [] } = useMyListings(walletAddress);
  const { data: offers } = useMyOffers(walletAddress);
  const cancelListing = useCancelListing();
  const cancelOffer = useCancelOffer();

  const activeListings = listings.filter(l => l.status === 'active');
  const totalHeld = positions.reduce((sum, p) => sum + p.balance, 0);

  if (!isAuthenticated) {
    return (
      <div className="text-center py-16">
        <Wallet className="w-10 h-10 text-white/15 mx-auto mb-3" />
        <p className="text-white/40 text-sm">{t('fractions.signInToSee')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {selling && (
        <SellFractionsDrawer
          tokenId={selling.tokenId}
          chainId={selling.chainId}
          post={{
            title: selling.title || undefined,
            imageUrl: selling.imageUrl || undefined,
            type: selling.postType || undefined,
          }}
          open
          onOpenChange={(v) => { if (!v) setSelling(null); }}
        />
      )}

      <SettlementRail />

      {/* Holdings */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-white/60">{t('fractions.yourFractions')}</h2>
          {totalHeld > 0 && (
            <span className="text-xs text-white/30">
              {totalHeld.toLocaleString()} {t('fractions.acrossPosts', { count: positions.length })}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 text-white/30 animate-spin" />
          </div>
        ) : positions.length === 0 ? (
          <div className="text-center py-12 rounded-xl border border-white/10 bg-white/5">
            <ImageIcon className="w-8 h-8 text-white/15 mx-auto mb-2" />
            <p className="text-white/40 text-sm">{t('fractions.noneHeldYet')}</p>
            <p className="text-white/25 text-xs mt-1">
              {t('fractions.noneHeldHint')}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {positions.map((position) => (
              <PositionCard
                key={`${position.chainId}-${position.tokenId}`}
                position={position}
                onSell={() => setSelling(position)}
                onOpen={() => navigate(`/app/post/${position.tokenId}/info`)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Your asks */}
      {activeListings.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-white/60">{t('fractions.listedForSale')}</h2>
          <div className="space-y-2">
            {activeListings.map((listing) => {
              const available = listing.quantity - listing.filled_quantity;
              return (
                <div
                  key={listing.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">
                      {listing.post_title || t('fractions.postNumber', { id: listing.token_id })}
                    </p>
                    <p className="text-xs text-white/50 flex items-center gap-1">
                      {t('fractions.fractionCountDot', { count: available })}
                      <img src={dehubCoin} alt="DHB" className="w-3 h-3" />
                      {t('fractions.priceEach', { price: listing.price_per_fraction })}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-400 hover:text-red-300 text-xs h-8 shrink-0"
                    disabled={cancelListing.isPending}
                    onClick={async () => {
                      try {
                        await cancelListing.mutateAsync({
                          listingId: listing.id,
                          tokenId: listing.token_id,
                        });
                        toast.success(t('fractions.listingCancelled'));
                      } catch (err) {
                        toast.error((err as Error)?.message || t('fractions.cancelFailed'));
                      }
                    }}
                  >
                    <X className="w-3.5 h-3.5 mr-1" />
                    {t('fractions.cancel')}
                  </Button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Your bids */}
      {!!offers?.made.length && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-white/60">{t('fractions.offersYouMade')}</h2>
          <div className="space-y-2">
            {offers.made.map((offer) => (
              <div
                key={offer.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm text-white truncate">{t('fractions.postNumber', { id: offer.token_id })}</p>
                  <p className="text-xs text-white/50 flex items-center gap-1">
                    {t('fractions.fractionCountDot', { count: offer.quantity })}
                    <img src={dehubCoin} alt="DHB" className="w-3 h-3" />
                    {t('fractions.priceEach', { price: offer.price_per_fraction })}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-400 hover:text-red-300 text-xs h-8 shrink-0"
                  disabled={cancelOffer.isPending}
                  onClick={async () => {
                    try {
                      await cancelOffer.mutateAsync({
                        offerId: offer.id,
                        tokenId: offer.token_id,
                      });
                      toast.success(t('fractions.offerWithdrawn'));
                    } catch (err) {
                      toast.error((err as Error)?.message || t('fractions.withdrawFailed'));
                    }
                  }}
                >
                  <X className="w-3.5 h-3.5 mr-1" />
                  {t('fractions.withdraw')}
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Bids aimed at you */}
      {!!offers?.received.length && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-white/60">{t('fractions.offersForYourFractions')}</h2>
          <div className="space-y-2">
            {offers.received.map((offer) => (
              <button
                key={offer.id}
                onClick={() => navigate(`/app/post/${offer.token_id}/info`)}
                className="w-full flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-left hover:border-white/20 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm text-white truncate">{t('fractions.postNumber', { id: offer.token_id })}</p>
                  <p className="text-xs text-white/50 flex items-center gap-1">
                    {t('fractions.fractionCountDot', { count: offer.quantity })}
                    <img src={dehubCoin} alt="DHB" className="w-3 h-3" />
                    {t('fractions.priceEach', { price: offer.price_per_fraction })}
                  </p>
                </div>
                <span className="text-xs text-white/40 flex items-center gap-1 shrink-0">
                  <HandCoins className="w-3.5 h-3.5" />
                  {t('fractions.review')}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
