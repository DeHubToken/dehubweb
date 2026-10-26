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

/** Stage recordings whose title, description or host matches, most listened first. */
export async function searchStageRecordings(query: string, limit = 20): Promise<AudioSpace[]> {
  // PostgREST reads , ( ) as filter syntax and % * as wildcards.
  const term = query.replace(/[,()%*\\]/g, ' ').trim();
  if (!term) return [];
  const { data, error } = await supabase
    .from('audio_spaces')
    .select('*')
    .eq('status', 'ended')
    .not('recording_url', 'is', null)
    .neq('recording_url', '')
    .or(`title.ilike.%${term}%,description.ilike.%${term}%,host_username.ilike.%${term}%`)
    .order('total_listens', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  return ((data as AudioSpace[]) || []).filter(hasStageRecording);
}
