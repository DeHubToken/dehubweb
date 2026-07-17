import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { TranscriptSegment } from './use-video-transcript';

interface TranslateResponse {
  segments: TranscriptSegment[];
  cached: boolean;
}

export function useTranslatedSegments(
  tokenId: number | null,
  lang: string,
  enabled: boolean,
) {
  return useQuery<TranscriptSegment[]>({
    queryKey: ['video-subs-translation', tokenId, lang],
    enabled: !!tokenId && enabled && !!lang && lang !== 'original',
    staleTime: 1000 * 60 * 60,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('translate-transcript', {
        body: { tokenId, lang },
      });
      if (error) throw error;
      return (data as TranslateResponse).segments ?? [];
    },
  });
}
