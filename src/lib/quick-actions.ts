export const QUICK_ACTIONS_HOLD_MS = 650;
export const QUICK_ACTIONS_MOVE_PX = 10;
export const OPEN_BUG_REPORT = 'dehub:report-page-bug';

// Preserve editing, browser link/image actions, media controls and owned gestures.
const RESERVED = 'button:disabled,a,input,textarea,select,option,[contenteditable]:not([contenteditable="false"]),[role="slider"],[role="menu"],[data-no-quick-actions],[data-quick-actions-ui],[data-media-control],[data-video-control],video,audio,canvas,iframe,img,[draggable="true"]';

export function canOpenQuickActions(target: EventTarget | null) {
  return target instanceof Element && !target.closest(RESERVED);
}

export function installQuickActions(open: () => void, enabled: () => boolean) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let start: { id: number; x: number; y: number } | null = null;
  let fired = false;
  let suppressClickUntil = 0;
  const cancel = () => { clearTimeout(timer); timer = undefined; start = null; };
  const down = (event: PointerEvent) => {
    const alreadyTracking = !!start;
    cancel();
    fired = false;
    if (alreadyTracking || !event.isPrimary || event.button !== 0 || !enabled() || event.defaultPrevented || !canOpenQuickActions(event.target)) return;
    start = { id: event.pointerId, x: event.clientX, y: event.clientY };
    timer = setTimeout(() => {
      if (!start || !enabled() || window.getSelection()?.toString()) return cancel();
      fired = true;
      suppressClickUntil = Date.now() + 1500;
      open();
    }, QUICK_ACTIONS_HOLD_MS);
  };
  const move = (event: PointerEvent) => {
    if (start && (event.pointerId !== start.id || Math.hypot(event.clientX - start.x, event.clientY - start.y) > QUICK_ACTIONS_MOVE_PX)) cancel();
  };
  const up = (event: PointerEvent) => {
    if (fired) { event.preventDefault(); event.stopImmediatePropagation(); }
    cancel();
    fired = false;
  };
  const click = (event: MouseEvent) => {
    if (Date.now() < suppressClickUntil && canOpenQuickActions(event.target)) {
      event.preventDefault(); event.stopImmediatePropagation(); suppressClickUntil = 0;
    }
  };
  const context = (event: MouseEvent) => {
    if ((start || fired) && canOpenQuickActions(event.target)) event.preventDefault();
  };
  const visibility = () => { if (document.hidden) cancel(); };
  document.addEventListener('pointerdown', down);
  document.addEventListener('pointermove', move, true);
  document.addEventListener('pointerup', up, true);
  document.addEventListener('pointercancel', cancel, true);
  document.addEventListener('click', click, true);
  document.addEventListener('contextmenu', context);
  document.addEventListener('scroll', cancel, true);
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('blur', cancel);
  return () => {
    cancel();
    document.removeEventListener('pointerdown', down);
    document.removeEventListener('pointermove', move, true);
    document.removeEventListener('pointerup', up, true);
    document.removeEventListener('pointercancel', cancel, true);
    document.removeEventListener('click', click, true);
    document.removeEventListener('contextmenu', context);
    document.removeEventListener('scroll', cancel, true);
    document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener('blur', cancel);
  };
}
