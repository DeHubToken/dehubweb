import { describe, it, expect } from 'vitest';
import { stakedFromBalanceData } from '@/hooks/use-dhb-holdings';

/**
 * The staked half of a user's DHB comes from the API and nowhere else.
 *
 * The wallet page used to re-derive it in the browser and subtract any unstake
 * *request* recorded in Supabase — but those requests are settled by hand from
 * a treasury address, so the pool's outbound log never shows one and the
 * subtraction fired against DHB that had never moved. Reading the API's
 * `balanceData` is what keeps the wallet agreeing with the profile, the badge
 * ladder and the leaderboard.
 */
describe('stakedFromBalanceData', () => {
  it('sums the staked rows across every chain', () => {
    // A real account: a legacy BNB contract position plus a Base pool stake,
    // no liquid DHB anywhere. The API reports 11,100,000 and so must we.
    const rows = [
      { chainId: 56, staked: 3100000.09806, walletBalance: 0 },
      { chainId: 8453, staked: 8000000, walletBalance: 0 },
    ];
    expect(stakedFromBalanceData(rows)).toBeCloseTo(11100000.09806, 5);
  });

  it('counts a stake the wallet balance cannot see', () => {
    // The whole point: walletBalance 0 must not imply staked 0.
    expect(stakedFromBalanceData([{ staked: 8000000 }])).toBe(8000000);
  });

  it('ignores rows with no usable staked figure', () => {
    expect(
      stakedFromBalanceData([
        { staked: 500 },
        { staked: undefined },
        { staked: Number.NaN },
        {} as { staked?: number },
      ]),
    ).toBe(500);
  });

  it('is zero when the API sent nothing back', () => {
    expect(stakedFromBalanceData(undefined)).toBe(0);
    expect(stakedFromBalanceData(null)).toBe(0);
    expect(stakedFromBalanceData([])).toBe(0);
  });
});
