import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import type { KeywordFilter } from '@/lib/api/dehub/keyword-filters';

export const KEYWORD_FILTERS_QUERY_KEY = ['keyword-filters'] as const;
const NO_FILTERS: KeywordFilter[] = [];

/**
 * The signed-in viewer's keyword filters. One cached list for every card on
 * the page; the settings section invalidates it after each change.
 */
export function useKeywordFilters(): KeywordFilter[] {
  const { isAuthenticated } = useAuth();
  const { data } = useQuery({
    queryKey: KEYWORD_FILTERS_QUERY_KEY,
    queryFn: async () => (await import('@/lib/api/dehub/keyword-filters')).getKeywordFilters(),
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
  return isAuthenticated && data ? data : NO_FILTERS;
}
