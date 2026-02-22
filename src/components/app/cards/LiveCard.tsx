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
import { Sparkles, MoreVertical, Flag, Ban, EyeOff, Bell } from 'lucide-react';
import { useTranslation as useI18n } from 'react-i18next';
import { CardHeader } from './CardHeader';
import { ActionBar } from './ActionBar';
import { CommentsWrapper } from './CommentsWrapper';
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

  // Navigate to single post page when clicking non-interactive areas
  const handleCardClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const isInteractive = target.closest('button, a, input, textarea, [role="button"], [data-no-navigate]');
    if (isInteractive) return;
    navigate(`/app/post/${stream.id}`);
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
      className="rounded-xl border border-white/[0.08] bg-transparent p-3 cursor-pointer isolate"
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
        <div className="flex items-center gap-1">
          <motion.button
            onClick={() => { if (!walletAddress) { openLoginModal(); return; } setShowAIChat(true); }}
            className="text-zinc-400 hover:text-white transition-colors"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            aria-label="Ask AI about this stream"
          >
            <Sparkles className="w-5 h-5" />
          </motion.button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button onClick={(e) => { if (!walletAddress) { e.preventDefault(); e.stopPropagation(); openLoginModal(); } }} className="text-zinc-400 hover:text-white transition-colors -mr-0.5">
                <MoreVertical className="w-5 h-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-zinc-800 border-zinc-700">
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
      <div className="relative aspect-video bg-zinc-800 rounded-lg overflow-hidden" data-no-navigate>
        <img
          src={stream.thumbnail}
          alt=""
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src =
              'https://images.unsplash.com/photo-1611162616475-46b635cb6868?w=480&h=270&fit=crop';
          }}
        />
        {!stream.isLive && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <span className="text-white text-xs font-semibold bg-zinc-800/80 px-3 py-1 rounded-full backdrop-blur-sm">
              Stream Ended
            </span>
          </div>
        )}
      </div>

      {/* Info & Actions */}
      <div className="pt-3">
        <ActionBar 
          postId={stream.id} 
          className="p-0 mb-2" 
          onComment={() => setShowComments(true)}
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
