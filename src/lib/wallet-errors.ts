/**
 * Wallet error classification
 * ===========================
 * Answers the one question the auth path kept getting wrong: did the PERSON
 * refuse, or did the connection fail?
 *
 * It used to decide with `error.message.includes('rejected')`. viem appends a
 * `Details:` block carrying the provider's own wording, so a connector that had
 * gone stale, a request the wallet superseded, and a popup that never surfaced
 * could all arrive with that word somewhere in the text — and every one of them
 * was reported back as something the user had done. People were told they had
 * rejected a signature they never saw, which is both wrong and unactionable.
 *
 * EIP-1193 gives the reliable answer instead: 4001 is user rejection and
 * nothing else is. It sits on the innermost provider error, though — viem wraps
 * its errors several layers deep and the outermost object usually carries no
 * `code` at all — so the whole cause chain has to be walked rather than just
 * the object that was thrown.
 *
 * @module lib/wallet-errors
 */

/** Cause chains are short in practice; the bound is only here to stop a cycle. */
const MAX_CAUSE_DEPTH = 8;

type AnyError = {
  name?: unknown;
  code?: unknown;
  message?: unknown;
  shortMessage?: unknown;
  details?: unknown;
  cause?: unknown;
};

/** The thrown error plus every `cause` beneath it, outermost first. */
function causeChain(error: unknown): AnyError[] {
  const chain: AnyError[] = [];
  const seen = new Set<unknown>();
  let node = error as AnyError | undefined | null;

  while (node && typeof node === 'object' && chain.length < MAX_CAUSE_DEPTH) {
    if (seen.has(node)) break;
    seen.add(node);
    chain.push(node);
    node = node.cause as AnyError | undefined | null;
  }

  return chain;
}

function codeOf(error: AnyError): number | string | undefined {
  const code = error.code;
  return typeof code === 'number' || typeof code === 'string' ? code : undefined;
}

function stringOf(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Did the user actually decline?
 *
 * `ACTION_REJECTED` is ethers' spelling of the same thing — Trust and Phantom
 * both surface errors that have been through an ethers layer at some point, so
 * matching only the numeric code would miss them.
 */
export function isUserRejection(error: unknown): boolean {
  return causeChain(error).some((entry) => {
    const code = codeOf(entry);
    return code === 4001 || code === 'ACTION_REJECTED' || entry.name === 'UserRejectedRequestError';
  });
}

/**
 * MetaMask answers -32002 when a request of the same type is already open —
 * usually a popup hiding behind the browser window. Worth telling apart because
 * the fix is "go and look at your wallet", not "try again", and retrying is
 * exactly what makes it worse.
 */
export function isRequestAlreadyPending(error: unknown): boolean {
  return causeChain(error).some((entry) => codeOf(entry) === -32002);
}

/**
 * Thrown by the auth path when a wallet request neither resolves nor rejects.
 *
 * This is the failure the other guards can never see: a signature request
 * fired while the wallet's connect popup was still closing gets queued and
 * never surfaced, so the promise just sits there. Nothing settles, so nothing
 * is thrown, so nothing is logged — and every `finally` that was going to
 * release the login state never runs. Racing the request against a timer is
 * the only way to turn that silence into an error the flow can recover from.
 */
export class WalletRequestTimeoutError extends Error {
  constructor(operation: string, afterMs: number) {
    super(`Wallet ${operation} request went unanswered for ${Math.round(afterMs / 1000)}s`);
    this.name = 'WalletRequestTimeoutError';
  }
}

/** Did the wallet simply never answer? (See WalletRequestTimeoutError.) */
export function isRequestTimeout(error: unknown): boolean {
  return causeChain(error).some((entry) => entry.name === 'WalletRequestTimeoutError');
}

export type WalletErrorReport = {
  /** Name of the outermost error, e.g. `UserRejectedRequestError`. */
  errorName?: string;
  /** The innermost provider code — the one that actually means something. */
  errorCode?: number | string;
  /** viem's one-line summary where there is one, else the first line thrown. */
  shortMessage?: string;
  /** Raw text, truncated: enough to read in a log row, small enough to store. */
  detail?: string;
};

const DETAIL_MAX = 300;

/**
 * Flatten an error into something worth writing to `client_error_logs`.
 * Deliberately small: these rows are read by eye, and a full viem stack in the
 * metadata column makes the batch too large to skim.
 */
export function describeWalletError(error: unknown): WalletErrorReport {
  const chain = causeChain(error);
  const outer = chain[0];
  if (!outer) return { detail: typeof error === 'string' ? error.slice(0, DETAIL_MAX) : undefined };

  // Innermost wins: the provider's own code is the informative one, and the
  // wrappers above it are viem's bookkeeping.
  let errorCode: number | string | undefined;
  for (const entry of chain) {
    const code = codeOf(entry);
    if (code !== undefined) errorCode = code;
  }

  const shortMessage =
    stringOf(outer.shortMessage) ??
    stringOf(outer.message)?.split('\n')[0] ??
    undefined;

  const detail = stringOf(outer.details) ?? stringOf(outer.message);

  return {
    errorName: stringOf(outer.name),
    errorCode,
    shortMessage,
    detail: detail?.slice(0, DETAIL_MAX),
  };
}
