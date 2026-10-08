/**
 * Renders nothing; runs the on-device dub for one video while mounted. Kept in
 * its own module so the overlay can lazy-load the engine only when a dub is on.
 */
import type { TranscriptSegment } from '@/hooks/use-transcript';
import { useVoiceDub } from '@/hooks/use-voice-dub';
import { useEffect, useState } from 'react';
import { useCachedVideoDub } from '@/hooks/use-cached-video-dub';
import { useCachedDubAudio } from '@/hooks/use-cached-dub-audio';

interface Props {
  videoRef: React.RefObject<HTMLVideoElement>;
  segments: TranscriptSegment[] | null;
  voice: SpeechSynthesisVoice | null;
  onFailed?: () => void;
  transcriptId: string | null;
  language: string | null;
  audible: boolean;
}

export default function VoiceDubEngine({ videoRef, segments, voice, onFailed, transcriptId, language, audible }: Props) {
  const cached = useCachedVideoDub(transcriptId, language, audible && !!segments?.length);
  const [audioFailed, setAudioFailed] = useState(false);
  const [deviceFailed, setDeviceFailed] = useState(false);
  useEffect(() => { setAudioFailed(false); setDeviceFailed(false); }, [transcriptId, language]);
  const url = !audioFailed ? cached?.audioUrl ?? null : null;
  useVoiceDub(videoRef, url || deviceFailed ? null : segments, voice, () => setDeviceFailed(true));
  useCachedDubAudio(videoRef, url, () => setAudioFailed(true));
  useEffect(() => {
    if ((deviceFailed || !voice) && (audioFailed || cached?.status === 'unavailable' || cached?.status === 'failed')) onFailed?.();
  }, [deviceFailed, voice, audioFailed, cached?.status, onFailed]);
  return null;
}
