import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteFilmReview,
  fetchFilmReviews,
  saveFilmReview,
  FilmReviewsUnavailableError,
  type SaveFilmReviewInput,
} from '@/lib/api/film-reviews';
import type { ObjectType } from '@/lib/api/justwatch';

function key(justwatchId: string | null, objectType: ObjectType) {
  return ['film-reviews', objectType, justwatchId] as const;
}

export function useFilmReviews(justwatchId: string | null, objectType: ObjectType) {
  return useQuery({
    queryKey: key(justwatchId, objectType),
    queryFn: () => fetchFilmReviews(justwatchId!, objectType),
    enabled: !!justwatchId,
    staleTime: 60 * 1000,
    // An undeployed function is a deployment state, not a blip — retrying it
    // just spends three round trips arriving at the same answer.
    retry: (failureCount, error) =>
      !(error instanceof FilmReviewsUnavailableError) && failureCount < 2,
  });
}

export function useSaveFilmReview(justwatchId: string | null, objectType: ObjectType) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (input: Omit<SaveFilmReviewInput, 'justwatchId' | 'objectType'>) =>
      saveFilmReview({ ...input, justwatchId: justwatchId!, objectType }),
    // Refetch rather than patch the cache: the summary (average, count,
    // distribution) is computed server-side over the whole set, so a local
    // splice would leave the stars disagreeing with the list beneath them.
    onSuccess: () => qc.invalidateQueries({ queryKey: key(justwatchId, objectType) }),
  });
}

export function useDeleteFilmReview(justwatchId: string | null, objectType: ObjectType) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: () => deleteFilmReview(justwatchId!, objectType),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(justwatchId, objectType) }),
  });
}

export { FilmReviewsUnavailableError };
