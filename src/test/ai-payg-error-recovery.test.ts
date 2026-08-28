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
 *  - A claim that failed after the transfer was mined threw the hash away, and
 *    the ledger is keyed on that hash — so the DHB was gone with no handle left.
 */
describe('paid AI error recovery', () => {
  it('reads the reason out of the response body, not the wrapper', async () => {
    const error = Object.assign(new Error('Edge Function returned a non-2xx status code'), {
      context: new Response(JSON.stringify({ error: 'Not enough DHB credit for this generation.' }), {
        status: 402,
      }),
    });

    await expect(readFunctionError(error, null)).resolves.toBe(
      'Not enough DHB credit for this generation.',
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

  it('parks an unclaimed transfer instead of losing the hash', () => {
    const source = readFileSync(resolve(__dirname, '../lib/ai-payg.ts'), 'utf8');

    // The throw that ends claimTopUp must record the hash first, or a paid-for
    // transfer becomes unrecoverable.
    expect(source).toMatch(/rememberUnclaimed\(txHash\);\s*\n\s*throw new Error\(/);
    // And a new payment must spend what is already owed before charging again.
    expect(source).toMatch(/await flushUnclaimedTopUps\(\);/);
  });

  it('bounds the chain switch so the paywall cannot wedge', () => {
    const source = readFileSync(resolve(__dirname, '../lib/ai-payg.ts'), 'utf8');

    expect(source).toMatch(/withTimeout\(\s*switchChain\(payChainId\)/);
    // The timeout must not wrap anything that has already been signed.
    expect(source).not.toMatch(/withTimeout\(\s*(result\.wait|writeContractAA)/);
  });
});
