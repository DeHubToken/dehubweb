/**
 * Quoted Post Embed Component
 * ============================
 * Twitter/X-style embedded quoted post preview.
 * Shows inside a bordered card with author info, content preview, and optional media thumbnail.
 */

import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { CheckCircle, Play, Images, Ticket, Lock } from 'lucide-react';
import { getMediaUrl } from '@/lib/api/dehub/core';
import { buildAvatarUrl, extractAvatarPath, buildFeedImageUrls, buildImageUrl } from '@/lib/media-url';
import { isHoldGated, isSubscriberGated } from '@/lib/content-gate';
import { isTokenUnlocked } from '@/lib/unlocked-tokens-store';
import { BadgedName } from '@/components/app/BadgedName';
import { NewMemberChip } from '@/components/app/NewMemberChip';
import type { DeHubNFT } from '@/lib/api/dehub/types';

/**
 * What a post's media looks like in an embed: which kind it is, the one
 * thumbnail to show, and whether it has to stay behind a gate. Shared with the
 * profile replies thread, which shows the post a comment sits under.
 */
export function resolveQuotedPostMedia(post: DeHubNFT) {
  // Converter imports use feed-video, and some older posts only carry a video
  // URL. Treat them like the feed does so a shared import has a playable card.
  // The API sends feed-video/feed-audio even though the shared NFT type still
  // lists only the original post types.
  const postType = post.postType as string;
  const isAudio = postType === 'audio' || postType === 'feed-audio';
  const hasVideo = !isAudio && (
    postType === 'video' ||
    postType === 'feed-video' ||
    post.media_type === 'video' ||
    !!post.videoUrl
  );

  // For images: resolve feed-image URLs properly via buildFeedImageUrls
  const resolvedImageUrls = buildFeedImageUrls(post.imageUrls);
  const firstImageUrl = (post.articleImageUrl ? buildFeedImageUrls([post.articleImageUrl])?.[0] : undefined) || resolvedImageUrls?.[0] || (post.imageUrl ? buildImageUrl(post.tokenId, post.imageUrl) : undefined);
  const hasImage = !hasVideo && (post.postType === 'image' || !!firstImageUrl);
  const thumbnailUrl = hasVideo
    ? (getMediaUrl(post.thumbnail_url) || buildImageUrl(post.tokenId, post.imageUrl))
    : firstImageUrl;

  // Gated content must stay gated in embeds (quotes, DM shares) — otherwise a
  // locked PPV post shared into a DM leaks its media as a free preview. Same
  // bypass rules as the feed cards: owners and unlockers see it clear.
  const isPPV = !!(post.is_ppv || post.streamInfo?.isPayPerView);
  const isHoldLocked = isHoldGated(
    post.is_locked || post.streamInfo?.isLockContent,
    post.locked_price ?? post.streamInfo?.lockContentAmount,
  );
  const canBypassGating = !!(post.isOwner || post.isUnlocked) || isTokenUnlocked(String(post.tokenId));
  // A subscriber-gated post must stay gated in an embed too, or quoting one
  // is a way to republish it in the clear.
  const isSubGated = isSubscriberGated(
    (post as any).plansDetails,
    canBypassGating,
  );
  const gated = ((isPPV || isHoldLocked) && !canBypassGating) || isSubGated;

  return { hasVideo, hasImage, thumbnailUrl, imageCount: resolvedImageUrls?.length ?? 0, gated, isPPV };
}

/** The media block of an embedded post — thumbnail, play glyph, image count, gate. */
export function QuotedPostMedia({ post, className }: { post: DeHubNFT; className?: string }) {
  const { hasVideo, hasImage, thumbnailUrl, imageCount, gated, isPPV } = resolveQuotedPostMedia(post);
  if (!hasImage && !hasVideo) return null;
  return (
    <div className={`relative w-full aspect-video max-h-[200px] sm:max-h-[240px] bg-zinc-900 overflow-hidden ${className || ''}`}>
      {thumbnailUrl && (
        <img
          src={thumbnailUrl}
          alt=""
          className={`w-full h-full object-cover rounded-lg ${gated ? 'blur-2xl scale-110 select-none pointer-events-none' : ''}`}
          loading="lazy"
        />
      )}
      {gated && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40">
          <div className="w-10 h-10 rounded-xl bg-black/40 backdrop-blur-[24px] saturate-[180%] flex items-center justify-center border border-white/10 mb-1.5">
            {isPPV ? <Ticket className="w-5 h-5 text-white" /> : <Lock className="w-5 h-5 text-white" />}
          </div>
          <p className="text-white font-semibold text-xs">
            {isPPV ? 'Pay-Per-View Content' : 'Locked Content'}
          </p>
        </div>
      )}
      {!gated && hasVideo && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center">
            <Play className="w-5 h-5 text-white fill-white ml-0.5" />
          </div>
        </div>
      )}
      {!gated && hasImage && imageCount > 1 && (
        <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm rounded-lg px-2 py-1 flex items-center gap-1">
          <Images className="w-3.5 h-3.5 text-white" />
          <span className="text-xs text-white font-medium">{imageCount}</span>
        </div>
      )}
    </div>
  );
}

