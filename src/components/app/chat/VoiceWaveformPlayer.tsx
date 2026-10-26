/**
 * VoiceWaveformPlayer
 * ====================
 * Chat voice notes (DMs, community, event, live and sidebar chats). Kept as
 * its own name for those callers; it is the shared Stage Strip player.
 */

import { memo } from 'react';
import { VoiceStripPlayer } from '@/components/app/audio/VoiceStripPlayer';

interface VoiceWaveformPlayerProps {
  src: string;
  className?: string;
}

export const VoiceWaveformPlayer = memo(function VoiceWaveformPlayer({ src, className }: VoiceWaveformPlayerProps) {
  return <VoiceStripPlayer src={src} className={className} />;
});
