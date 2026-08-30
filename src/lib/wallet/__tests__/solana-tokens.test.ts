/**
 * Tests for the Solana balance reader.
 *
 * The interesting behaviour is not "does it call the RPC" but what it does
 * with the answers: an owner accumulates empty token accounts from every
 * airdrop they have ever touched, Token-2022 holdings live behind a second
 * program and are invisible to the usual lookup, and a decimals mistake
 * mis-scales a balance by orders of magnitude rather than failing loudly.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getSolanaTokenBalances } from '@/lib/wallet/solana-tokens';
import { SOLANA_TOKENS } from '@/lib/chains/solana';

const OWNER = 'CuieVDEDtLo7FypA9SbLM9saXFdb1dsshEkyErMqkRQq';

function tokenAccount(mint: string, amount: string, decimals: number) {
  return { account: { data: { parsed: { info: { mint, tokenAmount: { amount, decimals } } } } } };
}

/** Answers each RPC method from a description, per token program. */
function mockRpc(opts: {
  lamports?: number | null;
  spl?: unknown[];
  spl2022?: unknown[];
  fail?: boolean;
}) {
  let tokenCalls = 0;
  return vi.fn().mockImplementation((_url: string, init: any) => {
    if (opts.fail) return Promise.reject(new Error('ECONNREFUSED'));
    const { method } = JSON.parse(init.body);
    if (method === 'getBalance') {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          result: opts.lamports === null ? null : { value: opts.lamports ?? 0 },
        }),
      });
    }
    // First call is the classic SPL program, second is Token-2022.
    const value = tokenCalls++ === 0 ? (opts.spl ?? []) : (opts.spl2022 ?? []);
    return Promise.resolve({ ok: true, json: async () => ({ result: { value } }) });
  });
}

describe('getSolanaTokenBalances', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockRpc({}));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns nothing when no Solana address is linked', async () => {
    expect(await getSolanaTokenBalances(null)).toEqual([]);
    expect(await getSolanaTokenBalances(undefined)).toEqual([]);
    expect(await getSolanaTokenBalances('')).toEqual([]);
  });

  it('converts lamports to SOL at nine decimals', async () => {
    vi.stubGlobal('fetch', mockRpc({ lamports: 1_500_000_000 }));

    const tokens = await getSolanaTokenBalances(OWNER);
    const sol = tokens.find(t => t.symbol === 'SOL');

    expect(sol?.formattedBalance).toBe('1.5');
    expect(sol?.isNative).toBe(true);
    expect(sol?.chainId).toBe(101);
  });

  it('shows SOL even at zero, so the chain is visibly present', async () => {
    vi.stubGlobal('fetch', mockRpc({ lamports: 0 }));

    const tokens = await getSolanaTokenBalances(OWNER);

    expect(tokens.find(t => t.symbol === 'SOL')?.formattedBalance).toBe('0');
  });

  it('names known mints and scales them by their own decimals', async () => {
    vi.stubGlobal(
      'fetch',
      mockRpc({ lamports: 0, spl: [tokenAccount(SOLANA_TOKENS.USDC, '2500000', 6)] }),
    );

    const usdc = (await getSolanaTokenBalances(OWNER)).find(t => t.symbol === 'USDC');

    expect(usdc?.name).toBe('USD Coin');
    expect(usdc?.formattedBalance).toBe('2.5');
    expect(usdc?.isCustom).toBeFalsy();
  });

  it('drops empty token accounts, which owners accumulate by the dozen', async () => {
    const junkMint = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
    vi.stubGlobal(
      'fetch',
      mockRpc({ lamports: 0, spl: [tokenAccount(junkMint, '0', 6)] }),
    );

    const tokens = await getSolanaTokenBalances(OWNER);

    expect(tokens.some(t => t.address === junkMint)).toBe(false);
  });

  it('includes Token-2022 holdings, which the classic lookup cannot see', async () => {
    const mint2022 = 'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL';
    vi.stubGlobal(
      'fetch',
      mockRpc({ lamports: 0, spl: [], spl2022: [tokenAccount(mint2022, '4200000000', 9)] }),
    );

    const found = (await getSolanaTokenBalances(OWNER)).find(t => t.address === mint2022);

    expect(found?.formattedBalance).toBe('4.2');
    // Unknown mint — labelled by a truncated address and flagged as custom.
    expect(found?.isCustom).toBe(true);
    expect(found?.symbol).toContain('…');
  });

  it('lists known mints at zero when the owner holds no account for them', async () => {
    vi.stubGlobal('fetch', mockRpc({ lamports: 0 }));

    const tokens = await getSolanaTokenBalances(OWNER);

    expect(tokens.find(t => t.symbol === 'USDC')?.formattedBalance).toBe('0');
    expect(tokens.find(t => t.symbol === 'USDT')?.formattedBalance).toBe('0');
  });

  it('returns an empty list when the RPC is unreachable, never throwing', async () => {
    vi.stubGlobal('fetch', mockRpc({ fail: true }));

    // A Solana outage costs the Solana rows and nothing else — the wallet page
    // must still render Base and BNB.
    await expect(getSolanaTokenBalances(OWNER)).resolves.toBeInstanceOf(Array);
  });
});
