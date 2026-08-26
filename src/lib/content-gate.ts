/**
 * Hold-gate resolution.
 * =====================
 * `streamInfo.isLockContent` on its own means nothing. The gate it describes is
 * "you must be holding N of token X to read this", so without a positive N there
 * is no condition to satisfy and no condition to fail — the post is simply open.
 *
 * Posts in exactly that state exist in prod because the composer's old
 * "Subscribers" switch set isLockContent with no amount — it was a hold gate
 * pretending to be a subscriber gate, and it carried no amount because there was
 * no amount to carry. Those posts rendered a lock badge over a drawer with no
 * button in it, and an amount line reading "Must be holding NaN DHB", while the
 * API served the body in full anyway. The real subscriber gate is below.
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

/** One of the creator's subscription plans, as the feed returns it. */
export interface SubscriberPlan {
  id: number;
  title: string;
  price: number;
  alreadySubscribed?: boolean;
}

/**
 * Subscriber gate resolution.
 * ==========================
 * Distinct from the hold gate above, and not interchangeable with it: a hold
 * gate asks "do you own N of this token", which any stranger can satisfy by
 * buying some. A subscriber gate asks "do you subscribe to THIS creator", which
 * only they can grant.
 *
 * The backend has carried this all along — a post stores the plan ids that
 * unlock it in `plans`, and the feed pipeline joins the viewer's subscriptions
 * to stamp `alreadySubscribed` on each one. Both clients ignored it and faked
 * a "Subscribers" switch with an amount-less DHB lock instead, which is the bug
 * this pairs with. Empty plans is not a gate, for the same reason a hold gate
 * with no amount is not one.
 */
export function isSubscriberGated(
  plans: SubscriberPlan[] | undefined,
  canBypass: boolean,
): boolean {
  if (canBypass || !plans?.length) return false;
  return !plans.some((p) => p.alreadySubscribed);
}
