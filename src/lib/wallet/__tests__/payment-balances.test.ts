import { afterEach, expect, it, vi } from 'vitest';
import { loadPaymentBalances } from '../payment-balances';
import { preferredPayment } from '../../payment-options';
import type { PaymentAsset } from '../../crypto-purchase';

vi.mock('@/lib/solana/address-cache', () => ({ getCachedSolanaAddress: vi.fn() }));
vi.mock('@/lib/contracts/dhb-token', () => ({
  initChainRpcUrls: vi.fn().mockResolvedValue(undefined),
  CHAIN_CONFIGS: { 1: { rpcUrl: 'eth-configured' }, 8453: { rpcUrl: 'base-configured' }, 56: { rpcUrl: 'bsc-configured' }, 4663: { rpcUrl: 'robinhood-configured' } },
}));
vi.mock('@/lib/chains/solana', () => ({ solanaRpcUrl: () => 'sol-configured' }));

const wallet = '0x1111111111111111111111111111111111111111';
const eth: PaymentAsset = { assetId: 'ethereum-eth', symbol: 'ETH', blockchain: 'eth', decimals: 18 };
const base: PaymentAsset = { ...eth, assetId: 'base-eth', blockchain: 'base', route: 'direct' };
const success = (result: string) => ({ ok: true, json: async () => ({ result }) }) as Response;

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

it('shows and selects funded Ethereum when the configured RPC rejects Buy balance reads', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async url => {
    if (url === 'base-configured') return success('0x0');
    if (url === 'eth-configured') return { ok: false, status: 401, json: async () => ({ error: { message: 'unauthorized' } }) } as Response;
    if (url === 'https://ethereum-rpc.publicnode.com') return success('0xde0b6b3a7640000');
    throw new Error('Unexpected endpoint');
  });
  const balances = await loadPaymentBalances([base, eth], wallet);
  expect(balances).toEqual({ 'base-eth': '0', 'ethereum-eth': '1' });
  expect(preferredPayment([base, eth], balances)).toEqual(eth);
  expect(fetchMock.mock.calls.map(([url]) => url).sort()).toEqual(['base-configured', 'eth-configured', 'https://ethereum-rpc.publicnode.com'].sort());
  for (const [, options] of fetchMock.mock.calls) {
    expect(JSON.parse(String(options?.body))).toMatchObject({ method: 'eth_getBalance', params: [wallet, 'latest'] });
  }
});

it('tries only Ethereum endpoints and keeps a failed balance unknown', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
  expect(await loadPaymentBalances([eth], wallet)).toEqual({ 'ethereum-eth': null });
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['eth-configured', 'https://ethereum-rpc.publicnode.com', 'https://eth.drpc.org']);
});

it('moves past a stalled Ethereum RPC after four seconds', async () => {
  vi.useFakeTimers();
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
    if (url === 'eth-configured') return new Promise<Response>((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new Error('timeout')), { once: true });
    });
    return success('0xde0b6b3a7640000');
  });
  const pending = loadPaymentBalances([eth], wallet);
  await vi.advanceTimersByTimeAsync(4000);
  expect(await pending).toEqual({ 'ethereum-eth': '1' });
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

