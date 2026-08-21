/**
 * AudioSpacesModal — the gate in front of the Stages sheet.
 *
 * The app shell mounts this on every page, signed in or not, so whatever it
 * reaches statically is downloaded and parsed before anything paints. The sheet
 * itself is ~250 KB of transcripts, soundboard, radio, TTS, captions, dubbing
 * and screen share that a visitor reading the feed never opens, so it lives
 * behind `React.lazy` in `AudioSpacesModalBody` and this file stays small.
 *
 * The body is mounted whenever the sheet is open **or** a stage is running.
 * That second condition is the load-bearing one: minimising calls `closeModal`
 * and leaves `currentSpace` set, so gating on `isModalOpen` alone would tear
 * down a live room's UI the moment it was minimised. `guestSpace` is the
 * signed-out half of the same thing.
 *
 * @module components/app/spaces/AudioSpacesModal
 */

import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useStage } from '@/contexts/StageContext';

const AudioSpacesModalBody = lazy(() => import('./AudioSpacesModalBody'));

/** Events that mean a real person is here, rather than a crawler or a bounce. */
const INTENT_EVENTS = ['pointerdown', 'keydown', 'touchstart'] as const;

/**
 * Fetch the sheet once the visitor touches the page at all, so opening Stages
 * is instant without the chunk sitting in front of first paint. Deliberately
 * not on a plain timer: a crawler, or a tab that bounces, should never pay for
 * a sheet nobody was going to open.
 */
function useWarmSheetOnFirstInput() {
  const warmed = useRef(false);

  useEffect(() => {
    const idle = (cb: () => void) =>
      'requestIdleCallback' in window ? requestIdleCallback(cb) : setTimeout(cb, 2000);

    const stop = () => {
      for (const type of INTENT_EVENTS) window.removeEventListener(type, warm);
    };

    function warm() {
      if (warmed.current) return;
      warmed.current = true;
      stop();
      // Idle so the chunk never competes with the interaction that asked for it.
      idle(() => {
        import('./AudioSpacesModalBody').catch(() => {});
      });
    }

    for (const type of INTENT_EVENTS) {
      window.addEventListener(type, warm, { passive: true });
    }
    return stop;
  }, []);
}

export function AudioSpacesModal() {
  const { isModalOpen, currentSpace, guestSpace } = useStage();
  useWarmSheetOnFirstInput();

  const needed = isModalOpen || !!currentSpace || !!guestSpace;

  // Once the sheet has been mounted, keep it mounted for the rest of the
  // session. Unmounting would throw away the browse list and the create form
  // for no gain — by then the chunk is downloaded and parsed, which is the only
  // cost this file exists to avoid.
  const [everNeeded, setEverNeeded] = useState(needed);
  useEffect(() => {
    if (needed) setEverNeeded(true);
  }, [needed]);

  if (!everNeeded) return null;

  return (
    <Suspense fallback={null}>
      <AudioSpacesModalBody />
    </Suspense>
  );
}

export default AudioSpacesModal;
