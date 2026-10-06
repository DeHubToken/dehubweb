import { act, cleanup, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ optIn: false, visible: true, lease: vi.fn(), track: vi.fn(), untrack: vi.fn(), release: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: true, walletAddress: 'ALICE' }) }));
vi.mock('@/hooks/use-dehub-profile', () => ({ useDeHubProfile: () => ({ data: { customs: { showOnline: mocks.optIn ? 'on' : 'off' } } }) }));
vi.mock('@/lib/realtime-channel-lease', () => ({ leaseChannel: mocks.lease }));
import OnlinePresenceHost from '../OnlinePresenceHost';
import { useIsOnline } from '@/lib/online-presence';

beforeEach(() => {
  vi.clearAllMocks(); mocks.optIn = false; mocks.visible = true;
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => mocks.visible ? 'visible' : 'hidden');
  mocks.lease.mockImplementation((_topic, options) => {
    options.onJoin({ track: mocks.track, untrack: mocks.untrack });
    return { release: mocks.release };
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('opens no channel for a foreground account with no opt-in or readers', () => {
  render(<OnlinePresenceHost />);
  expect(mocks.lease).not.toHaveBeenCalled();
});

it('reads without tracking while a dot is visible and releases when it is hidden', () => {
  render(<OnlinePresenceHost />);
  const reader = renderHook(({ enabled }) => useIsOnline('bob', enabled), { initialProps: { enabled: true } });
  expect(mocks.lease).toHaveBeenCalledTimes(1);
  expect(mocks.track).not.toHaveBeenCalled();
  expect(mocks.untrack).toHaveBeenCalledTimes(1);
  reader.rerender({ enabled: false });
  expect(mocks.release).toHaveBeenCalledTimes(1);
});

it('keeps opted-in publishing without readers and releases a hidden tab', () => {
  mocks.optIn = true;
  render(<OnlinePresenceHost />);
  expect(mocks.track).toHaveBeenCalledTimes(1);
  act(() => { mocks.visible = false; document.dispatchEvent(new Event('visibilitychange')); });
  expect(mocks.release).toHaveBeenCalledTimes(1);
  act(() => { mocks.visible = true; document.dispatchEvent(new Event('visibilitychange')); });
  expect(mocks.track).toHaveBeenCalledTimes(2);
});
