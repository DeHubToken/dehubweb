import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let stop = () => {};
let watcher: typeof import('@/lib/version-check');
let id = 'new-build';
const fetchVersion = vi.fn(async (_input: RequestInfo | URL, _options?: RequestInit) => ({ ok: true, json: async () => ({ id, note: 'Changes', url: '' }) }));
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-03T00:00:00Z'));
  vi.stubEnv('PROD', true);
  vi.stubGlobal('__BUILD_ID__', 'running-build');
  vi.stubGlobal('fetch', fetchVersion);
  fetchVersion.mockClear();
  id = 'new-build';
  sessionStorage.clear();
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  watcher = await import('@/lib/version-check');
});
afterEach(() => { stop(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('web update detection', () => {
  it('checks at boot instead of leaving a stale page silent for three minutes', async () => {
    const notify = vi.fn();
    stop = watcher.startVersionWatch(notify);
    await flush();
    expect(fetchVersion).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledWith({ id: 'new-build', note: 'Changes', url: '' });
    expect(fetchVersion.mock.calls[0]).toEqual(expect.arrayContaining([expect.stringContaining('/version.json?t='), { cache: 'no-store' }]));
  });
  it('does not offer an update when the page already has the deployed build', async () => {
    id = 'running-build';
    const notify = vi.fn();
    stop = watcher.startVersionWatch(notify); await flush();
    expect(notify).not.toHaveBeenCalled();
  });
  it('keeps watching after a notice and announces a later deploy without duplicate notices', async () => {
    const notify = vi.fn(); stop = watcher.startVersionWatch(notify); await flush();
    await vi.advanceTimersByTimeAsync(60000);
    expect(notify).toHaveBeenCalledOnce();
    id = 'next-build';
    await vi.advanceTimersByTimeAsync(60000);
    expect(notify).toHaveBeenCalledTimes(2);
    expect(notify.mock.calls[1][0].id).toBe('next-build');
  });
  it('restores a notice lost on unmount even when the old notified flag exists', async () => {
    sessionStorage.setItem('version-notified-id', id);
    const notify = vi.fn(); stop = watcher.startVersionWatch(notify); await flush(); stop();
    stop = watcher.startVersionWatch(notify); await flush();
    expect(notify).toHaveBeenCalledTimes(2);
  });
  it('honours explicit dismissal while still discovering the next deploy', async () => {
    watcher.dismissVersionUpdate(id);
    const notify = vi.fn(); stop = watcher.startVersionWatch(notify); await flush();
    expect(notify).not.toHaveBeenCalled();
    id = 'later-build'; await vi.advanceTimersByTimeAsync(60000);
    expect(notify).toHaveBeenCalledOnce();
  });
  it('does not poll a hidden page, and checks immediately when it returns', async () => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    const notify = vi.fn(); stop = watcher.startVersionWatch(notify);
    await vi.advanceTimersByTimeAsync(120000);
    expect(fetchVersion).not.toHaveBeenCalled();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange')); await flush();
    expect(notify).toHaveBeenCalledOnce();
  });
  it('checks on browser history restoration without flooding repeated events', async () => {
    id = 'running-build'; const notify = vi.fn(); stop = watcher.startVersionWatch(notify); await flush();
    await vi.advanceTimersByTimeAsync(16000); id = 'restored-new-build';
    window.dispatchEvent(new Event('pageshow')); window.dispatchEvent(new Event('online')); await flush();
    expect(notify).toHaveBeenCalledOnce();
    expect(fetchVersion).toHaveBeenCalledTimes(2);
  });
  it('stops notifying after cleanup, including a pending request', async () => {
    const notify = vi.fn(); stop = watcher.startVersionWatch(notify); stop(); await flush();
    await vi.advanceTimersByTimeAsync(120000); window.dispatchEvent(new Event('pageshow')); await flush();
    expect(notify).not.toHaveBeenCalled();
    expect(fetchVersion).toHaveBeenCalledOnce();
  });
});
