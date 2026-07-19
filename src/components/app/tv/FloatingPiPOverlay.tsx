/**
 * Floating PiP Overlay
 * ====================
 * Renders all active floating PiP mini-players.
 * Place this at the app root level so players persist across navigation.
 */

import { lazy, Suspense } from 'react';
import { usePiP } from '@/contexts/PiPContext';

// Lazy: FloatingPiPPlayer statically imports hls.js (~400 kB raw), and this
// overlay is mounted eagerly from AppLayout — the player chunk only downloads
// when a PiP is actually opened.
const FloatingPiPPlayer = lazy(() =>
  import('./FloatingPiPPlayer').then(m => ({ default: m.FloatingPiPPlayer }))
);

export function FloatingPiPOverlay() {
  const { pipChannels, removePiP } = usePiP();

  if (pipChannels.length === 0) return null;

  return (
    <Suspense fallback={null}>
      {pipChannels.map((channel, index) => (
        <FloatingPiPPlayer
          key={channel.id}
          channel={channel}
          index={index}
          onClose={removePiP}
        />
      ))}
    </Suspense>
  );
}
