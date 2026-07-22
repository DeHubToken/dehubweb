/**
 * Live Card Component
 * ===================
 * Displays live stream content with viewer count and universal styling.
 * 
 * @example
 * ```tsx
 * <LiveCard stream={liveData} />
 * ```
 */

import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sparkles, MoreVertical, Flag, Ban, EyeOff, Bell, Bookmark, Info } from 'lucide-react';
import { useTranslation as useI18n } from 'react-i18next';
import { cn } from '@/lib/utils';
import { CardHeader } from './CardHeader';
import { ActionBar } from './ActionBar';
import { CommentsWrapper } from './CommentsWrapper';
import { LiveEndedMedia } from './LiveEndedMedia';
import { PostAIChat } from './PostAIChat';
import { ReportModal } from '../modals/ReportModal';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useStreamActions } from '@/hooks/use-livestream';
import { useAuth } from '@/contexts/AuthContext';
import { useBookmarkPost } from '@/hooks/use-bookmarks';
import { toast } from 'sonner';
import type { LiveStream } from '@/types/feed.types';

interface LiveCardProps {
  stream: LiveStream;
}

export function LiveCard({ stream }: LiveCardProps) {
  const [showComments, setShowComments] = useState(false);
  const { t } = useI18n();
  const [showAIChat, setShowAIChat] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const navigate = useNavigate();
  const { isAuthenticated, openLoginModal, walletAddress } = useAuth();
  const { like, isLiking } = useStreamActions();
  // Bookmark state for the mobile/tablet three-dot menu (desktop shows this
  // in the ActionBar's left-anchored utility cluster instead).
  const { isBookmarked, isLoading: isBookmarkLoading, toggleBookmark } = useBookmarkPost(stream.id);
  const openPostInfoPage = useCallback(() => {
    navigate(`/app/post/${stream.id}/info`);
  }, [navigate, stream.id]);

  // Navigate to single post page when clicking non-interactive areas
  const handleCardClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const isInteractive = target.closest('button, a, input, textarea, [role="button"], [data-no-navigate]');
    if (isInteractive) return;
    // Allow text selection without navigating
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) return;
    navigate(`/app/post/${stream.id}`, { state: { fromFeed: true } });
  }, [navigate, stream.id]);

  const handleLike = useCallback(async () => {
    if (!isAuthenticated) {
      toast.error('Sign in to like');
      return;
    }
    try {
      await like(stream.id);
      setIsLiked(true);
      toast.success('Stream liked!');
    } catch {
      toast.error('Failed to like');
    }
  }, [stream.id, isAuthenticated, like]);

  return (
    <div 
      onClick={handleCardClick}
      className="rounded-xl border border-white/[0.12] bg-white/[0.03] p-3 cursor-pointer isolate"
    >
      {/* Header with AI and menu buttons */}
      <div className="flex items-start justify-between">
        <CardHeader
          username={stream.streamer}
          handle={stream.creatorUsername}
          avatarSeed={stream.avatar}
          contentType="live"
          isLive
          creatorId={stream.creatorId}
          creatorUsername={stream.creatorUsername}
        />
        <div className="flex items-center gap-2">
          <motion.button
            onClick={() => { if (!walletAddress) { openLoginModal(); return; } setShowAIChat(true); }}
            className="text-zinc-400 hover:text-white transition-colors"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            aria-label="Ask AI about this stream"
          >
            <Sparkles className="w-[23.5px] h-[23.5px]" />
          </motion.button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button onClick={(e) => { if (!walletAddress) { e.preventDefault(); e.stopPropagation(); openLoginModal(); } }} aria-label="Post options" className="text-zinc-400 hover:text-white transition-colors -mr-0.5">
                <MoreVertical className="w-[23.5px] h-[23.5px]" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-zinc-800 border-zinc-700">
              {/* Bookmark / Post info — mobile/tablet only; desktop shows these
                  anchored left in the bottom action bar instead. */}
              <DropdownMenuItem
                onClick={() => toggleBookmark()}
                disabled={isBookmarkLoading}
                className={cn(
                  "lg:hidden hover:bg-zinc-700 cursor-pointer gap-2",
                  isBookmarked ? "text-yellow-500" : "text-white"
                )}
              >
                <Bookmark className={cn("w-4 h-4", isBookmarked && "fill-current")} />
                {isBookmarked ? 'Remove bookmark' : 'Bookmark'}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={openPostInfoPage}
                className="lg:hidden text-white hover:bg-zinc-700 cursor-pointer gap-2"
              >
                <Info className="w-4 h-4" /> Post info
              </DropdownMenuItem>
              <DropdownMenuItem className="text-white hover:bg-zinc-700 cursor-pointer gap-2">
                <Bell className="w-4 h-4" /> {t('postOptions.notifyWhenLive')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setShowReportModal(true)}
                className="text-white hover:bg-zinc-700 cursor-pointer gap-2"
              >
                <Flag className="w-4 h-4" /> {t('postOptions.report')}
              </DropdownMenuItem>
              <DropdownMenuItem className="text-white hover:bg-zinc-700 cursor-pointer gap-2">
                <Ban className="w-4 h-4" /> {t('postOptions.blockCreator')}
              </DropdownMenuItem>
              <DropdownMenuItem className="text-white hover:bg-zinc-700 cursor-pointer gap-2">
                <EyeOff className="w-4 h-4" /> {t('postOptions.seeLessLikeThis')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Thumbnail */}
      <div className="relative aspect-video bg-black rounded-lg overflow-hidden" data-no-navigate>
        {stream.isLive && stream.thumbnail ? (
          <img
            src={stream.thumbnail}
            alt=""
            className="w-full h-full object-cover rounded-lg"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src =
                'https://images.unsplash.com/photo-1611162616475-46b635cb6868?w=480&h=270&fit=crop';
            }}
          />
        ) : (
          /* Ended live (or a live post missing its cover): show the cover image
             if there is one, otherwise a staticy TV screen — never an empty box. */
          <LiveEndedMedia thumbnail={stream.thumbnail} />
        )}
      </div>

      {/* Info & Actions */}
      <div className="pt-3">
        <ActionBar
          postId={stream.id}
          utilityDesktopAnchor
          className="p-0 mb-2"
          onComment={() => setShowComments(prev => !prev)}
          likeCount={stream.likeCount}
          commentCount={stream.commentCount}
        />
        <p className="font-semibold text-white text-sm">{stream.viewers} tuned in</p>
        <h3 className="text-white text-sm mt-1">{stream.title}</h3>
        <p className="text-zinc-500 text-xs mt-1">{stream.game}</p>
      </div>

      {/* Comments */}
      <CommentsWrapper
        open={showComments}
        onOpenChange={setShowComments}
        tokenId={stream.id}
      />

      {/* AI Chat */}
      <PostAIChat
        isOpen={showAIChat}
        onClose={() => setShowAIChat(false)}
        postContext={{
          type: 'live',
          author: stream.streamer,
          title: stream.title,
          caption: `Playing ${stream.game} with ${stream.viewers} viewers`,
          imageUrl: stream.thumbnail
        }}
      />

      {/* Report Modal */}
      <ReportModal
        open={showReportModal}
        onOpenChange={setShowReportModal}
        tokenId={stream.id}
        contentType="video"
      />
    </div>
  );
}
