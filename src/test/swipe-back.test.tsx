import React from 'react';
import { act, fireEvent, render, cleanup } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSwipeBack } from '@/hooks/use-swipe-back';
import { completesSwipeBack, findSwipeBackControl } from '@/lib/swipe-back';

const overlays = vi.hoisted(() => ({ open: false }));
vi.mock('@/lib/overlay-open', () => ({ useAnyOverlayOpen: () => overlays.open }));
const back = vi.fn();
function Harness() {
  useSwipeBack();
  return <div><button data-swipe-back onClick={back}>Back</button><div data-testid="surface" /></div>;
}
const touch = (type: string, x: number, y: number, count = 1) => {
  const point = { identifier: 7, clientX: x, clientY: y };
  fireEvent(document.querySelector('[data-testid="surface"]') ?? document.body, new TouchEvent(type, {
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
