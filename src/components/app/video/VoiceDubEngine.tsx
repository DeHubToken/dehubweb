/**
 * Renders nothing; runs the on-device dub for one video while mounted. Kept in
 * its own module so the overlay can lazy-load the engine only when a dub is on.
 */
import type { TranscriptSegment } from '@/hooks/use-transcript';
import { useVoiceDub } from '@/hooks/use-voice-dub';

interface Props {
  videoRef: React.RefObject<HTMLVideoElement>;
  segments: TranscriptSegment[] | null;
  voice: SpeechSynthesisVoice | null;
}

export default function VoiceDubEngine({ videoRef, segments, voice }: Props) {
  useVoiceDub(videoRef, segments, voice);
  return null;
}
