// Governance vote weight, decided on the server.
//
// The board weights a vote by the voter's staking badge: Crab counts once,
// Meglodon counts thirteen times. That weight used to be computed in the
// browser and sent up with the vote, which made it a number anyone could
// choose — `vote_weight: 999` was a valid request. Weight is derived here
// instead, from the balance the API reports for the wallet the token belongs
// to, and the client's opinion is discarded.
//
// The ladder below mirrors `src/lib/staking-badges.ts`. It is duplicated
// rather than imported because that module pulls in thirteen badge images
// through Vite's `@/assets` alias, which no Deno function can resolve.
// `src/lib/__tests__/governance-weight-parity.test.ts` fails the build if the
// two ever disagree, so the copy cannot rot quietly.

const BADGE_LEVELS: { name: string; min: number }[] = [
  { name: "Crab", min: 10000 },
  { name: "Lobster", min: 25000 },
  { name: "Piranha", min: 50000 },
  { name: "Tortoise", min: 100000 },
  { name: "Cobra", min: 250000 },
  { name: "Octopus", min: 500000 },
  { name: "Crocodite", min: 1000000 },
  { name: "Dolphin", min: 2000000 },
  { name: "Tiger Shark", min: 3000000 },
  { name: "Killer Whale", min: 5000000 },
  { name: "Great White Shark", min: 10000000 },
  { name: "Blue Whale", min: 25000000 },
  { name: "Meglodon", min: 50000000 },
];

/** Tier → weight. One step per rung, which is the whole rule. */
export const BADGE_VOTE_WEIGHT: Record<string, number> = Object.fromEntries(
  BADGE_LEVELS.map((b, i) => [b.name, i + 1]),
);

const BADGE_ORDER = BADGE_LEVELS.map((b) => b.name);

const USERNAME_BADGE_OVERRIDES: Record<string, string> = {
  maldoteth: "Meglodon",
  mal: "Meglodon",
  aaron: "Meglodon",
};

const BADGE_PRICE_ANCHOR = 0.001;
const MAX_BADGE_SCALE = 1;
const MIN_BADGE_SCALE = 0.001;

function significant(value: number, digits: number): number {
  if (!Number.isFinite(value) || value === 0) return 0;
  return Number(value.toPrecision(digits));
}

export function badgeScaleForPrice(price: unknown): number {
  const numeric = typeof price === "string" ? Number.parseFloat(price) : price;
  if (typeof numeric !== "number" || !Number.isFinite(numeric) || numeric <= 0) return MAX_BADGE_SCALE;
  const raw = significant(BADGE_PRICE_ANCHOR / numeric, 2);
  return Math.min(MAX_BADGE_SCALE, Math.max(MIN_BADGE_SCALE, raw));
}

function thresholds(scale: number): { name: string; min: number }[] {
  let previous = 0;
  return BADGE_LEVELS.map((level) => {
    const min = Math.max(1, previous + 1, significant(level.min * scale, 3));
    previous = min;
    return { name: level.name, min };
  });
}

function tierIndex(name: string | null): number {
  return name ? BADGE_ORDER.indexOf(name) : -1;
}

function earnedTier(amount: number, scale: number): string | null {
  let current: string | null = null;
  for (const b of thresholds(scale)) {
    if (amount >= b.min) current = b.name;
    else break;
  }
  return current;
}

export interface BadgeLock {
  tier: string;
  requirement: number;
}

export function parseBadgeLock(raw: unknown): BadgeLock | null {
  if (!raw || typeof raw !== "object") return null;
  const { tier, requirement } = raw as { tier?: unknown; requirement?: unknown };
  if (typeof tier !== "string" || tierIndex(tier) < 0) return null;
  const amount = typeof requirement === "string" ? parseFloat(requirement) : requirement;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) return null;
  return { tier, requirement: amount };
}

/**
 * The tier a holder draws: the one the ladder gives them, unless the tier they
 * grandfathered is higher and they still hold what it cost.
 */
export function badgeTier(
  badgeBalance: unknown,
  username?: string | null,
  opts: { scale?: number; lock?: unknown } = {},
): string | null {
  if (username) {
    const clean = username.replace("@", "").toLowerCase();
    const override = USERNAME_BADGE_OVERRIDES[clean];
    if (override) return override;
  }
  const amount = typeof badgeBalance === "string" ? parseFloat(badgeBalance) : badgeBalance;
  if (typeof amount !== "number" || !Number.isFinite(amount)) return null;

  const scale = opts.scale ?? MAX_BADGE_SCALE;
  const earned = earnedTier(amount, scale);
  const lock = parseBadgeLock(opts.lock);
  const locked = lock && amount >= lock.requirement ? lock.tier : null;
  return tierIndex(locked) > tierIndex(earned) ? locked : earned;
}

export interface ResolvedWeight {
  weight: number;
  badgeName: string | null;
}

const DEHUB_API_BASE = "https://api.dehub.io";

/** The DHB price the ladder is scaled by. A failed lookup means scale 1. */
async function ladderScale(): Promise<number> {
  try {
    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/get-dhb-price`;
    const res = await fetch(url, {
      headers: { apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "" },
    });
    if (!res.ok) return MAX_BADGE_SCALE;
    const data = await res.json();
    return badgeScaleForPrice(data?.prices?.DHB);
  } catch {
    return MAX_BADGE_SCALE;
  }
}

/**
 * The weight `wallet` votes with, read from the API's account row.
 *
 * Weight 0 means no badge, which the caller must treat as "cannot vote" — the
 * board has always required a holding to vote and this is where that is now
 * actually enforced. An unreachable API returns 0 rather than 1: failing open
 * would hand a free vote to anyone who could make the lookup fail.
 */
export async function resolveVoteWeight(wallet: string): Promise<ResolvedWeight> {
  let account: Record<string, unknown> | null = null;
  try {
    const res = await fetch(`${DEHUB_API_BASE}/api/account_info/${encodeURIComponent(wallet)}`);
    if (res.ok) {
      const body = await res.json();
      account = (body && typeof body === "object" && "result" in body ? body.result : body) ?? null;
    }
  } catch {
    account = null;
  }
  if (!account) return { weight: 0, badgeName: null };

  const scale = await ladderScale();
  const badgeName = badgeTier(account.badgeBalance, (account.username as string) ?? null, {
    scale,
    lock: account.badgeLock,
  });
  if (!badgeName) return { weight: 0, badgeName: null };
  return { weight: BADGE_VOTE_WEIGHT[badgeName] ?? 1, badgeName };
}
