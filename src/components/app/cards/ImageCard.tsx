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

import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { CardHeader } from './CardHeader';
import { ActionBar } from './ActionBar';
import { CommentsSection, generateRandomComments, generateRandomQuotes } from './CommentsSection';
import type { ImagePost } from '@/types/feed.types';

interface ImageCardProps {
  post: ImagePost;
}

export function ImageCard({ post }: ImageCardProps) {
  const [showComments, setShowComments] = useState(false);

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
        <ActionBar className="p-0 mb-2" onComment={() => setShowComments(!showComments)} />
        <p className="font-semibold text-white text-sm">{post.likes.toLocaleString()} likes</p>
        <p className="text-white text-sm mt-1">
          <span className="font-semibold">{post.username}</span> {post.caption}
        </p>
        <p className="text-zinc-500 text-xs mt-1">{post.timeAgo}</p>

        {/* Comments Section */}
        <AnimatePresence>
          {showComments && (
            <CommentsSection 
              onClose={() => setShowComments(false)} 
              initialReplies={generateRandomComments(15, post.id)}
              initialQuotes={generateRandomQuotes(5, post.id)}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
