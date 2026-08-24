/**
 * Paying for a dubbing session in DHB.
 * ====================================
 *
 * One transfer, at the end, for the minutes actually listened to — the same
 * way a PPV unlock or a tip is paid, from the DHB the listener already holds.
 * Signing every minute is not something you can ask of someone in the middle
 * of live audio, so the minutes are counted server-side and the wallet is
 * asked once.
 *
 * Deliberately not routed through the AI credit balance. DHB is the token the
 * app runs on and every listener already has one; making them fund a separate
 * balance first would be a second money path for no reason.
 *
 * The transfer itself now lives in `@/lib/dhb-payment`, shared with the daily
 * posting allowance, which pays the same way for the same reasons.
 */

import { payDhb, readDhbBalance } from '@/lib/dhb-payment';

export { readDhbBalance };

export interface DubPaymentResult {
  txHash: string;
  chain: 'Base' | 'BNB';
}

/** Send `amountDhb` to the treasury and return the mined transaction. */
export async function payForDubbing(amountDhb: number, treasury: string): Promise<DubPaymentResult> {
  const { txHash, chain } = await payDhb(amountDhb, treasury, {
    context: 'Stage dubbing',
    shortfallMessage: (amount, held) =>
      `Not enough DHB. This session costs ${amount.toLocaleString()} DHB and you hold ${held.toLocaleString()}.`,
  });
  return { txHash, chain };
}
