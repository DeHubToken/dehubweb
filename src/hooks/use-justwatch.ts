import { useQuery } from '@tanstack/react-query';
import {
  fetchProviders,
  fetchTitleOffers,
  searchTitles,
  JustWatchNotConfiguredError,
  type ObjectType,
} from '@/lib/api/justwatch';

/** Catalogue data is public and slow-moving, so it survives navigation. A
 *  missing partner token is a deployment state, not a transient failure —
 *  retrying it just burns requests to get the same answer. */
const shared = {
  staleTime: 30 * 60 * 1000,
  gcTime: 60 * 60 * 1000,
  retry: (failureCount: number, error: unknown) =>
    !(error instanceof JustWatchNotConfiguredError) && failureCount < 2,
} as const;

export function useJustWatchSearch(query: string, locale: string, objectType: ObjectType) {
  const trimmed = query.trim();

  return useQuery({
    queryKey: ['justwatch', 'search', locale, objectType, trimmed],
    queryFn: () => searchTitles(trimmed, locale, objectType),
    enabled: trimmed.length >= 2,
    ...shared,
    staleTime: 10 * 60 * 1000,
  });
}

export function useJustWatchOffers(
  id: string | number | null,
  locale: string,
  objectType: ObjectType,
) {
  return useQuery({
    queryKey: ['justwatch', 'offers', locale, objectType, id],
    queryFn: () => fetchTitleOffers(String(id), locale, objectType),
    enabled: id != null && id !== '',
    ...shared,
  });
}

export function useJustWatchProviders(locale: string) {
  return useQuery({
    queryKey: ['justwatch', 'providers', locale],
    queryFn: () => fetchProviders(locale),
    ...shared,
    staleTime: 24 * 60 * 60 * 1000,
  });
}

export { JustWatchNotConfiguredError };
