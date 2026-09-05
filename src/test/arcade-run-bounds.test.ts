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
 * The report bound closes that. **These tests are written against the game's
 * real reporting cadence**, which the first version of this file was not: it
 * assumed a run had "around sixty chances to report", and on that fiction the
 * bound shipped with no grace at all. The game posts on checkpoint crossings
 * only — `CHECKPOINT = 100` in `public/street-slayer-game/index.html` — so a
 * finisher sends TEN reports, and a 1:1 bound meant one lost report cost a
 * tenth of the run. `TOTAL_REPORTS` below is that ten, and it is the number
 * every case here reasons from.
 */
import { describe, expect, it } from 'vitest';
import {
  REPORT_GRACE,
  runBounds,
  runFlags,
} from '../../supabase/functions/_shared/arcade-run-bounds.ts';

/** Street Slayer's board, the only one that exists. */
const BOARD = { msPerPermille: 60, checkpointPermille: 100 };

/** Reports the game sends across a full run: 1000 permille / CHECKPOINT 100. */
const TOTAL_REPORTS = 10;

const at = (elapsedMs: number, checkpoints: number, allowancePermille = 100) =>
  runBounds({ ...BOARD, elapsedMs, checkpoints, allowancePermille });

/** Comfortably longer than the 60s the clock bound alone requires. */
const A_REAL_RUN_MS = 120_000;

describe('runBounds', () => {
  it('refuses the whole street to a single request that just waited', () => {
    // The exact exploit: open a run, sleep fifty-four seconds, submit 1000.
    const bounds = at(54_000, 0);
    expect(bounds.clockCap).toBeGreaterThanOrEqual(1000);
    expect(bounds.cap).toBe(BOARD.checkpointPermille * REPORT_GRACE);
    expect(runFlags(1000, bounds, BOARD.checkpointPermille)).toContain('unreported-progress');
  });

  it('refuses it however long the script waits', () => {
    expect(at(60 * 60_000, 0).cap).toBe(BOARD.checkpointPermille * REPORT_GRACE);
  });

  it('caps that script below a mediocre human', () => {
    // Score is progress * 1000 + life, so what matters is that the ceiling on a
    // silent run sits under what somebody who actually played half the street
    // walks away with.
    const script = at(54_000, 0).cap;
    const halfAHuman = 500;
    expect(script).toBeLessThan(halfAHuman);
  });

  /** The case the missing grace broke. */
  it('lets a finisher through when every report lands', () => {
    const bounds = at(A_REAL_RUN_MS, TOTAL_REPORTS);
    expect(bounds.cap).toBeGreaterThanOrEqual(1000);
    expect(runFlags(1000, bounds, BOARD.checkpointPermille)).toEqual([]);
  });

  /**
   * The regression, in literals.
   *
   * Deliberately NOT written as `TOTAL_REPORTS - REPORT_GRACE`. Phrasing the
   * expectation in terms of the constant under test makes it true for every
   * value of that constant, which is how the first version of this file passed
   * against the very bound it was supposed to be pinning. Eight is "a finisher
   * who lost two of its ten reports", and it has to reach the end of the street
   * whatever the grace happens to be set to.
   */
  it('credits a finisher that lost two of its ten reports', () => {
    expect(at(A_REAL_RUN_MS, 8).cap).toBeGreaterThanOrEqual(1000);
  });

  it('credits a finisher that lost three', () => {
    expect(at(A_REAL_RUN_MS, 7).cap).toBeGreaterThanOrEqual(1000);
  });

  /**
   * Honest about the edge. Lose enough reports and a finisher IS marked down —
   * that is the cost of the bound, and pinning it keeps the trade visible
   * rather than letting it be rediscovered on a real leaderboard.
   */
  it('does mark down a run that lost most of its reports', () => {
    expect(at(A_REAL_RUN_MS, 2).cap).toBeLessThan(1000);
  });

  it('still holds a well-reported run to the clock', () => {
    // Twenty reports, but only six seconds gone: the clock binds now.
    const bounds = at(6_000, 20);
    expect(bounds.reportCap).toBeGreaterThan(1000);
    expect(bounds.cap).toBe(200);
    expect(runFlags(1000, bounds, BOARD.checkpointPermille)).toContain('ahead-of-clock');
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

  /**
   * Walks a whole honest run through the report path the way the server sees
   * it, one checkpoint at a time, and asserts the player is never held back.
   * This is the regression the shipped bound would have failed.
   */
  it('never caps an honest run mid-way through', () => {
    let checkpoints = 0;
    let elapsed = 0;
    for (let crossed = 1; crossed <= TOTAL_REPORTS; crossed++) {
      const wants = crossed * BOARD.checkpointPermille;
      // The game cannot cross a checkpoint faster than the clock bound allows.
      elapsed += BOARD.checkpointPermille * BOARD.msPerPermille;
      // `report` carries no allowance; only `submit` forgives one checkpoint.
      const bounds = at(elapsed, checkpoints, 0);
      expect(
        Math.min(wants, bounds.cap),
        `report ${crossed} of ${TOTAL_REPORTS} was capped below its real progress`,
      ).toBe(wants);
      checkpoints += 1;
    }
  });
});
