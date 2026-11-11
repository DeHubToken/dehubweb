import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('chunk recovery', () => {
  const reload = vi.fn();
  let listeners: Record<string, () => void> = {};
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-13T12:00:00Z'));
    sessionStorage.clear();
    reload.mockReset();
    listeners = {};
    vi.stubGlobal('window', { location: { reload, origin: 'https://riftn.com' }, addEventListener: (type: string, fn: () => void) => { listeners[type] = fn; } });
    vi.stubGlobal('navigator', {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('advances recovery after a fast reload instead of claiming navigation is still pending', async () => {
    sessionStorage.setItem('chunk-reload-at', String(Date.now() - 100));
    sessionStorage.setItem('chunk-reload-tier', '1');
    const { recoverFromChunkError } = await import('../lazy-with-retry');
    expect(recoverFromChunkError()).toBe('reloading');
    await vi.advanceTimersByTimeAsync(1500);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('chunk-reload-tier')).toBe('2');
  });

  it('deduplicates same-document requests and stops waiting when navigation is blocked', async () => {
    const { recoverFromChunkError } = await import('../lazy-with-retry');
    expect(recoverFromChunkError()).toBe('reloading');
    expect(recoverFromChunkError()).toBe('reloading');
    await vi.advanceTimersByTimeAsync(1500 + 5000);
    expect(recoverFromChunkError()).toBe('exhausted');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload forever when both attempts already failed', async () => {
    sessionStorage.setItem('chunk-reload-at', String(Date.now() - 100));
    sessionStorage.setItem('chunk-reload-tier', '2');
    const { recoverFromChunkError } = await import('../lazy-with-retry');
    expect(recoverFromChunkError()).toBe('exhausted');
    expect(reload).not.toHaveBeenCalled();
  });

  it('rejects failed preloads even when reload does not replace the document', async () => {
    const { lazyWithRetry } = await import('../lazy-with-retry');
    const error = new Error('Failed to fetch dynamically imported module');
    const component = lazyWithRetry(vi.fn().mockRejectedValue(error));
    const assertion = expect(component.preload()).rejects.toBe(error);
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    await vi.advanceTimersByTimeAsync(1500);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('surfaces application errors without reloading the page', async () => {
    const { lazyWithRetry } = await import('../lazy-with-retry');
    const error = new Error('Invalid wallet configuration');
    const component = lazyWithRetry(vi.fn().mockRejectedValue(error));
    const assertion = expect(component.preload()).rejects.toBe(error);
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    expect(reload).not.toHaveBeenCalled();
  });

  it('does not reload or spend an attempt when the page is navigating away (Safari sign-in)', async () => {
    const { recoverFromChunkError } = await import('../lazy-with-retry');
    // Safari cancels pending downloads when the page leaves for Google sign-in.
    listeners.pagehide?.();
    expect(recoverFromChunkError()).toBe('reloading');
    await vi.advanceTimersByTimeAsync(3000);
    expect(reload).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('chunk-reload-tier')).toBeNull();
  });

  it('drops a queued reload when the page starts leaving before it fires', async () => {
    const { recoverFromChunkError } = await import('../lazy-with-retry');
    expect(recoverFromChunkError()).toBe('reloading');
    listeners.beforeunload?.();
    await vi.advanceTimersByTimeAsync(3000);
    expect(reload).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('chunk-reload-tier')).toBeNull();
  });

  it('recovers normally once a cancelled navigation has had time to land', async () => {
    const { recoverFromChunkError } = await import('../lazy-with-retry');
    listeners.pagehide?.();
    await vi.advanceTimersByTimeAsync(4100);
    expect(recoverFromChunkError()).toBe('reloading');
    await vi.advanceTimersByTimeAsync(1500);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('chunk-reload-tier')).toBe('1');
  });
});
