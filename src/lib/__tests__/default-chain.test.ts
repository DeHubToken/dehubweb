import { beforeEach, describe, expect, it } from 'vitest';
import { decideDefaultChain, getDefaultChainId, setDefaultChainWallet } from '@/lib/chains/default-chain';

const WALLET = '0xAbC0000000000000000000000000000000000001';

describe('default chain', () => {
  beforeEach(() => {
    localStorage.clear();
    setDefaultChainWallet(null);
  });

  it('starts new visitors on BNB', () => {
    expect(getDefaultChainId()).toBe(56);
    setDefaultChainWallet(WALLET);
    expect(getDefaultChainId()).toBe(56);
  });

  it('keeps Base for a wallet holding Base tokens, and remembers it', () => {
    setDefaultChainWallet(WALLET);
    expect(decideDefaultChain(WALLET, [{ balance: 0n }, { balance: 5n }])).toBe(8453);
    expect(getDefaultChainId()).toBe(8453);
    // Spending down later does not flip it.
    expect(decideDefaultChain(WALLET, [{ balance: 0n }])).toBe(8453);
  });

  it('picks BNB for an empty Base wallet', () => {
    setDefaultChainWallet(WALLET);
    expect(decideDefaultChain(WALLET, [{ balance: 0n }])).toBe(56);
    expect(getDefaultChainId()).toBe(56);
  });

  it('waits when the Base read was incomplete', () => {
    setDefaultChainWallet(WALLET);
    expect(decideDefaultChain(WALLET, [{ balance: 0n, balanceUnavailable: true }])).toBeNull();
    expect(getDefaultChainId()).toBe(56);
  });
});
