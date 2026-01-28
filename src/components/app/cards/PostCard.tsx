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

import { useState, memo } from 'react';
import { Eye, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { CardHeader } from './CardHeader';
import { ActionBar } from './ActionBar';
import { CommentsSheet } from '../comments';
import { TranslatableText } from '../TranslatableText';
import { PostAIChat } from './PostAIChat';
import { getViewCount } from '@/lib/feed-utils';
import type { TextPost } from '@/types/feed.types';

interface PostCardProps {
  post: TextPost;
}

export const PostCard = memo(function PostCard({ post }: PostCardProps) {
  const [showComments, setShowComments] = useState(false);
  const [showAIChat, setShowAIChat] = useState(false);

  return (
    <div className="bg-zinc-900 rounded-2xl overflow-hidden relative">
      <CardHeader
        username={post.author.name}
        avatarSeed={post.author.avatarSeed}
        verified={post.author.verified}
        contentType="post"
        creatorId={post.author.id}
        creatorUsername={post.author.handle}
      />

      {/* AI Button for text posts - positioned in header area */}
      <motion.button
        onClick={() => setShowAIChat(true)}
        className="absolute top-3 right-3 z-10 text-zinc-400 hover:text-white transition-colors"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        aria-label="Ask AI about this post"
      >
        <Sparkles className="w-5 h-5" />
      </motion.button>

      {/* Content */}
      <div className="px-3 pb-3">
        <TranslatableText text={post.content} className="text-white/90 text-sm sm:text-base" as="p" />
        <div className="flex items-center gap-3 mt-2">
          <span className="text-zinc-500 text-xs">{post.createdAt}</span>
          <span className="flex items-center gap-1 text-zinc-500 text-xs">
            <Eye className="w-3 h-3" />
            {getViewCount(post.id)}
          </span>
        </div>
      </div>

      <ActionBar 
        postId={post.id} 
        onComment={() => setShowComments(true)}
        likeCount={post.stats.likes}
        commentCount={post.stats.comments}
        hideDislike
      />

      {/* Comments Sheet */}
      {showComments && (
        <CommentsSheet
          tokenId={post.id}
          onClose={() => setShowComments(false)}
        />
      )}

      {/* AI Chat */}
      <PostAIChat
        isOpen={showAIChat}
        onClose={() => setShowAIChat(false)}
        postContext={{
          type: 'post',
          author: post.author.name,
          caption: post.content
        }}
      />
    </div>
  );
});
