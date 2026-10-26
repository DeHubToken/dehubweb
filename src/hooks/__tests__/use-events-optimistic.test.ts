import { beforeEach, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { useToggleRsvp } from '../use-events';

const state = vi.hoisted(() => ({ client: null as any }));
vi.mock('@tanstack/react-query', async importOriginal => ({
  ...await importOriginal<typeof import('@tanstack/react-query')>(),
  useMutation: (options: any) => options,
  useQueryClient: () => state.client,
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ walletAddress: 'viewer' }) }));
vi.mock('@/lib/supabase-wallet-client', () => ({ withWalletHeader: (query: any) => query }));
vi.mock('@/i18n/copy', () => ({ translateCopy: (_key: string, options: any) => options.defaultValue }));

beforeEach(() => { state.client = new QueryClient(); });
it('moves the RSVP immediately and rolls back only that event after failure', async () => {
  const event = { id: 'one', going_count: 5, interested_count: 2, is_private: false, gate_fee: 0 };
  const key = ['events', 'global', 'upcoming', 'viewer'];
  state.client.setQueryData(key, [event, { ...event, id: 'two' }]);
  state.client.setQueryData(['event-rsvp', 'one', 'viewer'], { status: 'interested' });
  const mutation = useToggleRsvp() as any;
  const variables = { eventId: 'one', status: 'going' };
  const context = await mutation.onMutate(variables);
  expect(state.client.getQueryData(key)[0]).toMatchObject({ going_count: 6, interested_count: 1 });
  expect(state.client.getQueryData(['event-rsvp', 'one', 'viewer']).status).toBe('going');
  state.client.setQueryData(key, (rows: any[]) => rows.map(row => row.id === 'two' ? { ...row, going_count: 99 } : row));
  mutation.onError(new Error('offline'), variables, context);
  expect(state.client.getQueryData(key)[0]).toEqual(event);
  expect(state.client.getQueryData(key)[1].going_count).toBe(99);
  expect(state.client.getQueryData(['event-rsvp', 'one', 'viewer']).status).toBe('interested');
});

it.each([{ is_private: true, gate_fee: 0 }, { is_private: false, gate_fee: 10 }])('does not optimistically grant gated admission', async gate => {
  state.client.setQueryData(['event', 'one'], { id: 'one', ...gate });
  state.client.setQueryData(['event-rsvp', 'one', 'viewer'], null);
  const mutation = useToggleRsvp() as any;
  expect(await mutation.onMutate({ eventId: 'one', status: 'going' })).toBeUndefined();
  expect(state.client.getQueryData(['event-rsvp', 'one', 'viewer'])).toBeNull();
});
