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
 * These functions are the whole fix, kept out of the component so they can be
 * tested against a real DOM without standing up the router and ~30 lazy pages.
 */

/**
 * Players whose media element never enters the document, against a node that
 * does. An audio post plays through a bare `new Audio()` wired into the shared
 * Web Audio graph — the canvas is what goes on screen — so the sweep below
 * could not see it and a track started in the feed survived every navigation.
 *
 * The anchor is read lazily because it is a React ref: the element is often
 * built before the node it belongs to has rendered.
 */
const offDocument = new Map<HTMLMediaElement, () => Node | null>();

/**
 * Advertise `el` as belonging to whichever page contains `anchor`. Returns the
 * unregistration — call it when the element is handed to another owner (the
 * corner player, meant to survive navigation) or torn down.
 */
export function registerOffDocumentMedia(
  el: HTMLMediaElement,
  anchor: () => Node | null,
): () => void {
  offDocument.set(el, anchor);
  return () => {
    offDocument.delete(el);
  };
}

/** The registered elements currently anchored inside `root`. */
function offDocumentIn(root: Node): HTMLMediaElement[] {
  const found: HTMLMediaElement[] = [];
  offDocument.forEach((anchorOf, el) => {
    const anchor = anchorOf();
    if (anchor && root.contains(anchor)) found.push(el);
  });
  return found;
}

function pauseAll(els: readonly HTMLMediaElement[]): HTMLMediaElement[] {
  const paused: HTMLMediaElement[] = [];
  els.forEach((el) => {
    if (el === document.pictureInPictureElement) return;
    if (el.paused) return;
    paused.push(el);
    el.pause();
  });
  return paused;
}

/**
 * Pause every playing media element inside `root` and return the ones actually
 * stopped, in document order, ready to hand back to {@link resumeMedia}.
 *
 * A picture-in-picture video is skipped: it is the one element in a hidden
 * subtree that is genuinely still on screen, in its own always-on-top window,
 * so the user can both see it and stop it themselves.
 */
export function pauseMediaIn(root: Element): HTMLMediaElement[] {
  const inDocument = Array.from(root.querySelectorAll<HTMLMediaElement>('video, audio'));
  return pauseAll([...inDocument, ...offDocumentIn(root)]);
}

/**
 * Pause only the off-document players inside `root`, leaving its `<video>` and
 * `<audio>` tags alone.
 *
 * For the post overlay, where home stays deliberately visible under the open
 * post: a track playing in the feed behind it is as unreachable as on a hidden
 * page, but a `<video>` must not be touched — opening a post hands that element
 * itself up to the post page (lib/video-handoff), and pausing it here would
 * stop the clip the user just opened. Off-document players have no hand-off.
 */
export function pauseOffDocumentMediaIn(root: Element): HTMLMediaElement[] {
  return pauseAll(offDocumentIn(root));
}

/**
 * Resume exactly the elements {@link pauseMediaIn} stopped.
 *
 * Without this, returning to a feed would leave a wall of dead-looking players
 * each needing a tap. The navigation that brought the user back is a user
 * gesture, so autoplay policy permits the `play()`; a rejection is not worth
 * surfacing. `isConnected` skips an element torn down in the meantime — an
 * off-document one is never connected, so there it is the registration, dropped
 * on teardown and on hand-over, that says it is still worth resuming.
 */
export function resumeMedia(els: readonly HTMLMediaElement[]): void {
  els.forEach((el) => {
    if (el.isConnected || offDocument.has(el)) el.play().catch(() => {});
  });
}
