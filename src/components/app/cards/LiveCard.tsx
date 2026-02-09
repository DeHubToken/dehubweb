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
import { Sparkles, MoreVertical, Flag, Ban, EyeOff, Bell, Heart, Gift } from 'lucide-react';
import { CardHeader } from './CardHeader';
import { ActionBar } from './ActionBar';
import { CommentsSection } from './CommentsSection';
import { PostAIChat } from './PostAIChat';
import { ReportModal } from '../modals/ReportModal';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
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
  const [showAIChat, setShowAIChat] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
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
      className="bg-zinc-900 rounded-2xl overflow-hidden cursor-pointer isolate"
    >
      {/* Header with AI and menu buttons */}
      <div className="flex items-start justify-between">
        <CardHeader
          username={stream.streamer}
          avatarSeed={stream.avatar}
          contentType="live"
          isLive
          creatorId={stream.creatorId}
          creatorUsername={stream.creatorUsername}
        />
        <div className="flex items-center gap-1">
          <motion.button
            onClick={handleLike}
            disabled={isLiking || isLiked}
            className={`transition-colors ${isLiked ? 'text-red-500' : 'text-zinc-400 hover:text-red-400'}`}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            aria-label="Like stream"
          >
            <Heart className={`w-5 h-5 ${isLiked ? 'fill-current' : ''}`} />
          </motion.button>
          <motion.button
            onClick={() => setShowAIChat(true)}
            className="text-zinc-400 hover:text-white transition-colors"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            aria-label="Ask AI about this stream"
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
                <Bell className="w-4 h-4" /> Notify When Live
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => setShowReportModal(true)}
                className="text-white hover:bg-zinc-700 cursor-pointer gap-2"
              >
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

      {/* Thumbnail */}
      <div className="aspect-video bg-zinc-800" data-no-navigate>
        <img src={stream.thumbnail} alt="" className="w-full h-full object-cover" />
      </div>

      {/* Info & Actions */}
      <div className="pt-3 px-3">
        <ActionBar 
          postId={stream.id} 
          className="p-0 mb-2" 
          onComment={() => setShowComments(true)}
          likeCount={stream.likeCount}
          commentCount={stream.commentCount}
        />
        <p className="font-semibold text-white text-sm">{stream.viewers} watching</p>
        <h3 className="text-white text-sm mt-1">{stream.title}</h3>
        <p className="text-zinc-500 text-xs mt-1">{stream.game}</p>
      </div>

      {/* Comments - Always use Drawer for consistent liquid glass style */}
      <Drawer open={showComments} onOpenChange={setShowComments}>
        <DrawerContent glass hideHandle className="max-h-[70vh] flex flex-col overflow-hidden">
          <div className="flex-1 min-h-0 px-4 pb-4 pt-2">
            <CommentsSection
              tokenId={stream.id}
              onClose={() => setShowComments(false)}
            />
          </div>
        </DrawerContent>
      </Drawer>

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
