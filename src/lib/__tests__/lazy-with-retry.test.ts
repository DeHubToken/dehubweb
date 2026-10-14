import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('chunk recovery', () => {
  const reload = vi.fn();
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-13T12:00:00Z'));
    sessionStorage.clear();
    reload.mockReset();
    vi.stubGlobal('window', { location: { reload } });
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
    await vi.advanceTimersByTimeAsync(0);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('chunk-reload-tier')).toBe('2');
  });

  it('deduplicates same-document requests and stops waiting when navigation is blocked', async () => {
    const { recoverFromChunkError } = await import('../lazy-with-retry');
    expect(recoverFromChunkError()).toBe('reloading');
    expect(recoverFromChunkError()).toBe('reloading');
    await vi.advanceTimersByTimeAsync(5000);
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
});
