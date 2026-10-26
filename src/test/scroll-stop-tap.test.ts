import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installScrollStopTap, isPageGliding } from '@/lib/scroll-stop-tap';

function touch(type: 'touchstart' | 'touchend', target: EventTarget, remaining: number) {
  const event = new Event(type, { bubbles: true, cancelable: true }) as TouchEvent;
  Object.defineProperty(event, 'touches', { value: { length: remaining } });
  target.dispatchEvent(event);
  return event;
}

function scrollTo(top: number) {
  const root = document.scrollingElement || document.documentElement;
  root.scrollTop = top;
  document.dispatchEvent(new Event('scroll'));
}

describe('scroll-stop-tap', () => {
  let uninstall: () => void;
  let now = 1000;
  let card: HTMLDivElement;
  let opened: ReturnType<typeof vi.fn<(event: Event) => void>>;

  beforeEach(() => {
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    uninstall = installScrollStopTap();
    card = document.createElement('div');
    document.body.appendChild(card);
    opened = vi.fn<(event: Event) => void>();
    card.addEventListener('click', opened);
    card.addEventListener('touchend', opened);
    scrollTo(0);
  });

  afterEach(() => {
    uninstall();
    card.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function fling() {
    touch('touchstart', document.body, 1);
    now += 16; scrollTo(200);
    touch('touchend', document.body, 0);
    now += 16; scrollTo(260); // momentum after the finger lifted
  }

  it('swallows the tap that stops a gliding feed', () => {
    fling();
    expect(isPageGliding()).toBe(true);
    now += 30;
    touch('touchstart', card, 1);
    const end = touch('touchend', card, 0);
    card.click();
    expect(end.defaultPrevented).toBe(true);
    expect(opened).not.toHaveBeenCalled();
  });

  it('lets a tap on a resting feed through', () => {
    fling();
    now += 400; // the glide has finished
    expect(isPageGliding()).toBe(false);
    touch('touchstart', card, 1);
    touch('touchend', card, 0);
    card.click();
    expect(opened).toHaveBeenCalledTimes(2);
  });

  it('a slow drag with no momentum leaves the next tap alone', () => {
    touch('touchstart', document.body, 1);
    now += 16; scrollTo(80);
    now += 16;
    touch('touchend', document.body, 0);
    now += 40;
    touch('touchstart', card, 1);
    touch('touchend', card, 0);
    expect(opened).toHaveBeenCalledTimes(1);
  });

  it('only the stopping tap is swallowed; the next one opens', () => {
    fling();
    now += 30;
    touch('touchstart', card, 1);
    touch('touchend', card, 0);
    card.click();
    now += 300;
    touch('touchstart', card, 1);
    touch('touchend', card, 0);
    card.click();
    expect(opened).toHaveBeenCalledTimes(2);
  });
});
