import { afterEach, expect, it, vi } from 'vitest';
import { libraryRequest } from './libraryRequest';
afterEach(() => vi.useRealTimers());
it('bounds a stalled request and does not retry mutations in the background', async () => {
  vi.useFakeTimers();
  const request = libraryRequest(new Promise<never>(() => {}));
  const rejected = expect(request).rejects.toThrow('timed out');
  await vi.advanceTimersByTimeAsync(30_000);
  await rejected;
  expect(vi.getTimerCount()).toBe(0);
});
