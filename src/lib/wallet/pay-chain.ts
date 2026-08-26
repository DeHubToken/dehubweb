/**
 * Which chain a DHB payment leaves on
 * ===================================
 * Every DHB spend on the site used to open with the same question — "Base or
 * BNB?" — and it is a question only the buyer's own wallet can answer. This
 * answers it for them: read the DHB balance on each chain the payee accepts and
 * take the first one that covers the bill.
 *
 * **Base always comes first.** It is the default network, the only chain with a
 * DHB pool to swap into and the only one the fiat gateway delivers on. So it
 * heads the order, and it is also where a payment that cannot be covered
 * anywhere is sent to fail — failing on the chain the buyer can actually top up
 * beats failing on the one they cannot.
 *
 * Only Base and BNB are ever candidates, and that is a correctness rule rather
 * than a shortlist: those are the two chains where the built-in wallet signs as
 * its **Safe**. On any other chain the same wallet acts as its owner EOA, which
 * is a different backend account, so the money would arrive from an address the
 * server does not recognise as the payer.
 *
 * A balance read that throws counts as zero rather than aborting the pick. One
 * flaky RPC must not strand somebody whose coins are on the other chain — the
 * worst case is falling back to Base, which is where we would have started.
 */

import { getERC20Balance } from '@/lib/contracts/aa-utils';
import { BASE_CHAIN_ID, BNB_CHAIN_ID, getChainConfig } from '@/lib/contracts/dhb-token';
import type { ChainId } from '@/components/app/ChainSelector';

/** Preference order for spending DHB. Base first, always. */
export const PAY_CHAIN_ORDER: ChainId[] = [BASE_CHAIN_ID as ChainId, BNB_CHAIN_ID as ChainId];

export interface PayChainPick {
  chainId: ChainId;
  /** False when no candidate held enough — the caller still gets Base. */
  covered: boolean;
  /** DHB held on the chosen chain, whole tokens, for "you have X" copy. */
  balanceDhb: number;
}

/**
 * Pick the chain a DHB payment should go out on.
 *
 * `accepted` is the set the payee will take — the `chains` array off a server
 * quote, usually. Anything outside {@link PAY_CHAIN_ORDER} is ignored, and an
 * empty intersection still yields Base rather than throwing, because the caller
 * is mid-purchase and a thrown error here reads as "the site is broken" rather
 * than "you are short".
 */
export async function pickPayChain(
  payer: string,
  amountWei: bigint,
  accepted?: number[],
): Promise<PayChainPick> {
  const matching = PAY_CHAIN_ORDER.filter(id => !accepted || accepted.includes(id));
  const candidates = matching.length ? matching : [PAY_CHAIN_ORDER[0]];

  const balances = await Promise.all(
    candidates.map(id =>
      getERC20Balance(getChainConfig(id).dhbToken, payer, id).catch(() => BigInt(0)),
    ),
  );

  const covering = balances.findIndex(balance => balance >= amountWei);
  const chosen = covering >= 0 ? covering : 0;

  return {
    chainId: candidates[chosen],
    covered: covering >= 0,
    balanceDhb: Number(balances[chosen]) / 1e18,
  };
}
