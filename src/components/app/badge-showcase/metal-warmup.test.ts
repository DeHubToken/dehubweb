import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ instances: [] as Array<{ show: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>; attach: ReturnType<typeof vi.fn>; setItems: ReturnType<typeof vi.fn> }> }));
vi.mock('./metal-stage', () => ({
  MetalStage: class {
    show = vi.fn(async () => true);
    dispose = vi.fn();
    attach = vi.fn();
    setItems = vi.fn();
    constructor() { mocks.instances.push(this); }
  },
}));

const item = (src: string) => ({ src, finish: 'glitter' as const, tilt: 0 });
const options = { hero: () => ({ x: 0, y: 0, size: 100 }) };

describe('metal badge preparation', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    mocks.instances.length = 0;
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it('hands over the prepared renderer without creating a second context', async () => {
    const { warmMetalBadge, acquireMetalStage } = await import('./metal-warmup');
    warmMetalBadge(item('lobster'));
    const canvas = document.createElement('canvas');
    const stage = await acquireMetalStage(canvas, options, 'lobster');
    expect(stage).toBe(mocks.instances[0]);
    expect(mocks.instances).toHaveLength(1);
    expect(mocks.instances[0].attach).toHaveBeenCalledWith(canvas, options);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mocks.instances[0].dispose).not.toHaveBeenCalled();
    expect(document.body.childElementCount).toBe(0);
  });

  it('keeps one renderer when the pointer moves between tiers', async () => {
    const { warmMetalBadge, acquireMetalStage } = await import('./metal-warmup');
    warmMetalBadge(item('crab'));
    warmMetalBadge(item('lobster'));
    warmMetalBadge(item('shark'));
    await acquireMetalStage(document.createElement('canvas'), options, 'shark');
    expect(mocks.instances).toHaveLength(1);
    expect(mocks.instances[0].setItems).toHaveBeenLastCalledWith([item('shark')]);
    expect(mocks.instances[0].dispose).not.toHaveBeenCalled();
  });

  it('releases unused GPU preparation and creates a fresh stage for a later click', async () => {
    const { warmMetalBadge, acquireMetalStage } = await import('./metal-warmup');
    warmMetalBadge(item('crab'));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mocks.instances[0].dispose).toHaveBeenCalledOnce();
    expect(document.body.childElementCount).toBe(0);
    await acquireMetalStage(document.createElement('canvas'), options, 'crab');
    expect(mocks.instances).toHaveLength(2);
  });
});
