/**
 * Wallet balance freshness
 * ========================
 * `useWalletTokens` holds its answer for five minutes and only re-polls while
 * a wallet surface is on screen, so a purchase that has already settled on
 * chain leaves the UI showing the old numbers until the page is reloaded.
 * Anything that moves the user's balance calls `refreshWalletBalances` when it
 * finishes.
 *
 * The gateway's delivery status is also not the moment the tokens exist: the
 * DHB lands on chain first and the status row catches up afterwards. Watching
 * the token contract directly is what makes the purchase feel instant, so
 * `watchForDhbArrival` polls `balanceOf` and fires the second the balance
 * moves.
 */

import type { QueryClient } from '@tanstack/react-query';
import { invalidateSelfBadgeBalance } from '@/hooks/use-self-badge-balance';
import { CHAIN_CONFIGS, BASE_CHAIN_ID, initChainRpcUrls } from '@/lib/contracts/dhb-token';

/** keccak('balanceOf(address)')[0..4] */
const BALANCE_OF_SELECTOR = '0x70a08231';

/**
 * Re-read every balance the app shows for the signed-in wallet.
 *
 * Covers the per-chain token lists and the badge balance, which is derived
 * from the same holdings and would otherwise keep a stale tier on screen.
 */
export function refreshWalletBalances(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ['wallet-tokens'] });
  invalidateSelfBadgeBalance(queryClient);
}

/**
 * Read a wallet's DHB balance straight off the token contract.
 *
 * Deliberately a bare JSON-RPC `eth_call` rather than the AA stack: this runs
 * on a timer during a purchase and must not touch the signer or ask the user
 * to unlock anything.
 */
export async function readDhbBalance(
  address: string,
  chainId: number = BASE_CHAIN_ID,
): Promise<bigint> {
  await initChainRpcUrls();
  const config = CHAIN_CONFIGS[chainId as keyof typeof CHAIN_CONFIGS];
  if (!config) throw new Error(`No chain config for ${chainId}`);
  const data = BALANCE_OF_SELECTOR + address.replace('0x', '').toLowerCase().padStart(64, '0');
  const res = await fetch(config.rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [{ to: config.dhbToken, data }, 'latest'],
    }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return BigInt(json.result ?? '0x0');
}

interface WatchOptions {
  address: string;
  /** Balance before the purchase. Read it before the payment leaves the wallet. */
  baseline: bigint;
  /** Fired once, with the new balance, as soon as it exceeds the baseline. */
  onArrive: (balance: bigint) => void;
  chainId?: number;
  intervalMs?: number;
  timeoutMs?: number;
}

/**
 * Poll for DHB landing in `address`, and stop at the first increase.
 *
 * Returns a cancel function; call it when the drawer closes or the purchase
 * resolves some other way, so the timer never outlives the screen that
 * started it.
 */
export function watchForDhbArrival({
  address,
  baseline,
  onArrive,
  chainId = BASE_CHAIN_ID,
  intervalMs = 2000,
  timeoutMs = 10 * 60 * 1000,
}: WatchOptions): () => void {
  let stopped = false;
  const deadline = Date.now() + timeoutMs;

  const tick = async () => {
    if (stopped) return;
    try {
      const balance = await readDhbBalance(address, chainId);
      if (stopped) return;
      if (balance > baseline) {
        stopped = true;
        onArrive(balance);
        return;
      }
    } catch {
      // A dropped RPC read is not a failed delivery — try again next tick.
    }
    if (stopped || Date.now() > deadline) return;
    setTimeout(tick, intervalMs);
  };

  setTimeout(tick, intervalMs);
  return () => { stopped = true; };
}
