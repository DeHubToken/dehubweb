import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { readFunctionError } from '@/lib/ai-invoke';

/**
 * Two failures cost real money before these guards existed:
 *
 *  - Every rejection from a paid AI function surfaced as Supabase's fixed
 *    "Edge Function returned a non-2xx status code", because `invoke` leaves
 *    `data` null on a non-2xx and the body is only reachable via `error.context`.
 *  - A payment that failed after the transfer was mined threw the hash away,
 *    so the DHB was gone with no handle left to retry it.
 */
describe('paid AI error recovery', () => {
  it('reads the reason out of the response body, not the wrapper', async () => {
    const error = Object.assign(new Error('Edge Function returned a non-2xx status code'), {
      context: new Response(JSON.stringify({ error: 'That payment has already been used up.' }), {
        status: 402,
      }),
    });

    await expect(readFunctionError(error, null)).resolves.toBe(
      'That payment has already been used up.',
    );
  });

  it('prefers an inline body error on a 2xx soft failure', async () => {
    await expect(readFunctionError(null, { error: 'Blocked by the safety filter.' })).resolves.toBe(
      'Blocked by the safety filter.',
    );
  });

  it('falls back to the wrapper message when the body is not JSON', async () => {
    const error = Object.assign(new Error('Edge Function returned a non-2xx status code'), {
      context: new Response('<html>502</html>', { status: 502 }),
    });

    await expect(readFunctionError(error, null)).resolves.toBe(
      'Edge Function returned a non-2xx status code',
    );
  });

  it('does not consume the body, so a caller can still read it', async () => {
    const response = new Response(JSON.stringify({ error: 'Rate limited.' }), { status: 429 });
    const error = Object.assign(new Error('non-2xx'), { context: response });

    await expect(readFunctionError(error, null)).resolves.toBe('Rate limited.');
    expect(response.bodyUsed, 'readFunctionError must clone, not consume').toBe(false);
  });

  /**
   * The unspent ledger, exercised rather than pattern-matched.
   *
   * This block used to assert against the source text of ai-payment.ts, so it
   * broke on a reformat and said nothing about what the code did. The rules it
   * was reaching for are behaviours, and they are checked as behaviours here.
   */
  describe('the unspent ledger', () => {
    const WALLET = '0xAAaaAAaaAAaaAAaaAAaaAAaaAAaaAAaaAAaaAAaa';
    const OTHER = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    const KEY = 'dehub.ai.unspentPayments';

    const seed = (entries: Record<string, unknown>[]) =>
      localStorage.setItem(KEY, JSON.stringify(entries));
    const stored = (): Record<string, unknown>[] =>
      JSON.parse(localStorage.getItem(KEY) || '[]');
    const entry = (over: Record<string, unknown> = {}) => ({
      txHash: '0xdead',
      dhb: 100,
      paidAt: Date.now(),
      wallet: WALLET.toLowerCase(),
      ...over,
    });

    beforeEach(() => localStorage.clear());

    it('offers a paid transfer back to the wallet that paid it', async () => {
      const { reusablePayment } = await import('@/lib/ai-payment');
      seed([entry()]);
      expect(reusablePayment(50, WALLET)?.txHash).toBe('0xdead');
    });

    it('does not offer one wallet the payment another made', async () => {
      const { reusablePayment } = await import('@/lib/ai-payment');
      seed([entry()]);
      // The server answers somebody else's hash with a 403, which the client
      // cannot recover from — so one abandoned payment used to block every
      // generation for the next person on the browser.
      expect(reusablePayment(50, OTHER)).toBeNull();
    });

    it('does not offer a transfer smaller than the job', async () => {
      const { reusablePayment } = await import('@/lib/ai-payment');
      seed([entry({ dhb: 10 })]);
      expect(reusablePayment(50, WALLET)).toBeNull();
    });

    it('does not offer one that has aged out of the reuse window', async () => {
      const { reusablePayment } = await import('@/lib/ai-payment');
      seed([entry({ paidAt: Date.now() - 60 * 60 * 1000 })]);
      expect(reusablePayment(50, WALLET)).toBeNull();
    });

    /**
     * The bug: the server keeps a balance per transfer and hands the remainder
     * back for the next job, but the client dropped the whole hash on any
     * success. A refunded 100 DHB job followed by a 10 DHB one that worked
     * threw away the handle to the other 90.
     */
    it('debits what the job drew and keeps the rest of the transfer', async () => {
      const { forgetPayment, reusablePayment } = await import('@/lib/ai-payment');
      seed([entry({ dhb: 100, pendingDhb: 10 })]);

      forgetPayment('0xdead');

      expect(stored()).toHaveLength(1);
      expect(stored()[0].dhb).toBe(90);
      expect(stored()[0].pendingDhb).toBeUndefined();
      expect(reusablePayment(90, WALLET)?.txHash).toBe('0xdead');
    });

    it('drops it once the job has drawn the lot', async () => {
      const { forgetPayment } = await import('@/lib/ai-payment');
      seed([entry({ dhb: 100, pendingDhb: 100 })]);
      forgetPayment('0xdead');
      expect(stored()).toHaveLength(0);
    });

    it('drops it when the server says the balance is gone', async () => {
      const { forgetPayment } = await import('@/lib/ai-payment');
      // Exhausted beats whatever this side believed was left on it.
      seed([entry({ dhb: 100, pendingDhb: 10 })]);
      forgetPayment('0xdead', true);
      expect(stored()).toHaveLength(0);
    });

    it('spends the lot when it never learned the price', async () => {
      const { forgetPayment } = await import('@/lib/ai-payment');
      // An entry written before pendingDhb existed. Costing one re-paid job is
      // the safe direction; a phantom balance the server refuses is not.
      seed([entry({ dhb: 100 })]);
      forgetPayment('0xdead');
      expect(stored()).toHaveLength(0);
    });

    it('leaves other transfers alone', async () => {
      const { forgetPayment } = await import('@/lib/ai-payment');
      seed([entry(), entry({ txHash: '0xbeef', pendingDhb: 100 })]);
      forgetPayment('0xbeef');
      expect(stored().map((p) => p.txHash)).toEqual(['0xdead']);
    });
  });

  it('bounds the chain switch so the paywall cannot wedge', () => {
    const source = readFileSync(resolve(__dirname, '../lib/ai-payment.ts'), 'utf8');

    expect(source).toMatch(/withTimeout\(\s*switchChain\(payChainId\)/);
    // The timeout must not wrap anything that has already been signed.
    expect(source).not.toMatch(/withTimeout\(\s*(result\.wait|writeContractAA)/);
  });
});
