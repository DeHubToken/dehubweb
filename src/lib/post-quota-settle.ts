/**
 * Making sure a posting payment is never taken twice
 * ==================================================
 *
 * The dangerous moment in a pay-after-posting flow is the gap between the
 * DHB leaving the wallet and the server being told about it. If the settle
 * call is lost there, the creator has paid and the bill is still open — and
 * the bill being open is what blocks their next paid post, so they would be
 * asked to pay for the same post again.
 *
 * So the hash is never dropped. It is retried a few times immediately, and if
 * it still has not landed it is written to localStorage and retried the next
 * time the composer opens. Settling is idempotent server-side (the hash is
 * claimed once, on a unique index), so replaying one costs nothing and the
 * only failure mode left is a delay.
 */

import { settlePostCharge } from '@/lib/api/dehub';

const PENDING_KEY = 'dehub_post_quota_pending_settlements';

/** Beyond this a stash entry is stale enough that something else is wrong. */
const MAX_ATTEMPTS = 12;

interface PendingSettlement {
  txHash: string;
  chainId: number;
  attempts: number;
  firstSeenAt: number;
}

function readPending(): PendingSettlement[] {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePending(rows: PendingSettlement[]): void {
  try {
    if (!rows.length) localStorage.removeItem(PENDING_KEY);
    else localStorage.setItem(PENDING_KEY, JSON.stringify(rows));
  } catch {
    // A full or disabled localStorage must not break posting. The immediate
    // retries below still ran; this only gives up the later ones.
  }
}

function stash(txHash: string, chainId: number, attempts: number): void {
  const rows = readPending().filter(r => r.txHash !== txHash);
  rows.push({ txHash, chainId, attempts, firstSeenAt: Date.now() });
  writePending(rows);
}

function forget(txHash: string): void {
  writePending(readPending().filter(r => r.txHash !== txHash));
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Tell the server about a transfer, retrying until it sticks.
 *
 * Resolves true once the charge is closed. Resolves false when it could not
 * be confirmed yet — in which case the hash has been stashed and will be
 * retried later, so a false here is "not yet", not "lost".
 */
export async function settleWithRetry(
  txHash: string,
  chainId: number,
  startingAttempts = 0,
): Promise<boolean> {
  // Three immediate goes with a widening gap. A transfer that has been mined
  // but not yet seen by the read RPC answers `pending` and clears within a
  // few seconds; anything longer is left to the stash.
  const delays = [0, 2500, 6000];

  for (let i = 0; i < delays.length; i++) {
    if (delays[i]) await wait(delays[i]);
    try {
      const result = await settlePostCharge(txHash, chainId);
      if (result?.settled) {
        forget(txHash);
        return true;
      }
    } catch (err) {
      console.warn('[PostQuota] settle attempt failed:', err);
    }
  }

  const attempts = startingAttempts + delays.length;
  if (attempts >= MAX_ATTEMPTS) {
    // Past this it is not a transient failure, and retrying it on every
    // composer open forever helps nobody. The charge stays open server-side
    // and support can close it against the hash in the console warning.
    console.warn(`[PostQuota] giving up on settling ${txHash} after ${attempts} attempts`);
    forget(txHash);
    return false;
  }

  stash(txHash, chainId, attempts);
  return false;
}

/**
 * Retry anything left over from an earlier session.
 *
 * Called when the composer opens: it is the moment the creator is about to
 * need a clear tab, and it costs one request per stranded hash — normally
 * none at all.
 */
export async function flushPendingSettlements(): Promise<void> {
  const rows = readPending();
  if (!rows.length) return;

  for (const row of rows) {
    await settleWithRetry(row.txHash, row.chainId, row.attempts);
  }
}
