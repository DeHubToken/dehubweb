import { describe, expect, it, vi, beforeEach } from 'vitest';
import { bindDrawerPullClose } from '@/lib/drawer-pull-close';

/** A touch event at a given time, built by hand so the gesture's timing is exact. */
function fire(el: HTMLElement, type: string, x: number, y: number, t: number) {
  const point = { clientX: x, clientY: y, identifier: 1, target: el };
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'touches', { value: type === 'touchend' ? [] : [point] });
  Object.defineProperty(ev, 'timeStamp', { value: t });
  el.dispatchEvent(ev);
  return ev;
}

/** Moves the finger from y0 by `steps` equal steps of `dy`, `ms` apart, then lets go `releaseAfter` later. */
function gesture(el: HTMLElement, y0: number, steps: number, dy: number, ms: number, releaseAfter = 8, dx = 0) {
  let t = 1000;
  let y = y0;
  let x = 200;
  fire(el, 'touchstart', x, y, t);
  for (let i = 0; i < steps; i++) {
    t += ms;
    y += dy;
    x += dx;
    fire(el, 'touchmove', x, y, t);
  }
  fire(el, 'touchend', x, y, t + releaseAfter);
}

describe('notifications drawer drag (part open / full / close)', () => {
  let sheet: HTMLElement;
  let scroller: HTMLElement;
  let close: ReturnType<typeof vi.fn<() => void>>;
  // jsdom's window is 768 tall, so part open rests 154px down.
  const PART = Math.round(window.innerHeight * 0.2);

  beforeEach(() => {
    vi.spyOn(performance, 'now').mockReturnValue(100_000);
    document.body.innerHTML = '';
    const scrim = document.createElement('div');
    scrim.setAttribute('data-vaul-overlay', '');
    document.body.appendChild(scrim);
    sheet = document.createElement('div');
    Object.defineProperty(sheet, 'offsetHeight', { value: window.innerHeight });
    scroller = document.createElement('div');
    sheet.appendChild(scroller);
    document.body.appendChild(sheet);
    close = vi.fn<() => void>();
    bindDrawerPullClose(sheet, scroller, close);
  });

  const expand = () => gesture(scroller, 500, 6, -15, 16);

  it('opens part open, lowered by a fifth of the screen', () => {
    expect(sheet.style.translate).toBe(`0 ${PART}px`);
    expect(sheet.hasAttribute('data-expanded')).toBe(false);
  });

  it('fills the screen when dragged up', () => {
    expand();
    expect(close).not.toHaveBeenCalled();
    expect(sheet.hasAttribute('data-expanded')).toBe(true);
    expect(sheet.style.translate).toBe('0 0px');
  });

  it('springs back to part open from a tiny upward nudge', () => {
    gesture(scroller, 500, 2, -10, 40, 200);
    expect(sheet.hasAttribute('data-expanded')).toBe(false);
    expect(sheet.style.translate).toBe(`0 ${PART}px`);
  });

  it('closes from part open on a long pull, even released slowly', () => {
    gesture(scroller, 200, 25, 10, 16, 200);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('closes from part open on a quick flick that moved it a clear distance', () => {
    gesture(scroller, 200, 10, 12, 8);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('springs back from a short flick down', () => {
    gesture(scroller, 200, 4, 10, 8);
    expect(close).not.toHaveBeenCalled();
    expect(sheet.style.translate).toBe(`0 ${PART}px`);
  });

  it('springs back when the finger stopped before letting go', () => {
    gesture(scroller, 200, 15, 10, 16, 200);
    expect(close).not.toHaveBeenCalled();
    expect(sheet.style.translate).toBe(`0 ${PART}px`);
  });

  it('from full, a pull down at the top steps back to part open, not closed', () => {
    expand();
    gesture(scroller, 200, 12, 10, 16, 200);
    expect(close).not.toHaveBeenCalled();
    expect(sheet.hasAttribute('data-expanded')).toBe(false);
    expect(sheet.style.translate).toBe(`0 ${PART}px`);
  });

  it('from full, a long pull closes', () => {
    expand();
    gesture(scroller, 100, 40, 10, 16, 200);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('from full, scrolling the list up never moves the sheet', () => {
    expand();
    gesture(scroller, 600, 10, -20, 16);
    expect(sheet.hasAttribute('data-expanded')).toBe(true);
    expect(sheet.style.translate).toBe('0 0px');
  });

  it('from full, never pulls while the list is scrolled, even if it reaches the top mid-swipe', () => {
    expand();
    scroller.scrollTop = 300;
    let t = 5000;
    fire(scroller, 'touchstart', 200, 100, t);
    for (let y = 120; y <= 700; y += 20) {
      if (y > 300) scroller.scrollTop = 0;
      fire(scroller, 'touchmove', 200, y, (t += 8));
    }
    fire(scroller, 'touchend', 200, 700, t + 8);
    expect(close).not.toHaveBeenCalled();
    expect(sheet.hasAttribute('data-expanded')).toBe(true);
  });

  it('from full, waits for a fling to settle before a pull can start', () => {
    expand();
    scroller.dispatchEvent(new Event('scroll'));
    gesture(scroller, 100, 40, 10, 16, 200);
    expect(close).not.toHaveBeenCalled();
    expect(sheet.hasAttribute('data-expanded')).toBe(true);
  });

  it('fills the screen when the search field gets focus', () => {
    const input = document.createElement('input');
    scroller.appendChild(input);
    input.focus();
    expect(sheet.hasAttribute('data-expanded')).toBe(true);
  });

  it('closes on a tap on the dimmed page above the sheet', () => {
    (document.querySelector('[data-vaul-overlay]') as HTMLElement).click();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('leaves sideways swipes alone', () => {
    gesture(scroller, 200, 10, 3, 8, 8, -20);
    expect(close).not.toHaveBeenCalled();
    expect(sheet.style.translate).toBe(`0 ${PART}px`);
  });
});

describe('one-height sheet (bell settings)', () => {
  let sheet: HTMLElement;
  let close: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    vi.spyOn(performance, 'now').mockReturnValue(100_000);
    document.body.innerHTML = '';
    sheet = document.createElement('div');
    Object.defineProperty(sheet, 'offsetHeight', { value: 500 });
    document.body.appendChild(sheet);
    close = vi.fn<() => void>();
    bindDrawerPullClose(sheet, sheet, close, { snap: false });
  });

  it('rests where it is and never grows on an upward drag', () => {
    gesture(sheet, 400, 6, -15, 16);
    expect(close).not.toHaveBeenCalled();
    // An upward drag is left to the list, so the sheet never moved.
    expect(sheet.style.translate ?? '').not.toMatch(/-/);
    expect(sheet.hasAttribute('data-expanded')).toBe(false);
  });

  it('closes on a pull down', () => {
    gesture(sheet, 100, 20, 10, 16, 200);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('springs back from a short pull', () => {
    gesture(sheet, 100, 4, 10, 16, 200);
    expect(close).not.toHaveBeenCalled();
    expect(sheet.style.translate).toBe('0 0px');
  });
});
