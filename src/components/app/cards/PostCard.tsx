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

import { useState, memo, useEffect } from 'react';
import { Eye, Sparkles, MoreVertical, Link2, Flag, Ban, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { CardHeader } from './CardHeader';
import { ActionBar } from './ActionBar';
import { CommentsSection } from './CommentsSection';
import { TranslatableText } from '../TranslatableText';
import { PostAIChat } from './PostAIChat';
import { ReportModal } from '../modals/ReportModal';
import { useFeedViewTracking } from '@/hooks/use-view-tracking';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { TextPost } from '@/types/feed.types';

// Use lg breakpoint (1024px) to determine if we show drawer vs inline
function useIsTabletOrMobile() {
  const [isTabletOrMobile, setIsTabletOrMobile] = useState(false);
  
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 1023px)');
    const onChange = () => setIsTabletOrMobile(mql.matches);
    mql.addEventListener('change', onChange);
    setIsTabletOrMobile(mql.matches);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  
  return isTabletOrMobile;
}

interface PostCardProps {
  post: TextPost;
}

export const PostCard = memo(function PostCard({ post }: PostCardProps) {
  const [showComments, setShowComments] = useState(false);
  const [showAIChat, setShowAIChat] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const isTabletOrMobile = useIsTabletOrMobile();
  
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
            <DropdownMenuItem 
              onClick={() => setShowReportModal(true)}
              className="text-white hover:bg-zinc-700 cursor-pointer gap-2"
            >
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
          onComment={() => setShowComments(prev => !prev)}
          likeCount={post.stats.likes}
          commentCount={post.stats.comments}
          hideDislike
        />

        {/* Comments - Drawer for tablet/mobile, inline for desktop */}
        {isTabletOrMobile ? (
          <Drawer open={showComments} onOpenChange={setShowComments}>
            <DrawerContent glass className="max-h-[70vh] overflow-hidden">
              <DrawerHeader className="border-b border-white/10 pb-3">
                <DrawerTitle className="text-white font-semibold flex items-center gap-2">
                  <MessageSquare className="w-5 h-5" />
                  Comments
                </DrawerTitle>
              </DrawerHeader>
              <div className="flex-1 overflow-y-auto px-4 pb-4">
                <CommentsSection
                  tokenId={post.id}
                  onClose={() => setShowComments(false)}
                />
              </div>
            </DrawerContent>
          </Drawer>
        ) : (
          <AnimatePresence>
            {showComments && (
              <CommentsSection
                tokenId={post.id}
                onClose={() => setShowComments(false)}
              />
            )}
          </AnimatePresence>
        )}
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

      {/* Report Modal */}
      <ReportModal
        open={showReportModal}
        onOpenChange={setShowReportModal}
        tokenId={post.id}
        contentType="post"
      />
    </div>
  );
});
