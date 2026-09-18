import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { isBuyRoute } from '../lib/buy-route';
import { useCryptoPurchase, type PurchaseApi } from './use-crypto-purchase';

const asset = { assetId: 'btc', blockchain: 'btc', symbol: 'BTC', decimals: 8 };
const service = (): PurchaseApi => ({
  assets: vi.fn().mockResolvedValue([asset]), list: vi.fn().mockResolvedValue([]),
  quote: vi.fn(), create: vi.fn(), status: vi.fn(),
});

describe('buy link activation', () => {
  it.each(['/buy', '/buy/', '/app/buy', '/app/buy/'])('loads currencies on direct entry to %s', async pathname => {
    const api = service();
    const { result, unmount } = renderHook(() => useCryptoPurchase(api, 'wallet', 50000, isBuyRoute(pathname)));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.assets).toEqual([asset]);
    expect(api.list).toHaveBeenCalledOnce();
    unmount();
  });

  it('pauses off-page and loads again when the cached buy page returns', async () => {
    const api = service();
    const { result, rerender, unmount } = renderHook(({ path }) => useCryptoPurchase(api, 'wallet', 50000, isBuyRoute(path)), { initialProps: { path: '/app' } });
    expect(result.current.loading).toBe(false);
    expect(api.assets).not.toHaveBeenCalled();
    rerender({ path: '/buy' });
    await waitFor(() => expect(result.current.assets).toEqual([asset]));
    rerender({ path: '/app/wallet' });
    expect(result.current.loading).toBe(false);
    rerender({ path: '/buy' });
    await waitFor(() => expect(api.assets).toHaveBeenCalledTimes(2));
    unmount();
  });

  it('does not show an endless loader before wallet initialization', async () => {
    const api = service();
    const { result, rerender, unmount } = renderHook(({ wallet }) => useCryptoPurchase(api, wallet, 50000, true), { initialProps: { wallet: '' } });
    expect(result.current.loading).toBe(false);
    expect(api.assets).not.toHaveBeenCalled();
    rerender({ wallet: 'wallet' });
    await waitFor(() => expect(result.current.assets).toEqual([asset]));
    unmount();
  });

  it('leaves loading on failure and reloads currencies on retry', async () => {
    const api = service();
    vi.mocked(api.assets).mockRejectedValueOnce(new Error('offline'));
    const { result, unmount } = renderHook(() => useCryptoPurchase(api, 'wallet', 50000, true));
    await waitFor(() => expect(result.current.assetsFailed).toBe(true));
    expect(result.current.loading).toBe(false);
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.assets).toEqual([asset]));
    expect(result.current.assetsFailed).toBe(false);
    unmount();
  });
});
