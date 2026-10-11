/**
 * Where the original token's trading tax went
 * ===========================================
 * The first DeHub token (BSC, 2021–22) charged a tax on every trade. Part of it
 * bought DeHub back and burned it, part was paid out to holders and stakers as
 * BNB, and part went to DeHub operations to run the company. All three were traced
 * once from the chain into _shared/finance-tax-split.json and
 * _shared/finance-history.json; this file turns them into the summary the
 * Stats page draws and the ledger that proves it, line by line.
 *
 * Kept free of Deno so vitest can check it (src/test/finance-tax-split.test.ts).
 */

import type { LedgerItem } from './ledger.ts';

export interface TaxSplitData {
  note: string;
  period: { from: string; to: string };
  addresses: { label: string; address: string }[];
  buckets: {
    team: { bnb: number; usd: number; grossBnb: number; passedOnBnb: number; payouts: number };
    burned: {
      bnb: number;
      usd: number;
      tokens: number;
      buybacks: number;
      firstDay: string;
      lastDay: string;
      method: string;
    };
    shared: {
      bnb: number;
      usd: number;
      holderBnb: number;
      stakerBnb: number;
      holderClaims: number;
      stakerClaims: number;
      wallets: number;
      fundedBnb: number;
      firstDay: string;
      lastDay: string;
      method: string;
    };
  };
  burns: { date: string; tx: string; bnb: number; bnbUsd: number; usd: number; tokens: number }[];
  shared: {
    date: string;
    holderClaims: number;
    holderBnb: number;
    stakerClaims: number;
    stakerBnb: number;
    bnbUsd: number;
    usd: number;
  }[];
  funding: { date: string; tx: string; from: string; bnb: number; bnbUsd: number; usd: number }[];
}

export interface TaxHistoryEntry {
  date: string;
  source: string;
  tx: string;
  wallet: string;
  route: string;
  bnb: number;
  usd: number;
}

/** The contract every holder and staker claimed their BNB from. */
export const REWARDS_CONTRACT = '0x30E2181EDb3F38Fe00Cf242561875Df1ab617E6c';

const OPERATIONS = new Set([
  '0x5700579d1a9f4e77f14775ac0ff696f1e2525d4f',
  '0x4fe9b55e56fe0927b9d9732cecf9c994379a5bf4',
]);
const TREASURY = '0xbf3039b0bb672b268e8384e30d81b1e6a8a43b2c';

export const TAX_LEDGER_SOURCES = [
  { id: 'bsc_token_tax', label: 'DeHub operations' },
  { id: 'bsc_token_burn', label: 'Bought back and burned' },
  { id: 'bsc_holder_share', label: 'Paid to holders and stakers' },
  { id: 'bsc_holder_funding', label: 'Paid into the holder rewards contract' },
] as const;

/** What a history entry was, in the words the ledger shows beside it. */
export function historyNote(route: string): string {
  if (route === 'collateral') return 'collateral payout';
  if (route === 'to_holders') return 'passed on to holder rewards';
  return 'tax sale';
}

function fundedBy(from: string): string {
  if (OPERATIONS.has(from)) return 'from an operations wallet';
  if (from === TREASURY) return 'from the treasury';
  return `from ${from.slice(0, 6)}…${from.slice(-4)}`;
}

/** The three totals the page draws, without the per-line arrays. */
export function taxSplitSummary(split: TaxSplitData) {
  return { period: split.period, ...split.buckets };
}

/**
 * Every line behind the three totals: each tax payout to DeHub operations (and each
 * time it passed BNB on to holders), each buyback-and-burn, each day of
 * holder and staker claims, and each deposit into the rewards contract.
 */
export function taxLedgerItems(split: TaxSplitData, history: TaxHistoryEntry[]): LedgerItem[] {
  const items: LedgerItem[] = [];
  for (const e of history) {
    items.push({
      date: e.date,
      source: 'bsc_token_tax',
      usd: e.usd,
      amount: e.bnb,
      unit: 'BNB',
      ref: { chain: 'bsc', tx: e.tx },
      note: historyNote(e.route),
    });
  }
  for (const b of split.burns) {
    items.push({
      date: b.date,
      source: 'bsc_token_burn',
      usd: b.usd,
      amount: b.bnb,
      unit: 'BNB',
      ref: { chain: 'bsc', tx: b.tx },
      note: `${b.tokens.toLocaleString('en-US')} DeHub burned`,
    });
  }
  // Claims were 18,000 separate transactions, so they are listed as a total
  // per day, with the contract whose event log holds every one of them.
  for (const s of split.shared) {
    items.push({
      date: s.date,
      source: 'bsc_holder_share',
      usd: s.usd,
      amount: Math.round((s.holderBnb + s.stakerBnb) * 1e6) / 1e6,
      unit: 'BNB',
      count: s.holderClaims + s.stakerClaims,
      ref: { chain: 'bsc', address: REWARDS_CONTRACT },
      note: s.stakerClaims > 0 ? `${s.stakerClaims.toLocaleString('en-US')} to stakers` : undefined,
    });
  }
  for (const f of split.funding) {
    items.push({
      date: f.date,
      source: 'bsc_holder_funding',
      usd: f.usd,
      amount: f.bnb,
      unit: 'BNB',
      ref: { chain: 'bsc', tx: f.tx },
      note: fundedBy(f.from),
    });
  }
  return items;
}
