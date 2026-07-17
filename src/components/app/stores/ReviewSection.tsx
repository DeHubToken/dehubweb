/**
 * ReviewSection — Full review system for store listings
 * Shows average rating, review list, and write-review form for buyers.
 */

import { useState } from 'react';
import { Star, MessageSquarePlus, ThumbsUp, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { StarRating } from './StarRating';
import { LiquidGlassBubble } from '@/components/ui/liquid-glass-bubble';
import { LiquidGlassBubble2 } from '@/components/ui/liquid-glass-bubble-2';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { useListingReviews, useCreateReview, useHasPurchased } from '@/hooks/use-store-reviews';
import { formatDistanceToNow } from 'date-fns';

interface ReviewSectionProps {
  listingId: string;
  sellerAddress: string;
}

export function ReviewSection({ listingId, sellerAddress }: ReviewSectionProps) {
  const { walletAddress } = useAuth();
  const { data: reviews = [], isLoading } = useListingReviews(listingId);
  const { data: hasPurchased } = useHasPurchased(listingId);
  const createReview = useCreateReview();

  const [showForm, setShowForm] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [expanded, setExpanded] = useState(true);

  const isSeller = walletAddress?.toLowerCase() === sellerAddress?.toLowerCase();
  const alreadyReviewed = reviews.some(
    r => r.reviewer_address.toLowerCase() === walletAddress?.toLowerCase()
  );
  const canReview = hasPurchased && !isSeller && !alreadyReviewed;

  // Stats
  const avgRating = reviews.length > 0
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
    : 0;
  const distribution = [5, 4, 3, 2, 1].map(star => ({
    star,
    count: reviews.filter(r => r.rating === star).length,
    pct: reviews.length > 0 ? (reviews.filter(r => r.rating === star).length / reviews.length) * 100 : 0,
  }));

  const handleSubmit = async () => {
    if (rating === 0) return;
    await createReview.mutateAsync({ listing_id: listingId, rating, comment: comment.trim() });
    setShowForm(false);
    setRating(0);
    setComment('');
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center justify-between w-full"
      >
        <div className="flex items-center gap-2">
          <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
          <span className="text-sm font-semibold text-primary-foreground">
            Reviews
          </span>
          <span className="text-xs text-zinc-500">({reviews.length})</span>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
      </button>

      {expanded && (
        <div className="space-y-3">
          {/* Summary bar */}
          {reviews.length > 0 && (
            <LiquidGlassBubble shimmer noBorder className="[&>div]:!rounded-xl">
              <div className="flex gap-4 p-3">
                {/* Big average */}
                <div className="flex flex-col items-center justify-center min-w-[72px]">
                  <span className="text-3xl font-bold text-primary-foreground">{avgRating.toFixed(1)}</span>
                  <StarRating value={avgRating} readonly size="sm" />
                  <span className="text-[10px] text-zinc-500 mt-0.5">{reviews.length} review{reviews.length !== 1 ? 's' : ''}</span>
                </div>
                {/* Distribution bars */}
                <div className="flex-1 flex flex-col justify-center gap-1">
                  {distribution.map(d => (
                    <div key={d.star} className="flex items-center gap-1.5">
                      <span className="text-[10px] text-zinc-400 w-3 text-right">{d.star}</span>
                      <Star className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
                      <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-amber-400 transition-all duration-500"
                          style={{ width: `${d.pct}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-zinc-500 w-4">{d.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </LiquidGlassBubble>
          )}

          {/* Write review button */}
          {canReview && !showForm && (
            <LiquidGlassBubble2
              label="Write a Review"
              icon={<MessageSquarePlus className="w-4 h-4" />}
              onClick={() => setShowForm(true)}
              width="100%"
              height="40px"
            />
          )}

          {/* Review form */}
          {showForm && (
            <LiquidGlassBubble shimmer noBorder className="[&>div]:!rounded-xl">
              <div className="p-3 space-y-3">
                <p className="text-xs font-medium text-primary-foreground">Your Rating</p>
                <div className="flex justify-center">
                  <StarRating value={rating} onChange={setRating} size="lg" />
                </div>
                <Textarea
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  placeholder="Share your experience with this product..."
                  className="bg-white/5 border-white/10 min-h-[80px] text-sm resize-none"
                  maxLength={500}
                />
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-zinc-500">{comment.length}/500</span>
                  <div className="flex gap-2">
                    <LiquidGlassBubble2
                      label="Cancel"
                      onClick={() => { setShowForm(false); setRating(0); setComment(''); }}
                      width="80px"
                      height="36px"
                    />
                    <LiquidGlassBubble2
                      label="Submit"
                      icon={<Star className="w-3.5 h-3.5" />}
                      loading={createReview.isPending}
                      loadingLabel="Posting..."
                      disabled={rating === 0}
                      onClick={handleSubmit}
                      width="100px"
                      height="36px"
                    />
                  </div>
                </div>
              </div>
            </LiquidGlassBubble>
          )}

          {/* Review list */}
          {isLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
            </div>
          ) : reviews.length === 0 ? (
            <p className="text-xs text-zinc-500 text-center py-3">No reviews yet — be the first!</p>
          ) : (
            <div className="space-y-2">
              {reviews.map(review => (
                <LiquidGlassBubble key={review.id} shimmer noBorder className="[&>div]:!rounded-xl">
                  <div className="p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold text-primary-foreground">
                          {review.reviewer_address.slice(2, 4).toUpperCase()}
                        </div>
                        <span className="text-xs text-zinc-400 font-mono">
                          {review.reviewer_address.slice(0, 6)}...{review.reviewer_address.slice(-4)}
                        </span>
                      </div>
                      <span className="text-[10px] text-zinc-500">
                        {formatDistanceToNow(new Date(review.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    <StarRating value={review.rating} readonly size="sm" />
                    {review.comment && (
                      <p className="text-sm text-primary-foreground leading-relaxed">{review.comment}</p>
                    )}
                    {review.seller_response && (
                      <div className="mt-2 pl-3 border-l-2 border-amber-400/30">
                        <p className="text-[10px] text-amber-400 font-medium mb-0.5">Seller Response</p>
                        <p className="text-xs text-zinc-300">{review.seller_response}</p>
                      </div>
                    )}
                  </div>
                </LiquidGlassBubble>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
