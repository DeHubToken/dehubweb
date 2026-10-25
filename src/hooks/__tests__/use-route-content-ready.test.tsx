import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { CachedPageActiveContext } from '@/contexts/CachedPageActiveContext';
import { ROUTE_CONTENT_READY } from '@/lib/route-loading-shell';
import { useRouteContentReady } from '../use-route-content-ready';

it('prevents a hidden cached page from revealing the current destination', () => {
  const ready = vi.fn();
  window.addEventListener(ROUTE_CONTENT_READY, ready);
  let active = false;
  try {
    const { rerender } = renderHook(() => useRouteContentReady(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <MemoryRouter><CachedPageActiveContext.Provider value={active}>{children}</CachedPageActiveContext.Provider></MemoryRouter>
      ),
    });
    expect(ready).not.toHaveBeenCalled();
    active = true;
    rerender();
    expect(ready).toHaveBeenCalledOnce();
    active = false;
    rerender();
    expect(ready).toHaveBeenCalledOnce();
  } finally {
    window.removeEventListener(ROUTE_CONTENT_READY, ready);
  }
});
