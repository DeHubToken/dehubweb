/**
 * Hold the page still while something is over it, and let go safely.
 * =================================================================
 *
 * There is one `body.style.overflow` and this app has a dozen things that want
 * it, so the slot was being fought over by two incompatible habits:
 *
 *  - **capture and restore** — read the old value, set `hidden`, put the old
 *    value back on close (the game launchers, the creator results feed, the
 *    assistant page).
 *  - **blind reset** — set `hidden`, write `''` on close (the fullscreen image
 *    viewer, the shorts viewer, the story viewer, the docs layout).
 *
 * Nest one inside the other and it comes apart. Open the shorts viewer, open a
 * story from it, close the story: the story writes `''` and the shorts viewer
 * is still open with the page now scrolling behind it. Do it the other way and
 * the capture-and-restore one saves `hidden` as "the old value" and writes it
 * back forever, which is the leak that leaves a page permanently unscrollable
 * and the reason `scroll-freeze-watchdog` exists.
 *
 * A count fixes both. The first acquire remembers what was there and sets the
 * lock; the last release puts the original back. Anything in between changes
 * nothing, which is exactly what nesting should do.
 *
 * Note this is deliberately NOT what vaul's `usePositionFixed` does, and the
 * drawer keeps `noBodyStyles` for the reasons written there: `position: fixed`
 * plus `height: auto` on a body scroller throws the reader's place away and
 * cannot put it back. This only ever touches `overflow`.
 */

let depth = 0;
/** What `body.style.overflow` was before the first lock. Restored by the last release. */
let original: string | null = null;

/**
 * Take a lock. Returns the matching release, which is safe to call twice —
 * a component that releases in both an effect cleanup and an unmount handler
 * must not decrement the count twice, or a sibling lock is dropped early.
 */
export function lockBodyScroll(): () => void {
  if (typeof document === 'undefined') return () => {};

  if (depth === 0) {
    original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  depth++;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    depth = Math.max(0, depth - 1);
    if (depth === 0) {
      // Back to whatever it was, which is usually '' but is not always: a
      // surface that legitimately set its own value should get it back.
      document.body.style.overflow = original ?? '';
      original = null;
    }
  };
}

/** How many locks are held. For tests and for the freeze watchdog's reporting. */
export function bodyScrollLockDepth(): number {
  return depth;
}
