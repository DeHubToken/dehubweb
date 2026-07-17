/**
 * Floating PiP Overlay
 * ====================
 * Renders all active floating PiP mini-players.
 * Place this at the app root level so players persist across navigation.
 */

import { usePiP } from '@/contexts/PiPContext';
import { FloatingPiPPlayer } from './FloatingPiPPlayer';

export function FloatingPiPOverlay() {
  const { pipChannels, removePiP } = usePiP();

  if (pipChannels.length === 0) return null;

  return (
    <>
      {pipChannels.map((channel, index) => (
        <FloatingPiPPlayer
          key={channel.id}
          channel={channel}
          index={index}
          onClose={removePiP}
        />
      ))}
    </>
  );
}
