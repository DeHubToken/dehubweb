import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  insert: vi.fn(), token: vi.fn(), update: vi.fn(), check: vi.fn(),
  join: vi.fn(), leave: vi.fn(), publish: vi.fn(), subscribe: vi.fn(), remove: vi.fn(),
  microphone: vi.fn(), camera: vi.fn(), handlers: {} as Record<string, (...args: any[]) => any>,
  callPing: vi.fn(), callSubscription: vi.fn(), wallet: 'alice',
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ walletAddress: mocks.wallet }) }));
vi.mock('@/lib/api/dehub/core', () => ({ apiCall: () => Promise.resolve(), getAuthToken: () => null }));
vi.mock('@/utils/simple-call-check', () => ({ simpleCallCheck: mocks.check, debugAllCalls: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  functions: { invoke: mocks.token },
  from: () => ({
    insert: () => ({ select: () => ({ single: mocks.insert }) }),
    update: (data: unknown) => ({ eq: (field: string, id: string) => mocks.update(data, field, id) }),
    select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { status: 'connected' } }) }) }),
  }),
  channel: () => { const channel = {
    on: (_type: string, _filter: unknown, handler: (...args: any[]) => any) => { mocks.callPing.mockImplementation(handler); return channel; },
    subscribe: (handler: (...args: any[]) => any) => { mocks.callSubscription.mockImplementation(handler); return channel; },
  }; return channel; },
  removeChannel: vi.fn(),
} }));
vi.mock('agora-rtc-sdk-ng', () => ({ default: {
  setLogLevel: vi.fn(),
  createClient: () => ({
    on: (name: string, handler: (...args: any[]) => any) => { mocks.handlers[name] = handler; },
    join: mocks.join, leave: mocks.leave, publish: mocks.publish,
    subscribe: mocks.subscribe, removeAllListeners: mocks.remove,
  }),
  createMicrophoneAudioTrack: mocks.microphone, createCameraVideoTrack: mocks.camera,
} }));
import { useCall } from '@/hooks/use-call';
import { visualActivity, createVisualActivity } from '@/lib/visual-activity';

const session = { id: 'call-1', caller_address: 'alice', recipient_address: 'bob', status: 'ringing', call_type: 'video', created_at: new Date().toISOString() };
const track = () => ({ play: vi.fn(), stop: vi.fn(), close: vi.fn(), setMuted: vi.fn() });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }

beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); mocks.handlers = {};
  mocks.wallet = 'alice';
  mocks.insert.mockResolvedValue({ data: session, error: null });
  mocks.token.mockResolvedValue({ data: { appId: 'app', token: 'token', uid: 1 }, error: null });
  mocks.update.mockResolvedValue({ error: null }); mocks.check.mockResolvedValue(null);
  mocks.join.mockResolvedValue(undefined); mocks.leave.mockResolvedValue(undefined);
  mocks.publish.mockResolvedValue(undefined); mocks.subscribe.mockResolvedValue(undefined);
  mocks.microphone.mockResolvedValue(track()); mocks.camera.mockResolvedValue(track());
});
afterEach(() => { cleanup(); visualActivity.setCall(false, false); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('incoming call query recovery', () => {
  it('shares concurrent startup, subscription and fallback checks, then recovers a ring arriving during the query', async () => {
    const initial = deferred<null>();
    mocks.check.mockReturnValueOnce(initial.promise).mockResolvedValueOnce({
      ...session, caller_address: 'bob', recipient_address: 'alice', created_at: new Date().toISOString(),
    });
    const { result } = renderHook(useCall);
    act(() => { mocks.callSubscription('SUBSCRIBED'); vi.advanceTimersByTime(15_000); });
    expect(mocks.check).toHaveBeenCalledTimes(1);
    act(() => { mocks.callPing({ payload: { id: 'call-1', status: 'ringing' } }); });
    await act(async () => { initial.resolve(null); for (let i = 0; i < 5; i++) await Promise.resolve(); });
    expect(mocks.check).toHaveBeenCalledTimes(2);
    expect(result.current.isIncoming).toBe(true);
  });

  it('skips hidden checks and recovers once on visibility and network recovery', async () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    renderHook(useCall);
    act(() => { mocks.callSubscription('SUBSCRIBED'); mocks.callPing({ payload: { status: 'ringing' } }); vi.advanceTimersByTime(30_000); });
    expect(mocks.check).not.toHaveBeenCalled();
    visibility.mockReturnValue('visible');
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('online')); });
    expect(mocks.check).toHaveBeenCalledTimes(1);
  });

  it('discards a previous wallet response without blocking the current wallet query', async () => {
    const alice = deferred<typeof session | null>(); const bob = deferred<typeof session | null>();
    mocks.check.mockReturnValueOnce(alice.promise).mockReturnValueOnce(bob.promise);
    const { result, rerender } = renderHook(useCall);
    mocks.wallet = 'bob'; rerender();
    expect(mocks.check).toHaveBeenCalledTimes(2);
    await act(async () => { alice.resolve({ ...session, recipient_address: 'alice', created_at: new Date().toISOString() }); });
    expect(result.current.currentCall).toBeNull();
    await act(async () => { bob.resolve({ ...session, recipient_address: 'bob', created_at: new Date().toISOString() }); });
    expect(result.current.isIncoming).toBe(true);
  });
});

