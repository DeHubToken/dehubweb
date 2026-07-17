/**
 * Hook to fetch tip count for a specific post from tip_records.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function usePostTipCount(tokenId?: string) {
  return useQuery({
    queryKey: ['post-tip-count', tokenId],
    queryFn: async () => {
      if (!tokenId) return 0;
      const { data, error } = await supabase
        .from('tip_records')
        .select('amount')
        .eq('token_id', tokenId);
      if (error) {
        console.warn('[TipCount] Query error:', error);
        return 0;
      }
      return (data || []).reduce((sum, r) => sum + Number(r.amount), 0);
    },
    enabled: !!tokenId,
    staleTime: 30_000,
  });
}
