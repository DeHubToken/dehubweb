import { it, expect, vi } from 'vitest';
import { predictSafeAddress } from '../smart-account-address';
it('derives the existing profile without a network or wallet call', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
  expect(await predictSafeAddress('0x0e240d0eaa38f6c210afab2925cda30e0b86882b')).toBe('0xd627ad6a37e91985b9413a721a000feed9d9125f');
  expect(fetch).not.toHaveBeenCalled();
  fetch.mockRestore();
});
it('rejects malformed owners', async () => {
  expect(await predictSafeAddress('invalid')).toBeNull();
});
