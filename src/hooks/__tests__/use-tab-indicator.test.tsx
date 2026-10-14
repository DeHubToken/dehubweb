import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CachedPageActiveContext } from '@/contexts/CachedPageActiveContext';
import { useTabIndicator } from '../use-tab-indicator';

let layerWidth = 600, layerHeight = 36, buttonWidth = 90;
let frameId = 0;
const frames = new Map<number, FrameRequestCallback>();
const observers = new Set<() => void>();
const box = (x: number, width: number, height: number) => ({ x, y: 8, left: x, top: 8, right: x + width, bottom: 8 + height, width, height, toJSON: () => ({}) }) as DOMRect;

function Row() {
  const { layerRef, setRef, rect } = useTabIndicator('home');
  return <><div ref={layerRef} data-testid="layer"><button ref={setRef('home')} data-testid="tab">Home</button></div><output data-testid="rect">{JSON.stringify(rect)}</output></>;
}
const page = (active: boolean) => <CachedPageActiveContext.Provider value={active}><Row /></CachedPageActiveContext.Provider>;
const rect = () => JSON.parse(screen.getByTestId('rect').textContent!);
const resize = () => act(() => {
  observers.forEach(notify => notify());
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach(callback => callback(performance.now()));
});

beforeEach(() => {
  layerWidth = 600; layerHeight = 36; buttonWidth = 90;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++frameId, callback); return frameId; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  vi.stubGlobal('ResizeObserver', class {
    notify: () => void;
    constructor(callback: ResizeObserverCallback) { this.notify = () => callback([], this as unknown as ResizeObserver); observers.add(this.notify); }
    observe() {}
    disconnect() { observers.delete(this.notify); }
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return this.dataset.testid === 'layer' ? box(240, layerWidth, layerHeight) : box(280, buttonWidth, 36);
  });
});
afterEach(() => { cleanup(); frames.clear(); observers.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each(['zero-width', 'zero-height', 'zero-button'])('retains the last visible selection during %s layout', kind => {
  render(page(true));
  const before = rect();
  if (kind === 'zero-width') { layerWidth = 0; buttonWidth = 48; }
  if (kind === 'zero-height') layerHeight = 0;
  if (kind === 'zero-button') buttonWidth = 0;
  resize();
  expect(rect()).toEqual(before);
});

it('preserves geometry in a cached route and measures its restored layout before a frame', () => {
  const view = render(page(true));
  const before = rect();
  layerWidth = 24; buttonWidth = 48;
  view.rerender(page(false));
  resize();
  expect(rect()).toEqual(before);
  layerWidth = 720; buttonWidth = 110;
  view.rerender(page(true));
  expect(rect()).toMatchObject({ width: 110, height: 36, x: 40, ready: true });
});

it('ignores an independently hidden tab row even if its dimensions are nonzero', () => {
  render(page(true));
  const before = rect();
  screen.getByTestId('layer').style.visibility = 'hidden';
  buttonWidth = 48;
  resize();
  expect(rect()).toEqual(before);
});
