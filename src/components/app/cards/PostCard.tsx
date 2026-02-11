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

import { useState, memo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Sparkles, MoreVertical, Link2, Flag, Ban, MessageSquare, Eye, EyeOff, Globe, Pencil, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { CardHeader } from './CardHeader';
import { ActionBar } from './ActionBar';
import { CommentsSection } from './CommentsSection';
import { PostMetadata } from './PostMetadata';
import { TranslatableText, useTranslation } from '../TranslatableText';
import { PostAIChat } from './PostAIChat';
import { ReportModal } from '../modals/ReportModal';
import { EditPostModal } from '../modals/EditPostModal';
import { DeletePostModal } from '../modals/DeletePostModal';
import { useFeedViewTracking } from '@/hooks/use-view-tracking';
import { useAuth } from '@/contexts/AuthContext';
import { updateTokenVisibility, type TokenVisibility } from '@/lib/api/dehub';
import { cacheTextPostForNavigation } from '@/lib/post-cache';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
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
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [visibility, setVisibility] = useState<TokenVisibility>('public');
  const isTabletOrMobile = useIsTabletOrMobile();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { walletAddress } = useAuth();
  
  const isOwnPost = walletAddress && post.author.id?.toLowerCase() === walletAddress.toLowerCase();
  
  // View tracking - batches views when post is visible for 2+ seconds
  const viewRef = useFeedViewTracking(post.id);

  // Translation hook for post content
  const {
    isTranslated,
    translatedText,
    isLoading: isTranslateLoading,
    error: translateError,
    handleTranslate,
    handleShowOriginal,
  } = useTranslation(post.content);

  // Navigate to single post page when clicking non-interactive areas
  // Pre-cache post data for instant display on the single post page
  const handleCardClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const isInteractive = target.closest('button, a, input, textarea, [role="button"], [data-no-navigate]');
    if (isInteractive) return;
    
    // Cache the post data before navigation for instant display
    cacheTextPostForNavigation(queryClient, post);
    navigate(`/app/post/${post.id}`);
  }, [navigate, post.id, queryClient, post]);

  return (
    <div 
      ref={viewRef} 
      onClick={handleCardClick}
      className="overflow-hidden relative cursor-pointer isolate"
    >
      <CardHeader
        username={post.author.name}
        handle={post.author.handle}
        avatarSeed={post.author.avatarSeed}
        verified={post.author.verified}
        contentType="post"
        creatorId={post.author.id}
        creatorUsername={post.author.handle}
        stakedAmount={post.author.stakedAmount}
      />

      {/* AI Button and Options Drawer - positioned in header area */}
      <div className="absolute top-0 right-0 z-10 flex items-center gap-2">
        <motion.button
          onClick={() => setShowAIChat(true)}
          className="text-zinc-400 hover:text-white transition-colors"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          aria-label="Ask AI about this post"
        >
          <Sparkles className="w-5 h-5" />
        </motion.button>
        
        <Drawer>
          <DrawerTrigger asChild>
            <button className="text-zinc-400 hover:text-white transition-colors -mr-0.5">
              <MoreVertical className="w-5 h-5" />
            </button>
          </DrawerTrigger>
          <DrawerContent glass className="px-4 pb-6">
            <DrawerHeader className="pb-2">
              <DrawerTitle className="text-white text-lg">Options</DrawerTitle>
            </DrawerHeader>
            <div className="flex flex-col gap-1">
              <button
                onClick={() => setShowReportModal(true)}
                className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left"
              >
                <Flag className="w-5 h-5" /> Report
              </button>
              <button
                onClick={() => {
                  const url = `${window.location.origin}/app/post/${post.id}`;
                  navigator.clipboard.writeText(url);
                  toast.success('Post URL copied to clipboard');
                }}
                className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left"
              >
                <Link2 className="w-5 h-5" /> Copy Post URL
              </button>
              <button className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left">
                <Ban className="w-5 h-5" /> Block Creator
              </button>
              {isOwnPost && (
                <>
                  <div className="border-t border-white/10 my-1" />
                  <button
                    onClick={() => setShowEditModal(true)}
                    className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left"
                  >
                    <Pencil className="w-5 h-5" /> Edit Post
                  </button>
                  <button
                    onClick={() => setShowDeleteModal(true)}
                    className="flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-white/10 rounded-xl transition-colors text-left"
                  >
                    <Trash2 className="w-5 h-5" /> Delete Post
                  </button>
                  <button
                    onClick={async () => {
                      const next: TokenVisibility = visibility === 'public' ? 'private' : 'public';
                      try {
                        await updateTokenVisibility(post.id, next);
                        setVisibility(next);
                        toast.success(`Post set to ${next}`);
                      } catch { toast.error('Failed to update visibility'); }
                    }}
                    className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left"
                  >
                    {visibility === 'public' ? <EyeOff className="w-5 h-5" /> : <Globe className="w-5 h-5" />}
                    {visibility === 'public' ? 'Make Private' : 'Make Public'}
                  </button>
                </>
              )}
            </div>
          </DrawerContent>
        </Drawer>
      </div>

      {/* Content */}
      <div className="pt-3 space-y-2">
        <TranslatableText text={isTranslated ? translatedText : post.content} className="text-white/90 text-sm sm:text-base" as="p" />

        {/* Metadata: timestamp and views */}
        <PostMetadata 
          timestamp={post.createdAt} 
          viewCount={post.views}
          translateControl={{
            isTranslated,
            isLoading: isTranslateLoading,
            error: translateError,
            onTranslate: handleTranslate,
            onShowOriginal: handleShowOriginal,
          }}
        />

        <div className="pt-1">
          <ActionBar 
            postId={post.id} 
            className="p-0"
            onComment={() => setShowComments(prev => !prev)}
            isLiked={post.isLiked}
            isDisliked={post.isDisliked}
            likeCount={post.stats.likes}
            commentCount={post.stats.comments}
            isOptimistic={post.isOptimistic}
          />
        </div>

        {/* Comments - Always use Drawer for consistent liquid glass style */}
        <Drawer open={showComments} onOpenChange={setShowComments}>
          <DrawerContent glass hideHandle className="max-h-[70vh] flex flex-col overflow-hidden">
            <div className="flex-1 min-h-0 px-4 pb-4 pt-2">
              <CommentsSection
                tokenId={post.id}
                onClose={() => setShowComments(false)}
              />
            </div>
          </DrawerContent>
        </Drawer>
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

      {/* Edit Post Modal */}
      <EditPostModal
        open={showEditModal}
        onOpenChange={setShowEditModal}
        tokenId={post.id}
        currentTitle={post.content?.slice(0, 140)}
        currentDescription=""
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['unified-feed'] });
        }}
      />

      {/* Delete Post Modal */}
      <DeletePostModal
        open={showDeleteModal}
        onOpenChange={setShowDeleteModal}
        tokenId={post.id}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['unified-feed'] });
        }}
      />
    </div>
  );
});
