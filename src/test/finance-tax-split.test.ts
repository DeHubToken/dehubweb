import { describe, expect, it } from 'vitest';
import split from '../../supabase/functions/_shared/finance-tax-split.json';
import history from '../../supabase/functions/_shared/finance-history.json';
import {
  REWARDS_CONTRACT,
  TAX_LEDGER_SOURCES,
  taxLedgerItems,
  taxSplitSummary,
  type TaxSplitData,
} from '../../supabase/functions/finance-stats/tax-split';

const data = split as TaxSplitData;
const HASH = /^0x[0-9a-f]{64}$/;
const sum = (xs: number[]) => xs.reduce((a, x) => a + x, 0);
const OPERATIONS = ['0x5700579d1a9f4e77f14775ac0ff696f1e2525d4f', '0x4fe9b55e56fe0927b9d9732cecf9c994379a5bf4'];

describe('token tax split', () => {
  it('publishes burn totals that add up from every buyback', () => {
    const { burned } = data.buckets;
    expect(data.burns).toHaveLength(burned.buybacks);
    expect(sum(data.burns.map((b) => b.bnb))).toBeCloseTo(burned.bnb, 3);
    expect(sum(data.burns.map((b) => b.usd))).toBeCloseTo(burned.usd, 0);
    expect(sum(data.burns.map((b) => b.tokens))).toBe(burned.tokens);
    expect(new Set(data.burns.map((b) => b.tx)).size).toBe(data.burns.length);
  });

  it('publishes holder and staker totals that add up from every day of claims', () => {
    const { shared } = data.buckets;
    expect(sum(data.shared.map((d) => d.holderBnb))).toBeCloseTo(shared.holderBnb, 3);
    expect(sum(data.shared.map((d) => d.stakerBnb))).toBeCloseTo(shared.stakerBnb, 3);
    expect(shared.holderBnb + shared.stakerBnb).toBeCloseTo(shared.bnb, 3);
    expect(sum(data.shared.map((d) => d.holderClaims))).toBe(shared.holderClaims);
    expect(sum(data.shared.map((d) => d.stakerClaims))).toBe(shared.stakerClaims);
    expect(sum(data.shared.map((d) => d.usd))).toBeCloseTo(shared.usd, 0);
    // What went into the rewards contract covers what came out of it.
    expect(sum(data.funding.map((f) => f.bnb))).toBeCloseTo(shared.fundedBnb, 3);
    expect(shared.fundedBnb).toBeGreaterThanOrEqual(shared.bnb);
  });

  it('nets out of revenue exactly what the operations wallets passed on to holders', () => {
    const fromOperations = sum(data.funding.filter((f) => OPERATIONS.includes(f.from)).map((f) => f.bnb));
    const prov = history.sources[0].provenance;
    expect(data.buckets.team.passedOnBnb).toBeCloseTo(fromOperations, 3);
    expect(prov.passedOnBnb).toBeCloseTo(fromOperations, 3);
    expect(data.buckets.team.bnb).toBeCloseTo(prov.totalBnb, 3);
    expect(data.buckets.team.usd).toBeCloseTo(prov.totalUsd, 0);
  });

  it('values every line at a real BNB price on its day', () => {
    for (const line of [...data.burns, ...data.funding]) {
      expect(line.tx).toMatch(HASH);
      expect(line.bnbUsd).toBeGreaterThan(150);
      expect(line.bnbUsd).toBeLessThan(800);
      expect(line.usd).toBeCloseTo(line.bnb * line.bnbUsd, 1);
    }
    for (const day of data.shared) {
      expect(day.usd).toBeCloseTo((day.holderBnb + day.stakerBnb) * day.bnbUsd, 1);
    }
  });

  it('gives every ledger line a way to check it on BscScan', () => {
    const items = taxLedgerItems(data, history.entries);
    const ids = new Set(TAX_LEDGER_SOURCES.map((s) => s.id));
    expect(items).toHaveLength(history.entries.length + data.burns.length + data.shared.length + data.funding.length);
    for (const item of items) {
      expect(ids.has(item.source as (typeof TAX_LEDGER_SOURCES)[number]['id'])).toBe(true);
      expect(item.ref?.chain).toBe('bsc');
      expect(item.ref?.tx ?? item.ref?.address).toBeTruthy();
    }
    const daily = items.filter((i) => i.source === 'bsc_holder_share');
    expect(daily.every((i) => i.ref?.address === REWARDS_CONTRACT && (i.count ?? 0) > 0)).toBe(true);
  });

  it('summarises without the per-line arrays', () => {
    const summary = taxSplitSummary(data);
    expect(Object.keys(summary).sort()).toEqual(['burned', 'period', 'shared', 'team']);
    expect(summary.period.from <= summary.period.to).toBe(true);
  });
});
