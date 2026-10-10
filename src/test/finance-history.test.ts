import { describe, expect, it } from 'vitest';
import history from '../../supabase/functions/_shared/finance-history.json';

const HASH = /^0x[0-9a-f]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

describe('finance history', () => {
  it('names a source for every entry', () => {
    const ids = new Set(history.sources.map((s) => s.id));
    for (const entry of history.entries) expect(ids.has(entry.source)).toBe(true);
  });

  it('adds up to the totals it publishes', () => {
    for (const source of history.sources) {
      const entries = history.entries.filter((e) => e.source === source.id);
      const bnb = entries.reduce((a, e) => a + e.bnb, 0);
      const usd = entries.reduce((a, e) => a + e.usd, 0);
      expect(entries.length).toBe(source.provenance.payouts);
      expect(bnb).toBeCloseTo(source.provenance.totalBnb, 2);
      expect(usd).toBeCloseTo(source.provenance.totalUsd, 0);
      expect(entries[0].date).toBe(source.provenance.firstDay);
      expect(entries[entries.length - 1].date).toBe(source.provenance.lastDay);
      const byWallet = Object.values(source.provenance.byWallet).reduce((a, v) => a + v, 0);
      expect(byWallet).toBeCloseTo(source.provenance.totalBnb, 2);
    }
  });

  it('gives every entry a checkable transaction, wallet and day price', () => {
    const wallets = new Set(
      history.sources.flatMap((s) => s.provenance.addresses.map((a) => a.address.toLowerCase())),
    );
    let previous = 0;
    for (const e of history.entries) {
      expect(e.tx).toMatch(HASH);
      expect(wallets.has(e.wallet)).toBe(true);
      expect(new Date(`${e.date}T00:00:00Z`).toISOString().slice(0, 10)).toBe(e.date);
      expect(e.block).toBeGreaterThanOrEqual(previous);
      expect(e.bnb).toBeGreaterThan(0);
      // A day's BNB price has to be one BNB actually traded at, and the USD is that price times the BNB.
      expect(e.bnbUsd).toBeGreaterThan(150);
      expect(e.bnbUsd).toBeLessThan(800);
      expect(e.usd).toBeCloseTo(e.bnb * e.bnbUsd, 1);
      previous = e.block;
    }
  });

  it('lists only well-formed addresses', () => {
    for (const source of history.sources) {
      for (const a of source.provenance.addresses) expect(a.address).toMatch(ADDRESS);
    }
  });
});
