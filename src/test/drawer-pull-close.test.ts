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

describe('notifications drawer pull to close', () => {
  let sheet: HTMLElement;
  let scroller: HTMLElement;
  let close: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    vi.spyOn(performance, 'now').mockReturnValue(100_000);
    document.body.innerHTML = '';
    const scrim = document.createElement('div');
    scrim.setAttribute('data-vaul-overlay', '');
    document.body.appendChild(scrim);
    sheet = document.createElement('div');
    Object.defineProperty(sheet, 'offsetHeight', { value: 800 });
    scroller = document.createElement('div');
    sheet.appendChild(scroller);
    document.body.appendChild(sheet);
    close = vi.fn<() => void>();
    bindDrawerPullClose(sheet, scroller, close);
  });

  it('closes on a long pull from the top, even released slowly', () => {
    gesture(scroller, 200, 25, 10, 16, 200);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('closes on a quick flick that moved the sheet a clear distance', () => {
    gesture(scroller, 200, 10, 12, 8);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('springs back from a short flick', () => {
    gesture(scroller, 200, 4, 10, 8);
    expect(close).not.toHaveBeenCalled();
    expect(sheet.style.transform).toBe('translate3d(0, 0, 0)');
  });

  it('springs back when the finger stopped before letting go', () => {
    gesture(scroller, 200, 15, 10, 16, 200);
    expect(close).not.toHaveBeenCalled();
    expect(sheet.style.transform).toBe('translate3d(0, 0, 0)');
  });

  it('never pulls while the list is scrolled, even if it reaches the top mid-swipe', () => {
    scroller.scrollTop = 300;
    let t = 1000;
    fire(scroller, 'touchstart', 200, 100, t);
    for (let y = 120; y <= 700; y += 20) {
      if (y > 300) scroller.scrollTop = 0;
      fire(scroller, 'touchmove', 200, y, (t += 8));
    }
    fire(scroller, 'touchend', 200, 700, t + 8);
    expect(close).not.toHaveBeenCalled();
    expect(sheet.style.transform).toBe('');
  });

  it('waits for a fling to settle before a pull can start', () => {
    scroller.dispatchEvent(new Event('scroll'));
    gesture(scroller, 200, 30, 10, 16, 200);
    expect(close).not.toHaveBeenCalled();
  });

  it('closes on a tap on the dimmed page above the sheet', () => {
    (document.querySelector('[data-vaul-overlay]') as HTMLElement).click();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('leaves sideways swipes alone', () => {
    gesture(scroller, 200, 10, 3, 8, 8, -20);
    expect(close).not.toHaveBeenCalled();
    expect(sheet.style.transform).toBe('');
  });
});
