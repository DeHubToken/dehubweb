import { beforeEach, expect, it, vi } from 'vitest';
import { fetchWallet } from '../store';
import { getReplacementToResume } from '../replacement';

const { maybeSingle, eq } = vi.hoisted(() => ({ maybeSingle: vi.fn(), eq: vi.fn() }));
vi.mock('../store', () => ({ fetchWallet: vi.fn(), cacheWallet: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => {
  const query = { select: () => query, eq: (...args: unknown[]) => { eq(...args); return query; },
    is: () => query, order: () => query, limit: () => query, maybeSingle };
  return query;
} } }));
const address = '0x2222222222222222222222222222222222222222';
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchWallet).mockResolvedValue({ ethAddress: address, payload: null });
  maybeSingle.mockResolvedValue({ data: null, error: null });
});
it('resumes the archived replacement only for the current identity and wallet', async () => {
  maybeSingle.mockResolvedValue({ data: { eth_address: 'old' }, error: null });
  await expect(getReplacementToResume('uid')).resolves.toBe(address);
  expect(eq).toHaveBeenCalledWith('user_id', 'uid');
  expect(eq).toHaveBeenCalledWith('replacement_address', address);
});
it('does not escalate an ordinary login failure without a pending archive', async () => {
  await expect(getReplacementToResume('uid')).resolves.toBeNull();
});
it('does not resume when there is no active wallet', async () => {
  vi.mocked(fetchWallet).mockResolvedValue(null);
  await expect(getReplacementToResume('uid')).resolves.toBeNull();
  expect(maybeSingle).not.toHaveBeenCalled();
});
it('refuses recovery when the archive cannot be checked', async () => {
  maybeSingle.mockResolvedValue({ data: null, error: { message: 'lookup failed' } });
  await expect(getReplacementToResume('uid')).rejects.toThrow('lookup failed');
});
