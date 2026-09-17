import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCryptoPurchase, type PurchaseApi } from './use-crypto-purchase';
import type { PaymentQuote, Purchase } from '../lib/crypto-purchase';

const asset = { assetId: 'eth', blockchain: 'eth', symbol: 'ETH', decimals: 18 };
const saved: Purchase = { id: 'saved', originAsset: 'eth', depositAddress: 'deposit', amountInFormatted: '0.1', expiresAt: Date.now() / 1000 + 3600, settlement: 'PROCESSING' };
function api(): PurchaseApi {
  return { assets: vi.fn().mockResolvedValue([asset]), list: vi.fn().mockResolvedValue([]), quote: vi.fn().mockResolvedValue({ amountInFormatted: '0.1' }), create: vi.fn().mockResolvedValue(saved), status: vi.fn().mockResolvedValue(saved) };
}

describe('payment recovery and request races', () => {
  it('does not send twice when recording a broadcast payment loses its response', async () => {
    const service = api();
    const direct = { ...saved, route: 'direct' as const, settlement: 'DIRECT_PENDING' };
    service.list = vi.fn().mockResolvedValue([direct]);
    service.status = vi.fn().mockResolvedValue(direct);
    service.confirm = vi.fn().mockRejectedValue(new Error('Connection lost'));
    const send = vi.fn().mockResolvedValue('0xsent');
    const { result, unmount } = renderHook(() => useCryptoPurchase(service, 'wallet', 50000, true));
    await waitFor(() => expect(result.current.purchase?.id).toBe(direct.id));
    await act(async () => { await result.current.pay(direct, send); });
    expect(result.current.purchase?.paymentTxHash).toBe('0xsent');
    await act(async () => { await result.current.pay(result.current.purchase!, send); });
    expect(send).toHaveBeenCalledTimes(1);
    unmount();
  });
  it('discards an old quote after the amount changes while the request is in flight', async () => {
    const service = api();
    let resolve!: (quote: PaymentQuote) => void;
    service.quote = vi.fn(() => new Promise<PaymentQuote>(done => { resolve = done; }));
    const { result, rerender, unmount } = renderHook(({ amount }) => useCryptoPurchase(service, 'wallet', amount, true), { initialProps: { amount: 50000 } });
    await waitFor(() => expect(result.current.assets).toHaveLength(1));
    act(() => result.current.selectAsset(asset));
    let pending!: Promise<void>;
    act(() => { pending = result.current.price(); });
    rerender({ amount: 60000 });
    await act(async () => { resolve({ amountInFormatted: '0.1' }); await pending; });
    expect(result.current.quote).toBeNull();
    unmount();
  });
  it('restores a server purchase without needing a local deposit address', async () => {
    const service = api();
    service.list = vi.fn().mockResolvedValue([saved]);
    const { result, unmount } = renderHook(() => useCryptoPurchase(service, 'wallet', 50000, true));
    await waitFor(() => expect(result.current.purchase?.id).toBe('saved'));
    expect(service.status).toHaveBeenCalledWith('saved');
    unmount();
  });
  it('creates only once on a double click and reuses the retry key after a lost response', async () => {
    const service = api();
    let reject!: (error: Error) => void;
    service.create = vi.fn(() => new Promise<Purchase>((_, fail) => { reject = fail; }));
    const { result, unmount } = renderHook(() => useCryptoPurchase(service, 'wallet', 50000, true));
    await waitFor(() => expect(result.current.assets).toHaveLength(1));
    act(() => result.current.selectAsset(asset));
    await act(async () => { await result.current.price(); });
    let first!: Promise<unknown>;
    act(() => { first = result.current.create(); void result.current.create(); });
    expect(service.create).toHaveBeenCalledTimes(1);
    const firstKey = vi.mocked(service.create).mock.calls[0][0].requestId;
    await act(async () => { reject(new Error('Connection lost')); await first; });
    service.create = vi.fn().mockResolvedValue(saved);
    await act(async () => { await result.current.create(); });
    expect(service.create).toHaveBeenCalledWith(expect.objectContaining({ requestId: firstKey }));
    unmount();
  });
});
