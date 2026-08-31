/**
 * "Did the user really click off this sheet?"
 * ===========================================
 * Radix dismisses a modal surface when a pointer goes down *outside* its own
 * content node. Outside is decided by DOM containment, and every overlay in
 * this app portals to `document.body` — so a sheet opened FROM another sheet
 * is, by that test, outside the one it belongs to. Clicking the stream-title
 * field in the Go Live sheet is a pointer-down outside the composer; picking a
 * category in a Select is a pointer-down outside whatever sheet the Select is
 * in; tapping a toast action is outside all of them.
 *
 * Radix has a second guard that usually saves this — a layer only reacts if it
 * is at or above the highest layer that disabled outside pointer events, so a
 * nested sheet normally shields its parent. "Usually" is the problem: that test
 * is an *ordering* test over a `Set` of live DOM nodes. Any remount of an
 * already-open surface (the composer re-rendering when live mode is picked, a
 * portal container changing, a layer registering while another is unmounting)
 * re-inserts it at the end of the set, it becomes the highest disabling layer,
 * and from that moment every click inside the sheet stacked on top of it reads
 * as a click off it. That is the intermittent "I clicked the title field and it
 * closed the whole composer" — the interaction is identical each time, only the
 * registration order differs.
 *
 * So do not rely on the ordering. A pointer landing inside an overlay's own
 * content is never the user clicking off a different overlay, whatever order
 * the layers registered in — assert that directly and let the ordering test be
 * a bonus rather than the only thing between a creator and a lost draft.
 *
 * Scrims are deliberately NOT in the list below: clicking a backdrop is exactly
 * how you dismiss a sheet, and it must keep working.
 */

/**
 * Overlay *content* surfaces, by the attributes their libraries already emit:
 * every vaul sheet, every Radix dialog / sheet / alert-dialog, everything on a
 * popper (Popover, Select, Tooltip, DropdownMenu), and sonner's toaster. A
 * hand-rolled overlay that portals to `body` can join in with
 * `data-overlay-content`.
 */
const OVERLAY_CONTENT_SELECTOR = [
  '[data-vaul-drawer]',
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[data-radix-popper-content-wrapper]',
  '[data-radix-menu-content]',
  '[data-sonner-toaster]',
  '[data-overlay-content]',
].join(',');

/** The overlay content surface this node sits in, if any. */
export function findOverlayContent(target: EventTarget | null): Element | null {
  if (!target || !(target instanceof Element)) return null;
  return target.closest(OVERLAY_CONTENT_SELECTOR);
}

/** Is this interaction physically inside some overlay's own content? */
export function isInteractionInsideOverlay(target: EventTarget | null): boolean {
  return findOverlayContent(target) !== null;
}

/** The shape of Radix's outside-interaction events, narrowed to what we touch. */
type OutsideEvent = { target: EventTarget | null; preventDefault: () => void };

/**
 * Wrap a content's `onPointerDownOutside` (or `onInteractOutside`) so an
 * interaction inside another overlay cannot dismiss it. Runs the call site's
 * own handler first, exactly as composing with Radix would.
 */
export function guardOutsideDismiss<E extends OutsideEvent>(
  handler?: (event: E) => void,
): (event: E) => void {
  return (event) => {
    handler?.(event);
    if (isInteractionInsideOverlay(event.target)) event.preventDefault();
  };
}
