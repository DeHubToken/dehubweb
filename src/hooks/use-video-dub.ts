/**
 * Dubbed audio for a video post.
 *
 * A dub is a row in `video_dubs` — one per transcript and language — whose
 * `audio_url` is an AAC track the worker rendered in the speaker's cloned
 * voice. Reading is a row lookup; asking for one calls `auto-dub`, which
 * queues the job. The sweeper fills the common languages ahead of time, so
 * most viewers find the row already `ready`.
 *
 * `useDubbedAudio` is the playback half: it plays the track through a hidden
 * <audio> glued to the <video>'s clock, with the video's own sound turned
 * down. The video element keeps owning play/pause/mute/seek — nothing in the
 * player has to know a dub is running.
 */
import { useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

/** Languages the synthesiser speaks. Mirrors `DUB_LANGS` in the function. */
export const DUB_LANGS = [
  'en', 'es', 'pt', 'fr', 'de', 'it', 'pl', 'tr', 'ru', 'nl', 'cs', 'ar', 'zh', 'ja', 'hu', 'ko', 'hi',
] as const;

export function dubLangFor(pickerCode: string | null | undefined): string | null {
  const base = (pickerCode ?? '').toLowerCase().split('-')[0];
  return (DUB_LANGS as readonly string[]).includes(base) ? base : null;
}

export type DubStatus = 'pending' | 'processing' | 'ready' | 'failed';

export interface DubRecord {
  status: DubStatus;
  audio_url: string | null;
  error: string | null;
  attempts: number;
  updated_at: string | null;
}

/**
 * How long a row may sit `pending` or `processing` before the player stops
 * believing in it. The worker answers in well under a minute once it holds
 * the job, so anything past this is a queue with nothing on the far end —
 * and without a ceiling the player spins a "Preparing…" hint forever and
 * re-polls every five seconds for as long as the page is open.
 */
const STALL_MS = 10 * 60_000;

function isStalled(row: DubRecord | null): boolean {
  if (!row || (row.status !== 'pending' && row.status !== 'processing')) return false;
  const touched = row.updated_at ? Date.parse(row.updated_at) : NaN;
  return Number.isFinite(touched) && Date.now() - touched > STALL_MS;
}

// `video_dubs` is newer than the generated Database types.
const db = supabase as unknown as SupabaseClient;

export function useVideoDub(transcriptId: string | null, lang: string | null, enabled: boolean) {
  const qc = useQueryClient();
  const wanted = enabled && !!transcriptId && !!lang;
  const key = ['video-dub', transcriptId, lang] as const;

  const query = useQuery<DubRecord | null>({
    queryKey: key,
    enabled: wanted,
    staleTime: 60 * 60_000,
    refetchInterval: (q) => {
      const row = q.state.data as DubRecord | null;
      const s = row?.status;
      if (s !== 'pending' && s !== 'processing') return false;
      return isStalled(row) ? false : 5000;
    },
    queryFn: async () => {
      const { data, error } = await db
        .from('video_dubs')
        .select('status, audio_url, error, attempts, updated_at')
        .eq('transcript_id', transcriptId!)
        .eq('language', lang!)
        .maybeSingle();
      if (error) throw error;
      return (data as DubRecord | null) ?? null;
    },
  });

  const request = useCallback(async () => {
    if (!wanted) return;
    const { error } = await supabase.functions.invoke('auto-dub', {
      body: { action: 'request', transcriptId, lang },
    });
    if (error) throw error;
    qc.invalidateQueries({ queryKey: key });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, transcriptId, lang, qc]);

  return {
    dub: query.data ?? null,
    isLoading: query.isLoading,
    request,
    stalled: isStalled(query.data ?? null),
  };
}

/**
 * Play `url` in lockstep with the video. Pass null to stop.
 *
 * The video's volume goes to zero rather than `muted`, so the player's mute
 * button keeps meaning what it says: we mirror `muted` onto the track and
 * leave `volume` as our own switch, restored on the way out.
 */
export function useDubbedAudio(videoRef: React.RefObject<HTMLVideoElement>, url: string | null) {
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !url) return;

    const a = new Audio(url);
    a.preload = 'auto';
    a.muted = v.muted;
    a.playbackRate = v.playbackRate;
    const prevVolume = v.volume;
    v.volume = 0;

    const align = () => {
      if (Math.abs(a.currentTime - v.currentTime) > 0.2) a.currentTime = v.currentTime;
    };
    const onPlay = () => { align(); a.play().catch(() => undefined); };
    const onPause = () => a.pause();
    const onRate = () => { a.playbackRate = v.playbackRate; };
    const onVolume = () => { a.muted = v.muted; };

    v.addEventListener('play', onPlay);
    v.addEventListener('playing', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('seeked', align);
    v.addEventListener('ratechange', onRate);
    v.addEventListener('volumechange', onVolume);
    const tick = window.setInterval(() => { if (!v.paused) align(); }, 1000);
    if (!v.paused) onPlay();

    return () => {
      window.clearInterval(tick);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('playing', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('seeked', align);
      v.removeEventListener('ratechange', onRate);
      v.removeEventListener('volumechange', onVolume);
      a.pause();
      a.removeAttribute('src');
      a.load();
      v.volume = prevVolume;
    };
  }, [videoRef, url]);
}
