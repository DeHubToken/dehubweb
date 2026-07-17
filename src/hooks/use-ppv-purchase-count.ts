/**
 * PPV Purchase Count Hook
 * =======================
 * Fetches the number of purchases for a given PPV token from the DeHub backend.
 */

import { useQuery } from '@tanstack/react-query';
import { getPpvSalesCount } from '@/lib/api/dehub';

export function usePPVPurchaseCount(tokenId: string | undefined) {
  return useQuery({
    queryKey: ['ppv-purchase-count', tokenId],
    enabled: !!tokenId,
    staleTime: 60_000,
    queryFn: async () => {
      try {
        const data = await getPpvSalesCount(tokenId!);
        return data.salesCount ?? 0;
      } catch {
        return 0;
      }
    },
    retry: false,
  });
}
