import { afterEach, expect, it, vi } from 'vitest';
import { readWalletBalance } from './read-timeout';
afterEach(() => vi.useRealTimers());
it('returns a successful read without waiting for slower chains', async () => {
  await expect(readWalletBalance(Promise.resolve(['balance']))).resolves.toEqual(['balance']);
});
it('settles a hanging RPC into an error and clears its timer', async () => {
  vi.useFakeTimers();
  const pending = readWalletBalance(new Promise(() => {}));
  const result = expect(pending).rejects.toThrow('timed out');
  await vi.advanceTimersByTimeAsync(15_000);
  await result;
  expect(vi.getTimerCount()).toBe(0);
});
