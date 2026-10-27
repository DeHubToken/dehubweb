import { it, expect, vi } from 'vitest';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor, act } from '@testing-library/react';
import { FeedSuperpowersProvider, useFeedSuperpowers } from '../FeedSuperpowersContext';
import { fetchSuperpowerStatus } from '@/lib/api/dehub/superpowers';
vi.mock('@/lib/api/dehub/superpowers', () => ({ fetchSuperpowerStatus: vi.fn() }));
vi.mock('@/contexts/AuthContext', async () => ({ AuthContext: (await import('react')).createContext({ isAuthenticated: true }) }));

it('uses one observer for many cards and propagates mutation invalidation', async () => {
  const fetchStatus = fetchSuperpowerStatus as ReturnType<typeof vi.fn>;
  fetchStatus.mockResolvedValue({ powers: [], boostsLeft: 2 });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const observed: number[] = [];
  function Card() { const status = useFeedSuperpowers(); observed.push(status?.boostsLeft ?? -1); return null; }
  const tree = (count: number) => <QueryClientProvider client={client}><FeedSuperpowersProvider>
    {Array.from({ length: count }, (_, i) => <Card key={i} />)}
  </FeedSuperpowersProvider></QueryClientProvider>;
  const view = render(tree(50));
  await waitFor(() => expect(observed).toContain(2));
  view.rerender(tree(100));
  expect(client.getQueryCache().find({ queryKey: ['superpowers', 'status'] })?.getObserversCount()).toBe(1);
  expect(fetchStatus).toHaveBeenCalledTimes(1);
  fetchStatus.mockResolvedValue({ powers: [], boostsLeft: 1 });
  await act(async () => { await client.invalidateQueries({ queryKey: ['superpowers', 'status'] }); });
  await waitFor(() => expect(observed).toContain(1));
  expect(fetchStatus).toHaveBeenCalledTimes(2);
  view.unmount(); client.clear();
});
