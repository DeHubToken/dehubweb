import React from 'react';
import { act, fireEvent, render, cleanup } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSwipeBack } from '@/hooks/use-swipe-back';
import { canGoBackInApp, completesSwipeBack, findSwipeBackControl, pageSwipeAllowed } from '@/lib/swipe-back';

const overlays = vi.hoisted(() => ({ open: false }));
vi.mock('@/lib/overlay-open', () => ({ useAnyOverlayOpen: () => overlays.open }));
const back = vi.fn();
function Harness() {
  useSwipeBack();
  return <div><button data-swipe-back onClick={back}>Back</button><div data-testid="surface" /><div data-no-swipe><div data-testid="carousel" /></div></div>;
}
const touch = (type: string, x: number, y: number, count = 1, on = 'surface') => {
  const point: Touch = {
    identifier: 7, clientX: x, clientY: y, pageX: x, pageY: y,
    screenX: x, screenY: y, force: 1, radiusX: 1, radiusY: 1,
    rotationAngle: 0, target: document.body,
  };
  fireEvent(document.querySelector(`[data-testid="${on}"]`) ?? document.body, new TouchEvent(type, {
    bubbles: true, cancelable: true,
    touches: type === 'touchend' ? [] : Array(count).fill(point), changedTouches: [point],
  }));
};
beforeEach(() => {
  overlays.open = false;
  back.mockClear();
  window.history.replaceState({ idx: 0 }, '', '/profile');
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('swipe back', () => {
  it('uses the profile/local back action once without relying on history', () => {
    render(<BrowserRouter><Harness /></BrowserRouter>);
    touch('touchstart', 12, 200); touch('touchmove', 45, 204); touch('touchend', 100, 204);
    touch('touchstart', 12, 200); touch('touchend', 100, 204);
    expect(back).toHaveBeenCalledTimes(1);
  });
  it.each(['scroll', 'middle', 'multi', 'cancel', 'native'])('does not pop for %s', (kind) => {
    render(<BrowserRouter><Harness /></BrowserRouter>);
    touch('touchstart', kind === 'middle' ? 200 : 12, 200, kind === 'multi' ? 2 : 1);
    if (kind === 'scroll') touch('touchmove', 15, 240);
    if (kind === 'cancel') touch('touchcancel', 40, 200);
    if (kind === 'native') act(() => window.dispatchEvent(new PopStateEvent('popstate')));
    touch('touchend', 100, kind === 'scroll' ? 290 : 200);
    expect(back).not.toHaveBeenCalled();
  });
  it('goes back from a drag across the page, not only the edge', () => {
    render(<BrowserRouter><Harness /></BrowserRouter>);
    touch('touchstart', 150, 300); touch('touchmove', 175, 302); touch('touchmove', 230, 306); touch('touchend', 260, 306);
    expect(back).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-swipe-back-cue]')).not.toBeNull();
  });
  it('asks a page drag for a longer pull than the edge', () => {
    render(<BrowserRouter><Harness /></BrowserRouter>);
    const now = vi.spyOn(performance, 'now').mockReturnValue(0);
    touch('touchstart', 150, 300); touch('touchmove', 175, 300);
    now.mockReturnValue(1000);
    touch('touchend', 220, 300);
    expect(back).not.toHaveBeenCalled();
  });
  it('leaves sideways swipes on carousels and media to them', () => {
    render(<BrowserRouter><Harness /></BrowserRouter>);
    touch('touchstart', 150, 300, 1, 'carousel'); touch('touchmove', 200, 300, 1, 'carousel'); touch('touchend', 280, 300, 1, 'carousel');
    expect(back).not.toHaveBeenCalled();
    document.body.innerHTML = '<div id="row" style="overflow-x:auto"><img id="pic"><span id="txt"></span></div><p id="plain"></p>';
    const row = document.querySelector<HTMLElement>('#row')!;
    Object.defineProperty(row, 'scrollWidth', { value: 900 });
    Object.defineProperty(row, 'clientWidth', { value: 300 });
    expect(pageSwipeAllowed(document.querySelector('#pic'))).toBe(true);
    expect(pageSwipeAllowed(document.querySelector('#txt'))).toBe(true);
    row.scrollLeft = 200;
    Object.defineProperty(row, 'scrollLeft', { value: 200 });
    expect(pageSwipeAllowed(document.querySelector('#txt'))).toBe(false);
    expect(pageSwipeAllowed(document.querySelector('#plain'))).toBe(true);
    document.body.innerHTML = '';
  });
  it('goes back through history on a page with no arrow, never from the feed tabs', () => {
    expect(canGoBackInApp('/app/wallet', { idx: 2 })).toBe(true);
    expect(canGoBackInApp('/app/wallet', { idx: 0 })).toBe(false);
    expect(canGoBackInApp('/app', { idx: 3 })).toBe(false);
    expect(canGoBackInApp('/', { idx: 3 })).toBe(false);
  });
  it('never activates a page behind an open sheet', () => {
    overlays.open = true;
    render(<BrowserRouter><Harness /></BrowserRouter>);
    touch('touchstart', 12, 200); touch('touchend', 100, 200);
    expect(back).not.toHaveBeenCalled();
  });
  it('uses the nested sheet back and ignores hidden and disabled controls', () => {
    document.body.innerHTML = '<button data-swipe-back id="page"></button><div role="dialog"><button data-swipe-back id="step"></button><button data-swipe-back disabled></button><div aria-hidden="true"><button data-swipe-back></button></div><div id="surface"></div></div>';
    expect(findSwipeBackControl(document.querySelector('#surface'), true)?.id).toBe('step');
    document.body.innerHTML = '';
  });
  it('requires a deliberate horizontal motion', () => {
    expect(completesSwipeBack(64, 8, 0)).toBe(true);
    expect(completesSwipeBack(28, 0, 650)).toBe(true);
    expect(completesSwipeBack(20, 0, 900)).toBe(false);
    expect(completesSwipeBack(80, 40, 800)).toBe(false);
    expect(completesSwipeBack(-80, 0, -800)).toBe(false);
  });
});
