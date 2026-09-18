import { describe, it, expect } from 'vitest';
import { tokenAmount, sumTokenAmounts } from '../token-amount';

describe('wallet amounts', () => {
  it('preserves small ETH balances across networks instead of parsing display labels', () => {
    const tokens = [
      { balance: 30758000000000n, decimals: 18, formattedBalance: '<0.01' },
      { balance: 7000000000000000n, decimals: 18, formattedBalance: '<0.01' },
      { balance: 0n, decimals: 18, formattedBalance: '0' },
    ];
    expect(sumTokenAmounts(tokens)).toBeCloseTo(0.007030758, 12);
    expect(sumTokenAmounts([...tokens].reverse())).toBeCloseTo(0.007030758, 12);
    expect(tokenAmount(tokens[0]) * 2700).toBeCloseTo(0.0830466);
  });
  it('converts each network decimal scale before adding the same token', () => {
    expect(sumTokenAmounts([
      { balance: 1500000n, decimals: 6 },
      { balance: 2000000000000000000n, decimals: 18 },
    ])).toBe(3.5);
    expect(sumTokenAmounts([])).toBe(0);
  });
});
