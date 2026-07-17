
import { useSearchContext } from '@/contexts/SearchContext';

export const useDocsSearch = () => {
  return useSearchContext();
};

export type { SearchResult, SearchIndex } from '@/contexts/SearchContext';
