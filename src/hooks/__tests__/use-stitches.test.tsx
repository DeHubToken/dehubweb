import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ reads: [] as Array<{ table: string; ids: number[] }> }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options: string | { defaultValue: string; count?: number; name?: string }) => typeof options === 'string'
      ? options
      : options.defaultValue.replace('{{count}}', String(options.count)).replace('{{name}}', String(options.name)),
  }),
}));
vi.mock('@/lib/api/dehub', () => ({ getNFTInfo: vi.fn() }));
vi.mock('@/lib/remix-links', () => ({ listRemixes: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        in: (_column: string, ids: number[]) => {
          mocks.reads.push({ table, ids });
          if (table === 'remix_links') {
            return Promise.resolve({ data: [{ remix_token_id: 2, source_token_id: 1, source_username: 'maker', source_address: '0xabc' }], error: null });
          }
          return Promise.resolve({ data: [{ source_token_id: 1, stitches: 3 }], error: null });
        },
      };
      return query;
    },
  },
}));

import { StitchAttribution } from '@/components/app/cards/StitchAttribution';

const wrap = (children: ReactNode) => (
  <QueryClientProvider client={new QueryClient()}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>
);

describe('stitch credit on cards', () => {
  it('reads every card on screen in one request per table and shows both credits', async () => {
    render(wrap(<>
      <StitchAttribution tokenId="1" />
      <StitchAttribution tokenId="2" />
      <StitchAttribution tokenId="3" />
    </>));

    const from = await screen.findByRole('link', { name: 'Stitched from @maker' });
    expect(from.getAttribute('href')).toBe('/app/post/1');
    expect(await screen.findByRole('button', { name: '3 Stitches' })).toBeTruthy();
    await waitFor(() => expect(mocks.reads).toHaveLength(2));
    expect(mocks.reads.map(r => r.table).sort()).toEqual(['remix_counts', 'remix_links']);
    for (const read of mocks.reads) expect(read.ids.sort()).toEqual([1, 2, 3]);
  });
});
