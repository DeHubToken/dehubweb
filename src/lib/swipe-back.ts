export function completesSwipeBack(distance: number, vertical: number, velocity: number, minDistance = 64): boolean {
  return Math.abs(vertical) <= Math.max(32, minDistance / 2) && distance > Math.abs(vertical) * 2 &&
    (distance >= minDistance || (distance >= 28 && velocity >= 650));
}

/** The leading strip where a drag always means back (the original edge swipe). */
export const SWIPE_BACK_EDGE = 28;
/** Further in, the page is dragged rather than its edge, so it asks for a longer pull. */
export const SWIPE_BACK_PAGE_DISTANCE = 88;

const OWNS_INPUT = 'input,textarea,select,[contenteditable="true"],[role="slider"],[data-swipe-back-ignore]';
// Media, carousels and anything that already swipes sideways keep the drag;
// only the edge strip goes back from on top of them.
const OWNS_SIDEWAYS = 'img,video,canvas,iframe,[data-no-swipe],[data-tab-swipe],[draggable="true"]';

/**
 * Whether a drag that starts away from the edge, on `target`, may go back.
 * Plain page surfaces (text, headers, empty space) can; a sideways scroller
 * that can still scroll toward the start, or an element that handles its own
 * horizontal touches, cannot.
 */
export function pageSwipeAllowed(target: Element | null): boolean {
  if (!target || target.closest(`${OWNS_INPUT},${OWNS_SIDEWAYS}`)) return false;
  const selection = typeof window.getSelection === 'function' ? window.getSelection() : null;
  if (selection && !selection.isCollapsed && selection.toString().trim()) return false;
  for (let node: Element | null = target; node && node !== document.body; node = node.parentElement) {
    const style = getComputedStyle(node);
    const touch = style.touchAction || '';
    if (touch === 'none' || (touch.includes('pan-y') && !touch.includes('pan-x'))) return false;
    if ((style.overflowX === 'auto' || style.overflowX === 'scroll') && node.scrollWidth > node.clientWidth + 1) {
      // Dragging right scrolls back toward the start; only once there is nothing left does back take over.
      if (Math.abs(node.scrollLeft) > 1) return false;
    }
  }
  return true;
}
/** Use the visible back control, including local actions that have no URL. */
export function findSwipeBackControl(target: Element | null, overlayOpen: boolean): HTMLElement | null {
  const dialog = target?.closest('[role="dialog"],[role="alertdialog"]');
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"],[role="alertdialog"]'))
    .filter(element => element.getClientRects().length && !element.closest('[inert],[aria-hidden="true"]') && element.dataset.state !== 'closed');
  const scope = overlayOpen ? dialogs[dialogs.length - 1] ?? document : dialog ?? document;
  const candidates = Array.from(scope.querySelectorAll<HTMLElement>('[data-swipe-back]')).filter(control => {
    if (control.matches(':disabled,[aria-disabled="true"]') || control.closest('[inert],[aria-hidden="true"]')) return false;
    if (overlayOpen && !control.closest('[role="dialog"],[role="alertdialog"]')) return false;
    if (!control.getClientRects().length) return false;
    for (let parent: Element | null = control; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') return false;
    }
    return true;
  });
  return candidates[candidates.length - 1] ?? null;
}
