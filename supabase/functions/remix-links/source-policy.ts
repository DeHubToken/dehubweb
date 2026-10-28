// deno-lint-ignore-file no-explicit-any
//
// Which DeHub posts may be reacted to. Pure, so it is tested on its own.

/** Why a post cannot be reacted to, or null when it can. Mirrors the recorder's own check. */
export function blockedReason(p: any): string | null {
  if (!p) return 'Video not found.';
  if (p.postType !== 'video') return 'Only videos can be reacted to.';
  const info = p.streamInfo ?? {};
  const rating = String(p.contentRating ?? 'safe').toLowerCase();
  const visibility = String(p.visibility ?? 'public').toLowerCase();
  if (p.isHidden || p.deleted || p.isDeleted) return 'This video is unavailable.';
  if (p.is_live || p.status === 'live' || p.stream?.isActive) return 'Live videos cannot be reacted to.';
  if (visibility !== 'public') return 'Only public videos can be reacted to.';
  if (rating !== 'safe' || p.spoilerText) return 'This video cannot be reacted to.';
  if (p.is_ppv || info.isPayPerView || p.is_locked || info.isLockContent || Number(p.price ?? 0) > 0
    || Number(p.locked_price ?? info.lockContentAmount ?? 0) > 0
    || (Array.isArray(p.plansDetails) && p.plansDetails.length > 0) || (Array.isArray(p.plans) && p.plans.length > 0)) {
    return 'Paid and subscriber-only videos cannot be reacted to.';
  }
  return null;
}
