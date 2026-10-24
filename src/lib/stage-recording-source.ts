import { supabase } from '@/integrations/supabase/client';

const copies = new Map<string, Promise<string>>();
export function playableStageRecording(stageId: string, url: string): Promise<string> {
  if (!/\.(webm|aac)(?:[?#]|$)/i.test(url)) return Promise.resolve(url);
  const key = `${stageId}:${url}`;
  const existing = copies.get(key);
  if (existing) return existing;
  const request = (async () => {
    // Another listener may already have converted the same old URL.
    const { data: stage } = await supabase.from('audio_spaces').select('recording_url').eq('id', stageId).maybeSingle();
    const current = stage?.recording_url;
    if (current && !/\.(webm|aac)(?:[?#]|$)/i.test(current)) return current;
    const { data, error } = await supabase.functions.invoke('finalize-stage-recording', { body: { stageId, transcribe: false } });
    if (error || !data?.ok || !data?.recordingUrl) throw new Error(data?.error || 'Recording conversion failed');
    return data.recordingUrl as string;
  })();
  copies.set(key, request);
  void request.catch(() => { if (copies.get(key) === request) copies.delete(key); });
  return request;
}
