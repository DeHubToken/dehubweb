import { useQuery } from '@tanstack/react-query';
import { useDebouncedValue } from '@/hooks/use-debounced-value';

/**
 * Searches a chart's whole zone, not only the entries the chart holds:
 * waits for typing to pause, then asks `fetch` for up to a page of matches.
 */
export function useChartSearch<T>(zone: string, search: string, fetch: (query: string) => Promise<T[]>) {
  const query = useDebouncedValue(search.trim(), 300);
  const result = useQuery({
    queryKey: ['chart-search', zone, query],
    queryFn: () => fetch(query),
    enabled: query.length >= 2,
    staleTime: 60_000,
  });
  return {
    items: query.length >= 2 ? result.data ?? [] : [],
    isSearching: search.trim().length >= 2 && (search.trim() !== query || result.isFetching),
  };
}
