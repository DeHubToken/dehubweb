import { describe, expect, it } from 'vitest';
import { formatHolderAmount, holderGateOf, holderRank, isDehubToken } from '@/hooks/use-holder-gate';

describe('holder gate helpers', () => {
  it('reads the gate only when token and chain are both set', () => {
    expect(holderGateOf({ holder_gate_token: null } as any)).toBeNull();
    expect(holderGateOf({ holder_gate_token: '0xabc', holder_gate_chain_id: 56, holder_gate_min: '1000', holder_gate_symbol: 'DHB' } as any))
      .toEqual({ chainId: 56, token: '0xabc', min: 1000, symbol: 'DHB', decimals: 18 });
  });

  it('formats amounts for people', () => {
    expect(formatHolderAmount(1000, 'DHB')).toBe('1,000 tokens');
    expect(formatHolderAmount(1000, 'PEPE')).toBe('1,000 PEPE');
    expect(formatHolderAmount(12.3456, 'DHB')).toBe('12.35 tokens');
    expect(formatHolderAmount(0.0001234)).toBe('0.000123 tokens');
  });

  it('ranks wallets case-insensitively', () => {
    const holders = [{ wallet_address: '0xaa', balance: 9, checked_at: '' }, { wallet_address: '0xbb', balance: 3, checked_at: '' }];
    expect(holderRank(holders, '0xBB')).toBe(2);
    expect(holderRank(holders, '0xcc')).toBeNull();
  });

  it('knows the DeHub token on every chain', () => {
    expect(isDehubToken({ chainId: 56, token: '0x680D3113caf77B61b510f332D5Ef4cf5b41A761D' })).toBe(true);
    expect(isDehubToken({ chainId: 8453, token: '0x680d3113caf77b61b510f332d5ef4cf5b41a761d' })).toBe(false);
  });
});
