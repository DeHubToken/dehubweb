import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}
export interface TranscriptRow {
  token_id: number;
  status: 'absent' | 'pending' | 'processing' | 'ready' | 'failed';
  transcript: { segments: TranscriptSegment[]; full_text: string } | null;
  duration_seconds: number | null;
  chunks_total: number;
  chunks_done: number;
  error: string | null;
}

async function callTranscribe(tokenId: number, action: 'status' | 'start'): Promise<TranscriptRow> {
  const { data, error } = await supabase.functions.invoke('transcribe-video', {
    body: { tokenId, action },
  });
  if (error) throw error;
  return data as TranscriptRow;
}

export function useVideoTranscript(tokenId: number | null, enabled = true) {
  const qc = useQueryClient();
  const key = ['video-transcript', tokenId];

  const query = useQuery<TranscriptRow>({
    queryKey: key,
    queryFn: () => callTranscribe(tokenId!, 'status'),
    enabled: !!tokenId && enabled,
    refetchInterval: (q) => {
      const s = (q.state.data as TranscriptRow | undefined)?.status;
      return s === 'processing' || s === 'pending' ? 3000 : false;
    },
    staleTime: 30_000,
  });

  const start = useMutation({
    mutationFn: () => callTranscribe(tokenId!, 'start'),
    onSuccess: (row) => qc.setQueryData(key, row),
  });

  return { ...query, start };
}
