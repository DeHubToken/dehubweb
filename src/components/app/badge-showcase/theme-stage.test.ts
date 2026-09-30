import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const scene = vi.hoisted(() => ({
  prepare: vi.fn(), setIce: vi.fn(), geometry: vi.fn(), start: vi.fn(),
  draw: vi.fn(), still: vi.fn(), clear: vi.fn(), dispose: vi.fn(),
  duration: () => 3.3, iceSource: null,
}));
vi.mock('./theme-scene', () => ({ createBadgeScene: () => scene }));
import { ThemeStage } from './theme-stage';

let frames: Map<number, FrameRequestCallback>;
let counter: number;
let reduced: boolean;
const imageLoads: (() => void)[] = [];
function makeStage() {
  const canvas = document.createElement('canvas');
  Object.defineProperties(canvas, { clientWidth: { value: 390 }, clientHeight: { value: 844 } });
  const landed = vi.fn(), failed = vi.fn(), tapped = vi.fn();
  const stage = new ThemeStage(canvas, { theme: 'cosmic', hero: () => ({ x: 50, y: 100, size: 220 }), onError: failed, onTap: tapped });
  stage.setItems([{ src: 'one', tilt: 0, finish: 'gloss' }, { src: 'two', tilt: 0, finish: 'gloss' }]);
  return { stage, canvas, landed, failed, tapped };
}
async function flushImages() { imageLoads.splice(0).forEach(load => load()); await Promise.resolve(); await Promise.resolve(); }
beforeEach(() => {
  vi.clearAllMocks(); frames = new Map(); counter = 0; reduced = false;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++counter, callback); return counter; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: reduced, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('Image', class {
    onload = () => {}; onerror = () => {}; crossOrigin = '';
    set src(_src: string) { imageLoads.push(() => this.onload()); }
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ setTransform() {}, drawImage() {} } as unknown as CanvasRenderingContext2D);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); imageLoads.length = 0; });
describe('badge stage lifecycle', () => {
  it('holds the opening frame, skips to the same badge, and stops rendering at rest', async () => {
    const { stage, landed } = makeStage();
    const ready = stage.show(0, { instant: true, hold: true }); await flushImages(); expect(await ready).toBe(true);
    expect(scene.clear).toHaveBeenCalled(); expect(frames.size).toBe(0);
    await stage.open({ from: null, onLanded: landed });
    stage.skip(); stage.skip();
    expect(landed).toHaveBeenCalledTimes(1); expect(frames.size).toBe(0);
    stage.dispose();
  });
  it('uses arrival for a first badge and honors reduced motion immediately', async () => {
    reduced = true;
    const { stage, landed } = makeStage();
    const ready = stage.show(0, { hold: true }); await flushImages(); await ready;
    await stage.open({ from: null, fromArt: null, promote: true, onLanded: landed });
    expect(scene.start).toHaveBeenCalledWith(null, false);
    expect(landed).toHaveBeenCalledTimes(1); expect(frames.size).toBe(0);
    stage.dispose();
  });
  it('does not revive a disposed showcase when artwork finishes loading', async () => {
    const { stage, failed } = makeStage();
    const ready = stage.show(0, { hold: true }); stage.dispose(); await flushImages(); await ready;
    expect(scene.prepare).not.toHaveBeenCalled(); expect(failed).not.toHaveBeenCalled(); expect(frames.size).toBe(0);
  });
  it('a late previous selection cannot overwrite a newer badge', async () => {
    const { stage, failed } = makeStage();
    const first = stage.show(0), second = stage.show(1);
    await flushImages(); await Promise.all([first, second]);
    expect(scene.prepare).toHaveBeenCalledTimes(1); expect(failed).not.toHaveBeenCalled();
    stage.dispose();
  });
  it('closing cancels the opening callback and disposal removes interaction handlers', async () => {
    const { stage, canvas, landed, tapped } = makeStage();
    const ready = stage.show(0, { hold: true }); await flushImages(); await ready;
    await stage.open({ from: null, onLanded: landed });
    stage.close({ x: 0, y: 0, size: 32 }, () => {}); stage.dispose();
    canvas.dispatchEvent(new MouseEvent('pointerup', { clientX: 100, clientY: 150 }));
    expect(landed).not.toHaveBeenCalled(); expect(tapped).not.toHaveBeenCalled(); expect(frames.size).toBe(0);
  });
});
