import { useTranslation as _useCopy } from 'react-i18next';
import { useSurfaceDraft } from '@/hooks/use-surface-draft';
import { useEffect, useState } from 'react';
import { Star, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import {
  useFilmReviews,
  useSaveFilmReview,
  useDeleteFilmReview,
  FilmReviewsUnavailableError,
} from '@/hooks/use-film-reviews';
import type { JustWatchTitleDetail, ObjectType } from '@/lib/api/justwatch';

const MAX_BODY = 4000;

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Stars. Interactive when `onRate` is given, otherwise a read-only meter. */
function Stars({
  value,
  size = 'sm',
  onRate,
}: {
  value: number;
  size?: 'sm' | 'lg';
  onRate?: (rating: number) => void;
}) {
  const { t: _copy } = _useCopy();
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  const cls = size === 'lg' ? 'h-6 w-6' : 'h-3.5 w-3.5';

  if (!onRate) {
    return (
      <span
        className="inline-flex items-center gap-0.5"
        role="img"
        aria-label={_copy("copy.d8238aa2eccd", { defaultValue: "{{value1}} out of 5", value1: value })}
      >
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`${cls} ${star <= Math.round(value) ? 'fill-white text-white' : 'text-zinc-700'}`}
            aria-hidden="true"
          />
        ))}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onMouseEnter={() => setHover(star)}
          onFocus={() => setHover(star)}
          onClick={() => onRate(star)}
          aria-label={_copy("copy.ca54d7fc43c4", { defaultValue: "Rate {{value1}} out of 5", value1: star })}
          aria-pressed={value === star}
          className="rounded p-0.5 transition-transform hover:scale-110 focus:outline-none focus-visible:ring-1 focus-visible:ring-white/50"
        >
          <Star
            className={`${cls} ${star <= shown ? 'fill-white text-white' : 'text-zinc-700'}`}
            aria-hidden="true"
          />
        </button>
      ))}
    </span>
  );
}

export function FilmReviews({
  justwatchId,
  objectType,
  title,
}: {
  justwatchId: string;
  objectType: ObjectType;
  /** The catalogue record, for the snapshot stored alongside a new review. */
  title: JustWatchTitleDetail | null;
}) {
  const { t: _copy } = _useCopy();
  const { walletAddress } = useAuth();
  const me = walletAddress?.toLowerCase() ?? null;

  const { data, isPending, error } = useFilmReviews(justwatchId, objectType);
  const save = useSaveFilmReview(justwatchId, objectType);
  const remove = useDeleteFilmReview(justwatchId, objectType);

  const mine = data?.reviews.find((r) => r.address.toLowerCase() === me) ?? null;
  const others = data?.reviews.filter((r) => r.address.toLowerCase() !== me) ?? [];

  const [rating, setRating] = useState(0);
  const [body, setBody] = useSurfaceDraft("components/cinema/FilmReviews.tsx:body", '', justwatchId);

  // Seed the composer from an existing review, and re-seed when the visitor
  // moves to a different title without the component unmounting.
  useEffect(() => {
    setRating(mine?.rating ?? 0);
    setBody.initialize(mine?.body ?? '');
  }, [mine?.id, mine?.rating, mine?.body, justwatchId, setBody]);

  // Reviews are ours, but the function that stores them is not deployed until
  // Cinema goes live. Say nothing rather than show an empty review section
  // that looks like nobody has reviewed anything.
  if (error instanceof FilmReviewsUnavailableError) return null;

  const summary = data?.summary;
  const canSubmit = rating >= 1 && rating <= 5 && !save.isPending;

  async function submit() {
    if (!title) return;
    try {
      await save.mutateAsync({
        rating,
        body: body.trim(),
        title: title.title,
        poster: title.poster,
        year: title.year,
      });
      toast.success(mine ? 'Review updated' : 'Review posted');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save your review');
    }
  }

  async function discard() {
    try {
      await remove.mutateAsync();
      setRating(0);
      setBody.complete(body, '');
      toast.success(_copy("copy.19c7963529d9", { defaultValue: "Review removed" }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not remove your review');
    }
  }

  return (
    <section className="mt-8 border-t border-white/10 pt-6" aria-label={_copy("copy.f7c633e370ca", { defaultValue: "Ratings and reviews" })}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-white">{_copy("copy.040a641f1ccc", { defaultValue: "Ratings & reviews" })}</h3>
        {summary?.count ? (
          <span className="flex items-center gap-2 text-xs text-zinc-500">
            <Stars value={summary.average ?? 0} />
            {summary.average} · {summary.count}{_copy("copy.68338686d5cd", { defaultValue: " review" })}{summary.count === 1 ? '' : 's'}
          </span>
        ) : null}
      </div>

      {isPending && (
        <div className="mt-4 flex items-center gap-2 text-sm text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{_copy("copy.510c765f211f", { defaultValue: "Loading reviews…" })}</div>
      )}

      {/* Composer */}
      {me ? (
        <div className="mt-4 rounded-xl border border-white/10 p-4">
          <div className="flex items-center gap-3">
            <span className="text-sm text-zinc-400">{mine ? _copy("copy.68548b47e72e", { defaultValue: "Your rating" }) : _copy("copy.1607f9781b2c", { defaultValue: "Rate it" })}</span>
            <Stars value={rating} size="lg" onRate={setRating} />
          </div>

          {rating > 0 && (
            <>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value.slice(0, MAX_BODY))}
                rows={3}
                placeholder={_copy("copy.8797e70cda54", { defaultValue: "Say what you thought (optional)" })}
                aria-label={_copy("copy.44237ef936d0", { defaultValue: "Your review" })}
                className="mt-3 w-full resize-y rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm text-white placeholder:text-zinc-600 focus:border-white/30 focus:outline-none"
              />

              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-xs text-zinc-600">
                  {body.length}/{MAX_BODY}
                </span>
                <div className="flex items-center gap-2">
                  {mine && (
                    <button
                      type="button"
                      onClick={discard}
                      disabled={remove.isPending}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:text-white disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />{_copy("copy.c3812fc4acb8", { defaultValue: "Remove" })}</button>
                  )}
                  <button
                    type="button"
                    onClick={submit}
                    disabled={!canSubmit}
                    className="rounded-lg bg-white px-4 py-1.5 text-sm font-medium text-black transition-opacity disabled:opacity-40"
                  >
                    {save.isPending ? _copy("copy.23e39291d613", { defaultValue: "Saving…" }) : mine ? _copy("copy.c1c1009d3f37", { defaultValue: "Update" }) : _copy("copy.c18f3c23b1ff", { defaultValue: "Post review" })}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      ) : (
        <p className="mt-4 text-sm text-zinc-500">{_copy("copy.7031458a555f", { defaultValue: "Sign in to rate and review." })}</p>
      )}

      {/* Everyone else */}
      {others.length > 0 && (
        <ul className="mt-5 space-y-4">
          {others.map((review) => (
            <li key={review.id} className="border-t border-white/5 pt-4 first:border-0 first:pt-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-zinc-500">
                  {shortAddress(review.address)}
                </span>
                <Stars value={review.rating} />
              </div>
              {review.body && (
                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-zinc-300">
                  {review.body}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {!isPending && !summary?.count && me && (
        <p className="mt-4 text-sm text-zinc-600">{_copy("copy.8d3f31ff21cf", { defaultValue: "Be the first to review this." })}</p>
      )}
    </section>
  );
}
