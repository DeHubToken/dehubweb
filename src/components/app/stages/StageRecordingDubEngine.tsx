import { useCallback, useEffect, useRef } from 'react';
import { useTranscript, useTranscriptTranslation } from '@/hooks/use-transcript';
import { getStageRecordingElement, getStagePlaybackState, pauseStageRecording, resumeStageRecording, useStagePlayback } from '@/lib/stage-playback';
import { setStageRecordingDubStatus, useStageRecordingLanguage } from '@/lib/stage-recording-language';
import { StageReplayDub } from '../spaces/StageReplayDub';

/** One engine stays mounted with the shared player, including while its UI is closed. */
export function StageRecordingDubEngine() {
  const playback = useStagePlayback();
  const { language } = useStageRecordingLanguage(playback.spaceId);
  const wanted = !!playback.spaceId && language !== 'original';
  const { transcript } = useTranscript('stage', playback.spaceId, wanted);
  const dubLanguage = wanted && language !== transcript?.source_lang ? language : null;
  const translation = useTranscriptTranslation(transcript?.id ?? null, language, !!dubLanguage && transcript?.status === 'ready');
  const requested = useRef(new Set<string>());
  useEffect(() => {
    if (!dubLanguage || !transcript || transcript.status !== 'ready' || translation.isLoading || translation.isError || translation.translation) return;
    const key = `${transcript.id}:${language}`;
    if (requested.current.has(key)) return;
    requested.current.add(key);
    void translation.request().catch(() => { if (playback.spaceId) setStageRecordingDubStatus(playback.spaceId, language, 'failed'); });
  }, [dubLanguage, transcript, language, translation.isLoading, translation.isError, translation.translation, translation.request, playback.spaceId]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  audioRef.current = getStageRecordingElement();
  const waiting = useRef<string | null>(null);
  const onReady = useCallback((ready: boolean, failed = false) => {
    const id = playback.spaceId;
    if (!id) return;
    const current = getStagePlaybackState();
    setStageRecordingDubStatus(id, language, language === 'original' ? 'original' : ready ? 'ready' : failed || translation.translation?.status === 'failed' || translation.isError ? 'failed' : 'preparing');
    if (!ready && !current.paused) { waiting.current = id; pauseStageRecording(); }
    if (ready && waiting.current === id && !current.loading) { waiting.current = null; resumeStageRecording(); }
  }, [playback.spaceId, playback.loading, language, translation.translation?.status, translation.isError]);
  if (!playback.spaceId) return null;
  return <div hidden><StageReplayDub audioRef={audioRef} transcriptId={transcript?.id ?? ''} language={dubLanguage}
    segments={translation.translation?.status === 'ready' ? translation.translation.segments : null} onReady={onReady} /></div>;
}
