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
import { isTokenUnlocked } from '@/lib/unlocked-tokens-store';
import { BadgedName } from '@/components/app/BadgedName';
import type { DeHubNFT } from '@/lib/api/dehub/types';

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
  const hasVideo = quotedPost.postType === 'video' && quotedPost.videoUrl;
  
  // For images: resolve feed-image URLs properly via buildFeedImageUrls
  const resolvedImageUrls = buildFeedImageUrls(quotedPost.imageUrls);
  const firstImageUrl = resolvedImageUrls?.[0] || (quotedPost.imageUrl ? buildImageUrl(quotedPost.tokenId, quotedPost.imageUrl) : undefined);
  const hasImage = !hasVideo && (quotedPost.postType === 'image' || !!firstImageUrl);
  const thumbnailUrl = hasVideo
    ? (getMediaUrl(quotedPost.thumbnail_url) || buildImageUrl(quotedPost.tokenId, quotedPost.imageUrl))
    : firstImageUrl;

  // Gated content must stay gated in embeds (quotes, DM shares) — otherwise a
  // locked PPV post shared into a DM leaks its media as a free preview. Same
  // bypass rules as the feed cards: owners and unlockers see it clear.
  const isPPV = !!(quotedPost.is_ppv || quotedPost.streamInfo?.isPayPerView);
  const isHoldLocked = !!(quotedPost.is_locked || quotedPost.streamInfo?.isLockContent);
  const canBypassGating = !!(quotedPost.isOwner || quotedPost.isUnlocked) || isTokenUnlocked(String(quotedPost.tokenId));
  const gated = (isPPV || isHoldLocked) && !canBypassGating;

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
      {thumbnailUrl && (hasImage || hasVideo) && (
        <div className="relative w-full aspect-video max-h-[200px] sm:max-h-[240px] bg-zinc-900 overflow-hidden">
          <img
            src={thumbnailUrl}
            alt=""
            className={`w-full h-full object-cover rounded-lg ${gated ? 'blur-2xl scale-110 select-none pointer-events-none' : ''}`}
            loading="lazy"
          />
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
          {!gated && hasImage && (resolvedImageUrls?.length ?? 0) > 1 && (
            <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm rounded-lg px-2 py-1 flex items-center gap-1">
              <Images className="w-3.5 h-3.5 text-white" />
              <span className="text-xs text-white font-medium">{resolvedImageUrls!.length}</span>
            </div>
          )}
        </div>
      )}

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
            badgeBalance={quotedPost.minterUser?.badgeBalance}
            username={handle}
            className="text-sm font-semibold text-white"
          >
            {displayName}
          </BadgedName>
          <CheckCircle className="w-3.5 h-3.5 text-white shrink-0 hidden" />
          <span className="text-xs text-zinc-500 truncate">@{handle}</span>
        </div>

        {/* Text content */}
        {content && (
          <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{content}</p>
        )}
      </div>
    </div>
  );
});
