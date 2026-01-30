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
import { Eye, Sparkles, MoreVertical, Link2, Flag, Ban } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { CardHeader } from './CardHeader';
import { ActionBar } from './ActionBar';
import { CommentsSection } from './CommentsSection';
import { TranslatableText } from '../TranslatableText';
import { PostAIChat } from './PostAIChat';
import { useFeedViewTracking } from '@/hooks/use-view-tracking';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { TextPost } from '@/types/feed.types';

interface PostCardProps {
  post: TextPost;
}

export const PostCard = memo(function PostCard({ post }: PostCardProps) {
  const [showComments, setShowComments] = useState(false);
  const [showAIChat, setShowAIChat] = useState(false);
  
  // View tracking - batches views when post is visible for 2+ seconds
  const viewRef = useFeedViewTracking(post.id);

  return (
    <div ref={viewRef} className="bg-zinc-900 rounded-2xl overflow-hidden relative">
      <CardHeader
        username={post.author.name}
        avatarSeed={post.author.avatarSeed}
        verified={post.author.verified}
        contentType="post"
        creatorId={post.author.id}
        creatorUsername={post.author.handle}
      />

      {/* AI Button for text posts - positioned in header area */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
        <motion.button
          onClick={() => setShowAIChat(true)}
          className="text-zinc-400 hover:text-white transition-colors"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          aria-label="Ask AI about this post"
        >
          <Sparkles className="w-5 h-5" />
        </motion.button>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="text-zinc-400 hover:text-white transition-colors">
              <MoreVertical className="w-5 h-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-zinc-800 border-zinc-700">
            <DropdownMenuItem className="text-white hover:bg-zinc-700 cursor-pointer gap-2">
              <Flag className="w-4 h-4" /> Report
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => {
                const url = `${window.location.origin}/app/post/${post.id}`;
                navigator.clipboard.writeText(url);
                toast.success('Post URL copied to clipboard');
              }}
              className="text-white hover:bg-zinc-700 cursor-pointer gap-2"
            >
              <Link2 className="w-4 h-4" /> Copy Post URL
            </DropdownMenuItem>
            <DropdownMenuItem className="text-white hover:bg-zinc-700 cursor-pointer gap-2">
              <Ban className="w-4 h-4" /> Block Creator
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Content */}
      <div className="p-3 space-y-2">
        <TranslatableText text={post.content} className="text-white/90 text-sm sm:text-base" as="p" />
        <div className="flex items-center gap-3">
          <span className="text-zinc-500 text-xs">{post.createdAt}</span>
          <span className="flex items-center gap-1 text-zinc-500 text-xs">
            <Eye className="w-3 h-3" />
            {post.views || '0'}
          </span>
        </div>

        <ActionBar 
          postId={post.id} 
          className="p-0"
          onComment={() => setShowComments(true)}
          likeCount={post.stats.likes}
          commentCount={post.stats.comments}
          hideDislike
        />

        {/* Inline Comments Section - inside padded container to match VideoCard */}
        <AnimatePresence>
          {showComments && (
            <CommentsSection
              tokenId={post.id}
              onClose={() => setShowComments(false)}
            />
          )}
        </AnimatePresence>
      </div>

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
