/**
 * Check if a stream tokenId is marked live in Supabase.
 * Used when api.dehub.io /start fails - we store live status in our table.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useStreamLiveStatus(tokenId: string | null) {
  return useQuery({
    queryKey: ['stream-live-status', tokenId],
    queryFn: async () => {
      if (!tokenId) return false;
      const { data, error } = await supabase
        .from('live_stream_sessions')
        .select('token_id')
        .eq('token_id', String(tokenId))
        .maybeSingle();
      if (error) return false;
      return !!data;
    },
    enabled: !!tokenId,
    staleTime: 30 * 1000, // 30s
  });
}
