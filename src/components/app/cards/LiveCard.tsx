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

import { useState, useCallback, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { cdnImage } from '@/lib/media-url';
import { Sparkles, MoreVertical, Flag, Ban, EyeOff, Bell, Bookmark, Info } from 'lucide-react';
import { useTranslation as useI18n } from 'react-i18next';
import { cn } from '@/lib/utils';
import { CardHeader } from './CardHeader';
import { ActionBar } from './ActionBar';
const LivePostChat = lazy(() =>
  import('./LivePostChat').then((m) => ({ default: m.LivePostChat })),
);
import { LiveEndedMedia } from './LiveEndedMedia';
// Lazy: only an on-air stream renders it, so the HLS glue stays off the boot path.
const LiveFeedPreview = lazy(() => import('./LiveFeedPreview').then(m => ({ default: m.LiveFeedPreview })));

import { GatedMedia } from './GatedMedia';
import { PostAIChatLazy } from './PostAIChatLazy';
import { ReportModal } from '../modals/ReportModal';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useStreamPresence } from '@/hooks/use-stream-presence';
import { useAuth } from '@/contexts/AuthContext';
import { useBookmarkPost } from '@/hooks/use-bookmarks';
import { useBlockAuthor } from '@/hooks/use-block-author';
import type { LiveStream } from '@/types/feed.types';

interface LiveCardProps {
  stream: LiveStream;
}

export function LiveCard({ stream }: LiveCardProps) {
  const [showComments, setShowComments] = useState(false);
  const { t } = useI18n();
  const [showAIChat, setShowAIChat] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const navigate = useNavigate();
  const { openLoginModal, walletAddress } = useAuth();
  // Who is watching right now, from the stream socket — the same figure the
  // post page shows. `stream.viewers` is the post's view total, which read
  // "15 tuned in" on the card while the room said 2.
  const livePresence = useStreamPresence(stream.streamId, !!stream.isLive);
  // Bookmark state for the three-dot menu. The same action is an icon in the
  // ActionBar's left-anchored utility cluster on desktop; both read this one
  // shared query, so they cannot disagree.
  const { isBookmarked, isLoading: isBookmarkLoading, toggleBookmark } = useBookmarkPost(stream.id);
  const { blockAuthor } = useBlockAuthor();
  const handleMuteStreamer = useCallback(() => {
    if (!walletAddress) { openLoginModal(); return; }
    if (!stream.creatorId) return;
    blockAuthor(stream.creatorId, stream.streamer || undefined);
  }, [walletAddress, openLoginModal, stream.creatorId, stream.streamer, blockAuthor]);
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
          badgeBalance={stream.creatorBadgeBalance}
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
              {/* Bookmark / Post info. Also on the action bar as icons on desktop —
                  the menu carries them at every width so there is one
                  reliable place to look. */}
              <DropdownMenuItem
                onClick={() => toggleBookmark()}
                disabled={isBookmarkLoading}
                className={cn(
                  "hover:bg-zinc-700 cursor-pointer gap-2",
                  isBookmarked ? "text-yellow-500" : "text-white"
                )}
              >
                <Bookmark className={cn("w-4 h-4", isBookmarked && "fill-current")} />
                {isBookmarked ? t("postOptions.removeBookmark", "Remove bookmark") : t("postOptions.bookmark", "Bookmark")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={openPostInfoPage}
                className="text-white hover:bg-zinc-700 cursor-pointer gap-2"
              >
                <Info className="w-4 h-4" /> {t("postInfo.title", "Post info")}
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
              <DropdownMenuItem onClick={handleMuteStreamer} className="text-white hover:bg-zinc-700 cursor-pointer gap-2">
                <Ban className="w-4 h-4" /> {t('postOptions.blockCreator')}
              </DropdownMenuItem>
              <DropdownMenuItem className="text-white hover:bg-zinc-700 cursor-pointer gap-2">
                <EyeOff className="w-4 h-4" /> {t('postOptions.seeLessLikeThis')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Thumbnail. Gated exactly like a video post's poster frame: a stream
          sold per view, held behind a token or marked mature stands behind the
          same sheet here, so the paywall is met before the click-through
          rather than after it. */}
      <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
        <GatedMedia
          gate={{
            tokenId: stream.tokenId || stream.id,
            creatorAddress: stream.creatorId,
            creatorName: stream.streamer,
            isPPV: stream.isPPV,
            ppvPrice: stream.ppvPrice,
            ppvCurrency: stream.ppvCurrency,
            ppvChainId: stream.ppvChainId,
            isLocked: stream.isLocked,
            lockedPrice: stream.lockedPrice,
            lockedCurrency: stream.lockedCurrency,
            lockedTokenAddress: stream.lockedTokenAddress,
            lockedChainId: stream.lockedChainId,
            subscriberPlans: stream.subscriberPlans,
            contentRating: stream.contentRating,
            canBypass: stream.isOwner || stream.isUnlocked,
          }}
          preview={stream.thumbnail ? cdnImage(stream.thumbnail, { width: 720 }) : undefined}
          className="rounded-lg"
        >
        {stream.isLive && (stream.playbackUrl || stream.playbackUrls?.length) ? (
          /* On air: the carousel card plays the stream, not a still of it. */
          <Suspense fallback={<div className="absolute inset-0 bg-black" />}>
            <LiveFeedPreview
              urls={[stream.playbackUrl, ...(stream.playbackUrls || [])]}
              thumbnail={stream.thumbnail ? cdnImage(stream.thumbnail, { width: 720 }) : undefined}
              fallbackLabel={t('feed.live')}
            />
          </Suspense>
        ) : stream.isLive && stream.thumbnail ? (
          <img
            /* Live thumbnails come straight off the API as raw CDN paths, so
               they never passed through the media-url builders. 720 covers the
               aspect-video card at 2x. */
            src={cdnImage(stream.thumbnail, { width: 720 })}
            alt=""
            className="w-full h-full object-cover rounded-lg"
            loading="lazy"
            decoding="async"
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
        </GatedMedia>
      </div>

      {/* Info & Actions */}
      <div className="pt-3">
        <ActionBar
          postId={stream.id}
          tokenId={parseInt(stream.id, 10) || undefined}
          utilityDesktopAnchor
          className="p-0 mb-2"
          onComment={() => setShowComments(prev => !prev)}
          isLiked={stream.isLiked}
          isDisliked={stream.isDisliked}
          myReaction={stream.myReaction}
          reactionCounts={stream.reactionCounts}
          likeCount={stream.likeCount}
          dislikeCount={stream.dislikeCount}
          commentCount={stream.commentCount}
        />
        <p className="font-semibold text-white text-sm">{livePresence != null ? String(livePresence) : stream.viewers} tuned in</p>
        <h3 className="text-white text-sm mt-1">{stream.title}</h3>
        <p className="text-zinc-500 text-xs mt-1">{stream.game}</p>
      </div>

      {/* The stream's chat — the same room the post page and the app join.
          A live post keeps one conversation; the comment button opens it. */}
      {showComments && (
        <div className="mt-3" data-no-navigate onClick={(e) => e.stopPropagation()}>
          <Suspense fallback={null}>
            <LivePostChat tokenId={stream.id} streamId={stream.streamId} isOffline={!stream.isLive} />
          </Suspense>
        </div>
      )}

      {/* AI Chat */}
      <PostAIChatLazy
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
