/**
 * Whether a DeHub video may be remixed: a finished, public, free video with
 * nothing gated behind it. For a reaction the creator's "Allow reactions"
 * switch is asked of the remix-links function too; if that service cannot be
 * reached the browser checks here still stand, and a real "no" still stops it.
 */
import { getNFTInfo } from '@/lib/api/dehub';
import { videoNeedsAccess } from '@/lib/api/dehub/video-access';
import { checkReactionSource, remixLinksUnavailable, tokenIdFromPostUrl } from '@/lib/api/remix-links';

export async function checkRemixSource(sourceUrl: string, mode: string) {
  const post = await getNFTInfo(decodeURIComponent(new URL(sourceUrl).pathname.split('/').filter(Boolean).pop()!));
  const extra = post as typeof post & { plansDetails?: unknown[]; plans?: unknown[]; deleted?: boolean };
  if (!post || post.postType !== 'video' || post.isHidden || extra.deleted || post.is_live || post.status === 'live'
    || post.stream?.isActive || post.spoilerText || (post.contentRating && post.contentRating !== 'safe')
    || (post.quotePolicy && post.quotePolicy !== 'public' && !post.isOwner)
    || videoNeedsAccess({ visibility: post.visibility, isPPV: post.is_ppv || post.streamInfo?.isPayPerView,
      isLocked: post.is_locked || post.streamInfo?.isLockContent,
      lockedPrice: post.locked_price ?? post.streamInfo?.lockContentAmount,
      subscriberPlans: extra.plansDetails ?? extra.plans })) throw new Error('This video is unavailable for remixing.');
  // The creator's "Allow reactions" switch lives with the remix links; the server says no for them.
  if (mode === 'react') {
    const tokenId = tokenIdFromPostUrl(sourceUrl);
    const verdict = !tokenId ? { allowed: false, reason: null }
      : await checkReactionSource(tokenId).catch((error) => {
        // The checks above already ran here; only a missing service is let through.
        if (remixLinksUnavailable(error)) return { allowed: true, reason: null };
        throw error;
      });
    if (!verdict.allowed) throw new Error(verdict.reason || 'This video is unavailable for reactions.');
  }
}
