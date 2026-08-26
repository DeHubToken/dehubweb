/**
 * Hold-gate resolution.
 * =====================
 * `streamInfo.isLockContent` on its own means nothing. The gate it describes is
 * "you must be holding N of token X to read this", so without a positive N there
 * is no condition to satisfy and no condition to fail — the post is simply open.
 *
 * Posts in exactly that state exist in prod because the composer's old
 * "Subscribers" switch set isLockContent with no amount (there has never been a
 * subscriber gate on the post model to back it). Those posts rendered a lock
 * badge over a drawer with no button in it, and an amount line reading
 * "Must be holding NaN DHB", while the API served the body in full anyway.
 *
 * Every surface that gates on holdings resolves it through here so the answer is
 * the same everywhere.
 */
export function isHoldGated(
  isLocked: boolean | undefined,
  lockedAmount: number | string | null | undefined,
): boolean {
  return !!isLocked && Number(lockedAmount) > 0;
}
