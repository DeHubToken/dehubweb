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
import { Eye, MoreVertical, Download, Flag, Ban, EyeOff, Sparkles } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { CardHeader } from './CardHeader';
import { ActionBar } from './ActionBar';
import { CommentsSection, generateRandomComments, generateRandomQuotes } from './CommentsSection';
import { TranslatableText } from '../TranslatableText';
import { PostAIChat } from './PostAIChat';
import { getViewCount } from '@/lib/feed-utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ImagePost } from '@/types/feed.types';

interface ImageCardProps {
  post: ImagePost;
}

export function ImageCard({ post }: ImageCardProps) {
  const [showComments, setShowComments] = useState(false);
  const [showAIChat, setShowAIChat] = useState(false);

  return (
    <div className="bg-zinc-900 rounded-2xl overflow-hidden">
      {/* Header with AI and menu buttons */}
      <div className="flex items-center justify-between">
        <CardHeader
          username={post.username}
          avatarSeed={post.avatar}
          verified={post.verified}
          contentType="image"
        />
        <div className="flex items-center gap-1 pr-3">
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
              <button className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
                <MoreVertical className="w-5 h-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-zinc-800 border-zinc-700">
              <DropdownMenuItem className="text-white hover:bg-zinc-700 cursor-pointer gap-2">
                <Download className="w-4 h-4" /> Download
              </DropdownMenuItem>
              <DropdownMenuItem className="text-white hover:bg-zinc-700 cursor-pointer gap-2">
                <Flag className="w-4 h-4" /> Report
              </DropdownMenuItem>
              <DropdownMenuItem className="text-white hover:bg-zinc-700 cursor-pointer gap-2">
                <Ban className="w-4 h-4" /> Block Creator
              </DropdownMenuItem>
              <DropdownMenuItem className="text-white hover:bg-zinc-700 cursor-pointer gap-2">
                <EyeOff className="w-4 h-4" /> See Less Like This
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Image */}
      <div className="aspect-square bg-zinc-800">
        <img src={post.image} alt="" className="w-full h-full object-cover" />
      </div>

      {/* Info & Actions */}
      <div className="p-3">
        <ActionBar postId={post.id} className="p-0 mb-2" onComment={() => setShowComments(!showComments)} />
        <p className="font-semibold text-white text-sm">{post.likes.toLocaleString()} likes</p>
        <p className="text-white text-sm mt-1">
          <span className="font-semibold">{post.username}</span> <TranslatableText text={post.caption} className="inline" as="span" />
        </p>
        <div className="flex items-center gap-3 mt-1">
          <span className="text-zinc-500 text-xs">{post.timeAgo}</span>
          <span className="flex items-center gap-1 text-zinc-500 text-xs">
            <Eye className="w-3 h-3" />
            {getViewCount(post.id)} views
          </span>
        </div>

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

      {/* AI Chat */}
      <PostAIChat
        isOpen={showAIChat}
        onClose={() => setShowAIChat(false)}
        postContext={{
          type: 'image',
          author: post.username,
          caption: post.caption,
          imageUrl: post.image
        }}
      />
    </div>
  );
}
