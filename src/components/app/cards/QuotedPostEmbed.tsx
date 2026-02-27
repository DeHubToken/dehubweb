/**
 * Quoted Post Embed Component
 * ============================
 * Twitter/X-style embedded quoted post preview.
 * Shows inside a bordered card with author info, content preview, and optional media thumbnail.
 */

import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { CheckCircle, Play, Images } from 'lucide-react';
import { getMediaUrl } from '@/lib/api/dehub/core';
import { buildFeedImageUrls, buildImageUrl } from '@/lib/media-url';
import { useProfileAvatar } from '@/hooks/use-profile-avatar-cache';
import type { DeHubNFT } from '@/lib/api/dehub/types';

interface QuotedPostEmbedProps {
  quotedPost: DeHubNFT;
  className?: string;
}

export const QuotedPostEmbed = memo(function QuotedPostEmbed({ quotedPost, className }: QuotedPostEmbedProps) {
  const navigate = useNavigate();

  const avatarPath = quotedPost.minterAvatarUrl || quotedPost.minterUser?.avatarImageUrl || quotedPost.creator?.avatarImageUrl;
  const avatarUrl = getMediaUrl(avatarPath);
  const resolvedAvatar = useProfileAvatar(quotedPost.minter, avatarUrl);

  const displayName = quotedPost.minterDisplayName || quotedPost.minterUsername || quotedPost.mintername || 'Unknown';
  const handle = quotedPost.minterUsername || quotedPost.mintername || quotedPost.minter?.slice(0, 8);
  const content = quotedPost.description || quotedPost.name || '';
  const hasVideo = quotedPost.postType === 'video' && quotedPost.videoUrl;
  
  // For images: resolve feed-image URLs properly via buildFeedImageUrls
  const resolvedImageUrls = buildFeedImageUrls(quotedPost.imageUrls);
  const firstImageUrl = resolvedImageUrls?.[0] || (quotedPost.imageUrl ? buildImageUrl(quotedPost.tokenId, quotedPost.imageUrl) : undefined);
  const hasImage = !hasVideo && (quotedPost.postType === 'image' || !!firstImageUrl);
  const thumbnailUrl = hasVideo
    ? (getMediaUrl(quotedPost.thumbnail_url) || buildImageUrl(quotedPost.tokenId, quotedPost.imageUrl))
    : firstImageUrl;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/app/post/${quotedPost.tokenId}`);
  };

  return (
    <div
      onClick={handleClick}
      className={`border border-zinc-700/60 rounded-2xl overflow-hidden cursor-pointer hover:bg-white/[0.03] transition-colors ${className || ''}`}
    >
      {/* Media thumbnail (top, like Twitter) */}
      {thumbnailUrl && (hasImage || hasVideo) && (
        <div className="relative w-full aspect-video bg-zinc-900">
          <img
            src={thumbnailUrl}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
          {hasVideo && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center">
                <Play className="w-5 h-5 text-white fill-white ml-0.5" />
              </div>
            </div>
          )}
          {hasImage && (resolvedImageUrls?.length ?? 0) > 1 && (
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
          <span className="text-sm font-semibold text-white truncate">{displayName}</span>
          <CheckCircle className="w-3.5 h-3.5 text-blue-400 shrink-0 hidden" />
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
