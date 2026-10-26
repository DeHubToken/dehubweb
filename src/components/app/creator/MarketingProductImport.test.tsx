import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MarketingProductImport } from './MarketingProductImport';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ walletAddress: 'alice' }) }));
vi.mock('@/lib/api/dehub/core', () => ({ ensureFreshToken: async () => 'session' }));
vi.mock('@/hooks/use-surface-draft', async () => {
  const { useState } = await import('react');
  return { useSurfaceDraft: (_key: string, initial: string) => useState(initial) };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('reviews fetched product text and applies it only after explicit selection without fetching images', async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ reviewRequired: true,
    sourceUrl: 'https://shop.example.com/product', finalUrl: 'https://shop.example.com/product', retrievedAt: '2026-10-26T00:00:00Z',
    products: [{ name: 'Tea tin', description: 'Whole leaf tea', brand: 'North', source: 'JSON-LD Product', imageUrls: ['https://shop.example.com/tea.jpg'] }],
  }) });
  vi.stubGlobal('fetch', fetcher);
  const useDetails = vi.fn();
  render(<MarketingProductImport onUse={useDetails} />);
  fireEvent.change(screen.getByRole('textbox', { name: 'creator.marketing.import.url' }), { target: { value: 'https://shop.example.com/product' } });
  fireEvent.click(screen.getByRole('button', { name: 'creator.marketing.import.action' }));
  await screen.findByText('Tea tin');
  expect(useDetails).not.toHaveBeenCalled();
  expect(screen.queryAllByRole('img')).toHaveLength(0);
  expect(fetcher).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'creator.marketing.import.use' }));
  expect(useDetails).toHaveBeenCalledWith({ name: 'Tea tin', description: 'Whole leaf tea', brand: 'North', source: 'JSON-LD Product' }, 'https://shop.example.com/product');
});
