/**
 * Tests for the Solana login proof.
 *
 * The base58 encoder here is hand-rolled — @solana/web3.js is 350 kB and this
 * runs on the login path — so it is checked against `bs58`, the encoder every
 * Solana tool actually uses, rather than against itself. A signature that
 * encodes even slightly wrong is rejected by the server as a forgery, and the
 * user is told their wallet has no history, which is not remotely the problem.
 *
 * The cases that break naive implementations are leading zero bytes: they
 * contribute nothing to the arithmetic and have to be counted separately, and
 * roughly one signature in 256 starts with one.
 *
 * `bs58` is imported without being declared in package.json: it is already
 * pinned in package-lock as a dependency of @solana/web3.js, which IS ours,
 * and declaring it would regenerate the lockfile for a test-only import. If
 * web3.js ever drops it this suite fails loudly, which is the right outcome.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import bs58 from 'bs58';
import { signSolanaLoginProof } from '@/lib/solana/wallet';

const LOGIN_MESSAGE =
  'Welcome to DeHub!\n\nClick to sign in for authentication.\n' +
  'Signatures are valid for 24 hours.\n' +
  'Your wallet address is 0x6fe89b2ac9c8dda4b2ea3e8d786dfe249422c3e0.\n' +
  'It is Sat, 30 Aug 2026 18:02:00 GMT.';

const SOL_ADDRESS = 'CuieVDEDtLo7FypA9SbLM9saXFdb1dsshEkyErMqkRQq';

/** A stand-in for `window.phantom.solana`. */
function phantomReturning(signature: Uint8Array) {
  return {
    isPhantom: true,
    publicKey: { toBase58: () => SOL_ADDRESS },
    connect: vi.fn().mockResolvedValue({ publicKey: { toBase58: () => SOL_ADDRESS } }),
    disconnect: vi.fn(),
    signTransaction: vi.fn(),
    signMessage: vi.fn().mockResolvedValue({ signature }),
  };
}

function randomSignature(seed: number): Uint8Array {
  const bytes = new Uint8Array(64);
  // Deterministic, so a failure is reproducible.
  let x = seed || 1;
  for (let i = 0; i < 64; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    bytes[i] = x & 0xff;
  }
  return bytes;
}

describe('signSolanaLoginProof', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    delete (window as any).phantom;
    delete (window as any).solana;
    vi.restoreAllMocks();
  });

  it('encodes the signature exactly as bs58 does', async () => {
    const signature = randomSignature(42);
    (window as any).phantom = { solana: phantomReturning(signature) };

    const proof = await signSolanaLoginProof(LOGIN_MESSAGE);

    expect(proof).not.toBeNull();
    expect(proof!.address).toBe(SOL_ADDRESS);
    expect(proof!.signature).toBe(bs58.encode(signature));
  });

  it('handles a signature with leading zero bytes', async () => {
    const signature = randomSignature(7);
    signature[0] = 0;
    signature[1] = 0;
    (window as any).phantom = { solana: phantomReturning(signature) };

    const proof = await signSolanaLoginProof(LOGIN_MESSAGE);

    expect(proof!.signature).toBe(bs58.encode(signature));
    expect(proof!.signature.startsWith('11')).toBe(true);
  });

  it('signs the message it was given, as utf8', async () => {
    const provider = phantomReturning(randomSignature(3));
    (window as any).phantom = { solana: provider };

    await signSolanaLoginProof(LOGIN_MESSAGE);

    const [bytes, display] = provider.signMessage.mock.calls[0];
    expect(new TextDecoder().decode(bytes)).toBe(LOGIN_MESSAGE);
    expect(display).toBe('utf8');
  });

  it('returns null when Phantom is not installed', async () => {
    expect(await signSolanaLoginProof(LOGIN_MESSAGE)).toBeNull();
  });

  it('returns null for a Phantom too old to sign messages', async () => {
    const provider: any = phantomReturning(randomSignature(1));
    delete provider.signMessage;
    (window as any).phantom = { solana: provider };

    expect(await signSolanaLoginProof(LOGIN_MESSAGE)).toBeNull();
  });

  it('returns null when the user declines, rather than throwing', async () => {
    const provider = phantomReturning(randomSignature(1));
    provider.signMessage = vi.fn().mockRejectedValue({ code: 4001, message: 'User rejected' });
    (window as any).phantom = { solana: provider };

    // A declined second prompt must not take the login down with it — the EVM
    // signature already given is what actually signs the person in.
    await expect(signSolanaLoginProof(LOGIN_MESSAGE)).resolves.toBeNull();
  });

  it('returns null on a signature of the wrong length', async () => {
    (window as any).phantom = { solana: phantomReturning(new Uint8Array(32)) };

    expect(await signSolanaLoginProof(LOGIN_MESSAGE)).toBeNull();
  });
});
