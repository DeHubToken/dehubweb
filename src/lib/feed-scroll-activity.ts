const settledListeners = new Set<() => void>();
let scrolling = false;
let touching = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let detach: (() => void) | undefined;
export const isFeedScrolling = () => scrolling;

function scheduleSettled() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    timer = undefined;
    if (touching) return;
    scrolling = false;
    settledListeners.forEach(listener => listener());
  }, 500);
}

/** One passive listener set; dimension corrections wait for the gesture and momentum. */
export function subscribeFeedScrollSettled(listener: () => void) {
  if (!detach) {
    const move = () => { scrolling = true; scheduleSettled(); };
    const start = () => { touching = true; move(); };
    const end = () => { touching = false; scheduleSettled(); };
    window.addEventListener('wheel', move, { passive: true, capture: true });
    window.addEventListener('scroll', move, { passive: true, capture: true });
    window.addEventListener('touchstart', start, { passive: true, capture: true });
    window.addEventListener('touchmove', move, { passive: true, capture: true });
    window.addEventListener('touchend', end, { passive: true, capture: true });
    window.addEventListener('touchcancel', end, { passive: true, capture: true });
    detach = () => {
      window.removeEventListener('wheel', move, { capture: true });
      window.removeEventListener('scroll', move, { capture: true });
      window.removeEventListener('touchstart', start, { capture: true });
      window.removeEventListener('touchmove', move, { capture: true });
      window.removeEventListener('touchend', end, { capture: true });
      window.removeEventListener('touchcancel', end, { capture: true });
      clearTimeout(timer); timer = undefined; scrolling = false; touching = false;
    };
  }
  settledListeners.add(listener);
  return () => {
    settledListeners.delete(listener);
    if (!settledListeners.size) { detach?.(); detach = undefined; }
  };
}
