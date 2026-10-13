import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useIsTouchDevice } from '../use-touch-device';

const originalViewport = Object.getOwnPropertyDescriptor(window, 'innerWidth')!;
afterEach(() => { cleanup(); vi.restoreAllMocks(); Object.defineProperty(window, 'innerWidth', originalViewport); });
it('uses media-query changes without synchronous viewport measurements', () => {
  const viewport = vi.fn(() => { throw new Error('layout read'); });
  Object.defineProperty(window, 'innerWidth', { configurable: true, get: viewport });
  let changed = () => {};
  const query = { matches: true, addEventListener: vi.fn((_name, fn) => { changed = fn; }), removeEventListener: vi.fn() };
  vi.spyOn(window, 'matchMedia').mockReturnValue(query as unknown as MediaQueryList);
  const { result } = renderHook(useIsTouchDevice);
  expect(result.current).toBe(true);
  act(() => { query.matches = false; changed(); });
  expect(result.current).toBe(false);
  expect(viewport).not.toHaveBeenCalled();
});
