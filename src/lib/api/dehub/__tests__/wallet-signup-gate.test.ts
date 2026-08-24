/**
 * Tests for how authenticateWallet reports a signup the API refused.
 *
 * stream-backend #128 turns away brand-new accounts arriving on a wallet with
 * no on-chain history, and answers 403 with a code and an explanation naming
 * the ways in that DO work. Before this was typed, the caller collapsed every
 * non-OK response into one toast reading "Could not complete sign-in. Please
 * try again." — advice that cannot work, over an explanation that never
 * reached the person it was written for.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { authenticateWallet, WalletSignupBlockedError } from '@/lib/api/dehub/auth';

const ADDRESS = '0x1234567890abcdef1234567890abcdef12345678';
const GATE_MESSAGE =
  'To create an account with a wallet, that wallet needs some history on-chain — a balance, ' +
  'or a transaction it has sent before. This is how we keep automated accounts out. ' +
  'You can sign up right now with Google, Apple, email or phone instead, and connect this ' +
  'wallet to your account afterwards.';

function mockFetch(body: unknown, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), { status }),
  );
}

const call = () => authenticateWallet(ADDRESS, '0xsignature', Date.now(), 8453);

beforeEach(() => localStorage.clear());
afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('authenticateWallet on a blocked signup', () => {
  it('raises WalletSignupBlockedError for the gate code', async () => {
    mockFetch(
      {
        status: false,
        error: true,
        code: 'WALLET_SIGNUP_REQUIRES_HISTORY',
        message: GATE_MESSAGE,
        error_message: GATE_MESSAGE,
      },
      403,
    );

    await expect(call()).rejects.toBeInstanceOf(WalletSignupBlockedError);
  });

  it("keeps the API's wording, which is the only place the alternatives are named", async () => {
    mockFetch(
      { code: 'WALLET_SIGNUP_REQUIRES_HISTORY', message: GATE_MESSAGE },
      403,
    );

    await expect(call()).rejects.toThrow(/Google, Apple, email or phone/);
  });

  it('falls back to its own wording when the API sends the code bare', async () => {
    mockFetch({ code: 'WALLET_SIGNUP_REQUIRES_HISTORY' }, 403);

    await expect(call()).rejects.toThrow(/needs some history on-chain/);
  });

  it('leaves every other failure as a plain Error', async () => {
    mockFetch({ message: 'Invalid signature' }, 400);

    const err = await call().catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(WalletSignupBlockedError);
    expect(err.message).toBe('Invalid signature');
  });

  it('does not mistake a 403 without the code for a blocked signup', async () => {
    mockFetch({ message: 'Forbidden' }, 403);

    const err = await call().catch((e) => e);
    expect(err).not.toBeInstanceOf(WalletSignupBlockedError);
  });
});
