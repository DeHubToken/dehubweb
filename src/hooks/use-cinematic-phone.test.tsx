import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCinematicPhone } from './use-cinematic-phone';

const state = vi.hoisted(() => ({ theme: 'system' }));
vi.mock('@/contexts/ThemeContext', () => ({ useAppTheme: () => state }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Home and profile presentation', () => {
  it('switches between bento and cinematic layouts without remounting the feed', () => {
    const listeners = new Set<() => void>();
    const media = {
      matches: true,
      addEventListener: (_: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    };
    vi.stubGlobal('matchMedia', () => media);
    state.theme = 'system';
    const { result, rerender, unmount } = renderHook(useCinematicPhone);
    expect(result.current).toBe(false);
    state.theme = 'immersive';
    rerender();
    expect(result.current).toBe(true);
    act(() => { media.matches = false; listeners.forEach(listener => listener()); });
    expect(result.current).toBe(false);
    act(() => { media.matches = true; listeners.forEach(listener => listener()); });
    expect(result.current).toBe(true);
    state.theme = 'system';
    rerender();
    expect(result.current).toBe(false);
    unmount();
    expect(listeners.size).toBe(0);
  });
});
