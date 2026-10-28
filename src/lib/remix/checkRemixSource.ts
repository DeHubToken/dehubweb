/**
 * Whether a DeHub video may be remixed: a finished, public, free video with
 * nothing gated behind it. For a duet, stitch or reaction the creator's allow
 * setting is asked of the shared remix links too; if that service cannot
 * answer the browser checks here still stand, and a real "no" still stops it.
 */
import { getNFTInfo } from '@/lib/api/dehub';
import { videoNeedsAccess } from '@/lib/api/dehub/video-access';
import { checkRemix } from '@/lib/remix-links';

export async function checkRemixSource(sourceUrl: string, mode: string) {
  const id = decodeURIComponent(new URL(sourceUrl).pathname.split('/').pop()!);
  const post = await getNFTInfo(id);
  const extra = post as typeof post & { plansDetails?: unknown[]; plans?: unknown[]; deleted?: boolean };
  if (!post || post.postType !== 'video' || post.isHidden || extra.deleted || post.is_live || post.status === 'live'
    || post.stream?.isActive || post.spoilerText || (post.contentRating && post.contentRating !== 'safe')
    || (post.quotePolicy && post.quotePolicy !== 'public' && !post.isOwner)
    || videoNeedsAccess({ visibility: post.visibility, isPPV: post.is_ppv || post.streamInfo?.isPayPerView,
      isLocked: post.is_locked || post.streamInfo?.isLockContent,
      lockedPrice: post.locked_price ?? post.streamInfo?.lockContentAmount,
      subscriberPlans: extra.plansDetails ?? extra.plans })) throw new Error('This video is unavailable for remixing.');
  // The creator's "Allow duets" / "Allow stitches" / "Allow reactions" setting, checked by the server for this viewer.
  if (mode === 'duet' || mode === 'stitch' || mode === 'react') {
    const verdict = await checkRemix(id, mode);
    if (!verdict.allowed) throw new Error(verdict.reason || `The creator does not allow ${mode === 'duet' ? 'duets' : mode === 'stitch' ? 'stitches' : 'reactions'} on this video.`);
  }
}
