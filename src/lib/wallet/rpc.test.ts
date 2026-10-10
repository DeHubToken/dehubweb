import { afterEach, expect, it, vi } from 'vitest';
vi.mock('@/lib/contracts/dhb-token', () => ({
  ETH_CHAIN_ID: 1,
  CHAIN_CONFIGS: { 1: { rpcUrl: 'configured-rpc' }, 8453: { rpcUrl: 'base-rpc' } },
  initChainRpcUrls: vi.fn().mockResolvedValue(undefined),
}));
import { walletRpc } from './rpc';

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
const result = (value: unknown) => ({ ok: true, json: async () => ({ result: value }) }) as Response;

it('recovers a rejected Ethereum endpoint without changing the requested balance', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce({ ok: false, json: async () => ({ error: { code: 403 } }) } as Response)
    .mockResolvedValueOnce(result('0xde0b6b3a7640000'));
  const params = ['0x1111111111111111111111111111111111111111', 'latest'];
  await expect(walletRpc(1, 'eth_getBalance', params)).resolves.toBe('0xde0b6b3a7640000');
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls[1][0]).toBe('https://ethereum-rpc.publicnode.com');
  expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toMatchObject({ method: 'eth_getBalance', params });
});

it('does not turn missing or malformed RPC results into a zero balance', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(result(undefined));
  await expect(walletRpc(1, 'eth_call', [])).rejects.toThrow('Balance unavailable');
});

it('aborts a stalled endpoint and clears timers after fallback succeeds', async () => {
  vi.useFakeTimers();
  vi.spyOn(globalThis, 'fetch').mockImplementation((url, init) => url === 'configured-rpc'
    ? new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('timeout'))))
    : Promise.resolve(result('0x1')));
  const read = walletRpc(1, 'eth_getBalance', []);
  await vi.advanceTimersByTimeAsync(4000);
  await expect(read).resolves.toBe('0x1');
  expect(vi.getTimerCount()).toBe(0);
});
