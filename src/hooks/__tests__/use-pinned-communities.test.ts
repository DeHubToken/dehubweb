import { beforeEach, expect, it, vi } from 'vitest';
import { usePinnedCommunities, usePinCommunity, useUnpinCommunity } from '../use-communities';
import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from '@/lib/supabase-wallet-client';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key }) }));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => options,
  useMutation: (options: unknown) => options,
  useQueryClient: () => ({}),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn() } }));
vi.mock('@/lib/supabase-wallet-client', () => ({ withWalletHeader: vi.fn((query: unknown) => query) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ walletAddress: 'viewer' }) }));
vi.mock('@/hooks/use-community-admin', () => ({ adminErrorMessage: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function queryResult(data: unknown = [], error: unknown = null) {
  const query: any = { data, error };
  for (const method of ['select', 'eq', 'order', 'insert', 'delete']) {
    query[method] = vi.fn(() => query);
  }
  vi.mocked(supabase.from).mockReturnValue(query);
  return query;
}

beforeEach(() => vi.clearAllMocks());

it('reads another profile’s public pins without requesting that owner’s wallet session', async () => {
  const pins = [{ community_id: 'community', display_order: 0 }];
  const query = queryResult(pins);
  const options = usePinnedCommunities('OWNER') as any;
  await expect(options.queryFn()).resolves.toEqual(pins);
  expect(query.eq).toHaveBeenCalledWith('wallet_address', 'owner');
  expect(withWalletHeader).not.toHaveBeenCalled();
});

it('keeps public read failures visible', async () => {
  const error = { message: 'unavailable' };
  queryResult(null, error);
  await expect((usePinnedCommunities('owner') as any).queryFn()).rejects.toBe(error);
});

it('still authenticates pin and unpin writes as the viewer', async () => {
  queryResult();
  await (usePinCommunity() as any).mutationFn({ communityId: 'community', displayOrder: 0 });
  await (useUnpinCommunity() as any).mutationFn('community');
  expect(withWalletHeader).toHaveBeenCalledTimes(2);
  for (const call of vi.mocked(withWalletHeader).mock.calls) expect(call[1]).toBe('viewer');
});
