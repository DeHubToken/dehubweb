/**
 * Post Card Component
 * ===================
 * Displays text-based post content with universal styling.
 * 
 * @example
 * ```tsx
 * <PostCard post={postData} />
 * ```
 */

import { CardHeader } from './CardHeader';
import { ActionBar } from './ActionBar';
import type { TextPost } from '@/types/feed.types';

interface PostCardProps {
  post: TextPost;
}

export function PostCard({ post }: PostCardProps) {
  return (
    <div className="bg-zinc-900 rounded-2xl overflow-hidden">
      <CardHeader
        username={post.author.name}
        avatarSeed={post.author.handle}
        verified={post.author.verified}
        contentType="post"
      />

      {/* Content */}
      <div className="px-3 pb-3">
        <p className="text-white/90 text-sm sm:text-base">{post.content}</p>
        <p className="text-zinc-500 text-xs mt-2">{post.createdAt}</p>
      </div>

      <ActionBar showBorder />
    </div>
  );
}
