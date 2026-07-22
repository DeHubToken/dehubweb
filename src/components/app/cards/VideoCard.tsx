/**
 * Video Card Component
 * ====================
 * Displays video content with thumbnail, duration, and universal styling.
 * 
 * @example
 * ```tsx
 * <VideoCard video={videoData} />
 * ```
 */

import { useState, useRef, useCallback, memo, useEffect, useId } from 'react';
import { cn } from '@/lib/utils';
import { useAutoOpenComments } from '@/hooks/use-auto-open-comments';
import { useNavigate } from 'react-router-dom';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useQueryClient } from '@tanstack/react-query';
import { Eye, MoreVertical, ListPlus, Clock, Flag, Download, Ban, Sparkles, Play, Pause, Volume2, VolumeX, Maximize, Minimize, FastForward, Rewind, PictureInPicture2, Lock, Gift, Ticket, MessageCircle, Link2, MessageSquare, Info, Trash2, Gem, Repeat, Music, X, Bookmark, Pin, Pencil } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import dehubCoin from '@/assets/dehub-coin.png';
import ppvTicketIcon from '@/assets/ppv-ticket-icon.png';

import dehubCoinSmall from '@/assets/dehub-coin.png';
import { motion, AnimatePresence } from 'framer-motion';
import { CardHeader } from './CardHeader';
import { ActionBar } from './ActionBar';
import { PollCard } from './PollCard';
import { PostMetadata } from './PostMetadata';
import { PPVDrawerContent } from './PPVDrawerContent';
import { LiquidGlassBubble } from '@/components/ui/liquid-glass-bubble';
import { VerifyUnlockButton } from './VerifyUnlockButton';
import { TranslatableText, SharedTranslationProvider, useTranslation } from '../TranslatableText';
import { hasCommunityLink, stripCommunityLinks } from '@/components/app/communities/CommunityLinkEmbed';
import { useTranslation as useI18n } from 'react-i18next';
import { PostAIChat } from './PostAIChat';
import { ReportModal } from '../modals/ReportModal';
import { DeletePostModal } from '../modals/DeletePostModal';
import { EditPostModal } from '../modals/EditPostModal';
import { applyOptimisticEdit } from '@/lib/optimistic-edit';
import { QuotePostModal } from '../modals/QuotePostModal';
import { TipModal } from '../modals/TipModal';
import { CommentsWrapper } from './CommentsWrapper';
import { LiveEndedMedia } from './LiveEndedMedia';
import { useIsTouchDevice } from '@/hooks/use-touch-device';
import { useVideoViewTracking } from '@/hooks/use-view-tracking';
import { usePostTipCount } from '@/hooks/use-post-tip-count';
import { videoPlaybackManager } from '@/lib/video-playback-manager';
import { getVideoPreferences, setPlaybackRate as vpSetPlaybackRate, setIsLooping as vpSetIsLooping, setVolume as vpSetVolume, PLAYBACK_RATES, formatRate } from '@/lib/video-preferences';
import { useAuth } from '@/contexts/AuthContext';
import { useAutoplay } from '@/contexts/AutoplayContext';
import { useConnectionQuality } from '@/hooks/use-connection-quality';
import { AudioVisualizer } from '../audio';
import { cacheVideoForNavigation } from '@/lib/post-cache';
import { repostPost } from '@/lib/api/dehub';
import { useSyncedAudio } from '@/hooks/use-synced-audio';
import { isTokenUnlocked, markTokenUnlocked } from '@/lib/unlocked-tokens-store';
import { useBookmarkPost } from '@/hooks/use-bookmarks';
import { useTogglePin } from '@/hooks/use-pins';
import { useBlankPoster } from '@/hooks/use-blank-poster';
import { useResolvedThumbnail } from '@/lib/thumbnail-fallback';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  wasDrawerJustDismissed,
} from '@/components/ui/drawer';
import type { VideoItem } from '@/types/feed.types';
import { VideoSubtitleOverlay } from '@/components/app/video/VideoSubtitleOverlay';
import { VideoGlitchLoader } from '@/components/app/video/VideoGlitchLoader';

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

/**
 * Mobile creator info component - shows avatar, display name, handle, and action buttons
 * Includes drawers for PPV, Bounty, and Locked badges
 */
interface MobileCreatorInfoProps {
  channel?: string;
  channelAvatar?: string;
  creatorUsername?: string;
  creatorId?: string;
  tokenId?: string;
  verified?: boolean;
  onAIClick?: () => void;
  onMenuClick?: () => void;
  isPPV?: boolean;
  ppvPrice?: number | string;
  ppvCurrency?: string;
  isW2E?: boolean;
  bountyAmount?: number;
  bountyCurrency?: string;
  bountyViews?: number;
  bountyComments?: number;
  isLocked?: boolean;
  lockedPrice?: number;
  lockedCurrency?: string;
  chainId?: number;
  onUnlocked?: () => void;
}

function MobileCreatorInfo({
  channel,
  channelAvatar,
  creatorUsername,
  creatorId,
  tokenId,
  verified = false,
  onAIClick,
  onMenuClick,
  isPPV,
  ppvPrice,
  ppvCurrency,
  isW2E,
  bountyAmount,
  bountyCurrency,
  bountyViews,
  bountyComments,
  isLocked,
  lockedPrice,
  lockedCurrency,
  chainId,
  onUnlocked,
}: MobileCreatorInfoProps) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [showBountyDrawer, setShowBountyDrawer] = useState(false);
  const [showPPVDrawer, setShowPPVDrawer] = useState(false);
  const [showLockedDrawer, setShowLockedDrawer] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

  // Format numbers with abbreviations (1K, 1M, etc.) - matches thumbnail format
  const formatCompact = (num: number | null | undefined): string => {
    const n = Number(num);
    if (!Number.isFinite(n) || n <= 0) return '0';
    if (n >= 1000000) return `${Math.floor(n / 1000000)}M`;
    if (n >= 1000) return `${Math.floor(n / 1000)}K`;
    return String(Math.floor(n));
  };

  // Calculate total bounty pool
  const totalBountyPool = bountyAmount && (bountyViews || bountyComments)
    ? bountyAmount * ((bountyViews || 0) + (bountyComments || 0))
    : 0;

  const handleProfileClick = () => {
    if (creatorUsername) {
      const cleanUsername = creatorUsername.replace('@', '');
      navigate(`/${cleanUsername}`);
    } else if (creatorId) {
      navigate(`/app/profile?id=${creatorId}`);
    }
  };

  const isClickable = !!(creatorId || creatorUsername);
  const hasBadges = isPPV || isW2E || isLocked;

  if (!channel) return null;

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={handleProfileClick}
          disabled={!isClickable}
          className={`flex items-center gap-2 ${isClickable ? 'cursor-pointer hover:opacity-80 transition-opacity' : 'cursor-default'}`}
        >
          {channelAvatar && channelAvatar.startsWith('http') && !avatarError ? (
            <img 
              src={channelAvatar} 
              alt={channel}
              className="w-9 h-9 rounded-md object-cover shrink-0"
              onError={() => setAvatarError(true)}
            />
          ) : (
            <div className="w-9 h-9 rounded-md bg-zinc-700 flex items-center justify-center shrink-0 text-white text-sm font-semibold">
              {(channel || '?').charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex flex-col items-start min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-white text-sm leading-tight truncate">{channel}</span>
              {verified && (
                <svg className="w-3.5 h-3.5 text-white shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                </svg>
              )}
            </div>
            {creatorUsername && (
              <span className="text-zinc-400 text-xs truncate">@{creatorUsername.replace('@', '')}</span>
            )}
          </div>
        </button>
        
        {/* Action buttons and badges */}
        <div className="flex items-center gap-0.5">
          {/* Content Type Badges - PPV/Bounty/Locked */}
          {hasBadges && (
            <div className="flex items-center gap-1">
              {/* PPV Badge - icon only on mobile */}
              {isPPV && ppvPrice && (
                <button 
                  className="flex items-center justify-center bg-black/40 backdrop-blur-[24px] saturate-[180%] w-7 h-7 rounded-lg border border-white/10 hover:bg-black/60 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowPPVDrawer(true);
                  }}
                >
                  <Ticket className="w-4 h-4 text-white" />
                </button>
              )}
              
              {/* Bounty Badge - keep text for bounty */}
              {isW2E && (
                <button 
                  className="flex items-center gap-1 bg-black/40 backdrop-blur-[24px] saturate-[180%] px-2 py-1 rounded-lg border border-white/10 hover:bg-black/60 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowBountyDrawer(true);
                  }}
                >
                  <Gift className="w-3 h-3 text-white" />
                  <span className="text-white text-xs font-medium">
                    {bountyAmount && bountyAmount > 0 
                      ? `${formatCompact(bountyAmount)} ${bountyCurrency || 'DHB'}` 
                      : 'Bounty'}
                  </span>
                </button>
              )}
              
              {/* Locked Badge - icon only on mobile */}
              {isLocked && (
                <button 
                  className="flex items-center justify-center bg-black/40 backdrop-blur-[24px] saturate-[180%] w-7 h-7 rounded-lg border border-white/10 hover:bg-black/60 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowLockedDrawer(true);
                  }}
                >
                  <Lock className="w-4 h-4 text-white" />
                </button>
              )}
            </div>
          )}
          
          <div className="flex items-start gap-0.5">
            <button
              onClick={onAIClick}
              className="w-8 h-[37.5px] flex items-start justify-center pt-[6.25px] text-zinc-400 hover:text-white transition-colors"
              aria-label="Ask AI about this video"
            >
              <Sparkles className="w-[23.5px] h-[23.5px]" />
            </button>
            <button aria-label="Post options" 
              onClick={onMenuClick}
              className="w-8 h-[37.5px] flex items-start justify-center pt-[6.25px] text-zinc-400 hover:text-white transition-colors"
            >
              <MoreVertical className="w-[23.5px] h-[23.5px]" />
            </button>
          </div>
        </div>
      </div>

      {/* Bounty Drawer */}
      <Drawer open={showBountyDrawer} onOpenChange={setShowBountyDrawer}>
        <DrawerContent glass className="px-4 pb-6">
          <DrawerHeader className="pb-3 relative">
              <DrawerTitle className="text-white text-lg flex items-center gap-2">
                <Gift className="w-5 h-5 text-white" />
                {t('drawers.bountyTitle')}
              </DrawerTitle>
              <button onClick={() => setShowBountyDrawer(false)} className="absolute top-3 right-0 p-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] transition-colors">
                <X className="w-4 h-4 text-zinc-400" />
              </button>
            </DrawerHeader>
            <div className="flex flex-col gap-4">
              <div className="space-y-3">
              {bountyViews && bountyViews > 0 && (
                  <div className="flex items-center gap-3 px-4 py-3 bg-white/5 rounded-xl border border-white/10">
                    <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center">
                      <Eye className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <p className="text-white text-sm font-medium">{t('drawers.firstViews', { count: bountyViews })}</p>
                      <p className="text-zinc-400 text-xs">{t('drawers.rewardedWatching')}</p>
                    </div>
                  </div>
                )}
                {bountyComments && bountyComments > 0 && (
                  <div className="flex items-center gap-3 px-4 py-3 bg-white/5 rounded-xl border border-white/10">
                    <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center">
                      <MessageCircle className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <p className="text-white text-sm font-medium">{t('drawers.firstComments', { count: bountyComments })}</p>
                      <p className="text-zinc-400 text-xs">{t('drawers.rewardedEngaging')}</p>
                    </div>
                  </div>
                )}
              </div>
              
              {bountyAmount && bountyAmount > 0 && (
                <div className="flex items-center justify-between px-4 py-4 bg-white/5 rounded-xl border border-white/10">
                  <span className="text-white text-sm">{t('drawers.rewardPerUser')}</span>
                  <div className="flex items-center gap-2">
                    <img src={dehubCoinSmall} alt="DHB" className="w-5 h-5" />
                    <span className="text-white text-lg font-bold">{formatCompact(bountyAmount)} {bountyCurrency || 'DHB'}</span>
                  </div>
                </div>
              )}
              
              {totalBountyPool > 0 && (
                <div className="flex items-center justify-between px-4 py-3 bg-white/5 rounded-xl border border-white/10">
                  <span className="text-white text-sm">{t('drawers.totalBountyPool')}</span>
                  <div className="flex items-center gap-2">
                    <img src={dehubCoinSmall} alt="DHB" className="w-4 h-4" />
                    <span className="text-white text-sm font-medium">{formatCompact(totalBountyPool)} {bountyCurrency || 'DHB'}</span>
                  </div>
                </div>
              )}
              
              <p className="text-center text-white/60 text-sm">
                {t('drawers.bountyDescription')}
              </p>
            </div>
          </DrawerContent>
        </Drawer>

      {/* PPV Drawer */}
      <Drawer open={showPPVDrawer} onOpenChange={setShowPPVDrawer}>
        <PPVDrawerContent
          tokenId={tokenId || ''}
          price={Number(ppvPrice)}
          currency={ppvCurrency || 'DHB'}
          creatorAddress={creatorId}
          chainId={chainId}
          onClose={() => setShowPPVDrawer(false)}
          onUnlocked={onUnlocked}
          formatCompact={formatCompact}
        />
      </Drawer>

      {/* Gated Content Drawer */}
      <Drawer open={showLockedDrawer} onOpenChange={setShowLockedDrawer}>
        <DrawerContent glass className="px-4 pb-6">
          <DrawerHeader className="pb-3 relative">
              <DrawerTitle className="text-white text-lg flex items-center gap-2">
                <Lock className="w-5 h-5 text-white" />
                {t('drawers.gatedTitle')}
              </DrawerTitle>
              <button onClick={() => setShowLockedDrawer(false)} className="absolute top-3 right-0 p-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] transition-colors">
                <X className="w-4 h-4 text-zinc-400" />
              </button>
            </DrawerHeader>
            <div className="flex flex-col gap-4">
              {lockedPrice && lockedPrice > 0 && (
                <div className="flex items-center justify-between px-4 py-4 bg-white/5 rounded-xl border border-white/10">
                  <span className="text-white text-sm">{t('drawers.mustHoldToView')}</span>
                  <div className="flex items-center gap-2">
                    <img src={dehubCoinSmall} alt="DHB" className="w-5 h-5" />
                    <span className="text-white text-lg font-bold">{formatCompact(lockedPrice)} {lockedCurrency || 'DHB'}</span>
                  </div>
                </div>
              )}
              <p className="text-center text-white/60 text-sm">
                {t('drawers.gatedDescription')}
              </p>
              {lockedPrice && lockedPrice > 0 && (
                <VerifyUnlockButton
                  requiredAmount={lockedPrice}
                  currency={lockedCurrency || 'DHB'}
                  onUnlocked={() => { setShowLockedDrawer(false); onUnlocked?.(); }}
                />
              )}
            </div>
          </DrawerContent>
        </Drawer>
    </>
  );
}

