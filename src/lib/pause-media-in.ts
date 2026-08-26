/**
 * Pausing media inside a hidden subtree
 * =====================================
 * `PersistentPageCache` mounts every visited page once and keeps it mounted
 * forever, hiding the inactive ones with `visibility: hidden` (plus
 * `content-visibility: hidden`, `height: 0`).
 *
 * None of that pauses a `<video>` or `<audio>`. Only *removal from the
 * document* does — per the HTML spec's "removed from a Document" steps — and a
 * cached page is never removed. So a clip playing on a page the user navigated
 * away from carried on with full audio, invisible, with no player left on
 * screen to stop it from. The shorts viewer was the clearest case: its
 * `VideoSlide` pauses on `isActive` flipping false, and nothing flipped it,
 * because nothing unmounted.
 *
 * These two functions are the whole fix, kept out of the component so they can
 * be tested against a real DOM without standing up the router and ~30 lazy
 * pages.
 */

/**
 * Pause every playing media element inside `root` and return the ones actually
 * stopped, in document order, ready to hand back to {@link resumeMedia}.
 *
 * A picture-in-picture video is skipped: it is the one element in a hidden
 * subtree that is genuinely still on screen, in its own always-on-top window,
 * so the user can both see it and stop it themselves.
 */
export function pauseMediaIn(root: ParentNode): HTMLMediaElement[] {
  const paused: HTMLMediaElement[] = [];
  root.querySelectorAll<HTMLMediaElement>('video, audio').forEach((el) => {
    if (el === document.pictureInPictureElement) return;
    if (el.paused) return;
    paused.push(el);
    el.pause();
  });
  return paused;
}

/**
 * Resume exactly the elements {@link pauseMediaIn} stopped.
 *
 * Without this, returning to a feed would leave a wall of dead-looking players
 * each needing a tap. The navigation that brought the user back is a user
 * gesture, so autoplay policy permits the `play()`; elements torn down in the
 * meantime are skipped, and a rejection is not worth surfacing.
 */
export function resumeMedia(els: readonly HTMLMediaElement[]): void {
  els.forEach((el) => {
    if (el.isConnected) el.play().catch(() => {});
  });
}
