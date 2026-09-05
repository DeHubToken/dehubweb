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
 * So the second bound asks that the run was actually reported. A board declares
 * what a single report may be worth, and a claim may not exceed what the reports
 * received so far can account for — plus a fixed grace, which is the whole
 * subject of the next paragraph.
 *
 * ── The grace is not decoration ──
 *
 * This shipped without it, held at exactly one report per checkpoint, on the
 * stated belief that "a run that reaches the end has had around sixty chances to
 * report and needs ten of them to land". That was wrong, and it cost real
 * players score. Street Slayer posts a report only when it crosses a checkpoint
 * (`public/street-slayer-game/index.html`: `CHECKPOINT = 100`), so finishing the
 * street sends **exactly ten** — the exact number a 1:1 bound demands, with no
 * slack at all. Every report lost to a network blip took a tenth of the run off
 * the player's final standing, permanently, because progress only ever advances
 * one checkpoint per report.
 *
 * `REPORT_GRACE` is that slack. At three, a finisher needs seven of its ten
 * reports to land, and a run that reports nothing still cannot claim more than
 * three checkpoints.
 *
 * ── What this does and does not stop ──
 *
 * It stops the lazy version: open a run, sleep under a minute, submit the lot.
 * That is now capped at three tenths of the street, which ranks below a mediocre
 * human. It does NOT stop a script that troubles itself to send ten reports over
 * a minute — nothing server-side can, for a game that runs on the player's own
 * machine. `unreported-progress` is the detection path for the rest, and it is
 * deliberately quiet enough to mean something when it fires.
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

/**
 * Reports a run may be short by and still reach the end.
 *
 * Three of the ten Street Slayer sends. See the note above for why a bound with
 * no grace under-scored real players.
 */
export const REPORT_GRACE = 3;

export function runBounds(input: RunBoundsInput): RunBounds {
  const elapsed = Math.max(0, input.elapsedMs);
  const clockCap = Math.floor(elapsed / input.msPerPermille) + input.allowancePermille;
  const reportCap =
    input.checkpointPermille * (Math.max(0, input.checkpoints) + REPORT_GRACE);
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
