import { afterEach, expect, it, vi } from 'vitest';
import { readWithTimeout } from './read-timeout';
afterEach(() => vi.useRealTimers());
it('releases a stalled read with a useful error and cleans up its timer', async () => {
  vi.useFakeTimers();
  const result = readWithTimeout(new Promise(() => {}), 'Pool preparation', 100);
  const assertion = expect(result).rejects.toThrow('Pool preparation timed out');
  await vi.advanceTimersByTimeAsync(100); await assertion;
  expect(vi.getTimerCount()).toBe(0);
});
it('does not leave a timer behind after a successful read', async () => {
  vi.useFakeTimers(); expect(await readWithTimeout(Promise.resolve(42), 'Pool')).toBe(42);
  expect(vi.getTimerCount()).toBe(0);
});
