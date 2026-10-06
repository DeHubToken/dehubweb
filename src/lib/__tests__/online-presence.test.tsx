import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { getShowOnline, publishOnline, useIsOnline, usePresenceReaders } from '../online-presence';

afterEach(() => { cleanup(); publishOnline(new Set()); });

describe('visible presence demand', () => {
  it('keeps a reader for visible dots and removes demand for hidden cached pages', () => {
    const hook = renderHook(({ enabled }) => ({
      online: useIsOnline('ALICE', enabled), readers: usePresenceReaders(),
    }), { initialProps: { enabled: true } });
    expect(hook.result.current.readers).toBe(true);
    act(() => publishOnline(new Set(['alice'])));
    expect(hook.result.current.online).toBe(true);
    hook.rerender({ enabled: false });
    expect(hook.result.current.readers).toBe(false);
    expect(hook.result.current.online).toBe(false);
  });

  it('retains demand until every visible reader leaves and ignores empty addresses', () => {
    const host = renderHook(usePresenceReaders);
    const first = renderHook(() => useIsOnline('alice'));
    const second = renderHook(() => useIsOnline('alice'));
    first.unmount();
    expect(host.result.current).toBe(true);
    second.unmount();
    expect(host.result.current).toBe(false);
    renderHook(() => useIsOnline(null));
    expect(host.result.current).toBe(false);
  });

  it('publishes only an explicit opt-in', () => {
    expect(getShowOnline(undefined)).toBe(false);
    expect(getShowOnline({ showOnline: 'off' })).toBe(false);
    expect(getShowOnline({ showOnline: 'on' })).toBe(true);
    expect(getShowOnline({ showOnline: true })).toBe(true);
  });
});
