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
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Eye, MoreVertical, ListPlus, Clock, Flag, Download, Ban, Sparkles, Play, Pause, Volume2, VolumeX, Maximize, Minimize, FastForward, Rewind, PictureInPicture2, Lock, Gift, Ticket, MessageCircle, Link2, MessageSquare, Pencil, Trash2 } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import dehubCoin from '@/assets/dehub-coin.png';
import ppvTicketIcon from '@/assets/ppv-ticket-icon.png';
import { usePPVPurchaseCount } from '@/hooks/use-ppv-purchase-count';
import dehubCoinSmall from '@/assets/dehub-coin.png';
import { motion, AnimatePresence } from 'framer-motion';
import { CardHeader } from './CardHeader';
import { ActionBar } from './ActionBar';
import { PostMetadata } from './PostMetadata';
import { PPVDrawerContent } from './PPVDrawerContent';
import { LiquidGlassBubble } from '@/components/ui/liquid-glass-bubble';
import { VerifyUnlockButton } from './VerifyUnlockButton';
import { TranslatableText, SharedTranslationProvider, useTranslation } from '../TranslatableText';
import { useTranslation as useI18n } from 'react-i18next';
import { PostAIChat } from './PostAIChat';
import { ReportModal } from '../modals/ReportModal';
import { EditPostModal } from '../modals/EditPostModal';
import { DeletePostModal } from '../modals/DeletePostModal';
import { TipModal } from '../modals/TipModal';
import { CommentsSection } from './CommentsSection';
import { useIsTouchDevice } from '@/hooks/use-touch-device';
import { useVideoViewTracking } from '@/hooks/use-view-tracking';
import { videoPlaybackManager } from '@/lib/video-playback-manager';
import { useAuth } from '@/contexts/AuthContext';

