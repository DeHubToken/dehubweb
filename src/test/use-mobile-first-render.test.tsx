import { renderHook, act } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useIsMobile } from '@/hooks/use-mobile';
afterEach(() => vi.unstubAllGlobals());
it('renders phone layout immediately and follows breakpoint changes', () => {
  let changed!: () => void;
  const query = { matches: true, addEventListener: (_: string, cb: () => void) => { changed = cb; }, removeEventListener: vi.fn() };
  vi.stubGlobal('matchMedia', vi.fn(() => query));
  const renders: boolean[] = [];
  const hook = renderHook(() => { const mobile = useIsMobile(); renders.push(mobile); return mobile; });
  expect(renders[0]).toBe(true);
  act(() => { query.matches = false; changed(); });
  expect(hook.result.current).toBe(false);
  hook.unmount();
  expect(query.removeEventListener).toHaveBeenCalledWith('change', changed);
});
