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
import { Eye } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { CardHeader } from './CardHeader';
import { ActionBar } from './ActionBar';
import { CommentsSection, generateRandomComments, generateRandomQuotes } from './CommentsSection';
import type { ImagePost } from '@/types/feed.types';

interface ImageCardProps {
  post: ImagePost;
}

// Generate random view count based on post id
const getViewCount = (id: string) => {
  const seed = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const views = Math.floor((seed * 1234) % 100000) + 1000;
  return views >= 1000 ? `${(views / 1000).toFixed(1)}K` : views.toString();
};

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
      <div className="aspect-square bg-zinc-800 relative">
        <img src={post.image} alt="" className="w-full h-full object-cover" />
        {/* View count overlay */}
        <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-black/70 px-2 py-0.5 rounded">
          <Eye className="w-3 h-3 text-white" />
          <span className="text-white text-xs font-medium">{getViewCount(post.id)}</span>
        </div>
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
