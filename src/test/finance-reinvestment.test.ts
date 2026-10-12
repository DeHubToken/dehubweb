import { expect, it } from 'vitest';
import { withReinvestedOperations, type FinanceAccountingDay } from '@/lib/finance-reinvestment';

it('averages retained operating funds after recorded costs without counting rewards twice', () => {
  const stats: { days: FinanceAccountingDay[] } = { days: [
    { date: '2022-01-01', revenue: { bsc_token_tax: 100 }, costs: { digitalocean: 10 } },
    { date: '2022-01-02', revenue: { bsc_token_tax: -20 }, costs: {} },
    { date: '2026-01-01', revenue: { ads: 30 }, costs: { digitalocean: 5 } },
  ] };
  const result = withReinvestedOperations(stats);
  expect(result.days[0].costs.operations_reinvestment).toBe(35);
  expect(result.days[1].costs.operations_reinvestment).toBe(35);
  expect(result.days[2].costs).toEqual({ digitalocean: 5 });
  expect(stats.days[0].costs).toEqual({ digitalocean: 10 });
  expect(withReinvestedOperations(result)).toEqual(result);
});

it('does not subtract real expenses when a month has no retained operating funds', () => {
  const stats: { days: FinanceAccountingDay[] } = { days: [{ date: '2022-01-01', revenue: { bsc_token_tax: -20 }, costs: { digitalocean: 40 } }] };
  expect(withReinvestedOperations(stats)).toEqual(stats);
});