/**
 * Expandable description component for immersive video view
 * Shows 4 lines with "see more" button, expands to full text on click
 */
interface ExpandableDescriptionProps {
  description: string;
  isImmersive: boolean;
}

function ExpandableDescription({ description: rawDescription, isImmersive }: ExpandableDescriptionProps) {
  // Normalize line breaks: unify \r\n → \n, then cap consecutive blank lines to max 1 (i.e. max 2 newlines)
  // Also strip community URLs — the CommunityLinkEmbed card handles that visually (display-only, never sent to API).
  const normalized = rawDescription.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const description = hasCommunityLink(normalized) ? stripCommunityLinks(normalized) : normalized;
  const [isExpanded, setIsExpanded] = useState(false);
  const [needsExpansion, setNeedsExpansion] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Check overflow via ResizeObserver to avoid forced reflow from direct scrollHeight reads
  useEffect(() => {
    if (!isImmersive || !containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver(() => {
      setNeedsExpansion(el.scrollHeight > el.clientHeight);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [isImmersive, description]);

  if (!isImmersive) {
    // Non-immersive: simple 1-line truncation
    return (
      <TranslatableText 
        text={description} 
        className="text-zinc-400 text-sm mb-2 line-clamp-1"
        as="p" 
      />
    );
  }

  return (
    <div className="mb-2">
      <div 
        ref={containerRef}
        className={isExpanded ? '' : 'line-clamp-4'}
      >
        <TranslatableText 
          text={description} 
          className="text-zinc-400 text-sm"
          as="p" 
        />
      </div>
      {needsExpansion && !isExpanded && (
        <button
          onClick={() => setIsExpanded(true)}
          className="text-zinc-300 text-sm font-medium mt-1 hover:text-white transition-colors"
        >
          See more
        </button>
      )}
      {isExpanded && (
        <button
          onClick={() => setIsExpanded(false)}
          className="text-zinc-300 text-sm font-medium mt-1 hover:text-white transition-colors"
        >
          Show less
        </button>
      )}
    </div>
  );
}

interface VideoCardProps {
  video: VideoItem;
  /** When true, renders full-width without rounded corners or header for immersive view */
  isImmersive?: boolean;
  /** When true, disables intersection-based autoplay (video only plays on explicit click) */
  disableAutoplay?: boolean;
  /** When true, hides the action bar (votes, comments, tips etc.) — useful for carousel thumbnails */
  hideActions?: boolean;
  /** First few feed items — skip lazy loading so LCP thumbnail loads immediately */
  aboveFold?: boolean;
}

export const VideoCard = memo(function VideoCard({ video, isImmersive = false, disableAutoplay = false, hideActions = false, aboveFold = false }: VideoCardProps) {
  const instanceId = useId();
  const { t } = useI18n();
  const [showAIChat, setShowAIChat] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [commentsInitialTab, setCommentsInitialTab] = useState<'replies' | 'quotes' | 'reposts' | 'search' | undefined>(undefined);
  useAutoOpenComments(setShowComments);
  const [showBountyDrawer, setShowBountyDrawer] = useState(false);
  const [showPPVDrawer, setShowPPVDrawer] = useState(false);
  const [showLockedDrawer, setShowLockedDrawer] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showOptionsDrawer, setShowOptionsDrawer] = useState(false);
  const [showTipModal, setShowTipModal] = useState(false);
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const { data: tipCount = 0 } = usePostTipCount(video.id);
  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(false);
  // Tracks the latest IntersectionObserver visibility so an async play() that
  // resolves after the card has scrolled away can bail instead of playing off-screen.
  const isIntersectingRef = useRef(false);
  const isTabletOrMobile = useIsTabletOrMobile();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { walletAddress, openLoginModal } = useAuth();
  const { autoplayEnabled } = useAutoplay();
  // Slow-network / Data-Saver mode: suppress autoplay and video preloading so a
  // metered connection isn't spent fetching 50MB clips the user hasn't asked for.
  const { liteMode } = useConnectionQuality();
  const isOwnPost = walletAddress && video.creatorId?.toLowerCase() === walletAddress.toLowerCase();
  const openPostInfoPage = useCallback(() => {
    setShowOptionsDrawer(false);
    navigate(`/app/post/${video.id}/info`);
  }, [navigate, video.id]);
  // Bookmark/pin state for the mobile/tablet three-dot menu (desktop shows
  // these in the ActionBar's left-anchored utility cluster instead).
  const { isBookmarked, isLoading: isBookmarkLoading, toggleBookmark } = useBookmarkPost(video.id);
  const [isPinned, setIsPinned] = useState(false);
  const togglePinMutation = useTogglePin();
  const videoTokenId = parseInt(video.id, 10) || undefined;
  const [isMuted, setIsMuted] = useState(() => video.isAudio ? false : videoPlaybackManager.globalMuted);
  const [showControls, setShowControls] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(() => getVideoPreferences().volume);
  const [seekIndicator, setSeekIndicator] = useState<'left' | 'right' | null>(null);
  const [showPlayIndicator, setShowPlayIndicator] = useState<'play' | 'pause' | null>(null);
  const [playbackRate, setPlaybackRate] = useState(() => getVideoPreferences().playbackRate);
  const [isLooping, setIsLooping] = useState(() => getVideoPreferences().isLooping);
  const [isFocused, setIsFocused] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastTapRef = useRef<{ time: number; x: number }>({ time: 0, x: 0 });
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const controlsTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isHoveringRef = useRef(false);
  const isTouchDevice = useIsTouchDevice();
  
  // View tracking - fires view after watching threshold
  const { onTimeUpdate: trackView } = useVideoViewTracking(video.id);

  // Shorts thumbnails may live at shorts/{id}.jpg instead of the mapped
  // images/{id}.jpg (folder moved mid-history; the API path lies both ways) —
  // resolve to whichever actually exists so the poster isn't a 403 black box.
  const thumbnail = useResolvedThumbnail(video.thumbnail);

  // Some video thumbnails are auto-captured from a black opening frame, so the
  // poster is a valid-but-blank black JPEG that renders as an empty black box
  // (worst on the immersive post page, where the video often isn't autoplaying).
  // Detect that and swap the flat poster for a neutral play-cover.
  const posterBlank = useBlankPoster(!video.isAudio && video.videoUrl ? thumbnail : undefined);

  // Synced audio overlay — plays a soundtrack over the video
  const { audioRef: syncedAudioRef, hasSoundtrack } = useSyncedAudio({
    soundtrackUrl: video.soundtrackUrl,
    isPlaying,
    isMuted,
    volume,
    videoRef: videoRef as React.RefObject<HTMLVideoElement>,
  });

  // Translation hook for video text content
  const videoText = [video.title, video.description].filter(Boolean).join('\n\n');
  const {
    isTranslated: isVideoTranslated,
    translatedText: videoTranslatedText,
    isLoading: isTranslateLoading,
    error: translateError,
    handleTranslate: handleVideoTranslate,
    handleShowOriginal: handleVideoShowOriginal,
  } = useTranslation(videoText);

  // Repost handler
  const handleRepost = useCallback(async () => {
    if (!walletAddress) { openLoginModal(); return; }
    const numericId = parseInt(video.id, 10);
    if (isNaN(numericId)) return;
    try {
      await repostPost(numericId);
      // Mark caches stale WITHOUT refetching now — refetching the unified feed
      // tears down the infinite-scroll list and snaps the user back to the top.
      queryClient.invalidateQueries({ queryKey: ['unified-feed'], refetchType: 'none' });
      queryClient.invalidateQueries({ queryKey: ['user-reposts'], refetchType: 'none' });
    } catch (err) {
      toast.error('Failed to repost');
      throw err; // let ActionBar roll back its optimistic repost state
    }
  }, [video.id, walletAddress, openLoginModal, queryClient]);

  const handleQuote = useCallback(() => {
    if (!walletAddress) { openLoginModal(); return; }
    setShowQuoteModal(true);
  }, [walletAddress, openLoginModal]);

  const handleDownloadVideo = useCallback(async () => {
    if (!video.videoUrl) return;
    toast.loading('Preparing download...', { id: 'video-download' });
    try {
      const response = await fetch(video.videoUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${video.title || video.id || 'video'}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Download started', { id: 'video-download' });
    } catch {
      toast.error('Download failed', { id: 'video-download' });
    }
  }, [video.videoUrl, video.title, video.id]);

  const videoAsNFT = {
    tokenId: parseInt(video.id, 10) || 0,
    name: video.title || '',
    description: video.description || '',
    imageUrl: thumbnail || '',
    videoUrl: video.videoUrl || '',
    postType: (video.isAudio ? 'feed-audio' : 'video') as any,
    minter: video.creatorId || '',
    minterUsername: video.creatorUsername || '',
    minterDisplayName: video.channel,
    minterAvatarUrl: video.channelAvatar,
    createdAt: video.createdAt || '',
  };

  // Pause callback for the playback manager
  const pauseVideo = useCallback(() => {
    videoRef.current?.pause();
    isPlayingRef.current = false;
    setIsPlaying(false);
  }, []);

  // Keep refs in sync for autoplay-related values
  const autoplayEnabledRef = useRef(autoplayEnabled);
  autoplayEnabledRef.current = autoplayEnabled;
  const liteModeRef = useRef(liteMode);
  liteModeRef.current = liteMode;

  // Video load gate: only videos at/near the viewport are allowed to pull bytes.
  // Off-screen cards render preload="none" (poster only) so the initial feed
  // doesn't fire a metadata range-request at every one of the ~50MB clips down
  // the list. Two-way with hysteresis: warm within 800px, and released again
  // only once the card drifts beyond ~2500px — the gap avoids preload thrash
  // on scroll-back while stopping a long session from accumulating hundreds of
  // media elements holding decoded buffers (the long-scroll tab-kill on 4GB
  // phones). aboveFold (LCP) videos are warm from the start and never release.
  const [nearViewport, setNearViewport] = useState(aboveFold);
  useEffect(() => {
    if (aboveFold) return;
    const el = containerRef.current;
    if (!el) return;
    const enterObs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setNearViewport(true);
      },
      { rootMargin: '800px 0px' },
    );
    const exitObs = new IntersectionObserver(
      ([entry]) => {
        // Never unload mid-playback (the visibility observer pauses at
        // viewport exit anyway, so this only guards races).
        if (!entry.isIntersecting && !isPlayingRef.current) setNearViewport(false);
      },
      { rootMargin: '2500px 0px' },
    );
    enterObs.observe(el);
    exitObs.observe(el);
    return () => {
      enterObs.disconnect();
      exitObs.disconnect();
    };
  }, [aboveFold]);

  // Releasing the src attribute alone doesn't free the decoder/buffer — an
  // explicit load() after React removes it does.
  const mediaAttached = aboveFold || nearViewport;
  useEffect(() => {
    if (mediaAttached) return;
    const vid = videoRef.current;
    if (vid && !vid.getAttribute('src')) {
      try { vid.load(); } catch { /* noop */ }
    }
  }, [mediaAttached]);

  // In Lite mode nothing preloads (tap-to-play still forces a load via play()).
  const videoPreload: 'none' | 'metadata' | 'auto' = liteMode
    ? 'none'
    : aboveFold
      ? 'auto'
      : nearViewport
        ? 'metadata'
        : 'none';
  const hasErrorRef = useRef(hasError);
  hasErrorRef.current = hasError;

  // Register with playback manager and setup IntersectionObserver (stable — no isPlaying dep)
  useEffect(() => {
    videoPlaybackManager.register(instanceId, pauseVideo, (muted: boolean) => {
      // Callback for manager to force mute/unmute this video
      if (videoRef.current) videoRef.current.muted = muted;
      setIsMuted(muted);
    });

    // Auto-pause when scrolled out of view + auto-play when scrolled into view (if enabled)
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          isIntersectingRef.current = entry.isIntersecting;
          if (!entry.isIntersecting && isPlayingRef.current) {
            pauseVideo();
            videoPlaybackManager.stop(instanceId);
          } else if (entry.isIntersecting && autoplayEnabledRef.current && !liteModeRef.current && !disableAutoplay && !isPlayingRef.current && !(video.isPPV || video.isLocked) && !video.isAudio && video.videoUrl && !hasErrorRef.current) {
            const vid = videoRef.current;
            if (vid) {
              // Fast fling race: the media-attach state may not have
              // re-rendered yet — attach the src imperatively before play()
              // (React reconciles to the same value on the next render).
              if (!vid.getAttribute('src') && video.videoUrl) vid.src = video.videoUrl;
              // Ask manager if this video should own audio
              const ownsAudio = videoPlaybackManager.play(instanceId);
              const shouldMute = videoPlaybackManager.globalMuted || !ownsAudio;
              vid.muted = shouldMute;
              setIsMuted(shouldMute);
              setIsLoading(true);
              vid.play().then(() => {
                // Scroll-away race: if the card left the viewport while play() was
                // pending, the pause branch above was skipped (isPlayingRef was
                // still false), so bail here to avoid playing/holding audio off-screen.
                if (!isIntersectingRef.current) {
                  vid.pause();
                  videoPlaybackManager.stop(instanceId);
                  setIsLoading(false);
                  return;
                }
                isPlayingRef.current = true;
                setIsPlaying(true);
                setIsLoading(false);
              }).catch(() => {
                setIsLoading(false);
              });
            }
          } else if (entry.isIntersecting && !isPlayingRef.current && !video.videoUrl && video.soundtrackUrl && !(video.isPPV || video.isLocked)) {
            // Auto-play soundtrack for image posts with attached sound
            isPlayingRef.current = true;
            setIsPlaying(true);
          }
        });
      },
      { threshold: 0.5 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      videoPlaybackManager.unregister(instanceId);
      observer.disconnect();
    };
  }, [instanceId, pauseVideo, video.isPPV, video.isLocked, video.videoUrl]);

  // Show controls briefly after any user interaction, then auto-hide
  const showControlsBriefly = useCallback(() => {
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => {
      if (!isHoveringRef.current) setShowControls(false);
    }, 2000);
  }, []);

  // Cleanup controls timer on unmount
  useEffect(() => {
    return () => {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, []);

  const [locallyUnlocked, setLocallyUnlocked] = useState(false);
  const storedUnlocked = isTokenUnlocked(video.id);
  const canBypassGating = !!(isOwnPost || video.isOwner || video.isUnlocked || locallyUnlocked || storedUnlocked);
  const isPPVLocked = !!video.isPPV && !canBypassGating;
  const isBountyLocked = false; // W2E content is free to watch; bounty rewards first X viewers/commenters
  const isHoldingsLocked = !!video.isLocked && !canBypassGating;
  const isComboLocked = isPPVLocked && isHoldingsLocked;
  const isContentGated = isPPVLocked || isBountyLocked || isHoldingsLocked;


  const handlePlayClick = useCallback(() => {
    // Audio posts use AudioVisualizer which handles its own playback
    if (video.isAudio) {
      if (isContentGated) return;
      const willPlay = !isPlayingRef.current;
      setIsPlaying(willPlay);
      isPlayingRef.current = willPlay;
      setShowPlayIndicator(willPlay ? 'play' : 'pause');
      setTimeout(() => setShowPlayIndicator(null), 500);
      // Record listen on first play
      if (willPlay) {
        import('@/lib/api/dehub/feed').then(m => m.recordListen(video.id)).catch(() => {});
      }
      return;
    }
    
    if (!video.videoUrl || isContentGated) return;

    if (hasError) {
      toast.error('Playback failed. Report sent.');
      return;
    }
    
    if (isPlaying) {
      videoRef.current?.pause();
      isPlayingRef.current = false;
      setIsPlaying(false);
      setShowPlayIndicator('pause');
      setTimeout(() => setShowPlayIndicator(null), 500);
      videoPlaybackManager.stop(instanceId);
      showControlsBriefly();
    } else {
      // Claim audio ownership for this video (user-initiated play)
      videoPlaybackManager.claimAudio(instanceId);
      const shouldMute = videoPlaybackManager.globalMuted;
      setIsMuted(shouldMute);
      if (videoRef.current) {
        videoRef.current.muted = shouldMute;
      }
      
      // Notify manager
      videoPlaybackManager.play(instanceId);
      setIsLoading(true);
      // Attach src imperatively if the media-release gate detached it and the
      // re-render hasn't landed yet (tap can beat the render).
      const vidEl = videoRef.current;
      if (vidEl && !vidEl.getAttribute('src') && video.videoUrl) vidEl.src = video.videoUrl;
      videoRef.current?.play().then(() => {
        isPlayingRef.current = true;
        setIsPlaying(true);
        setIsLoading(false);
        setShowPlayIndicator('play');
        setTimeout(() => setShowPlayIndicator(null), 500);
        showControlsBriefly();
      }).catch(() => {
        setIsLoading(false);
        setHasError(true);
        videoPlaybackManager.stop(instanceId);
      });
    }
  }, [isPlaying, video.videoUrl, video.isAudio, video.id, instanceId, showControlsBriefly, isContentGated]);

  const toggleMute = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    videoPlaybackManager.globalMuted = newMuted;
    if (!newMuted) {
      // User unmuted — claim audio ownership so other videos get muted
      videoPlaybackManager.claimAudio(instanceId);
    }
    if (videoRef.current) {
      videoRef.current.muted = newMuted;
    }
  }, [isMuted, instanceId]);

  const [isFullscreen, setIsFullscreen] = useState(false);

  // Track fullscreen state changes
  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!(document.fullscreenElement || (document as any).webkitFullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);

    // iOS fires these events on the video element itself
    const videoEl = videoRef.current;
    const onIOSFullscreen = () => setIsFullscreen(true);
    const onIOSExitFullscreen = () => setIsFullscreen(false);
    videoEl?.addEventListener('webkitbeginfullscreen', onIOSFullscreen);
    videoEl?.addEventListener('webkitendfullscreen', onIOSExitFullscreen);

    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
      videoEl?.removeEventListener('webkitbeginfullscreen', onIOSFullscreen);
      videoEl?.removeEventListener('webkitendfullscreen', onIOSExitFullscreen);
    };
  }, []);

  const toggleFullscreen = useCallback(() => {
    const videoEl = videoRef.current as any;
    const containerEl = containerRef.current as any;

    // Exit simulated fullscreen if active
    if (isFullscreen && !document.fullscreenElement && !(document as any).webkitFullscreenElement) {
      setIsFullscreen(false);
      return;
    }

    // Check if already in fullscreen (standard or iOS video)
    if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen();
      }
      return;
    }

    // iOS Safari: only supports webkitEnterFullscreen on <video> element
    if (videoEl && typeof videoEl.webkitEnterFullscreen === 'function') {
      try {
        videoEl.webkitEnterFullscreen();
        return;
      } catch {
        // Fall through to container fullscreen or simulated
      }
    }

    // Standard Fullscreen API on container — with fallback if blocked (e.g. SafePal WebView)
    // Also adds a timeout to catch silent failures where the promise resolves but fullscreen never activates
    if (containerEl) {
      const activateSimulated = () => {
        if (!document.fullscreenElement && !(document as any).webkitFullscreenElement) {
          setIsFullscreen(true);
        }
      };
      if (containerEl.requestFullscreen) {
        containerEl.requestFullscreen().catch(activateSimulated);
        setTimeout(activateSimulated, 300);
        return;
      } else if (containerEl.webkitRequestFullscreen) {
        try { containerEl.webkitRequestFullscreen(); } catch { activateSimulated(); }
        setTimeout(activateSimulated, 300);
        return;
      }
    }

    // Fallback: simulated fullscreen (SafePal/WebView or iOS audio posts where no native API works)
    setIsFullscreen(true);
  }, [isFullscreen]);

  const handleFullscreen = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    toggleFullscreen();
  }, [toggleFullscreen]);

  const handlePictureInPicture = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!document.pictureInPictureEnabled) return;
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(() => {});
    } else if (videoRef.current) {
      videoRef.current.requestPictureInPicture().catch(() => {
        toast.error('Picture-in-picture not supported in this browser');
      });
    }
  }, []);

  const adjustVolume = useCallback((delta: number) => {
    if (videoRef.current) {
      const newVolume = Math.max(0, Math.min(1, volume + delta));
      setVolume(newVolume);
      vpSetVolume(newVolume);
      videoRef.current.volume = newVolume;
      if (newVolume > 0 && isMuted) {
        setIsMuted(false);
        videoRef.current.muted = false;
      }
    }
  }, [volume, isMuted]);

  const seekBy = useCallback((seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, Math.min(videoRef.current.currentTime + seconds, videoRef.current.duration || 0));
      setSeekIndicator(seconds > 0 ? 'right' : 'left');
      setTimeout(() => setSeekIndicator(null), 500);
    }
  }, []);

  const handleVideoEnded = useCallback(() => {
    // Ads always loop — never stop
    if ((video.isAd || isLooping) && videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
      return;
    }
    isPlayingRef.current = false;
    setIsPlaying(false);
    videoPlaybackManager.stop(instanceId);
  }, [instanceId, isLooping, video.isAd]);


  const cyclePlaybackRate = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const currentIdx = PLAYBACK_RATES.indexOf(playbackRate as any);
    const nextRate = PLAYBACK_RATES[(currentIdx + 1) % PLAYBACK_RATES.length];
    setPlaybackRate(nextRate);
    vpSetPlaybackRate(nextRate);
    if (videoRef.current) videoRef.current.playbackRate = nextRate;
  }, [playbackRate]);

  const toggleLoop = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsLooping(prev => {
      vpSetIsLooping(!prev);
      return !prev;
    });
  }, []);

  // Listen for preference changes from other players
  useEffect(() => {
    const handler = (e: Event) => {
      const prefs = (e as CustomEvent).detail;
      setPlaybackRate(prefs.playbackRate);
      setIsLooping(prefs.isLooping);
      if (videoRef.current) videoRef.current.playbackRate = prefs.playbackRate;
    };
    window.addEventListener('video-prefs-changed', handler);
    return () => window.removeEventListener('video-prefs-changed', handler);
  }, []);

  const handleVideoError = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
    const videoEl = e.currentTarget;
    console.error('Video error:', video.videoUrl, videoEl.error?.message || 'Unknown error');
    setIsLoading(false);
    setHasError(true);
    setIsPlaying(false);
  }, [video.videoUrl]);

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      const ct = videoRef.current.currentTime;
      const dur = videoRef.current.duration;
      setCurrentTime(ct);
      
      // Track video view progress (fires view when threshold met)
      if (dur > 0) {
        trackView(ct, dur);
      }
    }
  }, [trackView]);

  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  }, []);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  const handleDoubleTapSeek = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const clientX = 'touches' in e ? e.changedTouches[0].clientX : e.clientX;
    const x = clientX - rect.left;
    const relativeX = x / rect.width; // 0 to 1
    
    // Center zone (37.5% - 62.5%) - fullscreen only, no seek
    if (relativeX >= 0.375 && relativeX <= 0.625) {
      toggleFullscreen();
      return;
    }
    
    // Only seek if video is playing
    if (videoRef.current && isPlaying) {
      if (relativeX > 0.625) {
        // Right 37.5% - fast forward
        videoRef.current.currentTime = Math.min(videoRef.current.currentTime + 10, videoRef.current.duration);
        setSeekIndicator('right');
      } else {
        // Left 37.5% - rewind
        videoRef.current.currentTime = Math.max(videoRef.current.currentTime - 10, 0);
        setSeekIndicator('left');
      }
      setTimeout(() => setSeekIndicator(null), 500);
    }
  }, [isPlaying, toggleFullscreen]);

  const handleVideoAreaClick = useCallback((e: React.MouseEvent) => {
    const now = Date.now();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    
    // Clear any pending single-click timeout
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }
    
    // Check for double-click (within 300ms and similar x position)
    if (now - lastTapRef.current.time < 300 && Math.abs(x - lastTapRef.current.x) < 50) {
      // Double-click detected - seek without pausing
      handleDoubleTapSeek(e);
      lastTapRef.current = { time: 0, x: 0 }; // Reset to prevent triple-tap
    } else {
      lastTapRef.current = { time: now, x };
      // Delay single click action to distinguish from double-click
      clickTimeoutRef.current = setTimeout(() => {
        handlePlayClick();
        clickTimeoutRef.current = null;
      }, 300);
    }
  }, [handleDoubleTapSeek, handlePlayClick]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const touch = e.changedTouches[0];
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    const relativeX = x / rect.width; // 0 to 1
    const relativeY = y / rect.height; // 0 to 1
    
    // Ignore touches in top-right corner (where controls are) - top 20% and right 40%
    if (relativeY < 0.20 && relativeX > 0.60) {
      return; // Let the button handle the touch natively
    }
    
    // Also ignore bottom area where progress bar is - bottom 20%
    if (relativeY > 0.80) {
      return; // Let the progress bar handle the touch natively
    }
    
    // Only prevent default after we've confirmed this isn't a button/control touch
    e.preventDefault();
    
    // Center zone (37.5% - 62.5%) for play/pause
    if (relativeX >= 0.375 && relativeX <= 0.625) {
      handlePlayClick();
      return;
    }
    
    // Left/right zones for seeking (only when playing)
    if (videoRef.current && isPlaying) {
      if (relativeX > 0.625) {
        // Right 37.5% - fast forward
        videoRef.current.currentTime = Math.min(videoRef.current.currentTime + 10, videoRef.current.duration);
        setSeekIndicator('right');
      } else {
        // Left 37.5% - rewind
        videoRef.current.currentTime = Math.max(videoRef.current.currentTime - 10, 0);
        setSeekIndicator('left');
      }
      setTimeout(() => setSeekIndicator(null), 500);
    }
  }, [isPlaying, handlePlayClick]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Format numbers with abbreviations (1K, 1M, etc.) - no decimals
  const formatCompact = (num: number | null | undefined): string => {
    const n = Number(num);
    if (!Number.isFinite(n) || n <= 0) return '0';
    if (n >= 1000000) return `${Math.floor(n / 1000000)}M`;
    if (n >= 1000) return `${Math.floor(n / 1000)}K`;
    return String(Math.floor(n));
  };

  // Keyboard shortcuts
  useEffect(() => {
    if (!isFocused || !isPlaying) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;
      switch (e.key) {
        case ' ':
          e.preventDefault();
          handlePlayClick();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          seekBy(-5);
          break;
        case 'ArrowRight':
          e.preventDefault();
          seekBy(5);
          break;
        case 'ArrowUp':
          e.preventDefault();
          adjustVolume(0.1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          adjustVolume(-0.1);
          break;
        case 'm':
          e.preventDefault();
          setIsMuted(prev => {
            const newMuted = !prev;
            videoPlaybackManager.globalMuted = newMuted;
            if (!newMuted) videoPlaybackManager.claimAudio(instanceId);
            if (videoRef.current) videoRef.current.muted = newMuted;
            return newMuted;
          });
          break;
        case 'p':
          e.preventDefault();
          if (document.pictureInPictureEnabled && videoRef.current) {
            if (document.pictureInPictureElement) {
              document.exitPictureInPicture().catch(() => {});
            } else {
              videoRef.current.requestPictureInPicture().catch(() => {});
            }
          }
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFocused, isPlaying, handlePlayClick, seekBy, adjustVolume]);
  // Navigate to single post page when clicking non-interactive areas (header only)
  // Pre-cache video data for instant display on the single post page
  const handleCardClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const isInteractive = target.closest('button, a, input, textarea, [role="button"], [data-no-navigate]');
    if (isInteractive) return;
    // Allow text selection without navigating
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) return;
    // Guard: don't navigate if any drawer is open, or was just dismissed by a
    // scrim tap (whose ghost click would otherwise open the post).
    if (wasDrawerJustDismissed()) return;
    if (showBountyDrawer || showPPVDrawer || showLockedDrawer) return;
    
    // Cache the video data before navigation for instant display
    cacheVideoForNavigation(queryClient, video);
    navigate(`/app/post/${video.id}`, { state: { fromFeed: true } });
  }, [navigate, video.id, queryClient, video, showBountyDrawer, showPPVDrawer, showLockedDrawer]);
  
  return (
    <div 
      data-video-card
      onClick={isImmersive ? undefined : handleCardClick}
      className={isImmersive
        ? "bg-black lg:bg-transparent overflow-hidden isolate"
        : "overflow-visible cursor-pointer isolate"
      }
    >
      {/* Header with AI and menu buttons - hidden in immersive mode and carousel (hideActions) mode */}
      {!isImmersive && !hideActions && (
        <div className="flex items-start justify-between">
          <CardHeader
            username={video.channel}
            handle={video.creatorUsername}
            avatarSeed={video.channelAvatar}
            verified={video.verified}
            contentType="video"
            creatorId={video.creatorId}
            creatorUsername={video.creatorUsername}
            badgeBalance={video.creatorBadgeBalance}
          />
          <div className="flex items-center gap-1">
            <motion.button
              onClick={() => { if (!walletAddress) { openLoginModal(); return; } setShowAIChat(true); }}
              className="text-zinc-400 hover:text-white transition-colors"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              aria-label="Ask AI about this video"
            >
              <Sparkles className="w-[23.5px] h-[23.5px]" />
            </motion.button>
            <Drawer open={showOptionsDrawer} onOpenChange={setShowOptionsDrawer}>
              <DrawerTrigger asChild>
              <button onClick={(e) => { if (!walletAddress) { e.preventDefault(); openLoginModal(); return; } setShowOptionsDrawer(true); }} className="text-zinc-400 hover:text-white transition-colors -mr-0.5">
                <MoreVertical className="w-[23.5px] h-[23.5px]" />
                </button>
              </DrawerTrigger>
              <DrawerContent glass className="px-4 pb-6">
                <DrawerHeader className="pb-2">
                  <DrawerTitle className="text-white text-lg">{t('postOptions.options')}</DrawerTitle>
                </DrawerHeader>
                <div className="flex flex-col gap-1">
                  {/* Bookmark / Post info — mobile/tablet only; desktop shows these
                      anchored left in the bottom action bar instead. */}
                  <button
                    onClick={() => { toggleBookmark(); }}
                    disabled={isBookmarkLoading}
                    className={cn(
                      "lg:hidden flex items-center gap-3 px-4 py-3 hover:bg-white/10 rounded-xl transition-colors text-left disabled:opacity-50",
                      isBookmarked ? "text-yellow-500" : "text-white"
                    )}
                  >
                    <Bookmark className={cn("w-5 h-5", isBookmarked && "fill-current")} />
                    {isBookmarked ? 'Remove bookmark' : 'Bookmark'}
                  </button>
                  <button
                    onClick={openPostInfoPage}
                    className="lg:hidden flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left"
                  >
                    <Info className="w-5 h-5" /> Post info
                  </button>
                  {!isOwnPost && (
                    <button
                      onClick={() => { setShowOptionsDrawer(false); setShowTipModal(true); }}
                      className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left"
                    >
                       <Gem className="w-5 h-5" /> {t('postOptions.sendTip')}
                    </button>
                  )}
                  <button className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left">
                    <ListPlus className="w-5 h-5" /> {t('postOptions.queue')}
                  </button>
                  <button className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left">
                    <Clock className="w-5 h-5" /> {t('postOptions.watchList')}
                  </button>
                  <button
                    onClick={() => setShowReportModal(true)}
                    className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left"
                  >
                    <Flag className="w-5 h-5" /> {t('postOptions.report')}
                  </button>
                  {!isContentGated && !(video.isLocked && !canBypassGating) && (
                    <button onClick={handleDownloadVideo} className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left">
                      <Download className="w-5 h-5" /> {t('postOptions.download')}
                    </button>
                  )}
                  <button 
                    onClick={() => {
                      const url = `${window.location.origin}/app/post/${video.id}`;
                      navigator.clipboard.writeText(url);
                      toast.success(t('postOptions.postUrlCopied'));
                    }}
                    className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left"
                  >
                    <Link2 className="w-5 h-5" /> {t('postOptions.copyPostUrl')}
                  </button>
                  <button className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left">
                    <Ban className="w-5 h-5" /> {t('postOptions.blockCreator')}
                  </button>
                  {isOwnPost && (
                    <>
                      <div className="border-t border-white/10 my-1" />
                      <button
                        onClick={() => { setShowOptionsDrawer(false); setTimeout(() => setShowEditModal(true), 300); }}
                        className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left"
                      >
                        <Pencil className="w-5 h-5" /> {t('postOptions.editPost')}
                      </button>
                      <button
                        onClick={() => {
                          if (!videoTokenId || togglePinMutation.isPending) return;
                          togglePinMutation.mutate(videoTokenId, {
                            onSuccess: (data) => setIsPinned(data.pinned),
                          });
                        }}
                        disabled={!videoTokenId || togglePinMutation.isPending}
                        className={cn(
                          "lg:hidden flex items-center gap-3 px-4 py-3 hover:bg-white/10 rounded-xl transition-colors text-left disabled:opacity-40",
                          isPinned ? "text-blue-400" : "text-white"
                        )}
                      >
                        <Pin className={cn("w-5 h-5", isPinned && "fill-current")} />
                        {isPinned ? 'Unpin post' : 'Pin post'}
                      </button>
                      <button
                        onClick={() => { setShowOptionsDrawer(false); setTimeout(() => setShowDeleteModal(true), 300); }}
                        className="flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-white/10 rounded-xl transition-colors text-left"
                      >
                        <Trash2 className="w-5 h-5" /> {t('postOptions.deletePost')}
                      </button>
                    </>
                  )}
                </div>
              </DrawerContent>
            </Drawer>
          </div>
        </div>
      )}

      {/* Video Player / Thumbnail */}
      <div 
        ref={containerRef}
        tabIndex={0}
        data-no-navigate
        data-media-full
        className={`relative bg-black cursor-pointer group/thumb outline-none overflow-hidden transition-all duration-300 ${isImmersive ? 'rounded-none' : 'rounded-2xl'} ${isFullscreen ? 'fixed inset-0 z-[9999] w-screen h-screen rounded-none flex items-center justify-center' : (isImmersive && showComments ? 'aspect-[2/1]' : 'aspect-video')}`}
        onClick={isTouchDevice ? undefined : (video.isAudio ? undefined : handleVideoAreaClick)}
        onTouchEnd={isTouchDevice ? (video.isAudio ? undefined : handleTouchEnd) : undefined}
        onMouseEnter={() => {
          isHoveringRef.current = true;
          setShowControls(true);
          if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
          controlsTimerRef.current = setTimeout(() => setShowControls(false), 2000);
        }}
        onMouseMove={() => {
          if (!isHoveringRef.current) return;
          setShowControls(true);
          if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
          controlsTimerRef.current = setTimeout(() => setShowControls(false), 2000);
        }}
        onMouseLeave={() => {
          isHoveringRef.current = false;
          if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
          setShowControls(false);
        }}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
      >
        {/* Combo PPV + Holdings Locked */}
        {isComboLocked ? (
          <>
            <img src={thumbnail} alt={video.title} className="w-full h-full object-cover rounded-lg" loading="lazy" />
            <div 
              className="absolute inset-0 flex flex-col items-center justify-center bg-black/30 cursor-pointer"
              onClick={(e) => { e.stopPropagation(); setShowPPVDrawer(true); }}
              onTouchStart={(e) => { (e.currentTarget as any)._touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
              onTouchEnd={(e) => {
                e.stopPropagation();
                const start = (e.currentTarget as any)._touchStart;
                if (!start) return;
                const touch = e.changedTouches[0];
                if (Math.abs(touch.clientX - start.x) < 10 && Math.abs(touch.clientY - start.y) < 10) { e.preventDefault(); setShowPPVDrawer(true); }
              }}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-14 h-14 rounded-2xl bg-black/40 backdrop-blur-[24px] saturate-[180%] flex items-center justify-center border border-white/10">
                  <Ticket className="h-6 w-6 text-white" />
                </div>
                <div className="w-14 h-14 rounded-2xl bg-black/40 backdrop-blur-[24px] saturate-[180%] flex items-center justify-center border border-white/10">
                  <Lock className="h-6 w-6 text-white" />
                </div>
              </div>
              <p className="text-white font-semibold text-sm mb-1">
                {t('drawers.unlockFor')} {formatCompact(Number(video.ppvPrice))} {video.ppvCurrency || 'DHB'}
              </p>
              <p className="text-white/70 text-xs">
                Must be holding {formatCompact(Number(video.lockedPrice))} {video.lockedCurrency || 'DHB'}
              </p>
            </div>
          </>
        ) : isPPVLocked ? (
          <>
            <img src={thumbnail} alt={video.title} className="w-full h-full object-cover" loading="lazy" />
            <div 
              className="absolute inset-0 flex flex-col items-center justify-center bg-black/30 cursor-pointer"
              onClick={(e) => { e.stopPropagation(); setShowPPVDrawer(true); }}
              onTouchStart={(e) => { (e.currentTarget as any)._touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
              onTouchEnd={(e) => {
                e.stopPropagation();
                const start = (e.currentTarget as any)._touchStart;
                if (!start) return;
                const touch = e.changedTouches[0];
                if (Math.abs(touch.clientX - start.x) < 10 && Math.abs(touch.clientY - start.y) < 10) { e.preventDefault(); setShowPPVDrawer(true); }
              }}
            >
              <div className="w-16 h-16 rounded-2xl bg-black/40 backdrop-blur-[24px] saturate-[180%] flex items-center justify-center border border-white/10 mb-3">
                <Ticket className="h-7 w-7 text-white" />
              </div>
              <p className="text-white font-semibold text-sm mb-1">{t('drawers.ppvTitle')}</p>
              <p className="text-white/70 text-xs">
                {t('drawers.unlockFor')} {formatCompact(Number(video.ppvPrice))} {video.ppvCurrency || 'USDC'}
              </p>
              
            </div>
          </>
        ) : isHoldingsLocked ? (
          <>
            <img src={thumbnail} alt={video.title} className="w-full h-full object-cover" loading="lazy" />
            <div 
              className="absolute inset-0 flex flex-col items-center justify-center bg-black/30 cursor-pointer"
              onClick={(e) => { e.stopPropagation(); setShowLockedDrawer(true); }}
              onTouchStart={(e) => { (e.currentTarget as any)._touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
              onTouchEnd={(e) => {
                e.stopPropagation();
                const start = (e.currentTarget as any)._touchStart;
                if (!start) return;
                const touch = e.changedTouches[0];
                if (Math.abs(touch.clientX - start.x) < 10 && Math.abs(touch.clientY - start.y) < 10) { e.preventDefault(); setShowLockedDrawer(true); }
              }}
            >
              <div className="w-16 h-16 rounded-2xl bg-black/40 backdrop-blur-[24px] saturate-[180%] flex items-center justify-center border border-white/10 mb-3">
                <Lock className="h-7 w-7 text-white" />
              </div>
              <p className="text-white font-semibold text-sm mb-1">Holdings Required</p>
              <p className="text-white/70 text-xs">
                Must be holding {formatCompact(Number(video.lockedPrice))} {video.lockedCurrency || 'DHB'}
              </p>
            </div>
          </>
        ) : isBountyLocked ? (
          <>
            <img src={thumbnail} alt={video.title} className="w-full h-full object-cover" loading="lazy" />
            <div 
              className="absolute inset-0 flex flex-col items-center justify-center bg-black/30 cursor-pointer"
              onClick={(e) => { e.stopPropagation(); setShowBountyDrawer(true); }}
              onTouchStart={(e) => { (e.currentTarget as any)._touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
              onTouchEnd={(e) => {
                e.stopPropagation();
                const start = (e.currentTarget as any)._touchStart;
                if (!start) return;
                const touch = e.changedTouches[0];
                if (Math.abs(touch.clientX - start.x) < 10 && Math.abs(touch.clientY - start.y) < 10) { e.preventDefault(); setShowBountyDrawer(true); }
              }}
            >
              <div className="w-16 h-16 rounded-2xl bg-black/40 backdrop-blur-[24px] saturate-[180%] flex items-center justify-center border border-white/10 mb-3">
                <Gift className="h-7 w-7 text-white" />
              </div>
              <p className="text-white font-semibold text-sm mb-1">{t('drawers.bountyTitle')}</p>
              <p className="text-white/70 text-xs">
                {video.bountyAmount && video.bountyAmount > 0 
                  ? `${formatCompact(video.bountyAmount)} ${video.bountyCurrency || 'DHB'}`
                  : t('drawers.bountyDescription')}
              </p>
            </div>
          </>
        ) : (
          <>
            {video.isAudio && video.audioUrl ? (
              /* Audio post: liquid glass container with static waveform backdrop */
              <div className="relative w-full h-full bg-black/60 backdrop-blur-[24px] border border-white/10 overflow-hidden">
                {/* Live AudioVisualizer */}
                <div className="absolute inset-0">
                  <AudioVisualizer
                    audioUrl={video.audioUrl}
                    isPlaying={isPlaying}
                    onPlayPause={handlePlayClick}
                    className="w-full h-full"
                    showStylePicker={true}
                    muted={isMuted}
                    seed={video.id}
                    decodeEnabled={nearViewport}
                  />
                </div>
              </div>
            ) : video.videoUrl ? (
              hasError ? (
                <img src={thumbnail} alt={video.title} className="w-full h-full object-cover" loading={aboveFold ? 'eager' : 'lazy'} fetchPriority={aboveFold ? 'high' : 'auto'} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
              ) :
              <video
                ref={videoRef}
                src={mediaAttached ? video.videoUrl : undefined}
                poster={thumbnail || undefined}
                muted={isMuted}
                playsInline
                loop={video.isAd || isLooping}

                {...{"webkit-playsinline": ""}}
                preload={videoPreload}
                onEnded={handleVideoEnded}
                onError={handleVideoError}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                className={`w-full h-full ${isFullscreen ? 'object-contain' : 'object-cover'}`}
              />
            ) : (
              /* No playable URL — a past live (or url-less video). Show the
                 cover image if there is one, otherwise a staticy TV screen.
                 Never an empty black box. */
              <LiveEndedMedia
                thumbnail={thumbnail}
                label={video.isLivePost ? 'Live ended' : 'Unavailable'}
              />
            )}
           </>
        )}

        {/* Blank/black poster fallback — a neutral play-cover so a video whose
            thumbnail is a flat black frame never reads as an empty black box.
            Sits above the video but below the controls (z-10); pointer-events
            stay off so the container's click/tap still triggers play. Hidden
            once the clip is playing or actively loading. */}
        {posterBlank && video.videoUrl && !isContentGated && !isPlaying && !isLoading && (
          <div
            className="absolute inset-0 z-[5] flex items-center justify-center bg-gradient-to-b from-zinc-800 to-black pointer-events-none"
            aria-hidden="true"
          >
            <div className="w-16 h-16 rounded-2xl bg-black/40 backdrop-blur-[24px] saturate-[180%] border border-white/10 flex items-center justify-center">
              <Play className="w-7 h-7 text-white fill-current ml-1" />
            </div>
          </div>
        )}

        {/* Hidden synced audio element for soundtrack overlay */}
        {hasSoundtrack && video.soundtrackUrl && (
          <audio
            ref={syncedAudioRef}
            src={video.soundtrackUrl}
            preload="auto"
            className="hidden"
          />
        )}

        {/* Soundtrack badge — like TikTok "♪ Song Name" */}
        {hasSoundtrack && video.soundtrackTitle && (
          <div className="absolute bottom-2 left-2 z-10 flex items-center gap-1.5 bg-black/40 backdrop-blur-[16px] px-2 py-1 rounded-lg border border-white/10 max-w-[60%]">
            <Music className="w-3 h-3 text-white flex-shrink-0" />
            <span className="text-white text-[10px] truncate">
              {video.soundtrackTitle}{video.soundtrackCreator ? ` — ${video.soundtrackCreator}` : ''}
            </span>
          </div>
        )}
        
        {/* Top-left lock badge removed — centered Holdings Required overlay covers this */}

        {/* Optional CC subtitle overlay */}
        {!isContentGated && video.videoUrl && (
          <VideoSubtitleOverlay tokenId={video.id} videoRef={videoRef} buttonClassName="absolute top-2 right-[228px] z-20" buttonVisible={showControls} />
        )}
        
        
        {/* Video controls - hidden when PPV locked */}
        {!isContentGated && <>
        {/* First-frame glitch loader */}
        {isLoading && (
          <VideoGlitchLoader poster={thumbnail} />
        )}
        
        {/* Center flash indicator removed — play/pause now in progress bar */}

        {/* Top-aligned video controls (volume, PiP & fullscreen) - liquid glass */}
        {showControls && (
          <div data-video-controls className="absolute top-2 right-2 flex items-center gap-2 z-10">

            <button
              className="h-8 w-[52px] bg-black/40 backdrop-blur-[24px] saturate-[180%] text-white rounded-xl flex items-center justify-center border border-white/10 text-xs font-medium"
              onClick={cyclePlaybackRate}
            >
              {formatRate(playbackRate)}x
            </button>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className={cn(
                    "h-8 w-8 bg-black/40 backdrop-blur-[24px] saturate-[180%] text-white rounded-xl flex items-center justify-center border border-white/10",
                    isLooping && "bg-white/20"
                  )}
                  onClick={toggleLoop}
                >
                  <Repeat className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>{isLooping ? 'Loop on' : 'Loop off'}</TooltipContent>
            </Tooltip>
            {document.pictureInPictureEnabled && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="h-8 w-8 bg-black/40 backdrop-blur-[24px] saturate-[180%] text-white rounded-xl flex items-center justify-center border border-white/10"
                    onClick={handlePictureInPicture}
                  >
                    <PictureInPicture2 className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Picture in Picture (P)</TooltipContent>
              </Tooltip>
            )}
            <button 
              className="h-8 w-8 bg-black/40 backdrop-blur-[24px] saturate-[180%] text-white rounded-xl flex items-center justify-center border border-white/10"
              onClick={toggleMute}
            >
              {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <button 
              className="h-8 w-8 bg-black/40 backdrop-blur-[24px] saturate-[180%] text-white rounded-xl flex items-center justify-center border border-white/10"
              onClick={handleFullscreen}
            >
              {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </button>
          </div>
        )}

        {/* Progress bar at bottom */}
        {duration > 0 && showControls && (
          <div data-video-controls className="absolute bottom-0 left-0 right-0 px-2 pb-3 pt-6 bg-gradient-to-t from-black/80 to-transparent z-10">

            <div className="flex items-center gap-2">
              <button
                onClick={(e) => { e.stopPropagation(); handlePlayClick(); }}
                className="h-6 w-6 bg-black/40 backdrop-blur-[24px] saturate-[180%] rounded border border-white/10 flex items-center justify-center shrink-0"
              >
                {isPlaying ? <Pause className="h-3 w-3 text-white fill-current" /> : <Play className="h-3 w-3 text-white fill-current ml-0.5" />}
              </button>
              <span className="px-1.5 py-0.5 bg-black/40 backdrop-blur-[24px] saturate-[180%] rounded border border-white/10 text-white text-xs min-w-[36px] text-center">{formatTime(currentTime)}</span>
              <input
                type="range"
                min={0}
                max={duration || 100}
                value={currentTime}
                onChange={handleSeek}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 h-1 bg-white/30 rounded-full appearance-none cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none 
                  [&::-webkit-slider-thumb]:w-3 
                  [&::-webkit-slider-thumb]:h-3 
                  [&::-webkit-slider-thumb]:bg-white 
                  [&::-webkit-slider-thumb]:rounded-full
                  [&::-webkit-slider-thumb]:shadow-md
                  [&::-moz-range-thumb]:w-3
                  [&::-moz-range-thumb]:h-3
                  [&::-moz-range-thumb]:bg-white
                  [&::-moz-range-thumb]:rounded-full
                  [&::-moz-range-thumb]:border-0"
                style={{
                  background: `linear-gradient(to right, white ${(currentTime / (duration || 1)) * 100}%, rgba(255,255,255,0.3) ${(currentTime / (duration || 1)) * 100}%)`
                }}
              />
              <span className="px-1.5 py-0.5 bg-black/40 backdrop-blur-[24px] saturate-[180%] rounded border border-white/10 text-white text-xs min-w-[36px] text-center">{formatTime(duration)}</span>
            </div>
          </div>
        )}

        {/* Seek indicator */}
        <AnimatePresence>
          {seekIndicator && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className={`absolute top-1/2 -translate-y-1/2 ${seekIndicator === 'right' ? 'right-8' : 'left-8'}`}
            >
              <div className="w-12 h-12 rounded-xl bg-black/40 backdrop-blur-[24px] saturate-[180%] flex items-center justify-center border border-white/10">
                {seekIndicator === 'right' ? (
                  <FastForward className="h-6 w-6 text-white" />
                ) : (
                  <Rewind className="h-6 w-6 text-white" />
                )}
              </div>
              <p className="text-white text-xs text-center mt-1">10s</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error state - show thumbnail naturally, toast on click */}
        </>}

        {/* Duration badge for gated content - always visible on locked thumbnails */}
        {isContentGated && video.duration && (
          <div className={`absolute bottom-2 right-2 bg-black/40 backdrop-blur-[24px] saturate-[180%] px-1.5 py-0.5 rounded border border-white/10 text-xs text-white font-medium z-10`}>
            {video.duration}
          </div>
        )}
        
      </div>

      {/* Compact avatar row for carousel mode (hideActions) - avatar + AI + dots below thumbnail */}
      {hideActions && !isImmersive && (
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              const cleanUsername = video.creatorUsername?.replace('@', '');
              if (cleanUsername) navigate(`/${cleanUsername}`);
              else if (video.creatorId) navigate(`/app/profile?id=${video.creatorId}`);
            }}
            className="cursor-pointer"
          >
            <Avatar className="w-7 h-7 rounded-md">
              {video.channelAvatar && <AvatarImage src={video.channelAvatar} className="rounded-md" />}
              <AvatarFallback className="bg-zinc-700 text-white font-medium rounded-md text-xs">{video.channel?.[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
          </button>
          <div className="flex items-center gap-1">
            <motion.button
              onClick={(e) => { e.stopPropagation(); if (!walletAddress) { openLoginModal(); return; } setShowAIChat(true); }}
              className="text-zinc-400 hover:text-white transition-colors"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              aria-label="Ask AI about this video"
            >
              <Sparkles className="w-4 h-4" />
            </motion.button>
            <button 
              onClick={(e) => { e.stopPropagation(); if (!walletAddress) { openLoginModal(); return; } setShowOptionsDrawer(true); }}
              className="text-zinc-400 hover:text-white transition-colors"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Info & Actions */}
      <div className={`pt-3${isImmersive ? ' px-3' : ''}`}>
        {/* Creator info with action buttons - mobile/tablet immersive view only (hidden on desktop where SinglePostPage renders DesktopCreatorInfo) */}
        {isImmersive && (
          <div className="lg:hidden">
          <MobileCreatorInfo
            channel={video.channel}
            channelAvatar={video.channelAvatar}
            creatorUsername={video.creatorUsername}
            creatorId={video.creatorId}
            verified={video.verified}
            onAIClick={() => { if (!walletAddress) { openLoginModal(); return; } setShowAIChat(true); }}
            onMenuClick={() => { if (!walletAddress) { openLoginModal(); return; } setShowOptionsDrawer(true); }}
            isPPV={isPPVLocked ? video.isPPV : false}
            tokenId={video.id}
            ppvPrice={video.ppvPrice}
            ppvCurrency={video.ppvCurrency}
            isW2E={isBountyLocked ? video.isW2E : false}
            bountyAmount={video.bountyAmount}
            bountyCurrency={video.bountyCurrency}
            bountyViews={video.bountyViews}
            bountyComments={video.bountyComments}
            isLocked={video.isLocked && !canBypassGating}
            lockedPrice={video.lockedPrice}
            lockedCurrency={video.lockedCurrency}
            chainId={video.chainId}
            onUnlocked={() => {
              setLocallyUnlocked(true);
              markTokenUnlocked(video.id);
              queryClient.invalidateQueries({ queryKey: ['unified-feed'] });
              queryClient.invalidateQueries({ queryKey: ['dehub-feed'] });
              queryClient.invalidateQueries({ queryKey: ['nft-info', video.id] });
            }}
          />
          </div>
        )}
        <SharedTranslationProvider>
          {(() => {
            // Split translated text back into title + description
            let translatedTitle = video.title;
            let translatedDesc = video.description || '';
            if (isVideoTranslated && videoTranslatedText) {
              const parts = videoTranslatedText.split('\n\n');
              translatedTitle = parts[0] || video.title;
              translatedDesc = parts.slice(1).join('\n\n') || video.description || '';
            }
            return (
              <>
                <TranslatableText text={isVideoTranslated ? translatedTitle : video.title} className="text-white text-sm font-medium mb-1" as="h3" hideControls />
                {video.description && video.description !== video.title && (
                  <ExpandableDescription 
                    description={isVideoTranslated ? translatedDesc : video.description} 
                    isImmersive={isImmersive} 
                  />
                )}
              </>
            );
          })()}
        </SharedTranslationProvider>
        <div className="mb-3">
          <PostMetadata 
            timestamp={video.uploadedAgo} 
            viewCount={video.views?.replace(' views', '') || '0'}
            isAd={video.isAd}
            isAudio={video.isAudio}
            translateControl={{
              isTranslated: isVideoTranslated,
              isLoading: isTranslateLoading,
              error: translateError,
              onTranslate: handleVideoTranslate,
              onShowOriginal: handleVideoShowOriginal,
            }}
          />
        </div>
        {!hideActions && (
          <>
            {parseInt(video.id, 10) > 0 && <PollCard tokenId={parseInt(video.id, 10)} />}
            <ActionBar
              postId={video.id}
              tokenId={parseInt(video.id, 10) || undefined}
              isOwnPost={!!isOwnPost}
              utilityDesktopAnchor
              className="p-0"
              isLiked={video.isLiked}
              isDisliked={video.isDisliked}
              onComment={() => {
                setCommentsInitialTab(undefined);
                setShowComments(!showComments);
              }}
              onRepost={handleRepost}
              onQuote={handleQuote}
              likeCount={video.likeCount}
              dislikeCount={video.dislikeCount}
              commentCount={video.commentCount}
              repostCount={video.repostCount}
              isReposted={video.isReposted}
              isOptimistic={video.isOptimistic}
              tipCount={tipCount}
              onTip={() => setShowTipModal(true)}
              onSeeEngagements={() => {
                setCommentsInitialTab('reposts');
                setShowComments(true);
              }}
            />

            {/* Comments — drawer in immersive mode (video shrinks to make room),
                inline bento expansion in the feed. */}
            <CommentsWrapper
              open={showComments}
              onOpenChange={setShowComments}
              tokenId={video.id}
              initialTab={commentsInitialTab}
              immersive={isImmersive}
            />
          </>
        )}
      </div>

      {/* AI Chat */}
      <PostAIChat
        isOpen={showAIChat}
        onClose={() => setShowAIChat(false)}
        postContext={{
          type: 'video',
          author: video.channel,
          title: video.title,
          imageUrl: thumbnail,
          videoUrl: video.videoUrl,
        }}
      />

      {/* Report Modal */}
      <ReportModal
        open={showReportModal}
        onOpenChange={setShowReportModal}
        tokenId={video.id}
        contentType="video"
      />

      {/* Options Drawer for immersive mode */}
      <Drawer open={showOptionsDrawer} onOpenChange={setShowOptionsDrawer}>
        <DrawerContent glass className="px-4 pb-6">
          <DrawerHeader className="pb-2">
            <DrawerTitle className="text-white text-lg">{t('postOptions.options')}</DrawerTitle>
          </DrawerHeader>
          <div className="flex flex-col gap-1">
            {/* Bookmark / Post info — mobile/tablet only; desktop shows these
                anchored left in the bottom action bar instead. */}
            <button
              onClick={() => { toggleBookmark(); }}
              disabled={isBookmarkLoading}
              className={cn(
                "lg:hidden flex items-center gap-3 px-4 py-3 hover:bg-white/10 rounded-xl transition-colors text-left disabled:opacity-50",
                isBookmarked ? "text-yellow-500" : "text-white"
              )}
            >
              <Bookmark className={cn("w-5 h-5", isBookmarked && "fill-current")} />
              {isBookmarked ? 'Remove bookmark' : 'Bookmark'}
            </button>
            <button
              onClick={openPostInfoPage}
              className="lg:hidden flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left"
            >
              <Info className="w-5 h-5" /> Post info
            </button>
            {!isOwnPost && (
              <button
                onClick={() => { setShowOptionsDrawer(false); setShowTipModal(true); }}
                className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left"
              >
                <Gem className="w-5 h-5" /> {t('postOptions.sendTip')}
              </button>
            )}
            <button className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left">
              <ListPlus className="w-5 h-5" /> {t('postOptions.queue')}
            </button>
            <button className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left">
              <Clock className="w-5 h-5" /> {t('postOptions.watchList')}
            </button>
            <button 
              onClick={() => {
                setShowOptionsDrawer(false);
                setShowReportModal(true);
              }}
              className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left"
            >
              <Flag className="w-5 h-5" /> {t('postOptions.report')}
            </button>
            {!isContentGated && !(video.isLocked && !canBypassGating) && (
              <button onClick={handleDownloadVideo} className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left">
                <Download className="w-5 h-5" /> {t('postOptions.download')}
              </button>
            )}
            <button 
              onClick={() => {
                const url = `${window.location.origin}/app/post/${video.id}`;
                navigator.clipboard.writeText(url);
                toast.success(t('postOptions.linkCopied'));
                setShowOptionsDrawer(false);
              }}
              className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left"
            >
              <Link2 className="w-5 h-5" /> {t('postOptions.copyLink')}
            </button>
            {isOwnPost && (
              <>
                <div className="border-t border-white/10 my-1" />
                <button
                  onClick={() => { setShowOptionsDrawer(false); setShowEditModal(true); }}
                  className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left"
                >
                  <Pencil className="w-5 h-5" /> {t('postOptions.editPost')}
                </button>
                <button
                  onClick={() => {
                    if (!videoTokenId || togglePinMutation.isPending) return;
                    togglePinMutation.mutate(videoTokenId, {
                      onSuccess: (data) => setIsPinned(data.pinned),
                    });
                  }}
                  disabled={!videoTokenId || togglePinMutation.isPending}
                  className={cn(
                    "lg:hidden flex items-center gap-3 px-4 py-3 hover:bg-white/10 rounded-xl transition-colors text-left disabled:opacity-40",
                    isPinned ? "text-blue-400" : "text-white"
                  )}
                >
                  <Pin className={cn("w-5 h-5", isPinned && "fill-current")} />
                  {isPinned ? 'Unpin post' : 'Pin post'}
                </button>
                <button
                  onClick={() => { setShowOptionsDrawer(false); setShowDeleteModal(true); }}
                  className="flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-white/10 rounded-xl transition-colors text-left"
                >
                  <Trash2 className="w-5 h-5" /> {t('postOptions.deletePost')}
                </button>
              </>
            )}
          </div>
        </DrawerContent>
      </Drawer>

      {/* Delete Post Modal */}
      <DeletePostModal
        open={showDeleteModal}
        onOpenChange={setShowDeleteModal}
        tokenId={video.id}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['unified-feed'] });
          queryClient.invalidateQueries({ queryKey: ['dehub-feed'] });
        }}
      />

      {/* Edit Post Modal */}
      <EditPostModal
        open={showEditModal}
        onOpenChange={setShowEditModal}
        tokenId={video.id}
        currentTitle={video.title}
        currentDescription={video.description ?? ''}
        currentCategories={video.categories ?? []}
        onSuccess={(edited) => {
          applyOptimisticEdit(queryClient, video.id, edited);
        }}
      />

      {/* Tip Modal */}
      <TipModal
        open={showTipModal}
        onOpenChange={setShowTipModal}
        creatorAddress={video.creatorId}
        creatorName={video.channel}
        tokenId={video.id}
      />

      {/* PPV Drawer - controlled, rendered at root level for mobile compatibility */}
      {video.isPPV && video.ppvPrice && (
        <Drawer open={showPPVDrawer} onOpenChange={setShowPPVDrawer}>
          <PPVDrawerContent
            tokenId={video.id}
            price={Number(video.ppvPrice)}
            currency={video.ppvCurrency || 'DHB'}
            creatorAddress={video.creatorId}
            chainId={video.chainId}
            onClose={() => setShowPPVDrawer(false)}
            onUnlocked={() => {
              setLocallyUnlocked(true);
              markTokenUnlocked(video.id);
              queryClient.invalidateQueries({ queryKey: ['unified-feed'] });
              queryClient.invalidateQueries({ queryKey: ['dehub-feed'] });
              queryClient.invalidateQueries({ queryKey: ['nft-info', video.id] });
            }}
            formatCompact={formatCompact}
          />
        </Drawer>
      )}

      {/* Bounty Drawer - controlled, rendered at root level for mobile compatibility */}
      {video.isW2E && (
        <Drawer open={showBountyDrawer} onOpenChange={setShowBountyDrawer}>
          <DrawerContent glass className="px-4 pb-6">
            <DrawerHeader className="pb-3 relative">
              <DrawerTitle className="text-white text-lg flex items-center gap-2">
                <Gift className="w-5 h-5 text-white" />
                {t('drawers.bountyTitle')}
              </DrawerTitle>
              <button onClick={() => setShowBountyDrawer(false)} className="absolute top-3 right-0 p-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] transition-colors">
                <X className="w-4 h-4 text-zinc-400" />
              </button>
            </DrawerHeader>
            <div className="flex flex-col gap-4">
              <div className="space-y-3">
                {video.bountyViews && video.bountyViews > 0 && (
                  <div className="flex items-center gap-3 px-4 py-3 bg-white/5 rounded-xl border border-white/10">
                    <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center">
                      <Eye className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <p className="text-white text-sm font-medium">{t('drawers.firstViews', { count: video.bountyViews })}</p>
                      <p className="text-zinc-400 text-xs">{t('drawers.rewardedWatching')}</p>
                    </div>
                  </div>
                )}
                {video.bountyComments && video.bountyComments > 0 && (
                  <div className="flex items-center gap-3 px-4 py-3 bg-white/5 rounded-xl border border-white/10">
                    <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center">
                      <MessageCircle className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <p className="text-white text-sm font-medium">{t('drawers.firstComments', { count: video.bountyComments })}</p>
                      <p className="text-zinc-400 text-xs">{t('drawers.rewardedEngaging')}</p>
                    </div>
                  </div>
                )}
              </div>
              {video.bountyAmount && video.bountyAmount > 0 && (
                <div className="flex items-center justify-between px-4 py-4 bg-white/5 rounded-xl border border-white/10">
                  <span className="text-white text-sm">{t('drawers.rewardPerUser')}</span>
                  <div className="flex items-center gap-2">
                    <img src={dehubCoinSmall} alt="DHB" className="w-5 h-5" />
                    <span className="text-white text-lg font-bold">{video.bountyAmount} {video.bountyCurrency || 'DHB'}</span>
                  </div>
                </div>
              )}
              <p className="text-center text-white/60 text-sm">
                {t('drawers.bountyDescription')}
              </p>
              {/* Close / View action buttons */}
              <div className="flex items-center gap-3">
                <LiquidGlassBubble
                  shimmer={false}
                  className="flex-1 cursor-pointer"
                  onClick={() => setShowBountyDrawer(false)}
                >
                  <span className="block text-center text-white text-sm font-medium">
                    {t('drawers.bountyClose')}
                  </span>
                </LiquidGlassBubble>
                <LiquidGlassBubble
                  shimmer={false}
                  className="flex-1 cursor-pointer"
                  onClick={() => {
                    setShowBountyDrawer(false);
                    cacheVideoForNavigation(queryClient, video);
                    navigate(`/app/post/${video.id}`, { state: { fromFeed: true } });
                  }}
                >
                  <span className="block text-center text-white text-sm font-medium">
                    {t('drawers.bountyView')}
                  </span>
                </LiquidGlassBubble>
              </div>
            </div>
          </DrawerContent>
        </Drawer>
      )}

      {/* Locked Drawer - controlled, rendered at root level for mobile compatibility */}
      {video.isLocked && !canBypassGating && (
        <Drawer open={showLockedDrawer} onOpenChange={setShowLockedDrawer}>
          <DrawerContent glass className="px-4 pb-6">
            <DrawerHeader className="pb-3 relative">
              <DrawerTitle className="text-white text-lg flex items-center gap-2">
                <Lock className="w-5 h-5 text-white" />
                {t('drawers.gatedTitle')}
              </DrawerTitle>
              <button onClick={() => setShowLockedDrawer(false)} className="absolute top-3 right-0 p-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] transition-colors">
                <X className="w-4 h-4 text-zinc-400" />
              </button>
            </DrawerHeader>
            <div className="flex flex-col gap-4">
              {video.lockedPrice && video.lockedPrice > 0 && (
                <div className="flex items-center justify-between px-4 py-4 bg-white/5 rounded-xl border border-white/10">
                  <span className="text-white text-sm">{t('drawers.mustHoldToView')}</span>
                  <div className="flex items-center gap-2">
                    <img src={dehubCoinSmall} alt="DHB" className="w-5 h-5" />
                    <span className="text-white text-lg font-bold">{formatCompact(video.lockedPrice)} {video.lockedCurrency || 'DHB'}</span>
                  </div>
                </div>
              )}
              <p className="text-center text-white/60 text-sm">
                {t('drawers.gatedDescription')}
              </p>
              {video.lockedPrice && video.lockedPrice > 0 && (
                <VerifyUnlockButton
                  requiredAmount={video.lockedPrice}
                  currency={video.lockedCurrency || 'DHB'}
                  onUnlocked={() => {
                    setShowLockedDrawer(false);
                    setLocallyUnlocked(true);
                    markTokenUnlocked(video.id);
                    queryClient.invalidateQueries({ queryKey: ['unified-feed'] });
                    queryClient.invalidateQueries({ queryKey: ['dehub-feed'] });
                    queryClient.invalidateQueries({ queryKey: ['nft-info', video.id] });
                  }}
                />
              )}
            </div>
          </DrawerContent>
        </Drawer>
      )}

      {/* Quote Post Modal */}
      <QuotePostModal
        open={showQuoteModal}
        onOpenChange={setShowQuoteModal}
        quotedPost={videoAsNFT as any}
      />
    </div>
  );
});
