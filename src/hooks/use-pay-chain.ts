/**
 * Which chain the pay button is about to use
 * ==========================================
 * The label half of {@link pickPayChain}. A drawer that is about to spend
 * somebody's DHB should say where it is coming from before they press the
 * button, not after.
 *
 * Two things this does deliberately:
 *
 * - **The address read is silent.** Nobody asked for anything yet — the drawer
 *   merely opened — so a locked built-in wallet must not be sent to the unlock
 *   dialog for a caption. It stays quiet and the label simply does not appear;
 *   the real pick at pay time prompts properly.
 * - **The wallet stack is imported at call time.** These drawers are reachable
 *   from feed cards, and `scripts/check-entry-bundle.mjs` fails the build if
 *   wagmi/web3auth land in the entry chunk.
 *
 * The answer is advisory. It is re-read at pay time, because a drawer can sit
 * open for minutes and the balance behind it is not ours.
 */

import { useEffect, useState } from 'react';
import type { PayChainPick } from '@/lib/wallet/pay-chain';

/**
 * @param amountDhb what is about to be spent, whole DHB; null/0 disables.
 * @param accepted  chain ids the payee will take, off the server quote.
 */
export function usePayChain(
  amountDhb: number | null | undefined,
  accepted?: number[],
): PayChainPick | null {
  const [pick, setPick] = useState<PayChainPick | null>(null);
  // Arrays are a fresh identity every render; the ids are what matter.
  const acceptedKey = (accepted || []).join(',');

  useEffect(() => {
    if (!amountDhb || amountDhb <= 0) {
      setPick(null);
      return;
    }
    let cancelled = false;
    setPick(null);

    (async () => {
      const [{ pickPayChain }, { getWalletAddress }, { toWei }] = await Promise.all([
        import('@/lib/wallet/pay-chain'),
        import('@/lib/contracts/aa-utils'),
        import('@/lib/contracts/dhb-token'),
      ]);
      const payer = await getWalletAddress({ silent: true });
      const result = await pickPayChain(
        payer,
        toWei(amountDhb),
        acceptedKey ? acceptedKey.split(',').map(Number) : undefined,
      );
      if (!cancelled) setPick(result);
    })().catch(() => {
      // Locked, signed out, or every RPC down. The caption is not worth a
      // console error, and pay time will raise a real one.
      if (!cancelled) setPick(null);
    });

    return () => { cancelled = true; };
  }, [amountDhb, acceptedKey]);

  return pick;
}
