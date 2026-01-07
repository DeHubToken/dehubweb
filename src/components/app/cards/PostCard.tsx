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

import { useState } from 'react';
import { Eye } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { CardHeader } from './CardHeader';
import { ActionBar } from './ActionBar';
import { CommentsSection, generateRandomComments, generateRandomQuotes } from './CommentsSection';
import { TranslatableText } from '../TranslatableText';
import type { TextPost } from '@/types/feed.types';

interface PostCardProps {
  post: TextPost;
}

// Generate random view count based on post id
const getViewCount = (id: string) => {
  const seed = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const views = Math.floor((seed * 1234) % 50000) + 500;
  return views >= 1000 ? `${(views / 1000).toFixed(1)}K` : views.toString();
};

export function PostCard({ post }: PostCardProps) {
  const [showComments, setShowComments] = useState(false);

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
        <TranslatableText text={post.content} className="text-white/90 text-sm sm:text-base" as="p" />
        <div className="flex items-center gap-3 mt-2">
          <span className="text-zinc-500 text-xs">{post.createdAt}</span>
          <span className="flex items-center gap-1 text-zinc-500 text-xs">
            <Eye className="w-3 h-3" />
            {getViewCount(post.id)} views
          </span>
        </div>
      </div>

      <ActionBar onComment={() => setShowComments(!showComments)} />

      {/* Comments Section */}
      <div className="px-3 pb-3">
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