interface QuotedPostEmbedProps {
  quotedPost: DeHubNFT;
  className?: string;
}

export const QuotedPostEmbed = memo(function QuotedPostEmbed({ quotedPost, className }: QuotedPostEmbedProps) {
  const navigate = useNavigate();

  // Avatars must go through buildAvatarUrl, not getMediaUrl. getMediaUrl just
  // prefixes the CDN base, which is wrong for the older upload format: the API
  // still returns paths like "statics/avatars/0x….octet-stream", and
  // CDN_BASE + "statics/avatars/…" 403s — the statics/ segment has to be
  // stripped. Radix then fails to load the image and renders AvatarFallback, so
  // the quoted author silently showed as a grey initial. buildAvatarUrl also
  // adds the per-address cache-bust, so an avatar change shows up here too.
  const avatarPath =
    extractAvatarPath(quotedPost) ||
    extractAvatarPath(quotedPost.minterUser) ||
    extractAvatarPath(quotedPost.creator);
  const avatarAddress = quotedPost.minter || quotedPost.minterUser?.address || '';
  const resolvedAvatar = buildAvatarUrl(avatarAddress, avatarPath);

  // The API's inline `quotedPost` object only carries `minterUser {…}` — the
  // flat `minter*` fields it has on top-level feed posts are absent here, so
  // reading only those (as this used to) rendered "Unknown" / a raw address
  // for every quote, same class of bug the avatar fix above already covers.
  const displayName =
    quotedPost.minterUser?.displayName ||
    quotedPost.minterUser?.username ||
    quotedPost.minterDisplayName ||
    quotedPost.minterUsername ||
    quotedPost.mintername ||
    'Unknown';
  const handle =
    quotedPost.minterUser?.username ||
    quotedPost.minterUsername ||
    quotedPost.mintername ||
    quotedPost.minter?.slice(0, 8);
  const content = quotedPost.description || quotedPost.name || '';

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/app/post/${quotedPost.tokenId}`, { state: { fromFeed: true } });
  };

  return (
    <div
      onClick={handleClick}
      className={`border border-zinc-700/60 rounded-2xl overflow-hidden cursor-pointer hover:bg-white/[0.03] transition-colors ${className || ''}`}
    >
      {/* Media thumbnail (top, like Twitter) */}
      <QuotedPostMedia post={quotedPost} />

      {/* Content area */}
      <div className="p-3">
        {/* Author row */}
        <div className="flex items-center gap-1.5 mb-1">
          <Avatar className="w-5 h-5">
            <AvatarImage src={resolvedAvatar || undefined} />
            <AvatarFallback className="text-[8px] bg-zinc-700 text-zinc-300">
              {displayName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <BadgedName
            badgeBalance={quotedPost.minterUser?.hideBadgeAndBalance ? 0 : quotedPost.minterUser?.badgeBalance}
            username={handle}
            className="text-[15px] leading-5 font-semibold text-white"
          >
            {displayName}
          </BadgedName>
          <NewMemberChip address={avatarAddress || undefined} />
          <CheckCircle className="w-3.5 h-3.5 text-white shrink-0 hidden" />
          <span className="text-[13px] leading-5 text-zinc-500 truncate">@{handle}</span>
        </div>

        {/* Text content */}
        {quotedPost.articleBody && <span className="mb-1 block text-xs font-semibold uppercase tracking-widest text-white/60">Article</span>}
        {quotedPost.articleBody && quotedPost.name?.trim() && <h3 className="text-lg font-semibold text-white">{quotedPost.name}</h3>}
        {content && (
          <p className="text-[15px] leading-[22px] text-zinc-300 whitespace-pre-wrap">{content}</p>
        )}
      </div>
    </div>
  );
});
