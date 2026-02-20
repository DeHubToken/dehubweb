/**
 * Live Stream Card Component
 * ==========================
 * Displays a live stream with video player and "stream ended" fallback state.
 * Wired to DeHub API for likes, gifts, ending streams, and activity logs.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { 
  Sparkles, MoreVertical, Flag, Ban, EyeOff, Bell, 
  Play, Volume2, VolumeX, Maximize, Radio,
  Heart, Gift, StopCircle, Activity, Loader2
} from 'lucide-react';
import { useTranslation as useI18n } from 'react-i18next';
import Hls from 'hls.js';
import { CardHeader } from './CardHeader';
import { ActionBar } from './ActionBar';
import { CommentsSection } from './CommentsSection';
import { PostAIChat } from './PostAIChat';
import { ReportModal } from '../modals/ReportModal';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { videoPlaybackManager } from '@/lib/video-playback-manager';
import { useStreamActions, useStreamActivities } from '@/hooks/use-livestream';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { getDHBBalance } from '@/lib/contracts/stream-controller';
import { fromWei } from '@/lib/contracts/dhb-token';
import dehubCoin from '@/assets/dehub-coin.png';
import usdcLogo from '@/assets/usdc-logo.png';
import { createLogger } from '@/lib/logger';
import type { LiveStream } from '@/types/feed.types';

const logger = createLogger('LiveStreamCard');

interface LiveStreamCardProps {
  stream: LiveStream;
}

export function LiveStreamCard({ stream }: LiveStreamCardProps) {
  const [showComments, setShowComments] = useState(false);
  const { t } = useI18n();
  const [showAIChat, setShowAIChat] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showActivityLog, setShowActivityLog] = useState(false);
  const [showGiftDrawer, setShowGiftDrawer] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(videoPlaybackManager.globalMuted);
  const urlsToTry = useMemo(() => [
    stream.playbackUrl,
    ...(stream.playbackUrls || []).filter((u): u is string => !!u && u !== stream.playbackUrl),
  ].filter((u): u is string => !!u && u.includes('.m3u8')), [stream.playbackUrl, stream.playbackUrls]);
  const hasPlaybackUrl = urlsToTry.length > 0;
  // If stream.isLive is false, treat as ended immediately — don't try to play a dead HLS URL
  const [streamEnded, setStreamEnded] = useState(!stream.isLive);
  const [error, setError] = useState<string | null>(null);
  const [isLiked, setIsLiked] = useState(false);
  const [giftAmount, setGiftAmount] = useState('');
  const [giftCurrency, setGiftCurrency] = useState('DHB');
  const [dhbBalance, setDhbBalance] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const videoId = `live-${stream.id}`;

  const { isAuthenticated, walletAddress, openLoginModal } = useAuth();
  const isStreamOwner = walletAddress && stream.creatorId && 
    walletAddress.toLowerCase() === stream.creatorId.toLowerCase();
  const { like, gift, end, isLiking, isSendingGift, isEnding } = useStreamActions();
  const { activities, isLoading: activitiesLoading } = useStreamActivities(
    showActivityLog ? stream.id : null
  );

  // Fetch DHB balance when gift drawer opens
  useEffect(() => {
    if (!showGiftDrawer || !walletAddress) return;
    let cancelled = false;
    setBalanceLoading(true);
    getDHBBalance(walletAddress)
      .then((bal) => {
        if (!cancelled) {
          const formatted = fromWei(bal);
          setDhbBalance(Number(formatted).toLocaleString(undefined, { maximumFractionDigits: 2 }));
        }
      })
      .catch(() => {
        if (!cancelled) setDhbBalance(null);
      })
      .finally(() => {
        if (!cancelled) setBalanceLoading(false);
      });
    return () => { cancelled = true; };
  }, [showGiftDrawer, walletAddress]);

  useEffect(() => {
    const video = videoRef.current;
    const shouldAttemptPlayback = stream.isLive || hasPlaybackUrl;
    if (!video || !shouldAttemptPlayback || urlsToTry.length === 0) return;

    let urlIndex = 0;
    const currentUrl = () => urlsToTry[urlIndex];
    logger.info('Initializing player', {
      streamId: stream.id,
      isLive: stream.isLive,
      urlsToTry: urlsToTry.length,
      currentUrl: currentUrl(),
    });

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 60,
      });

      const tryLoad = () => {
        const streamUrl = currentUrl();
        logger.info('HLS loading source...', { urlIndex, streamUrl });
        hls.loadSource(streamUrl);
      };

      tryLoad();
      hls.attachMedia(video);

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          logger.error('HLS Fatal Error', { type: data.type, details: data.details }, data);

          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            const retryCount = (hls as any)._networkRetryCount || 0;
            // Live streams get many more retries — connection blips shouldn't kill the player
            const maxRetriesPerUrl = stream.isLive ? 20 : 5;

            if (retryCount < maxRetriesPerUrl) {
              (hls as any)._networkRetryCount = retryCount + 1;
              // Back off: 3s → 5s → 10s
              const delay = retryCount < 3 ? 3000 : retryCount < 10 ? 5000 : 10000;
              logger.info(`Network error, retrying in ${delay / 1000}s... (${retryCount + 1}/${maxRetriesPerUrl})`);
              setError('Connecting to stream...');
              setTimeout(() => {
                // Any manifest/level error = full source reload (not just resume)
                // manifestParsingError: server returned non-HLS content (stream not ready yet)
                // manifestLoadError / levelLoadError: HTTP-level failure
                const needsReload = (
                  data.details === 'manifestLoadError' ||
                  data.details === 'manifestParsingError' ||
                  data.details === 'manifestLoadTimeOut' ||
                  data.details === 'levelLoadError' ||
                  data.details === 'levelLoadTimeOut'
                );
                if (needsReload) {
                  hls.loadSource(currentUrl());
                } else {
                  hls.startLoad();
                }
              }, delay);
            } else if (urlIndex < urlsToTry.length - 1) {
              // Try next CDN URL
              urlIndex++;
              (hls as any)._networkRetryCount = 0;
              logger.info('Trying alternate CDN URL...', { urlIndex, url: currentUrl() });
              setError('Trying alternate source...');
              tryLoad();
            } else if (stream.isLive) {
              // Live stream: cycle back through all URLs and keep retrying — never give up
              urlIndex = 0;
              (hls as any)._networkRetryCount = 0;
              logger.info('All URLs exhausted on live stream, cycling back in 15s...');
              setError('Reconnecting...');
              setTimeout(() => tryLoad(), 15000);
            } else {
              // Ended/recording stream: give up
              setError('Stream unavailable');
              setStreamEnded(true);
            }
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            logger.info('Attempting media error recovery...');
            hls.recoverMediaError();
          } else {
            // Other fatal errors (e.g. internal): only end for non-live streams
            if (!stream.isLive) {
              hls.destroy();
              setStreamEnded(true);
            } else {
              // For live streams, try reloading the source instead of ending
              logger.warn('Non-network fatal error on live stream, reloading source...');
              setError('Reconnecting...');
              setTimeout(() => hls.loadSource(currentUrl()), 5000);
            }
          }
        } else {
          logger.warn('HLS Non-fatal error', { type: data.type, details: data.details });
        }
      });

      hlsRef.current = hls;
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = currentUrl();
    }

    videoPlaybackManager.register(videoId, () => {
      video.pause();
      setIsPlaying(false);
    });

    return () => {
      hlsRef.current?.destroy();
      videoPlaybackManager.unregister(videoId);
    };
  }, [stream.isLive, stream.thumbnail, videoId, hasPlaybackUrl, urlsToTry]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
      videoPlaybackManager.stop(videoId);
    } else {
      videoPlaybackManager.play(videoId);
      video.play().catch(() => {
        setError('Failed to play stream');
      });
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying, videoId]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = !isMuted;
    setIsMuted(!isMuted);
    videoPlaybackManager.globalMuted = !isMuted;
  }, [isMuted]);

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

  const handleLike = useCallback(async () => {
    if (!isAuthenticated) {
      toast.error('Sign in to like');
      return;
    }
    try {
      await like(stream.id);
      setIsLiked(true);
      toast.success('Stream liked!');
    } catch (err) {
      console.error('[LiveStream] Like failed:', err);
      toast.error('Failed to like stream');
    }
  }, [stream.id, isAuthenticated, like]);

  const handleSendGift = useCallback(async () => {
    if (!isAuthenticated) {
      toast.error('Sign in to send gifts');
      return;
    }
    const amount = parseFloat(giftAmount);
    if (!amount || amount <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    try {
      await gift(stream.id, { amount, currency: giftCurrency });
      toast.success(`Sent ${amount} ${giftCurrency} gift!`);
      setGiftAmount('');
      setShowGiftDrawer(false);
    } catch (err) {
      console.error('[LiveStream] Gift failed:', err);
      toast.error('Failed to send gift');
    }
  }, [stream.id, isAuthenticated, gift, giftAmount, giftCurrency]);

  const handleEndStream = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      await end(stream.id);
      setStreamEnded(true);
      toast.success('Stream ended');
    } catch (err) {
      console.error('[LiveStream] End failed:', err);
      toast.error('Failed to end stream');
    }
  }, [stream.id, isAuthenticated, end]);

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'like': return <Heart className="w-3 h-3 text-red-400" />;
      case 'gift': return <Gift className="w-3 h-3 text-yellow-400" />;
      case 'join': return <Activity className="w-3 h-3 text-green-400" />;
      case 'leave': return <Activity className="w-3 h-3 text-zinc-500" />;
      default: return <Activity className="w-3 h-3 text-zinc-400" />;
    }
  };

  return (
    <div className="rounded-xl border border-white/[0.08] bg-transparent p-3 isolate">
      {/* Header with AI and menu buttons */}
      <div className="flex items-center justify-between">
        <CardHeader
          username={stream.streamer}
          handle={stream.creatorUsername}
          avatarSeed={stream.avatar}
          contentType="live"
          isLive={stream.isLive && !streamEnded}
          creatorId={stream.creatorId}
          creatorUsername={stream.creatorUsername}
        />
        <div className="flex items-center gap-1 pr-3">
          {/* Like button */}
          {!streamEnded && (
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
          )}
          {/* Gift button */}
          {!streamEnded && (
            <motion.button
              onClick={() => setShowGiftDrawer(true)}
              className="text-zinc-400 hover:text-yellow-400 transition-colors"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              aria-label="Send gift"
            >
              <Gift className="w-5 h-5" />
            </motion.button>
          )}
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
              <button onClick={(e) => { if (!walletAddress) { e.preventDefault(); e.stopPropagation(); openLoginModal(); } }} className="w-8 h-8 rounded-xl flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
                <MoreVertical className="w-5 h-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-zinc-800 border-zinc-700">
              <DropdownMenuItem
                onClick={() => setShowActivityLog(true)}
                className="text-white hover:bg-zinc-700 cursor-pointer gap-2"
              >
                <Activity className="w-4 h-4" /> {t('postOptions.activityLog')}
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
              {/* End stream - only for the stream creator while live */}
              {!streamEnded && isAuthenticated && isStreamOwner && (
                <DropdownMenuItem
                  onClick={handleEndStream}
                  disabled={isEnding}
                  className="text-red-400 hover:bg-zinc-700 cursor-pointer gap-2"
                >
                  {isEnding ? <Loader2 className="w-4 h-4 animate-spin" /> : <StopCircle className="w-4 h-4" />}
                  {t('postOptions.endStream')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Video Player or Stream Ended State */}
      <div ref={containerRef} className="aspect-video bg-black relative rounded-lg overflow-hidden">
        {streamEnded ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900">
            <div
              className="absolute inset-0 bg-cover bg-center opacity-20"
              style={{ backgroundImage: `url(${stream.thumbnail})` }}
            />
            <div className="relative z-10 flex flex-col items-center gap-4 text-center px-4">
              <div className="w-16 h-16 rounded-xl bg-zinc-800 flex items-center justify-center">
                <Radio className="w-8 h-8 text-zinc-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white mb-1">Stream Ended</h3>
                <p className="text-sm text-zinc-400">
                  This stream is no longer live. Check back later for more content.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              className="w-full h-full object-contain"
              playsInline
              muted={isMuted}
              poster={stream.thumbnail}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setStreamEnded(true)}
            />
            {/* Reconnecting overlay — shown on top of video while retrying */}
            {error && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <div className="flex flex-col items-center gap-2 text-center px-4">
                  <Loader2 className="w-6 h-6 text-white animate-spin" />
                  <p className="text-white/80 text-sm">{error}</p>
                </div>
              </div>
            )}
            
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 hover:opacity-100 transition-opacity">
              <button
                onClick={togglePlay}
                className="w-16 h-16 rounded-xl bg-black/40 backdrop-blur-[24px] saturate-[180%] flex items-center justify-center border border-white/10 hover:bg-black/60 transition-colors"
              >
                <Play className="w-8 h-8 text-white fill-white ml-1" />
              </button>
            </div>
            
            <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent opacity-0 hover:opacity-100 transition-opacity">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-red-500 text-white text-xs font-semibold rounded">
                    LIVE
                  </span>
                  <span className="text-white text-sm">{stream.viewers} tuned in</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleMute}
                    className="p-2 text-white hover:bg-white/20 rounded transition-colors"
                  >
                    {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                  </button>
                  <button
                    onClick={toggleFullscreen}
                    className="p-2 text-white hover:bg-white/20 rounded transition-colors"
                  >
                    <Maximize className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Info & Actions */}
      <div className="pt-3">
        <ActionBar 
          postId={stream.id} 
          className="p-0 mb-2" 
          onComment={() => setShowComments(true)}
          onLike={handleLike}
          likeCount={stream.likeCount}
          commentCount={stream.commentCount}
        />
        {!streamEnded && (
          <p className="font-semibold text-white text-sm">{stream.viewers} tuned in</p>
        )}
        <h3 className="text-white text-sm mt-1">{stream.title}</h3>
        <p className="text-zinc-500 text-xs mt-1">{stream.game}</p>
      </div>

      {/* Comments Drawer */}
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

      {/* Gift Drawer */}
      <Drawer open={showGiftDrawer} onOpenChange={setShowGiftDrawer}>
        <DrawerContent glass className="px-4 pb-8">
          <DrawerHeader className="border-b border-white/10 mb-4">
            <DrawerTitle className="text-white flex items-center gap-2">
              <Gift className="w-5 h-5 text-yellow-400" />
              Send a Gift
            </DrawerTitle>
          </DrawerHeader>
          <div className="space-y-4">
            {/* Balance display */}
            <div className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-2.5 border border-white/10">
              <span className="text-xs text-zinc-400">Your balance</span>
              <div className="flex items-center gap-1.5">
                <img
                  src={giftCurrency === 'DHB' ? dehubCoin : usdcLogo}
                  alt={giftCurrency}
                  className="w-4 h-4"
                />
                <span className="text-sm font-medium text-white">
                  {balanceLoading ? '...' : giftCurrency === 'DHB' ? (dhbBalance ?? '—') : '—'}
                </span>
                <span className="text-xs text-zinc-500">{giftCurrency}</span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-zinc-400">Amount</label>
              <Input
                type="number"
                value={giftAmount}
                onChange={(e) => setGiftAmount(e.target.value)}
                placeholder="Enter amount"
                className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
                min="0"
                step="0.01"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-zinc-400">Currency</label>
              <div className="flex gap-2">
                {['DHB', 'USDC'].map((c) => (
                  <button
                    key={c}
                    onClick={() => setGiftCurrency(c)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                      giftCurrency === c
                        ? 'bg-white text-black'
                        : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <Button
              onClick={handleSendGift}
              disabled={isSendingGift || !giftAmount}
              className="w-full bg-yellow-500 hover:bg-yellow-600 text-black py-5 font-semibold rounded-xl"
            >
              {isSendingGift ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Gift className="w-4 h-4 mr-2" />
              )}
              Send Gift
            </Button>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Activity Log Drawer */}
      <Drawer open={showActivityLog} onOpenChange={setShowActivityLog}>
        <DrawerContent glass className="px-4 pb-8 max-h-[70vh]">
          <DrawerHeader className="border-b border-white/10 mb-4">
            <DrawerTitle className="text-white flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Stream Activity
            </DrawerTitle>
          </DrawerHeader>
          <div className="overflow-y-auto space-y-1">
            {activitiesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
              </div>
            ) : activities.length === 0 ? (
              <p className="text-center text-zinc-500 text-sm py-8">No activity yet</p>
            ) : (
              activities.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-center gap-3 py-2 px-3 rounded-xl hover:bg-zinc-800/50 transition-colors"
                >
                  {getActivityIcon(activity.type)}
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-white font-medium">
                      {activity.username || activity.address?.slice(0, 8)}
                    </span>
                    <span className="text-sm text-zinc-400 ml-1.5">
                      {activity.type === 'gift'
                        ? `sent ${activity.giftAmount} ${activity.giftCurrency}`
                        : activity.type === 'like'
                        ? 'liked the stream'
                        : activity.type === 'join'
                        ? 'joined'
                        : activity.type === 'leave'
                        ? 'left'
                        : activity.message || activity.type}
                    </span>
                  </div>
                  <span className="text-xs text-zinc-500 flex-shrink-0">
                    {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                  </span>
                </div>
              ))
            )}
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
          caption: `${streamEnded ? 'Ended stream' : 'Playing'} ${stream.game}${!streamEnded ? ` with ${stream.viewers} viewers` : ''}`,
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
