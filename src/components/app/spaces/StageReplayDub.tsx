import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { pickVoice, useSpeechVoices } from '@/hooks/dub-preference';
import { useVoiceDub } from '@/hooks/use-voice-dub';
import { useCachedDubAudio } from '@/hooks/use-cached-dub-audio';
import { useCachedVideoDub } from '@/hooks/use-cached-video-dub';
import type { TranscriptSegment } from '@/hooks/use-transcript';

/** The transcript's language is also the replay's spoken language. */
export function StageReplayDub({ audioRef, transcriptId, language, segments, onReady }: {
  audioRef: React.RefObject<HTMLAudioElement>;
  transcriptId: string;
  language: string | null;
  segments: TranscriptSegment[] | null;
  onReady: (ready: boolean) => void;
}) {
  const { t } = useTranslation();
  const voices = useSpeechVoices();
  const voice = pickVoice(voices, language);
  const cached = useCachedVideoDub(transcriptId, language, !!language && !!segments?.length);
  const [deviceFailed, setDeviceFailed] = useState(false);
  const [audioFailed, setAudioFailed] = useState(false);
  useEffect(() => { setDeviceFailed(false); setAudioFailed(false); }, [transcriptId, language]);
  const url = language && !audioFailed ? cached?.audioUrl ?? null : null;
  useVoiceDub(audioRef, language && !url && !deviceFailed ? segments : null, voice, () => setDeviceFailed(true));
  useCachedDubAudio(audioRef, url, () => setAudioFailed(true));
  const ready = !language || (!!segments?.length && (!!url || (!!voice && !deviceFailed)));
  useEffect(() => {
    onReady(ready);
    if (!ready) audioRef.current?.pause();
  }, [ready, onReady, audioRef]);
  if (!language) return null;
  const failed = (audioFailed || ['failed', 'unavailable', 'too-long'].includes(cached?.status ?? '')) && (!voice || deviceFailed);
  return <p role="status" className="text-xs text-white/60">{t(ready ? 'dub.dubbed' : failed ? 'dub.noVoice' : 'dub.preparing')}</p>;
}
