/**
 * FullscreenImageViewer, mounted only once someone has actually opened it.
 *
 * All four callers render the viewer unconditionally and let `isOpen` drive its
 * `AnimatePresence`, which is the usual reason a modal ends up statically
 * reachable from `src/main.tsx`: the feed cards are on the first-paint path, so
 * the viewer, its translation sheet and the embla carousel under it were parsed
 * before anything painted, for every visitor, whether or not a photo was ever
 * tapped. See `scripts/boot-path-report.mjs`.
 *
 * `openedOnce` is what makes that safe to lazy-load: the viewer mounts on the
 * first open and STAYS mounted, so `isOpen` going false still runs the exit
 * animation rather than yanking the element out mid-fade.
 */
import { lazy, Suspense, useEffect, useState } from 'react';
import type { FullscreenImageViewerProps } from './FullscreenImageViewer';

const FullscreenImageViewer = lazy(() =>
  import('./FullscreenImageViewer').then((m) => ({ default: m.FullscreenImageViewer })),
);

export function FullscreenImageViewerLazy(props: FullscreenImageViewerProps) {
  const [openedOnce, setOpenedOnce] = useState(props.isOpen);

  useEffect(() => {
    if (props.isOpen) setOpenedOnce(true);
  }, [props.isOpen]);

  if (!openedOnce) return null;

  return (
    <Suspense fallback={null}>
      <FullscreenImageViewer {...props} />
    </Suspense>
  );
}
