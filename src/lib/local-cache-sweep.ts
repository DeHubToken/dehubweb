/**
 * Local cache sweep
 * =================
 * Two of DeHub's localStorage caches write one key per *thing* and never delete
 * any of them:
 *
 *   dehub-profile-cache:<id>  — a full profile blob per person whose page you
 *                               opened, ever, with no clock on it
 *   dehub-dm-fee-<scope>      — a per-message fee per DM you opened, ever
 *
 * Neither is large on its own and neither is wrong on the day it is written.
 * The problem is the shared 5 MB origin quota: auth tokens, wallet ciphertext,
 * the persisted query cache and now composer drafts all live in it, and the
 * failure mode when it fills is not an error anyone sees — setItem throws, the
 * catch swallows it, and the newest write is simply the one that gets dropped.
 * Unbounded growth over here shows up as a lost draft over there.
 *
 * So: run once at boot, on idle, and take out anything expired, anything in a
 * pre-TTL shape that cannot be aged, and the oldest of whatever is left over
 * the cap. Everything swept is a *cache* — the next read refetches it.
 *
 * @module lib/local-cache-sweep
 */

interface SweepRule {
  prefix: string;
  /** Entries older than this are dropped. */
  maxAge: number;
  /** Keep at most this many, newest first. */
  maxEntries: number;
}

const RULES: SweepRule[] = [
  // Profiles: a week is well past the point where a stale display name or
  // follower count is worth painting, and 200 is far more than anyone browses
  // between sessions.
  { prefix: 'dehub-profile-cache:', maxAge: 7 * 24 * 60 * 60 * 1000, maxEntries: 200 },
  // DM fees: the other side can change theirs at any time, so this is a paint
  // hint with a short life, matching DM_FEE_CACHE_TTL in DirectMessageChat.
  { prefix: 'dehub-dm-fee-', maxAge: 6 * 60 * 60 * 1000, maxEntries: 200 },
];

/** Timestamp of a stamped entry, or null when it is a legacy unstamped blob. */
function stampOf(raw: string): number | null {
  try {
    const parsed = JSON.parse(raw) as { v?: number; t?: number };
    if (parsed && parsed.v === 1 && typeof parsed.t === 'number') return parsed.t;
  } catch { /* unparseable — treat as legacy */ }
  return null;
}

function sweepRule(rule: SweepRule, keys: string[]): void {
  const cutoff = Date.now() - rule.maxAge;
  const survivors: Array<{ key: string; t: number }> = [];

  for (const key of keys) {
    const raw = localStorage.getItem(key);
    // A legacy entry has no clock, so it can never be aged out — it would sit
    // there forever. Drop it; the next read refetches and writes a stamped one.
    const stamp = raw ? stampOf(raw) : null;
    if (stamp === null || stamp < cutoff) {
      localStorage.removeItem(key);
      continue;
    }
    survivors.push({ key, t: stamp });
  }

  if (survivors.length <= rule.maxEntries) return;
  survivors
    .sort((a, b) => b.t - a.t)
    .slice(rule.maxEntries)
    .forEach(({ key }) => localStorage.removeItem(key));
}

/**
 * Sweep every per-item cache once. Safe to call more than once; it is idempotent
 * and cheap (one pass over the key list, then only the matching keys are read).
 */
export function sweepLocalCaches(): void {
  if (typeof window === 'undefined') return;
  try {
    // Snapshot the key list first — removeItem during a live localStorage.key()
    // walk shifts the indices and silently skips entries.
    const all: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) all.push(key);
    }
    for (const rule of RULES) {
      sweepRule(rule, all.filter((key) => key.startsWith(rule.prefix)));
    }
  } catch {
    // Storage unavailable (private mode). Nothing to sweep, nothing to report.
  }
}

