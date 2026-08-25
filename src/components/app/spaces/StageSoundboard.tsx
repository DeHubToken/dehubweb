/**
 * StageSoundboard — the shared soundboard, wired to a Stage.
 *
 * Everything visible lives in SoundboardPanel; this only supplies the Stage's
 * own injection path. Clips go into the Agora channel via injectAudio (the
 * same route TTS takes), which is why listeners hear them even when the host
 * is muted or on mobile, where there is no speaker loopback to catch.
 */

import { useCallback } from 'react';
import { useStage } from '@/contexts/StageContext';
import { SoundboardPanel } from '@/components/app/shared/SoundboardPanel';

interface StageSoundboardProps {
  isVisible: boolean;
  onClose: () => void;
}

export function StageSoundboard({ isVisible, onClose }: StageSoundboardProps) {
  const { injectAudio, stopInject } = useStage();

  const playClip = useCallback(
    (blob: Blob, { id, label }: { id: string; label: string }) =>
      injectAudio(blob, {
        kind: 'ai',
        source: 'soundboard',
        label: `Soundboard: ${label || id}`,
        // A sound effect has no words, but a subtitle track that goes silent
        // through an air horn is worse than one that names it.
        caption: `♪ ${label || id}`,
      }),
    [injectAudio]
  );

  return (
    <SoundboardPanel
      isVisible={isVisible}
      onClose={onClose}
      playClip={playClip}
      stopClip={stopInject}
      errorMessage="Could not play on stage — stay connected as host"
    />
  );
}
