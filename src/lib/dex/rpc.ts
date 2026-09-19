import { FallbackProvider, FetchRequest, JsonRpcProvider, type PerformActionRequest } from 'ethers';
import { BASE_CHAIN_ID, CHAIN_CONFIGS, initChainRpcUrls } from '@/lib/contracts/dhb-token';
import type { DexChainId } from './v4';
import { readWithTimeout } from './read-timeout';

// With quorum 1, ethers can accept a fast SERVER_ERROR as the result before
// starting its backup. Retry only reads after transport failure, never writes.
class DexReadProvider extends FallbackProvider {
  async _perform(request: PerformActionRequest): Promise<any> {
    try { return await super._perform(request); }
    catch (error) {
      if (request.method === 'broadcastTransaction' || !isRpcUnavailable(error)) throw error;
      let lastError = error;
      for (const { provider } of this.providerConfigs.slice(1)) {
        try { return await this._translatePerform(provider, request); }
        catch (next) {
          if (!isRpcUnavailable(next)) throw next;
          lastError = next;
        }
      }
      throw lastError;
    }
  }
}

function isRpcUnavailable(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  return ['SERVER_ERROR', 'TIMEOUT', 'NETWORK_ERROR'].includes(code ?? '')
    || /rate.?limit|\b429\b|exceeded maximum retry limit/i.test(String(error));
}
const providers = new Map<string, FallbackProvider>();
let rpcInitialization: Promise<void> | undefined;
export async function dexProvider(chainId: DexChainId) {
  await (rpcInitialization ??= readWithTimeout(initChainRpcUrls(), 'RPC configuration', 5000).catch(() => {}));
  const urls = [...new Set([CHAIN_CONFIGS[chainId].rpcUrl,
    chainId === BASE_CHAIN_ID ? 'https://base-rpc.publicnode.com' : 'https://bsc-rpc.publicnode.com',
    ...(chainId === BASE_CHAIN_ID ? ['https://base.drpc.org'] : [])])];
  const key = urls.join('|');
  let provider = providers.get(key);
  if (!provider) {
    provider = new DexReadProvider(urls.map((url, index) => {
      const request = new FetchRequest(url);
      request.timeout = 10000;
      request.setThrottleParams({ maxAttempts: 1 });
      return { provider: new JsonRpcProvider(request, chainId, { staticNetwork: true, batchMaxCount: 1 }),
        priority: index + 1, stallTimeout: 1000, weight: 1 };
    }), chainId, { quorum: 1 });
    providers.set(key, provider);
  }
  return provider;
}

