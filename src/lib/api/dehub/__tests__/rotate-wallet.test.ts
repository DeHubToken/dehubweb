/**
 * Tests for rotateWallet — the call that moves an existing account onto the
 * wallet this browser actually holds.
 *
 * It exists for the state where the account is linked to one address and the
 * browser can only derive another. Signing in from there does not reach the
 * account: the signature registers as a brand-new signup, so the person either
 * lands in a second empty account or, since the wallet-history gate, in no
 * account at all — the failure two users reported this week.
 *
 * What matters here is the same as for the exchange beside it: the failure
 * modes have to stay distinguishable. "Nothing to move" is the ordinary answer
 * for a genuinely new signup and must not be logged as a fault, while anything
 * else means the sign-in that follows is about to create a duplicate or be
 * refused outright.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { DEHUB_API_BASE } from '@/lib/api/dehub/core';
import { rotateWallet, WalletNotLinkedError } from '@/lib/api/dehub/auth';

const ADDRESS = '0xAABBCCDDEEFF00112233445566778899AABBCCDD';
const SIGNATURE = '0xsignature';
const TIMESTAMP = 1_800_000_000;

function mockFetch(body: unknown, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), { status }),
  );
}

function rotate() {
  return rotateWallet(ADDRESS, SIGNATURE, TIMESTAMP, 8453, 'supabase-jwt');
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('rotateWallet', () => {
  it('posts to the rotate endpoint with the destination signature', async () => {
    mockFetch({ status: true, result: { address: ADDRESS.toLowerCase() } });
    await rotate();

    const [url, opts] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe(`${DEHUB_API_BASE}/api/auth/rotate-wallet`);
    expect(opts?.method).toBe('POST');
    // Lowercased, like every other address the API is given.
    expect(JSON.parse(String(opts?.body))).toMatchObject({
      address: ADDRESS.toLowerCase(),
      sig: SIGNATURE,
      timestamp: TIMESTAMP,
      chainId: 8453,
    });
  });

  it('sends the Supabase token in the body, never as a custom header', async () => {
    // The x-supabase-authorization header is not in the API's CORS allowlist,
    // so a browser refuses the preflight and the request never leaves — which
    // is how the rescue shipped dead. The body field is the form that works
    // cross-origin; this test keeps the header from coming back.
    mockFetch({ status: true, result: {} });
    await rotate();

    const [, opts] = vi.mocked(fetch).mock.calls[0];
    const headers = opts?.headers as Record<string, string>;
    expect(headers['x-supabase-authorization']).toBeUndefined();
    expect(JSON.parse(String(opts?.body)).supabaseAccessToken).toBe('supabase-jwt');
  });

  it('raises WalletNotLinkedError when there is no account to move', async () => {
    mockFetch(
      { code: 'WALLET_NOT_LINKED', message: 'This login is not linked to an account yet.' },
      409,
    );
    await expect(rotate()).rejects.toBeInstanceOf(WalletNotLinkedError);
  });

  it('raises WalletNotLinkedError for an ambiguous link', async () => {
    mockFetch({ code: 'WALLET_LINK_AMBIGUOUS', message: 'Linked to more than one account.' }, 409);
    await expect(rotate()).rejects.toBeInstanceOf(WalletNotLinkedError);
  });

  it('keeps other refusals distinct — the destination already has an account', async () => {
    mockFetch({ code: 'ADDRESS_IN_USE', message: 'That wallet already has a DeHub account.' }, 409);

    const error = await rotate().catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(WalletNotLinkedError);
    expect(error.message).toMatch(/already has a DeHub account/);
  });

  it('surfaces a server that has no such endpoint', async () => {
    mockFetch({}, 404);
    await expect(rotate()).rejects.toThrow();
  });
});
