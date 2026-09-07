// Cross-app parity for the derived Solana wallet.
//
// dehub-mobile derives the same address from the same key (libs/solana-seed.ts
// + libs/solana-derive.ts) using @solana/web3.js `Keypair.fromSeed`, where web
// uses @noble's ed25519 to keep web3.js off the unlock path. Two
// implementations of one address is exactly the situation that silently
// diverges, and the cost of divergence here is a user who is shown one deposit
// address on their phone and a different one in the browser — with real SOL
// sent to whichever they happened to copy.
//
// The vectors below were produced by RUNNING the mobile implementation against
// its own dependencies, not by copying this one's output. Do not hand-edit: if
// the derivation ever intentionally changes, regenerate them from the mobile
// repo — and note that doing so moves every existing user's address.
import { describe, expect, it } from 'vitest';
import { deriveSolanaAddress, deriveSolanaSeed } from '../derive';

/** m/44'/60'/0'/0/0 of the standard "abandon × 11 / about" test mnemonic. */
const ABANDON_KEY = '0x1ab42cc412b618bdea3a599e3c9bae199ebf030895b039e9db1e30dafb12b727';
const ABANDON_SEED = 'ad049508832cc69a5c1bb8a524251734ca51ac96d98cb13cdb3b283587304db3';
const ABANDON_SOLANA = '48Mr8FYZiZx2riVj6yRafaNS8SCW2wf5aY1QDXYKSGDe';

const ONE_KEY = '0x0000000000000000000000000000000000000000000000000000000000000001';
const ONE_SOLANA = '8SeHbnMtzmcQVyDAc3VAe1ajHHpudUstnGMEYYB6AcYC';

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');

describe('deriveSolanaSeed', () => {
  it('matches the seed the mobile app derives', () => {
    expect(toHex(deriveSolanaSeed(ABANDON_KEY))).toBe(ABANDON_SEED);
  });

  it('ignores the 0x prefix and surrounding whitespace', () => {
    expect(toHex(deriveSolanaSeed(`  ${ABANDON_KEY.slice(2)}  `))).toBe(ABANDON_SEED);
  });

  it('refuses anything that is not a 32-byte key', () => {
    expect(() => deriveSolanaSeed('0xdeadbeef')).toThrow(/malformed EVM private key/);
    expect(() => deriveSolanaSeed('')).toThrow(/malformed EVM private key/);
  });
});

describe('deriveSolanaAddress', () => {
  it('matches the address the mobile app shows for the same wallet', () => {
    expect(deriveSolanaAddress(ABANDON_KEY)).toBe(ABANDON_SOLANA);
  });

  it('matches on a second, unrelated key', () => {
    expect(deriveSolanaAddress(ONE_KEY)).toBe(ONE_SOLANA);
  });

  it('is deterministic', () => {
    expect(deriveSolanaAddress(ABANDON_KEY)).toBe(deriveSolanaAddress(ABANDON_KEY));
  });

  it('gives different wallets different addresses', () => {
    expect(deriveSolanaAddress(ABANDON_KEY)).not.toBe(deriveSolanaAddress(ONE_KEY));
  });
});
