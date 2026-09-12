import { afterEach, expect, it, vi } from 'vitest';
import { liftFullscreenElement } from '@/hooks/use-video-fullscreen';
import { installScrollFreezeWatchdog } from '@/lib/scroll-freeze-watchdog';

const error = vi.hoisted(() => vi.fn());
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ error }) }));
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); document.body.style.overflow = ''; document.body.style.overflowY = ''; Reflect.deleteProperty(document, 'elementFromPoint'); });

it('preserves a real fullscreen lock but still recovers an orphaned lock after exit', () => {
  vi.useFakeTimers();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.spyOn(document.body, 'scrollHeight', 'get').mockReturnValue(3000);
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => document.body });
  const parent = document.createElement('section');
  const player = document.createElement('div');
  parent.appendChild(player);
  document.body.appendChild(parent);
  const restore = liftFullscreenElement(player);
  // JSDOM does not expand the overflow shorthand into computed overflowY.
  document.body.style.overflowY = 'hidden';
  const stop = installScrollFreezeWatchdog();
  try {
    vi.advanceTimersByTime(5001);
    expect(document.body.style.overflow).toBe('hidden');
    expect(error).not.toHaveBeenCalled();
    restore();
    expect(player.hasAttribute('data-media-fullscreen')).toBe(false);
    expect(document.body.style.overflow).toBe('');
    document.body.style.overflow = 'hidden';
    vi.advanceTimersByTime(5001);
    expect(document.body.style.overflow).toBe('');
    expect(error).toHaveBeenCalledTimes(1);
  } finally {
    stop();
    if (player.parentNode !== parent) restore();
    parent.remove();
  }
});
