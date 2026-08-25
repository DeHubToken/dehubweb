/**
 * Video adapter over the shared transcript hook.
 *
 * Kept as its own file because a video is addressed by token id everywhere in
 * the app, and callers should not have to remember that the store keys on
 * `(kind, ref)` strings. Everything else — reading, following, starting — is
 * `use-transcript`.
 */
import {
  useTranscript,
  useTranscriptTranslation,
  type TranscriptRecord,
  type TranscriptSegment,
} from './use-transcript';

export type { TranscriptSegment, TranscriptRecord };

export function useVideoTranscript(tokenId: number | null, enabled = true) {
  return useTranscript('video', tokenId ? String(tokenId) : null, enabled);
}

/** Translated subtitle lines for a video, from the shared translation cache.
 *  A language another viewer already asked for costs a row read. */
export function useTranslatedSegments(
  transcriptId: string | null,
  lang: string,
  enabled: boolean,
) {
  const { translation, request, isFetching } = useTranscriptTranslation(transcriptId, lang, enabled);
  return {
    segments: translation?.status === 'ready' ? translation.segments : null,
    status: translation?.status ?? null,
    isFetching,
    request,
  };
}
