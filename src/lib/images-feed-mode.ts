/**
 * Images feed view mode
 * =====================
 * The images tab has two views: the collage grid, and — after tapping a tile —
 * an endless scroll feed starting at that post. While the scroll view is up the
 * nav pill's left slot turns into a back arrow, exactly like it does for a post
 * overlay opened from the home feed, so leaving a feed always uses the same
 * top-left affordance.
 *
 * A module-level store rather than a one-off event: the collapsed-desktop
 * `GlobalFeedNav` mounts and unmounts with the sidebar, so a fresh mount has to
 * be able to READ the current mode instead of waiting for the next change.
 * HomePage owns the state and is the only writer; the nav asks to go back by
 * dispatching the event below.
 */

import { useSyncExternalStore } from 'react';

let inScrollView = false;
const subscribers = new Set<() => void>();

/** Called by HomePage whenever the images tab enters/leaves the scroll view. */
export function setImagesFeedScrollView(next: boolean) {
  if (inScrollView === next) return;
  inScrollView = next;
  subscribers.forEach((cb) => cb());
}

function subscribe(cb: () => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

const getSnapshot = () => inScrollView;
const getServerSnapshot = () => false;

/** True while the images tab is showing the endless scroll view, not the grid. */
export function useImagesFeedScrollView(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export const IMAGES_BACK_TO_COLLAGE_EVENT = 'images-back-to-collage';

/** Ask HomePage to return the images tab to its collage grid. */
export function requestImagesBackToCollage() {
  window.dispatchEvent(new CustomEvent(IMAGES_BACK_TO_COLLAGE_EVENT));
}