import { cacheVideoForNavigation } from '@/lib/post-cache';
import { isTokenUnlocked, markTokenUnlocked } from '@/lib/unlocked-tokens-store';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import type { VideoItem } from '@/types/feed.types';

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

  // Format numbers with abbreviations (1K, 1M, etc.) - matches thumbnail format
  const formatCompact = (num: number): string => {
    if (num >= 1000000) return `${Math.floor(num / 1000000)}M`;
    if (num >= 1000) return `${Math.floor(num / 1000)}K`;
    return String(num);
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
          {channelAvatar && (
            <img 
              src={channelAvatar} 
              alt={channel}
              className="w-9 h-9 rounded-md object-cover shrink-0"
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/placeholder.svg';
              }}
            />
          )}
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-semibold text-white text-sm leading-tight truncate">{channel}</span>
            {creatorUsername && (
              <span className="text-zinc-400 text-sm truncate">@{creatorUsername.replace('@', '')}</span>
            )}
            {verified && (
              <svg className="w-3.5 h-3.5 text-blue-500 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
              </svg>
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
          
          <button
            onClick={onAIClick}
            className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
            aria-label="Ask AI about this video"
          >
            <Sparkles className="w-5 h-5" />
          </button>
          <button 
            onClick={onMenuClick}
            className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
          >
            <MoreVertical className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Bounty Drawer */}
      <Drawer open={showBountyDrawer} onOpenChange={setShowBountyDrawer}>
        <DrawerContent glass className="px-4 pb-6">
          <DrawerHeader className="pb-3">
              <DrawerTitle className="text-white text-lg flex items-center gap-2">
                <Gift className="w-5 h-5 text-white" />
                {t('drawers.bountyTitle')}
              </DrawerTitle>
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
          <DrawerHeader className="pb-3">
              <DrawerTitle className="text-white text-lg flex items-center gap-2">
                <Lock className="w-5 h-5 text-white" />
                {t('drawers.gatedTitle')}
              </DrawerTitle>
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

function ExpandableDescription({ description, isImmersive }: ExpandableDescriptionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [needsExpansion, setNeedsExpansion] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Check if text overflows (needs expansion) after render
  useEffect(() => {
    if (isImmersive && containerRef.current) {
      const el = containerRef.current;
      // Compare scrollHeight with clientHeight to detect overflow
      setNeedsExpansion(el.scrollHeight > el.clientHeight);
    }
  }, [description, isImmersive]);

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
}

export const VideoCard = memo(function VideoCard({ video, isImmersive = false }: VideoCardProps) {
  const instanceId = useId();
  const { t } = useI18n();
  const [showAIChat, setShowAIChat] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showBountyDrawer, setShowBountyDrawer] = useState(false);
  const [showPPVDrawer, setShowPPVDrawer] = useState(false);
  const [showLockedDrawer, setShowLockedDrawer] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showOptionsDrawer, setShowOptionsDrawer] = useState(false);
  const [showTipModal, setShowTipModal] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const isTabletOrMobile = useIsTabletOrMobile();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { walletAddress, openLoginModal } = useAuth();
  const isOwnPost = walletAddress && video.creatorId?.toLowerCase() === walletAddress.toLowerCase();
  const [isMuted, setIsMuted] = useState(() => videoPlaybackManager.globalMuted);
  const [showControls, setShowControls] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [seekIndicator, setSeekIndicator] = useState<'left' | 'right' | null>(null);
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

  // Pause callback for the playback manager
  const pauseVideo = useCallback(() => {
    videoRef.current?.pause();
    setIsPlaying(false);
  }, []);

  // Register with playback manager and setup IntersectionObserver
  useEffect(() => {
    videoPlaybackManager.register(instanceId, pauseVideo);

    // Auto-pause when scrolled out of view
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting && isPlaying) {
            pauseVideo();
            videoPlaybackManager.stop(instanceId);
          }
        });
      },
      { threshold: 0.3 } // Pause when less than 30% visible
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      videoPlaybackManager.unregister(instanceId);
      observer.disconnect();
    };
  }, [instanceId, pauseVideo, isPlaying]);

  // Show controls briefly after any user interaction, then auto-hide
  const showControlsBriefly = useCallback(() => {
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => {
      if (!isHoveringRef.current) setShowControls(false);
    }, 3000);
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

  // PPV purchase count
  const { data: ppvPurchaseCount } = usePPVPurchaseCount(isPPVLocked ? video.id : undefined);

  const handlePlayClick = useCallback(() => {
    if (!video.videoUrl || isContentGated) return;
    
    if (isPlaying) {
      videoRef.current?.pause();
      setIsPlaying(false);
      videoPlaybackManager.stop(instanceId);
      showControlsBriefly();
    } else {
      // Sync mute state from global manager before playing
      const currentGlobalMuted = videoPlaybackManager.globalMuted;
      setIsMuted(currentGlobalMuted);
      if (videoRef.current) {
        videoRef.current.muted = currentGlobalMuted;
      }
      
      // Notify manager - this will pause any other playing video
      videoPlaybackManager.play(instanceId);
      setIsLoading(true);
      videoRef.current?.play().then(() => {
        setIsPlaying(true);
        setIsLoading(false);
        showControlsBriefly();
      }).catch(() => {
        setIsLoading(false);
        setHasError(true);
        videoPlaybackManager.stop(instanceId);
      });
    }
  }, [isPlaying, video.videoUrl, instanceId, showControlsBriefly, isContentGated]);

  const toggleMute = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    videoPlaybackManager.globalMuted = newMuted; // Persist globally for future videos
    if (videoRef.current) {
      videoRef.current.muted = newMuted;
    }
  }, [isMuted]);

  const [isFullscreen, setIsFullscreen] = useState(false);

  // Track fullscreen state changes
  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
    };
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      const el = containerRef.current as any;
      if (!el) return;
      if (el.requestFullscreen) {
        el.requestFullscreen();
      } else if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
      }
    }
  }, []);

  const handleFullscreen = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    toggleFullscreen();
  }, [toggleFullscreen]);

  const handlePictureInPicture = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture();
    } else if (videoRef.current) {
      videoRef.current.requestPictureInPicture();
    }
  }, []);

  const adjustVolume = useCallback((delta: number) => {
    if (videoRef.current) {
      const newVolume = Math.max(0, Math.min(1, volume + delta));
      setVolume(newVolume);
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
    setIsPlaying(false);
    videoPlaybackManager.stop(instanceId);
  }, [instanceId]);

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
  const formatCompact = (num: number): string => {
    if (num >= 1000000) return `${Math.floor(num / 1000000)}M`;
    if (num >= 1000) return `${Math.floor(num / 1000)}K`;
    return String(Math.floor(num));
  };

  // Keyboard shortcuts
  useEffect(() => {
    if (!isFocused || !isPlaying) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
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
            if (videoRef.current) videoRef.current.muted = newMuted;
            return newMuted;
          });
          break;
        case 'p':
          e.preventDefault();
          if (videoRef.current) {
            if (document.pictureInPictureElement) {
              document.exitPictureInPicture();
            } else {
              videoRef.current.requestPictureInPicture();
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
    // Guard: don't navigate if any drawer is open
    if (showBountyDrawer || showPPVDrawer || showLockedDrawer) return;
    
    // Cache the video data before navigation for instant display
    cacheVideoForNavigation(queryClient, video);
    navigate(`/app/post/${video.id}`);
  }, [navigate, video.id, queryClient, video, showBountyDrawer, showPPVDrawer, showLockedDrawer]);
  
  return (
    <div 
      onClick={isImmersive ? undefined : handleCardClick}
      className={isImmersive 
        ? "bg-black overflow-hidden isolate" 
        : "overflow-hidden cursor-pointer isolate"
      }
    >
      {/* Header with AI and menu buttons - hidden in immersive mode */}
      {!isImmersive && (
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
              <Sparkles className="w-5 h-5" />
            </motion.button>
            <Drawer open={showOptionsDrawer} onOpenChange={setShowOptionsDrawer}>
              <DrawerTrigger asChild>
              <button onClick={(e) => { if (!walletAddress) { e.preventDefault(); openLoginModal(); return; } setShowOptionsDrawer(true); }} className="text-zinc-400 hover:text-white transition-colors -mr-0.5">
                <MoreVertical className="w-5 h-5" />
                </button>
              </DrawerTrigger>
              <DrawerContent glass className="px-4 pb-6">
                <DrawerHeader className="pb-2">
                  <DrawerTitle className="text-white text-lg">{t('postOptions.options')}</DrawerTitle>
                </DrawerHeader>
                <div className="flex flex-col gap-1">
                  {!isOwnPost && (
                    <button
                      onClick={() => { setShowOptionsDrawer(false); setShowTipModal(true); }}
                      className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left"
                    >
                      <img src={dehubCoin} alt="DHB" className="w-5 h-5" /> {t('postOptions.sendTip')}
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
                    <button className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left">
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
                        onClick={() => setShowEditModal(true)}
                        className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left"
                      >
                        <Pencil className="w-5 h-5" /> {t('postOptions.editPost')}
                      </button>
                      <button
                        onClick={() => setShowDeleteModal(true)}
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
        className={`relative bg-zinc-800 cursor-pointer group/thumb outline-none rounded-md overflow-hidden ${isFullscreen ? 'w-full h-full flex items-center justify-center' : 'aspect-video'}`}
        onClick={isTouchDevice ? undefined : handleVideoAreaClick}
        onTouchEnd={isTouchDevice ? handleTouchEnd : undefined}
        onMouseEnter={() => {
          isHoveringRef.current = true;
          setShowControls(true);
          if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
        }}
        onMouseLeave={() => {
          isHoveringRef.current = false;
          if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
          controlsTimerRef.current = setTimeout(() => setShowControls(false), 3000);
        }}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
      >
        {/* Combo PPV + Holdings Locked */}
        {isComboLocked ? (
          <>
            <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover" loading="lazy" />
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
              <p className="text-white/50 text-[10px] mt-1">{ppvPurchaseCount ?? 0} PPV Sale{(ppvPurchaseCount ?? 0) !== 1 ? 's' : ''}</p>
            </div>
          </>
        ) : isPPVLocked ? (
          <>
            <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover" loading="lazy" />
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
              <p className="text-white/50 text-[10px] mt-1">{ppvPurchaseCount ?? 0} PPV Sale{(ppvPurchaseCount ?? 0) !== 1 ? 's' : ''}</p>
            </div>
          </>
        ) : isHoldingsLocked ? (
          <>
            <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover" loading="lazy" />
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
            <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover" loading="lazy" />
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
            {video.videoUrl && !hasError ? (
              <video
                ref={videoRef}
                src={video.videoUrl}
                poster={video.thumbnail}
                muted={isMuted}
                playsInline
                preload="metadata"
                crossOrigin="anonymous"
                onEnded={handleVideoEnded}
                onError={handleVideoError}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onLoadedData={() => console.log('Video loaded:', video.videoUrl)}
                className={`w-full h-full ${isFullscreen ? 'object-contain' : 'object-cover'}`}
              />
            ) : (
              <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover" loading="lazy" />
            )}
          </>
        )}
        
        {/* Content Type Badges - PPV/Bounty/Locked - show all that apply - hide in immersive mode */}
        {!isImmersive && (video.isLocked && !canBypassGating) && (
          <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5">
            {/* Locked/Gated Badge */}
            {video.isLocked && (
              <button 
                className="flex items-center gap-1 bg-black/40 backdrop-blur-[24px] saturate-[180%] px-2 py-1 rounded-lg border border-white/10 hover:bg-black/60 transition-colors"
                onClick={(e) => { e.stopPropagation(); setShowLockedDrawer(true); }}
              >
                <Lock className="w-3 h-3 text-white" />
                <span className="text-white text-xs font-medium">
                  {video.lockedPrice && video.lockedPrice > 0 
                    ? `${formatCompact(video.lockedPrice)} ${video.lockedCurrency || 'DHB'}` 
                    : ''}
                </span>
              </button>
            )}
          </div>
        )}
        
        {/* Video controls - hidden when PPV locked */}
        {!isContentGated && <>
        {/* Loading spinner */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <div className="w-10 h-10 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        )}
        
        {/* Play/Pause button overlay - double click/tap for fullscreen */}
        {(!isPlaying || (showControls && !isTouchDevice)) && !isLoading && (
          <div 
            className={`absolute inset-0 flex items-center justify-center bg-black/20 ${isTouchDevice ? 'opacity-100' : 'opacity-0 group-hover/thumb:opacity-100'} transition-opacity`}
            onDoubleClick={(e) => {
              e.stopPropagation();
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const x = e.clientX - rect.left;
              const relativeX = x / rect.width;
              
              // Only toggle fullscreen in center 25% zone
              if (relativeX >= 0.375 && relativeX <= 0.625) {
                toggleFullscreen();
              } else {
                // Left/right zones trigger seek via the main handler
                handleDoubleTapSeek(e);
              }
            }}
          >
            <div className="w-14 h-14 rounded-xl bg-black/40 backdrop-blur-[24px] saturate-[180%] flex items-center justify-center border border-white/10">
              {isPlaying ? (
                <Pause className="h-6 w-6 text-white fill-current" />
              ) : (
                <Play className="h-6 w-6 text-white fill-current ml-1" />
              )}
            </div>
          </div>
        )}

        {/* Top-aligned video controls (volume, PiP & fullscreen) - liquid glass */}
        {isPlaying && (showControls || isTouchDevice) && (
          <div className="absolute top-2 right-2 flex items-center gap-2 z-10">
            <button 
              className="h-8 w-8 bg-black/40 backdrop-blur-[24px] saturate-[180%] text-white rounded-xl flex items-center justify-center border border-white/10"
              onClick={toggleMute}
            >
              {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
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
            <button 
              className="h-8 w-8 bg-black/40 backdrop-blur-[24px] saturate-[180%] text-white rounded-xl flex items-center justify-center border border-white/10"
              onClick={handleFullscreen}
            >
              {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </button>
          </div>
        )}

        {/* Progress bar at bottom */}
        {isPlaying && duration > 0 && (showControls || isTouchDevice) && (
          <div className="absolute bottom-0 left-0 right-0 px-2 pb-3 pt-6 bg-gradient-to-t from-black/80 to-transparent z-10">
            <div className="flex items-center gap-2">
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

        {/* Error state */}
        {hasError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <p className="text-white/70 text-sm">Video unavailable</p>
          </div>
        )}
        
        {/* Duration badge - liquid glass - hide when progress bar visible */}
        {!(isPlaying && duration > 0 && (showControls || isTouchDevice)) && (
          <div className="absolute bottom-2 right-2 bg-black/40 backdrop-blur-[24px] saturate-[180%] px-1.5 py-0.5 rounded border border-white/10 text-xs text-white font-medium">
            {video.duration}
          </div>
        )}
        </>}
        
      </div>

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
              queryClient.invalidateQueries({ queryKey: ['dehub-videos'] });
              queryClient.invalidateQueries({ queryKey: ['nft-info', video.id] });
            }}
          />
          </div>
        )}
        <SharedTranslationProvider>
          <TranslatableText text={video.title} className="text-white text-sm font-medium mb-1" as="h3" hideControls />
          {video.description && video.description !== video.title && (
            <ExpandableDescription 
              description={video.description} 
              isImmersive={isImmersive} 
            />
          )}
        </SharedTranslationProvider>
        <div className="mb-3">
          <PostMetadata 
            timestamp={video.uploadedAgo} 
            viewCount={video.views?.replace(' views', '') || '0'}
            isAd={video.isAd}
            translateControl={{
              isTranslated: isVideoTranslated,
              isLoading: isTranslateLoading,
              error: translateError,
              onTranslate: handleVideoTranslate,
              onShowOriginal: handleVideoShowOriginal,
            }}
          />
        </div>
        <ActionBar
          postId={video.id} 
          className="p-0" 
          isLiked={video.isLiked} 
          isDisliked={video.isDisliked}
          onComment={() => setShowComments(!showComments)}
          likeCount={video.likeCount}
          dislikeCount={video.dislikeCount}
          commentCount={video.commentCount}
          isOptimistic={video.isOptimistic}
        />

        {/* Comments - Always use Drawer for consistent liquid glass style */}
        <Drawer open={showComments} onOpenChange={setShowComments}>
          <DrawerContent glass hideHandle className="max-h-[70vh] flex flex-col overflow-hidden">
            <div className="flex-1 min-h-0 px-4 pb-4 pt-2">
              <CommentsSection
                tokenId={video.id}
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
          type: 'video',
          author: video.channel,
          title: video.title,
          imageUrl: video.thumbnail
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
            {!isOwnPost && (
              <button
                onClick={() => { setShowOptionsDrawer(false); setShowTipModal(true); }}
                className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left"
              >
                <img src={dehubCoin} alt="DHB" className="w-5 h-5" /> {t('postOptions.sendTip')}
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
              <button className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left">
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

      {/* Edit Post Modal */}
      <EditPostModal
        open={showEditModal}
        onOpenChange={setShowEditModal}
        tokenId={video.id}
        currentTitle={video.title}
        currentDescription={video.description}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['unified-feed'] });
          queryClient.invalidateQueries({ queryKey: ['dehub-videos'] });
        }}
      />

      {/* Delete Post Modal */}
      <DeletePostModal
        open={showDeleteModal}
        onOpenChange={setShowDeleteModal}
        tokenId={video.id}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['unified-feed'] });
          queryClient.invalidateQueries({ queryKey: ['dehub-videos'] });
        }}
      />

      {/* Tip Modal */}
      <TipModal
        open={showTipModal}
        onOpenChange={setShowTipModal}
        creatorAddress={video.creatorId}
        creatorName={video.channel}
        context={video.id}
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
              queryClient.invalidateQueries({ queryKey: ['dehub-videos'] });
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
            <DrawerHeader className="pb-3">
              <DrawerTitle className="text-white text-lg flex items-center gap-2">
                <Gift className="w-5 h-5 text-white" />
                {t('drawers.bountyTitle')}
              </DrawerTitle>
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
                    navigate(`/app/post/${video.id}`);
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
            <DrawerHeader className="pb-3">
              <DrawerTitle className="text-white text-lg flex items-center gap-2">
                <Lock className="w-5 h-5 text-white" />
                {t('drawers.gatedTitle')}
              </DrawerTitle>
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
                    queryClient.invalidateQueries({ queryKey: ['dehub-videos'] });
                    queryClient.invalidateQueries({ queryKey: ['nft-info', video.id] });
                  }}
                />
              )}
            </div>
          </DrawerContent>
        </Drawer>
      )}
    </div>
  );
});
