/**
 * Stage times
 * ===========
 * A stage is announced to an audience spread across every timezone, but every
 * surface rendered `scheduled_at` through date-fns `format`, which prints the
 * *viewer's* local time with nothing to say so. A host who scheduled 20:00 UTC
 * saw "9:00 PM" on their own card and reasonably read it as the wrong time,
 * and a shared announcement told each reader a different hour with no way to
 * reconcile them.
 *
 * Local time stays the headline — it is the one a reader can act on without
 * arithmetic — with the UTC clock alongside it as the anchor everyone shares.
 */

/** UTC clock time for a stage, e.g. `20:00 UTC`. */
export function stageUtcClock(date: Date): string {
  const hours = date.getUTCHours().toString().padStart(2, '0');
  const minutes = date.getUTCMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes} UTC`;
}
