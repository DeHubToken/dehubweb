import { expect, it } from 'vitest';
import { withReinvestedOperations, type FinanceAccountingDay } from '@/lib/finance-reinvestment';

it('preserves the existing server allocation when month totals have floating-point residue', () => {
  const stats: { days: FinanceAccountingDay[] } = { days: Array.from({ length: 31 }, (_, index) => ({
    date: `2021-11-${String(index + 1).padStart(2, '0')}`,
    revenue: { bsc_token_tax: index === 0 ? 100.1 : 0 },
    costs: { operations_reinvestment: 100.1 / 31 },
  })) };
  expect(withReinvestedOperations(stats)).toEqual(stats);
});

it('adds a remaining allocation without replacing costs already allocated', () => {
  const stats = { days: [{ date: '2021-11-01', revenue: { bsc_token_tax: 100 }, costs: { operations_reinvestment: 60 } }] };
  expect(withReinvestedOperations(stats).days[0].costs.operations_reinvestment).toBe(100);
});

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
