/**
 * PPV Purchase Count Hook
 * =======================
 * Fetches the number of purchases for a given PPV token.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function usePPVPurchaseCount(tokenId: string | undefined) {
  return useQuery({
    queryKey: ['ppv-purchase-count', tokenId],
    enabled: !!tokenId,
    staleTime: 60_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('ppv_purchases' as any)
        .select('*', { count: 'exact', head: true })
        .eq('token_id', tokenId!);
      if (error) throw error;
      return count ?? 0;
    },
  });
}
