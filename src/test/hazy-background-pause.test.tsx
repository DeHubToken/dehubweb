import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { HazyNightsBackground } from '@/components/app/HazyNightsBackground';

const state = vi.hoisted(() => ({ active: false, pixels: false, draws: 0 }));

vi.mock('@/contexts/ThemeContext', () => ({
  useAppTheme: () => ({ theme: 'hazy', themeHues: {}, brandColors: [] }),
}));
vi.mock('@/lib/three/scene-helpers', () => ({
  capPixelRatio: vi.fn(),
  releaseContext: vi.fn(),
  createRenderGate: () => ({ isActive: () => state.active, destroy: vi.fn() }),
}));
vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();
  return {
    ...actual,
    WebGLRenderer: class {
      domElement = document.createElement('canvas');
      setSize() { state.pixels = false; }
      render() { state.pixels = true; state.draws++; }
    },
  };
});

beforeEach(() => {
  state.active = false;
  state.pixels = false;
  state.draws = 0;
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('shows a still background when mounted while animation is paused', () => {
  render(<HazyNightsBackground />);
  expect(state.pixels).toBe(true);
  expect(state.draws).toBe(1);
  expect(requestAnimationFrame).not.toHaveBeenCalled();
});

it('repaints a buffer cleared by resize without resuming a paused loop', () => {
  render(<HazyNightsBackground />);
  const before = state.draws;
  act(() => window.dispatchEvent(new Event('resize')));
  expect(state.pixels).toBe(true);
  expect(state.draws).toBe(before + 1);
  expect(requestAnimationFrame).not.toHaveBeenCalled();
});

it('keeps reduced-motion backgrounds static after a resize', () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
  render(<HazyNightsBackground />);
  act(() => window.dispatchEvent(new Event('resize')));
  expect(state.pixels).toBe(true);
  expect(requestAnimationFrame).not.toHaveBeenCalled();
});
