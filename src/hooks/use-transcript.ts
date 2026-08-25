/**
 * One transcript hook for every kind of thing DeHub transcribes.
 *
 * Videos and stages each had their own — one polled an edge function every
 * three seconds and got the whole row back each time (segments, WebVTT and
 * every cached translation), the other read a table and subscribed. They now
 * share this: read the row over PostgREST, follow it over realtime, and call
 * the `transcribe` function only to start one.
 */
import { useCallback, useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type TranscriptKind = 'video' | 'stage' | 'live' | 'audio';

/** 'empty' means the run finished and there was nothing said. It is separate
 *  from 'ready' because storing it as ready made it permanent: every
 *  already-done check passed and nothing could re-run it. */
export type TranscriptStatus =
  | 'absent' | 'pending' | 'processing' | 'ready' | 'empty' | 'failed';

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  speaker?: string;
}

export interface TranscriptChapter {
  title: string;
  start: number;
  end: number;
}

export interface TranscriptRecord {
  id: string;
  source_kind: TranscriptKind;
  source_ref: string;
  status: Exclude<TranscriptStatus, 'absent'>;
  source_lang: string | null;
  duration_seconds: number | null;
  segments: TranscriptSegment[];
  full_text: string | null;
  vtt: string | null;
  summary: string | null;
  summary_status: string;
  chapters: TranscriptChapter[];
  speaker_map: Record<string, unknown>;
  speaker_overrides: Record<string, { username?: string }>;
  visibility: 'public' | 'members' | 'private';
  attempts: number;
  error: string | null;
  updated_at: string;
}

const COLUMNS =
  'id, source_kind, source_ref, status, source_lang, duration_seconds, segments, ' +
  'full_text, vtt, summary, summary_status, chapters, speaker_map, speaker_overrides, ' +
  'visibility, attempts, error, updated_at';

export function transcriptKey(kind: TranscriptKind, ref: string | null) {
  return ['transcript', kind, ref] as const;
}

function coerce(row: any): TranscriptRecord {
  return {
    ...row,
    segments: Array.isArray(row?.segments) ? row.segments : [],
    chapters: Array.isArray(row?.chapters) ? row.chapters : [],
    speaker_map: row?.speaker_map ?? {},
    speaker_overrides: row?.speaker_overrides ?? {},
  } as TranscriptRecord;
}

async function readTranscript(kind: TranscriptKind, ref: string): Promise<TranscriptRecord | null> {
  const { data, error } = await supabase
    .from('transcripts')
    .select(COLUMNS)
    .eq('source_kind', kind)
    .eq('source_ref', ref)
    .maybeSingle();
  if (error) throw error;
  return data ? coerce(data) : null;
}

export function useTranscript(
  kind: TranscriptKind,
  ref: string | null,
  enabled = true,
) {
  const qc = useQueryClient();
  const key = transcriptKey(kind, ref);
  const active = !!ref && enabled;

  const query = useQuery<TranscriptRecord | null>({
    queryKey: key,
    queryFn: () => readTranscript(kind, ref!),
    enabled: active,
    // A finished transcript never changes on its own, so there is nothing to
    // re-fetch for. Only an in-flight one is worth a backstop poll, and even
    // that is a safety net behind the realtime subscription below.
    refetchInterval: (q) => {
      const s = (q.state.data as TranscriptRecord | null)?.status;
      return s === 'pending' || s === 'processing' ? 8000 : false;
    },
    staleTime: 5 * 60_000,
  });

  const status: TranscriptStatus = query.data?.status ?? 'absent';
  const inFlight = status === 'pending' || status === 'processing';

  useEffect(() => {
    if (!active || !ref) return;
    if (!inFlight && status !== 'absent') return;

    const channel = supabase
      .channel(`transcript-${kind}-${ref}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transcripts', filter: `source_ref=eq.${ref}` },
        (payload) => {
          const row = payload.new as any;
          if (!row || row.source_kind !== kind) return;
          qc.invalidateQueries({ queryKey: key });
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
    // `key` is derived from kind+ref, which are already dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, kind, ref, inFlight, status, qc]);

  const start = useMutation({
    mutationFn: async (opts: { force?: boolean } = {}) => {
      const { data, error } = await supabase.functions.invoke('transcribe', {
        body: { kind, ref, action: 'start', force: opts?.force === true },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  /** Whether asking again could produce anything different. A run that came
   *  back empty is worth exactly one more try; one that has burned its
   *  attempts is not. */
  const canRetry = useMemo(() => {
    if (!query.data) return true;
    if (query.data.status === 'ready') return false;
    return query.data.attempts < 5;
  }, [query.data]);

  return { ...query, transcript: query.data ?? null, status, inFlight, canRetry, start };
}

/* ───────────────────────────── translations ─────────────────────────────── */

export interface TranslationRecord {
  status: 'processing' | 'ready' | 'failed';
  segments: TranscriptSegment[];
  summary: string | null;
  chapters: TranscriptChapter[];
  error: string | null;
}

export function useTranscriptTranslation(
  transcriptId: string | null,
  language: string,
  enabled: boolean,
) {
  const qc = useQueryClient();
  const wanted = enabled && !!transcriptId && !!language && language !== 'original';
  const key = ['transcript-translation', transcriptId, language] as const;

  const query = useQuery<TranslationRecord | null>({
    queryKey: key,
    enabled: wanted,
    // A translation is immutable once ready; this is the shared cache that
    // makes the second viewer of a language free.
    staleTime: 60 * 60_000,
    refetchInterval: (q) =>
      (q.state.data as TranslationRecord | null)?.status === 'processing' ? 3000 : false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transcript_translations')
        .select('status, segments, summary, chapters, error')
        .eq('transcript_id', transcriptId!)
        .eq('language', language)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        ...data,
        segments: Array.isArray(data.segments) ? data.segments : [],
        chapters: Array.isArray(data.chapters) ? data.chapters : [],
      } as unknown as TranslationRecord;
    },
  });

  const request = useCallback(async () => {
    if (!transcriptId || !wanted) return;
    const { error } = await supabase.functions.invoke('translate-transcript', {
      body: { transcriptId, lang: language },
    });
    if (error) throw error;
    qc.invalidateQueries({ queryKey: key });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcriptId, language, wanted, qc]);

  return { ...query, translation: query.data ?? null, request };
}
