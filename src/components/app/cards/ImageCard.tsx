/**
 * Image Card Component
 * ====================
 * Displays image post content with universal styling.
 * 
 * @example
 * ```tsx
 * <ImageCard post={imageData} />
 * ```
 */

import { CardHeader } from './CardHeader';
import { ActionBar } from './ActionBar';
import type { ImagePost } from '@/types/feed.types';

interface ImageCardProps {
  post: ImagePost;
}

export function ImageCard({ post }: ImageCardProps) {
  return (
    <div className="bg-zinc-900 rounded-2xl overflow-hidden">
      <CardHeader
        username={post.username}
        avatarSeed={post.avatar}
        verified={post.verified}
        contentType="image"
      />

      {/* Image */}
      <div className="aspect-square bg-zinc-800">
        <img src={post.image} alt="" className="w-full h-full object-cover" />
      </div>

      {/* Info & Actions */}
      <div className="p-3">
        <ActionBar className="p-0 mb-2" />
        <p className="font-semibold text-white text-sm">{post.likes.toLocaleString()} likes</p>
        <p className="text-white text-sm mt-1">
          <span className="font-semibold">{post.username}</span> {post.caption}
        </p>
        <p className="text-zinc-500 text-xs mt-1">{post.timeAgo}</p>
      </div>
    </div>
  );
}
