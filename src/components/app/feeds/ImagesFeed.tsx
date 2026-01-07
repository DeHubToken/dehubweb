/**
 * Images Feed Component
 * =====================
 * Displays image posts in collage or endless scroll view.
 * Uses centralized mock data and shared utilities.
 * 
 * @module components/app/feeds/ImagesFeed
 */

import { useRef, useMemo } from 'react';
import { Heart, MessageCircle, Bookmark, Share2, MoreHorizontal, Download, Flag, Ban, EyeOff, Repeat2, Send, Link, Loader2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { SAMPLE_IMAGES } from '@/data/mock-feed.data';
import { shuffleArray } from '@/lib/feed-utils';
import type { ImagePost } from '@/types/feed.types';

// ============================================================================
// TYPES
// ============================================================================

interface ImagesFeedProps {
  showCollage?: boolean;
  isRefreshing?: boolean;
  refreshKey?: number;
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function CollageView({ posts }: { posts: ImagePost[] }) {
  return (
    <div className="p-1 sm:p-2">
      <div className="grid grid-cols-3 gap-0.5 sm:gap-1">
        {posts.map((post, index) => {
          const isLargeTile = (index + 1) % 3 === 0 && index !== 0;
          
          return (
            <div
              key={post.id}
              className={cn(
                'relative aspect-square bg-zinc-800 overflow-hidden group cursor-pointer',
                isLargeTile && 'col-span-2 row-span-2'
              )}
            >
              <img
                src={post.image}
                alt=""
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 sm:gap-6">
                <div className="flex items-center gap-1 sm:gap-2 text-white">
                  <Heart className="w-4 h-4 sm:w-6 sm:h-6 fill-white" />
                  <span className="font-semibold text-xs sm:text-base">{post.likes.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-1 sm:gap-2 text-white">
                  <MessageCircle className="w-4 h-4 sm:w-6 sm:h-6 fill-white" />
                  <span className="font-semibold text-xs sm:text-base">{post.comments}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EndlessScrollView({ posts }: { posts: ImagePost[] }) {
  return (
    <div className="p-2 sm:p-3 space-y-3">
      {posts.map((post) => (
        <div key={post.id} className="bg-zinc-900 rounded-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-3">
            <div className="flex items-center gap-3">
              <div className="p-0.5 rounded-full bg-gradient-to-br from-red-500 via-red-600 to-orange-500">
                <div className="p-0.5 bg-zinc-900 rounded-full">
                  <Avatar className="w-8 h-8">
                    <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${post.avatar}`} />
                    <AvatarFallback className="bg-zinc-700">{post.username[0]}</AvatarFallback>
                  </Avatar>
                </div>
              </div>
              <div>
                <div className="flex items-center gap-1">
                  <span className="font-semibold text-white text-sm">{post.username}</span>
                  {post.verified && (
                    <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                    </svg>
                  )}
                </div>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="text-zinc-400 hover:text-white">
                  <MoreHorizontal className="w-5 h-5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-zinc-800 border-zinc-700">
                <DropdownMenuItem className="text-white hover:bg-zinc-700 cursor-pointer gap-2">
                  <Download className="w-4 h-4" />
                  Download
                </DropdownMenuItem>
                <DropdownMenuItem className="text-white hover:bg-zinc-700 cursor-pointer gap-2">
                  <Flag className="w-4 h-4" />
                  Report
                </DropdownMenuItem>
                <DropdownMenuItem className="text-white hover:bg-zinc-700 cursor-pointer gap-2">
                  <Ban className="w-4 h-4" />
                  Block Creator
                </DropdownMenuItem>
                <DropdownMenuItem className="text-white hover:bg-zinc-700 cursor-pointer gap-2">
                  <EyeOff className="w-4 h-4" />
                  See Less Like This
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Image */}
          <div className="aspect-square bg-zinc-800">
            <img src={post.image} alt="" className="w-full h-full object-cover" />
          </div>

          {/* Actions */}
          <div className="p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-4">
                <button className="text-white hover:text-red-400 transition-colors">
                  <Heart className="w-6 h-6" />
                </button>
                <button className="text-white hover:text-zinc-400 transition-colors">
                  <MessageCircle className="w-6 h-6" />
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="text-white hover:text-zinc-400 transition-colors">
                      <Share2 className="w-6 h-6" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="bg-zinc-800 border-zinc-700">
                    <DropdownMenuItem className="text-white hover:bg-zinc-700 cursor-pointer gap-2">
                      <Repeat2 className="w-4 h-4" />
                      Repost
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-white hover:bg-zinc-700 cursor-pointer gap-2">
                      <Send className="w-4 h-4" />
                      DM to
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-white hover:bg-zinc-700 cursor-pointer gap-2">
                      <Link className="w-4 h-4" />
                      Copy URL
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <button className="text-white hover:text-zinc-400 transition-colors">
                <Bookmark className="w-6 h-6" />
              </button>
            </div>

            <p className="font-semibold text-white text-sm mb-1">
              {post.likes.toLocaleString()} likes
            </p>

            <p className="text-white text-sm">
              <span className="font-semibold">{post.username}</span>{' '}
              <span className="text-zinc-300">{post.caption}</span>
            </p>

            <button className="text-zinc-500 text-sm mt-1">
              View all {post.comments} comments
            </button>

            <p className="text-zinc-500 text-xs mt-1">{post.timeAgo}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ImagesFeed({ showCollage = false, isRefreshing = false, refreshKey = 0 }: ImagesFeedProps) {
  const hasAnimated = useRef(false);
  
  // Shuffle posts based on refreshKey using centralized data
  const shuffledPosts = useMemo(() => {
    return shuffleArray(SAMPLE_IMAGES, refreshKey);
  }, [refreshKey]);
  
  // Only animate after first render (when switching views)
  const shouldAnimate = hasAnimated.current;
  hasAnimated.current = true;

  if (isRefreshing) {
    return (
      <div className="p-2 sm:p-3">
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-10 h-10 text-white animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      {showCollage ? (
        <motion.div
          key={`collage-${refreshKey}`}
          initial={shouldAnimate ? { opacity: 0, scale: 0.95 } : false}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        >
          <CollageView posts={shuffledPosts} />
        </motion.div>
      ) : (
        <motion.div
          key={`endless-${refreshKey}`}
          initial={shouldAnimate ? { opacity: 0, scale: 0.95 } : false}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        >
          <EndlessScrollView posts={shuffledPosts} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
