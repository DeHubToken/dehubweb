/**
 * Buttons that answer the first tap, even right after a flick.
 *
 * After a fast swipe, Chrome on Android keeps a fling alive for about half a
 * second, even when touch-action stops it from scrolling anything, and the
 * next touch only cancels that fling: pointerdown and pointerup still arrive,
 * but no click. In the Shorts viewer every swipe is a flick, so Back (and
 * like, share, mute...) needed a second tap or a wait.
 *
 * Inside `root`, a touch that goes down and up on the same button, without
 * moving or being held, presses that button on lift. The browser's own click,
 * if it still comes, is then dropped so nothing fires twice. Mouse, pen and
 * keyboard are untouched.
 */

const BUTTON = 'button, [role="button"]';
/** Further than this and it is a drag, not a tap. */
const TAP_SLOP_PX = 10;
/** Longer than this and it is a hold, which its own handlers own. */
const TAP_MAX_MS = 500;
/** How long the browser's late click for the same press is dropped. */
const LATE_CLICK_MS = 800;

function buttonOf(target: EventTarget | null, root: HTMLElement): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const button = target.closest<HTMLElement>(BUTTON);
  if (!button || !root.contains(button)) return null;
  if ((button as HTMLButtonElement).disabled || button.getAttribute('aria-disabled') === 'true') return null;
  return button;
}

export function installFirstTap(root: HTMLElement): () => void {
  let press: { id: number; x: number; y: number; at: number; button: HTMLElement } | null = null;
  let pressed: { button: HTMLElement; until: number } | null = null;
  let pressing = false;

  const onDown = (e: PointerEvent) => {
    press = null;
    if (e.pointerType !== 'touch' || !e.isPrimary) return;
    const button = buttonOf(e.target, root);
    if (button) press = { id: e.pointerId, x: e.clientX, y: e.clientY, at: performance.now(), button };
  };
  const onMove = (e: PointerEvent) => {
    if (press && e.pointerId === press.id && Math.hypot(e.clientX - press.x, e.clientY - press.y) > TAP_SLOP_PX) press = null;
  };
  const onCancel = (e: PointerEvent) => {
    if (press && e.pointerId === press.id) press = null;
  };
  const onUp = (e: PointerEvent) => {
    const start = press;
    press = null;
    if (!start || e.pointerId !== start.id) return;
    if (performance.now() - start.at > TAP_MAX_MS) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > TAP_SLOP_PX) return;
    if (buttonOf(e.target, root) !== start.button) return;
    pressed = { button: start.button, until: performance.now() + LATE_CLICK_MS };
    pressing = true;
    try { start.button.click(); } finally { pressing = false; }
  };
  const onClick = (e: MouseEvent) => {
    if (pressing || !pressed) return;
    const late = pressed;
    if (performance.now() > late.until) { pressed = null; return; }
    if (!(e.target instanceof Node) || !late.button.contains(e.target)) return;
    pressed = null;
    e.preventDefault();
    e.stopPropagation();
  };

  root.addEventListener('pointerdown', onDown, true);
  root.addEventListener('pointermove', onMove, true);
  root.addEventListener('pointercancel', onCancel, true);
  root.addEventListener('pointerup', onUp, true);
  root.addEventListener('click', onClick, true);
  return () => {
    root.removeEventListener('pointerdown', onDown, true);
    root.removeEventListener('pointermove', onMove, true);
    root.removeEventListener('pointercancel', onCancel, true);
    root.removeEventListener('pointerup', onUp, true);
    root.removeEventListener('click', onClick, true);
  };
}