describe('call media lifecycle', () => {
  it('ends a session created after the user hangs up, without starting media', async () => {
    const insertion = deferred<{ data: typeof session; error: null }>();
    mocks.insert.mockReturnValue(insertion.promise);
    const { result } = renderHook(useCall);
    let starting!: Promise<void>;
    act(() => { starting = result.current.startCall('bob', 'video'); });
    await act(async () => { await result.current.endCall(); });
    await act(async () => { insertion.resolve({ data: session, error: null }); await starting; });
    expect(result.current.currentCall).toBeNull();
    expect(mocks.token).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith({ status: 'ended' }, 'id', session.id);
  });

  it('closes a microphone that resolves after hangup and never publishes it', async () => {
    const microphone = deferred<ReturnType<typeof track>>();
    mocks.microphone.mockReturnValue(microphone.promise);
    const { result } = renderHook(useCall);
    let starting!: Promise<void>;
    await act(async () => { starting = result.current.startCall('bob', 'video'); for (let i = 0; i < 10; i++) await Promise.resolve(); });
    expect(mocks.microphone).toHaveBeenCalledTimes(1);
    await act(async () => { await result.current.endCall(); });
    const lateTrack = track();
    await act(async () => { microphone.resolve(lateTrack); await starting; });
    expect(lateTrack.close).toHaveBeenCalledTimes(1);
    expect(mocks.publish).not.toHaveBeenCalled();
    expect(mocks.camera).not.toHaveBeenCalled();
    expect(mocks.leave).toHaveBeenCalled();
  });

  it('keeps one start time across audio/video publications and does not render on each second', async () => {
    let renders = 0;
    const { result } = renderHook(() => { renders++; return useCall(); });
    await act(async () => { await result.current.startCall('bob', 'video'); });
    const remote = { audioTrack: track(), videoTrack: track() };
    await act(async () => { await mocks.handlers['user-published'](remote, 'audio'); });
    const startedAt = result.current.callStartedAt;
    await act(async () => { vi.advanceTimersByTime(2000); await Promise.resolve(); });
    await act(async () => { await mocks.handlers['user-published'](remote, 'video'); });
    expect(result.current.callStartedAt).toBe(startedAt);
    const settledRenders = renders;
    await act(async () => { vi.advanceTimersByTime(10_000); await Promise.resolve(); });
    expect(renders).toBe(settledRenders);
    await act(async () => { mocks.handlers['user-left'](); await Promise.resolve(); });
    expect(result.current.currentCall).toBeNull();
    expect(remote.audioTrack.stop).toHaveBeenCalled();
    expect(remote.videoTrack.stop).toHaveBeenCalled();
    expect(mocks.remove).toHaveBeenCalled();
  });

  it('reattaches video to the restored call screen after minimizing', async () => {
    const local = track(); const remote = track();
    mocks.camera.mockResolvedValue(local);
    const { result } = renderHook(useCall);
    await act(async () => { await result.current.startCall('bob', 'video'); });
    const first = document.createElement('div');
    Object.assign(result.current.remoteVideoRef, { current: first });
    await act(async () => { await mocks.handlers['user-published']({ videoTrack: remote }, 'video'); });
    expect(remote.play).toHaveBeenLastCalledWith(first);
    act(() => { result.current.minimizeCall(); });
    const restored = document.createElement('div');
    Object.assign(result.current.remoteVideoRef, { current: restored });
    Object.assign(result.current.localVideoRef, { current: restored });
    act(() => { result.current.maximizeCall(); });
    expect(remote.play).toHaveBeenLastCalledWith(restored);
    expect(local.play).toHaveBeenLastCalledWith(restored);
  });

  it('attaches a call video surface that mounts after the remote publication', async () => {
    const remote = track();
    const { result } = renderHook(useCall);
    await act(async () => { await result.current.startCall('bob', 'video'); });
    await act(async () => { await mocks.handlers['user-published']({ videoTrack: remote }, 'video'); });
    const lateSurface = document.createElement('div');
    result.current.attachRemoteVideo(lateSurface);
    expect(remote.play).toHaveBeenLastCalledWith(lateSurface);
  });
});

it('suspends immediately and resumes only after focus settles, keeping feed paused for minimized calls', () => {
  const activity = createVisualActivity();
  activity.setCall(true, true);
  expect(activity.isVisualActive()).toBe(false);
  activity.setCall(true, false);
  vi.advanceTimersByTime(250);
  expect(activity.isVisualActive()).toBe(true);
  expect(activity.isFeedPlaybackAllowed()).toBe(false);
  activity.setCall(false, false);
  activity.setFocused(false); activity.setFocused(true);
  vi.advanceTimersByTime(249);
  expect(activity.isFeedPlaybackAllowed()).toBe(false);
  vi.advanceTimersByTime(1);
  expect(activity.isFeedPlaybackAllowed()).toBe(true);
  activity.dispose();
});
