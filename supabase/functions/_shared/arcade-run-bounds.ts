/**
 * How much progress a run may claim.
 *
 * Two bounds, and a claim is held to the lower of them.
 *
 * The clock bound is the original one: a board declares how long its shortest
 * conceivable run takes, and nothing may claim more than the elapsed time
 * allows. It is a wall, not a target — set well below any human play, because
 * it bounds what is possible rather than what is good.
 *
 * A wall is all it can ever be, though, because waiting is free. Reaching the
 * end of Street Slayer needs `elapsed / 60 + 100 >= 1000`, so fifty-four
 * seconds — and one request claiming the lot arrived exactly at the bound and
 * tripped no flag, because the forgiving checkpoint covers the last hundred. A
 * script could open a run, sleep under a minute, submit full progress and full
 * life, and take the top of a board that is getting token stakes.
 *
 * So the second bound asks that the run was actually reported. A board already
 * declares what a single report may be worth; holding every claim to that makes
 * the number mean the same thing at `report` and at `submit`, and the end of
 * the street then takes ten reports whatever the clock says.
 *
 * That is a long way from real play. The host relays at most one report a
 * second and a hundred permille cannot be crossed faster than six seconds, so a
 * run that reaches the end has had around sixty chances to report and needs ten
 * of them to land. Reports are fire-and-forget and some are dropped; this is
 * the margin for that, and `unreported-progress` records when the bound was the
 * thing that bit, so it can be tuned against real runs rather than guesses.
 *
 * Kept free of imports and of Deno globals so the rule can be exercised
 * directly from the test suite.
 */

export interface RunBoundsInput {
  /** Milliseconds since the run was opened. */
  elapsedMs: number;
  /** Milliseconds of play one permille of progress is worth, at the very least. */
  msPerPermille: number;
  /** Progress a single report may be worth. */
  checkpointPermille: number;
  /** Reports accepted on this run so far. */
  checkpoints: number;
  /**
   * Progress forgiven on top of the clock, for one dropped report. Zero at
   * `report`, one checkpoint at `submit`.
   */
  allowancePermille: number;
}

export interface RunBounds {
  /** What the clock alone allows. */
  clockCap: number;
  /** What the reports alone allow. */
  reportCap: number;
  /** The binding one. */
  cap: number;
}

export function runBounds(input: RunBoundsInput): RunBounds {
  const elapsed = Math.max(0, input.elapsedMs);
  const clockCap = Math.floor(elapsed / input.msPerPermille) + input.allowancePermille;
  const reportCap = input.checkpointPermille * (Math.max(0, input.checkpoints) + 1);
  return { clockCap, reportCap, cap: Math.min(clockCap, reportCap) };
}

/**
 * Which bounds a claim broke, by more than a whole checkpoint each.
 *
 * A good player sprinting a quiet stretch is briefly ahead of a bound and
 * catches up on the next fight. Flagging that would fill the ledger with the
 * players it exists to tell cheats apart from, so each flag needs a clear
 * checkpoint of daylight before it fires.
 */
export function runFlags(claimedPermille: number, bounds: RunBounds, checkpointPermille: number): string[] {
  const flags: string[] = [];
  if (claimedPermille > bounds.clockCap + checkpointPermille) flags.push('ahead-of-clock');
  if (claimedPermille > bounds.reportCap + checkpointPermille) flags.push('unreported-progress');
  return flags;
}
