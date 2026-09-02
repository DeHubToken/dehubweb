import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
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

  it('records a transfer as unspent instead of losing the hash', () => {
    const source = readFileSync(resolve(__dirname, '../lib/ai-payment.ts'), 'utf8');

    // The hash must be recorded before it is returned, or a job that dies
    // between the signature and the provider costs a second transfer.
    expect(source).toMatch(/writeUnspent\(\[\.\.\.readUnspent\(\), \{ txHash/);
    // And a new payment must spend what is already paid for before charging.
    expect(source).toMatch(/const reusable = remember \? reusablePayment\(/);

    // Keyed on the wallet, not only the hash. localStorage outlives a profile
    // switch, and the server answers a hash belonging to someone else with a
    // 403 rather than the "already spent" the client recovers from — so a
    // payment the previous account abandoned blocked every generation for the
    // next person on that browser until the reuse window expired.
    expect(source).toMatch(/function reusablePayment\(priceDhb: number, wallet: string\)/);
    expect(source).toMatch(/p\.wallet === holder/);
    expect(source).toMatch(/wallet: payer\.toLowerCase\(\)/);
  });

  it('bounds the chain switch so the paywall cannot wedge', () => {
    const source = readFileSync(resolve(__dirname, '../lib/ai-payment.ts'), 'utf8');

    expect(source).toMatch(/withTimeout\(\s*switchChain\(payChainId\)/);
    // The timeout must not wrap anything that has already been signed.
    expect(source).not.toMatch(/withTimeout\(\s*(result\.wait|writeContractAA)/);
  });
});
