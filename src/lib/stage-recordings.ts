import { supabase } from '@/integrations/supabase/client';
import type { AudioSpace } from '@/types/audio-spaces.types';

/** Ended rooms without audio are history, not recordings listeners can play. */
export function hasStageRecording(space: Pick<AudioSpace, 'status' | 'recording_url'>): boolean {
  return space.status === 'ended' && !!space.recording_url?.trim();
}

/** Shared by every public replay listing; filter before the twenty-row limit. */
export async function fetchStageRecordings(
  order: 'ended_at' | 'total_listens' = 'ended_at',
): Promise<AudioSpace[]> {
  const { data, error } = await supabase
    .from('audio_spaces')
    .select('*')
    .eq('status', 'ended')
    .not('recording_url', 'is', null)
    .neq('recording_url', '')
    .order(order, { ascending: false, nullsFirst: false })
    .limit(20);
  if (error) throw error;
  return ((data as AudioSpace[]) || []).filter(hasStageRecording);
}
