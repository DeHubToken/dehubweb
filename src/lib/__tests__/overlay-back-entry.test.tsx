import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const escapes = vi.fn();
const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') escapes(); };

beforeEach(() => {
  vi.resetModules();
  escapes.mockClear();
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
  window.history.replaceState({ idx: 0 }, '', '/#access_token=abc&refresh_token=def');
  document.addEventListener('keydown', onKey);
});
afterEach(() => {
  cleanup();
  document.removeEventListener('keydown', onKey);
  vi.unstubAllGlobals();
});

describe('Android Back entry for open sheets', () => {
  it('keeps the sheet open when the address changes under it (sign-in return clearing its token)', async () => {
    const { OverlayOpenTracker } = await import('@/lib/overlay-open');
    render(<OverlayOpenTracker />);
    // What supabase-js does after reading the token: location.hash = ''.
    act(() => {
      window.history.pushState(null, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
    });
    expect(escapes).not.toHaveBeenCalled();
    // A fresh Back entry now sits on the cleaned address.
    expect((window.history.state as Record<string, unknown>)?.__dehubOverlay).toBe(true);
  });

  it('still closes the top sheet on a real Back', async () => {
    const { OverlayOpenTracker } = await import('@/lib/overlay-open');
    render(<OverlayOpenTracker />);
    const href = window.location.href;
    act(() => {
      // Back off the entry: same address, the entry's state is gone.
      window.history.replaceState({ idx: 0 }, '', href);
      window.dispatchEvent(new PopStateEvent('popstate', { state: { idx: 0 } }));
    });
    expect(escapes).toHaveBeenCalledTimes(1);
  });
});
