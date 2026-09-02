/**
 * The leaderboard's only defence is what the server saw.
 *
 * Street Slayer runs on the player's own machine and there is nothing to
 * simulate a result against, so a run is bounded rather than verified. The
 * clock bound was the whole of it, and waiting is free: reaching the end needs
 * `elapsed / 60 + 100 >= 1000`, which is fifty-four seconds, and a single
 * request claiming the lot landed exactly at the bound and tripped no flag
 * because the forgiving checkpoint covered the last hundred.
 *
 * These pin the second bound that closes it — that a claim is also held to what
 * was actually reported — and, just as importantly, that ordinary play is
 * nowhere near either one.
 */
import { describe, expect, it } from 'vitest';
import {
  runBounds,
  runFlags,
} from '../../supabase/functions/_shared/arcade-run-bounds.ts';

/** Street Slayer's board, the only one that exists. */
const BOARD = { msPerPermille: 60, checkpointPermille: 100 };

const at = (elapsedMs: number, checkpoints: number, allowancePermille = 100) =>
  runBounds({ ...BOARD, elapsedMs, checkpoints, allowancePermille });

describe('runBounds', () => {
  it('refuses the whole street to a single request that just waited', () => {
    // The exact exploit: open a run, sleep fifty-four seconds, submit 1000.
    const bounds = at(54_000, 0);
    expect(bounds.clockCap).toBeGreaterThanOrEqual(1000);
    expect(bounds.cap).toBe(100);
    expect(runFlags(1000, bounds, BOARD.checkpointPermille)).toContain('unreported-progress');
  });

  it('refuses it however long the script waits', () => {
    // An hour buys nothing without reports.
    expect(at(60 * 60_000, 0).cap).toBe(100);
  });

  it('still holds a well-reported run to the clock', () => {
    // Twenty reports, but only six seconds gone: the clock binds now.
    const bounds = at(6_000, 20);
    expect(bounds.reportCap).toBe(2100);
    expect(bounds.cap).toBe(200);
    expect(runFlags(1000, bounds, BOARD.checkpointPermille)).toContain('ahead-of-clock');
  });

  it('lets a genuine run reach the end', () => {
    // Two minutes and thirty reports — the host relays at most one a second,
    // so a run of this length has had well over a hundred chances.
    const bounds = at(120_000, 30);
    expect(bounds.cap).toBeGreaterThanOrEqual(1000);
    expect(runFlags(1000, bounds, BOARD.checkpointPermille)).toEqual([]);
  });

  it('survives most of the reports being dropped', () => {
    // Ten landed out of the ~120 chances a two-minute run had. The bound is a
    // margin for fire-and-forget reporting, not a demand that every one lands.
    const bounds = at(120_000, 10);
    expect(bounds.cap).toBeGreaterThanOrEqual(1000);
    expect(runFlags(1000, bounds, BOARD.checkpointPermille)).toEqual([]);
  });

  it('does not flag a player briefly ahead of either bound', () => {
    // Half a checkpoint over, which is a quiet stretch rather than a cheat.
    const bounds = at(30_000, 5);
    expect(runFlags(bounds.cap + 50, bounds, BOARD.checkpointPermille)).toEqual([]);
  });

  it('gives no allowance at report time, and one checkpoint at submit', () => {
    expect(at(6_000, 0, 0).clockCap).toBe(100);
    expect(at(6_000, 0, 100).clockCap).toBe(200);
  });

  it('treats a negative or absent elapsed time as no time at all', () => {
    expect(at(-5_000, 0, 0).clockCap).toBe(0);
    expect(at(0, 0, 0).cap).toBe(0);
  });
});
