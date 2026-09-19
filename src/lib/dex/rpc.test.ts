import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/contracts/dhb-token', () => ({
  BASE_CHAIN_ID: 8453, BNB_CHAIN_ID: 56,
  CHAIN_CONFIGS: { 8453: { rpcUrl: 'https://configured.example', dhbToken: '0x0000000000000000000000000000000000000001' }, 56: { rpcUrl: 'https://bnb.example', dhbToken: '0x0000000000000000000000000000000000000002' } },
  initChainRpcUrls: vi.fn(async () => {}),
}));
import { dexProvider } from './rpc';
import { JsonRpcProvider } from 'ethers';

describe('DEX RPC routing', () => {
  it('uses the configured endpoint and succeeds through a backup when it is rate limited', async () => {
    const provider = await dexProvider(8453);
    const configs = provider.providerConfigs;
    const urls = configs.map(c => (c.provider as JsonRpcProvider)._getConnection().url);
    expect(urls).toEqual(['https://configured.example', 'https://base-rpc.publicnode.com', 'https://base.drpc.org']);
    const calls = configs.map((config, index) => vi.spyOn(config.provider as JsonRpcProvider, '_send').mockImplementation(async payload => {
      const request = Array.isArray(payload) ? payload[0] : payload;
      if (request.method === 'eth_call' && index === 0) throw Object.assign(new Error('429 over rate limit'), { code: 'SERVER_ERROR' });
      return [{ id: request.id, result: request.method === 'eth_blockNumber' ? '0x100' : request.method === 'eth_chainId' ? '0x2105' : '0x' + '0'.repeat(63) + '1' }];
    }));
    try {
      await expect(provider.call({ to: '0x0000000000000000000000000000000000000001', data: '0x12345678' })).resolves.toBe('0x' + '0'.repeat(63) + '1');
      expect(calls[0]).toHaveBeenCalled();
      expect(calls[1]).toHaveBeenCalled();
      calls[1].mockClear();
      vi.spyOn(configs[0].provider, '_perform').mockRejectedValue(Object.assign(new Error('execution reverted'), { code: 'CALL_EXCEPTION', data: '0xdeadbeef' }));
      await expect(provider.call({ to: '0x0000000000000000000000000000000000000001', data: '0x87654321' })).rejects.toMatchObject({ code: 'CALL_EXCEPTION' });
      expect(calls[1]).not.toHaveBeenCalled();
    } finally { await provider.destroy(); }
  });
});
