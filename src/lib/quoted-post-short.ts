import type { DeHubNFT } from '@/lib/api/dehub/types';
import { isBrainrotPlayable } from './brainrot-feed';
import { isShortsPhoto } from './shorts-photos';
import { mapToShortVideo } from './short-video';

/** Quote previews use the same player and restrictions as ordinary feed media. */
export function quotedPostShort(post: DeHubNFT) {
  const kind = post.postType as string;
  const video = ['video', 'feed-video', 'short'].includes(kind) ||
    (kind !== 'audio' && kind !== 'feed-audio' && kind !== 'live' &&
      (post.media_type === 'video' || !!post.videoUrl));
  const mediaPost = kind === 'image' ? { ...post, postType: 'feed-images' } : post;
  if ((!video && !isShortsPhoto(mediaPost)) || !isBrainrotPlayable({ ...post, transcodingStatus: video ? post.transcodingStatus : undefined }) ||
      post.spoilerText || post.is_locked || post.is_live || (post.stream?.isActive && !post.stream?.endedAt) ||
      (post.visibility && post.visibility !== 'public') || post.isBlocked || post.blockedYou) return null;
  return mapToShortVideo(mediaPost, 0);
}
