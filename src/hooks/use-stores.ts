/**
 * Own listings
 * ============
 * The listings a creator already has, for the Shop on posts and lives. The
 * Stores pages are gone; listings made there still show and check out.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { useAuth } from '@/contexts/AuthContext';

export function useMyListings() {
  const { walletAddress } = useAuth();
  return useQuery({
    queryKey: ['my-store-listings', walletAddress],
    queryFn: async () => {
      const { data, error } = await withWalletHeader(
        supabase.from('store_listings').select('*').eq('wallet_address', walletAddress!.toLowerCase()).order('created_at', { ascending: false }),
        walletAddress!
      );
      if (error) throw error;
      return data || [];
    },
    enabled: !!walletAddress,
  });
}
