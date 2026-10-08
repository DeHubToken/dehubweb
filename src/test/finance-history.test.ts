import { describe, expect, it } from 'vitest';
import history from '../../supabase/functions/_shared/finance-history.json';

describe('finance history', () => {
  it('names a source for every row', () => {
    const ids = new Set(history.sources.map((s) => s.id));
    for (const row of history.rows) expect(ids.has(row.source)).toBe(true);
  });

  it('adds up to the totals it publishes', () => {
    for (const source of history.sources) {
      const rows = history.rows.filter((r) => r.source === source.id);
      const bnb = rows.reduce((a, r) => a + r.bnb, 0);
      const usd = rows.reduce((a, r) => a + r.usd, 0);
      expect(bnb).toBeCloseTo(source.provenance.totalBnb, 2);
      expect(usd).toBeCloseTo(source.provenance.totalUsd, 0);
      expect(rows[0].date).toBe(source.provenance.firstDay);
      expect(rows[rows.length - 1].date).toBe(source.provenance.lastDay);
      const byWallet = Object.values(source.provenance.byWallet).reduce((a, v) => a + v, 0);
      expect(byWallet).toBeCloseTo(source.provenance.totalBnb, 2);
    }
  });

  it('holds one positive, priced amount per real UTC day, in order', () => {
    let previous = '';
    for (const row of history.rows) {
      expect(row.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(`${row.date}T00:00:00Z`).toISOString().slice(0, 10)).toBe(row.date);
      expect(row.date > previous).toBe(true);
      expect(row.usd).toBeGreaterThan(0);
      expect(row.bnb).toBeGreaterThan(0);
      // A day's implied BNB price has to be a price BNB actually traded at.
      expect(row.usd / row.bnb).toBeGreaterThan(150);
      expect(row.usd / row.bnb).toBeLessThan(800);
      previous = row.date;
    }
  });
});
