// ── Twitter World Cup Giveaway — winner recognition ──
//
// These users won the Twitter World Cup giveaway (top creators by views on a
// World Cup post). The 200,000 DHB prize is credited ON-CHAIN separately; at
// announcement time the DHB token contract is paused, so the prize is surfaced
// across the app as an AWARDED / PENDING prize.
//
// IMPORTANT: this is intentionally NOT folded into the user's spendable balance
// (that figure is read from real on-chain holdings and gates real spending).
// Everything below is presented as a clearly-labelled pending prize so we never
// show a winner tokens/USD they can't actually use yet. Once the contract
// resumes and the transfer lands, the real on-chain balance reflects it and
// `PENDING` can be flipped to false (or this recognition removed).

export const WORLD_CUP_GIVEAWAY = {
  campaign: 'Twitter World Cup Giveaway',
  amount: 200_000,
  token: 'DHB',
  /** Credited to the in-app (custodial) balance; not spendable on-chain until
   *  the DHB token contract resumes transfers. */
  pending: true,
  /** Winner-facing status line. */
  note: 'The tokens have been credited to your in-app balance and will be spendable soon. Stay tuned for updates.',
  /** Short pill label for compact surfaces. */
  statusLabel: 'Not spendable yet',
} as const;

/** Winner wallet addresses (lowercased) → handle, for friendly display. */
const WINNERS: Record<string, { handle: string }> = {
  '0x71555aa7b368b0319ed6fa9d1ef6c387433cb433': { handle: 'mrnovocryto' },
  '0x759ffef43115805def2d64be71497cd0f83c01a6': { handle: 'skyler_adams' },
  '0x684012bc9bfbfc987d8d0e1b13a2fdb31caba3b6': { handle: 'martvader' },
  '0xd627ad6a37e91985b9413a721a000feed9d9125f': { handle: 'dehu_b' },
  '0xfe8db009274c251765431e2b7464868c73672b81': { handle: 'raw' },
};

export interface GiveawayPrize {
  amount: number;
  token: string;
  campaign: string;
  pending: boolean;
  note: string;
  handle: string;
}

/** Returns the giveaway prize for a wallet address, or null if not a winner. */
export function getGiveawayPrizeFor(address?: string | null): GiveawayPrize | null {
  if (!address) return null;
  const winner = WINNERS[address.toLowerCase()];
  if (!winner) return null;
  return {
    amount: WORLD_CUP_GIVEAWAY.amount,
    token: WORLD_CUP_GIVEAWAY.token,
    campaign: WORLD_CUP_GIVEAWAY.campaign,
    pending: WORLD_CUP_GIVEAWAY.pending,
    note: WORLD_CUP_GIVEAWAY.note,
    handle: winner.handle,
  };
}

export function isGiveawayWinner(address?: string | null): boolean {
  return !!address && !!WINNERS[address.toLowerCase()];
}

/** Formatted prize amount, e.g. "200,000". */
export function formatPrizeAmount(amount: number = WORLD_CUP_GIVEAWAY.amount): string {
  return amount.toLocaleString('en-US');
}
