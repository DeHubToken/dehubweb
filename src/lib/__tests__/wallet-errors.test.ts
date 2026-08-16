import { describe, it, expect } from 'vitest';
import {
  isUserRejection,
  isRequestAlreadyPending,
  isRequestTimeout,
  describeWalletError,
  WalletRequestTimeoutError,
} from '@/lib/wallet-errors';

/**
 * Shaped like what viem actually throws: a named wrapper whose own `code` is
 * absent, with the provider's EIP-1193 error buried underneath.
 */
function viemError(opts: {
  name: string;
  shortMessage?: string;
  message: string;
  details?: string;
  causeCode?: number | string;
  causeName?: string;
}) {
  return {
    name: opts.name,
    shortMessage: opts.shortMessage,
    message: opts.message,
    details: opts.details,
    cause: opts.causeCode !== undefined || opts.causeName
      ? { name: opts.causeName, code: opts.causeCode, message: opts.details ?? opts.message }
      : undefined,
  };
}

describe('isUserRejection', () => {
  it('finds 4001 nested under a viem wrapper', () => {
    const err = viemError({
      name: 'UserRejectedRequestError',
      shortMessage: 'User rejected the request.',
      message: 'User rejected the request.\n\nDetails: MetaMask Tx Signature: User denied message signature.',
      causeCode: 4001,
    });
    expect(isUserRejection(err)).toBe(true);
  });

  it("accepts ethers' ACTION_REJECTED spelling", () => {
    expect(isUserRejection({ code: 'ACTION_REJECTED', message: 'user rejected action' })).toBe(true);
  });

  it('accepts the wrapper name alone when no code survived', () => {
    expect(isUserRejection({ name: 'UserRejectedRequestError', message: 'nope' })).toBe(true);
  });

  // The regression this module exists for: every one of these used to be
  // reported to the user as "Signature rejected", because the word appears in
  // text viem copied from the provider rather than from any decision they made.
  it('does not call a stale connector a rejection', () => {
    const err = viemError({
      name: 'ProviderDisconnectedError',
      shortMessage: 'The provider is disconnected from all chains.',
      message:
        'The provider is disconnected from all chains.\n\nDetails: the request was rejected by the transport',
      causeCode: 4900,
    });
    expect(isUserRejection(err)).toBe(false);
  });

  it('does not call an already-pending request a rejection', () => {
    const err = viemError({
      name: 'ResourceUnavailableRpcError',
      message: 'Request of type personal_sign already pending for origin. Please wait.',
      causeCode: -32002,
    });
    expect(isUserRejection(err)).toBe(false);
    expect(isRequestAlreadyPending(err)).toBe(true);
  });

  it('survives a cyclic cause chain', () => {
    const a: any = { name: 'A', message: 'a' };
    const b: any = { name: 'B', message: 'b', cause: a };
    a.cause = b;
    expect(isUserRejection(a)).toBe(false);
  });

  it('handles nothing at all', () => {
    expect(isUserRejection(undefined)).toBe(false);
    expect(isUserRejection(null)).toBe(false);
    expect(isUserRejection('user rejected the request')).toBe(false);
  });
});

describe('isRequestTimeout', () => {
  it('recognises the timeout the auth path throws', () => {
    const err = new WalletRequestTimeoutError('signature', 60_000);
    expect(isRequestTimeout(err)).toBe(true);
    // A timeout is neither a decision by the user nor a queue collision.
    expect(isUserRejection(err)).toBe(false);
    expect(isRequestAlreadyPending(err)).toBe(false);
  });

  it('does not mistake other errors for a timeout', () => {
    expect(isRequestTimeout({ name: 'Error', message: 'timed out' })).toBe(false);
    expect(isRequestTimeout(undefined)).toBe(false);
  });
});

describe('describeWalletError', () => {
  it('reports the innermost provider code, not the wrapper', () => {
    const err = viemError({
      name: 'SignMessageError',
      shortMessage: 'Could not sign.',
      message: 'Could not sign.',
      causeCode: 4001,
    });
    expect(describeWalletError(err)).toMatchObject({
      errorName: 'SignMessageError',
      errorCode: 4001,
      shortMessage: 'Could not sign.',
    });
  });

  it('falls back to the first line when there is no shortMessage', () => {
    const err = { name: 'Error', message: 'first line\nsecond line' };
    expect(describeWalletError(err).shortMessage).toBe('first line');
  });

  it('truncates detail so a batch stays readable', () => {
    const err = { name: 'Error', message: 'x'.repeat(1000) };
    expect(describeWalletError(err).detail).toHaveLength(300);
  });
});
