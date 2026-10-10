import { CHAIN_CONFIGS, ETH_CHAIN_ID, initChainRpcUrls } from '@/lib/contracts/dhb-token';
import type { ChainId } from '@/components/app/ChainSelector';

/** Wallet reads can recover when one RPC rejects requests or stops responding. */
export async function walletRpc(chainId: ChainId, method: 'eth_getBalance' | 'eth_call', params: unknown[]): Promise<string> {
  await initChainRpcUrls();
  const configured = CHAIN_CONFIGS[chainId]?.rpcUrl;
  if (!configured) throw new Error('Network unavailable');
  const urls = [...new Set([configured, ...(chainId === ETH_CHAIN_ID ? [
    'https://ethereum-rpc.publicnode.com', 'https://eth.drpc.org',
  ] : [])])];
  for (const url of urls) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), chainId === ETH_CHAIN_ID ? 4000 : 8000);
    try {
      const response = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: controller.signal,
      });
      const body = await response.json();
      if (!response.ok || body.error || typeof body.result !== 'string' || !/^0x[0-9a-f]+$/i.test(body.result)) {
        throw new Error('Balance unavailable');
      }
      return body.result;
    } catch { /* Continue to the next endpoint without turning a failed read into zero. */ }
    finally { clearTimeout(timer); }
  }
  throw new Error('Balance unavailable');
}
