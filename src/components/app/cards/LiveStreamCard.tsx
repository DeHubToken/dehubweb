/**
 * Live Stream Card Component
 * ==========================
 * Displays a live stream with video player and "stream ended" fallback state.
 * Wired to DeHub API for likes, gifts, ending streams, and activity logs.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Sparkles, MoreVertical, Flag, Ban, EyeOff, Bell,
  Play, Volume2, VolumeX, Maximize, Minimize,
  Heart, Gift, StopCircle, Activity, Loader2, Bookmark, Info
} from 'lucide-react';
import { useTranslation as useI18n } from 'react-i18next';
import { cn } from '@/lib/utils';
// Type-only: the hls.js runtime (~400 kB raw) loads dynamically at attach time
// so it stays out of the eager feed-card path (see the playback effect below).
import type Hls from 'hls.js';
import { CardHeader } from './CardHeader';
import { ActionBar } from './ActionBar';
import { CommentsWrapper } from './CommentsWrapper';
import { LiveEndedMedia } from './LiveEndedMedia';
import { StreamShopPinnedCard } from '../live/StreamShop';
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
// The WHEP subscriber pulls in peer-connection code and loads on demand at
// attach time (see the playback effect) — a static import here would put it
// on the boot path, since this card is eager via HomeFeed. live-ingest is
// safe to import statically for the same reason: it is pure URL arithmetic
// with no imports of its own.
import { liveSourceFromHlsUrl, whepEndpointFor } from '@/lib/live-ingest';
import type { WhepSubscription } from '@/lib/livepeer/whep';
import { useStreamActions, useStreamActivities } from '@/hooks/use-livestream';
import { useBlockAuthor } from '@/hooks/use-block-author';
import { useAuth } from '@/contexts/AuthContext';
import { useBookmarkPost } from '@/hooks/use-bookmarks';
import { usePostTipCount } from '@/hooks/use-post-tip-count';
// The gift drawer's send is a REAL on-chain DHB tip (StreamController.sendTip
// via useTipPayment — wallet modules load dynamically inside tip()); the
// /api/live gift endpoint only records it afterwards for the activity feed.
import { useTipPayment, MIN_TIP_DHB } from '@/hooks/use-tip-payment';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
// NOTE: stream-controller reaches wallet/contract code (aa-utils → wagmi) and
// this card is eager via HomeFeed — getDHBBalance is dynamically imported at
// call time below so the wallet stack stays out of the entry bundle
// (scripts/check-entry-bundle.mjs fails the build if it leaks in).
import { fromWei, DHB_TOKEN } from '@/lib/contracts/dhb-token';
import { getAuthToken } from '@/lib/api/dehub/core';
import { supabase } from '@/integrations/supabase/client';
import dehubCoin from '@/assets/dehub-coin.png';
import { createLogger } from '@/lib/logger';
import type { LiveStream } from '@/types/feed.types';

const logger = createLogger('LiveStreamCard');

/**
 * How long a negotiated WebRTC session gets to actually deliver a frame.
 * The nasty case is not an error — it is a session that connects cleanly and
 * plays nothing, which has no event to listen for.
 */
const WHEP_START_TIMEOUT_MS = 6000;

interface LiveStreamCardProps {
  stream: LiveStream;
}

export function LiveStreamCard({ stream }: LiveStreamCardProps) {
  const [showComments, setShowComments] = useState(false);
  const { t } = useI18n();
  const navigate = useNavigate();
  // Bookmark state for the mobile/tablet three-dot menu (desktop shows this
  // in the ActionBar's left-anchored utility cluster instead).
  const { isBookmarked, isLoading: isBookmarkLoading, toggleBookmark } = useBookmarkPost(stream.id);
  const openPostInfoPage = useCallback(() => {
    navigate(`/app/post/${stream.id}/info`);
  }, [navigate, stream.id]);
  const [showAIChat, setShowAIChat] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showActivityLog, setShowActivityLog] = useState(false);
  const [showGiftDrawer, setShowGiftDrawer] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMuted, setIsMuted] = useState(videoPlaybackManager.globalMuted);
  const urlsToTry = useMemo(() => [
    stream.playbackUrl,
    ...(stream.playbackUrls || []).filter((u): u is string => !!u && u !== stream.playbackUrl),
  ].filter((u): u is string => !!u && u.includes('.m3u8')), [stream.playbackUrl, stream.playbackUrls]);
  const hasPlaybackUrl = urlsToTry.length > 0;
  // The WebRTC route reuses the id already embedded in the HLS URL, so nothing
  // new has to be threaded through the feed mappers to reach it.
  const whepSource = useMemo(
    () => (stream.isLive ? liveSourceFromHlsUrl(urlsToTry[0]) : null),
    [stream.isLive, urlsToTry]
  );
  const whepPlaybackId = whepSource?.playbackId ?? null;
  const [transport, setTransport] = useState<'whep' | 'hls'>(
    typeof RTCPeerConnection !== 'undefined' && !!whepPlaybackId ? 'whep' : 'hls'
  );
  // If stream.isLive is false, treat as ended immediately — don't try to play a dead HLS URL
  const [streamEnded, setStreamEnded] = useState(!stream.isLive);
  const [error, setError] = useState<string | null>(null);
  const [isLiked, setIsLiked] = useState(false);
  const [giftAmount, setGiftAmount] = useState('');
  const [dhbBalance, setDhbBalance] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  /** One WebRTC attempt per card: once it fails, HLS keeps the element. */
  const whepFailedRef = useRef(false);
  const videoId = `live-${stream.id}`;

  const { isAuthenticated, walletAddress, openLoginModal } = useAuth();
  const queryClient = useQueryClient();
  const isStreamOwner = walletAddress && stream.creatorId &&
    walletAddress.toLowerCase() === stream.creatorId.toLowerCase();
  const { like, gift, end, isLiking, isEnding } = useStreamActions();
  const { blockAuthor } = useBlockAuthor();
  // Every /api/live/{id}/* interaction route takes the Mongo ObjectId, never
  // the NFT tokenId — a tokenId there is a guaranteed CastError 500.
  const apiStreamId = stream.streamId || null;
  const { activities, isLoading: activitiesLoading } = useStreamActivities(
    showActivityLog && apiStreamId ? apiStreamId : null
  );
  const { data: tipCount = 0 } = usePostTipCount(stream.id);

  // stream.isLive routinely flips true AFTER mount: LivePostWithStatus merges
  // the Supabase live flag in asynchronously, and the platform marks streams
  // live before any ingest connects. The ended latch must follow the flip or
  // a viewer landing in that window is stuck on "Stream ended" for a stream
  // that is live — with the <video> never mounted, so playback can't recover.
  useEffect(() => {
    if (stream.isLive) setStreamEnded(false);
  }, [stream.isLive]);

  // Same flip, second consequence: the WebRTC id only exists once the card
  // knows the stream is live, which is usually a beat after mount. Take the
  // fast path when it appears — unless it has already been tried and failed.
  useEffect(() => {
    if (whepPlaybackId && !whepFailedRef.current) setTransport('whep');
  }, [whepPlaybackId]);

  // Fetch DHB balance when gift drawer opens
  useEffect(() => {
    if (!showGiftDrawer || !walletAddress) return;
    let cancelled = false;
    setBalanceLoading(true);
    import('@/lib/contracts/stream-controller')
      .then(m => m.getDHBBalance(walletAddress))
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

  /**
   * WebRTC first, HLS second.
   *
   * HLS is a playlist of finished segments, so a viewer sits 10-20 seconds
   * behind the broadcaster — long enough that a tip or a question lands on a
   * host who has moved on. WHEP plays the same playbackId over WebRTC at about
   * a second. It is not universal (no nearby node, a UDP-hostile network, a
   * stream that never went live), so a failure or a silent connect falls
   * straight back to the ladder below rather than leaving a black frame.
   */
  useEffect(() => {
    if (transport !== 'whep' || streamEnded || !whepPlaybackId) return;
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    let session: WhepSubscription | null = null;

    const fallBack = (reason: string) => {
      if (cancelled) return;
      logger.info('Falling back to HLS', { reason, streamId: stream.id });
      // Latched: without it the promote-on-live effect below would flip the
      // transport straight back and the two would trade the element forever.
      whepFailedRef.current = true;
      setTransport('hls');
    };

    // A session that negotiates but never delivers media is the worst case:
    // no error to catch and nothing on screen. Give it a few seconds, then go.
    const timer = setTimeout(() => {
      if (!cancelled && !video.videoWidth) fallBack('no frames');
    }, WHEP_START_TIMEOUT_MS);

    (async () => {
      try {
        const { subscribeToWhep } = await import('@/lib/livepeer/whep');
        if (cancelled) return;
        session = await subscribeToWhep({
          playbackId: whepPlaybackId,
          endpoint: whepEndpointFor({
            provider: whepSource?.provider,
            playbackId: whepPlaybackId,
          }),
          onStateChange: (state, detail) => {
            if (cancelled) return;
            if (state === 'playing') setError(null);
            else if (state === 'reconnecting') setError('Reconnecting…');
            else if (state === 'failed') fallBack(detail || 'connection failed');
          },
        });
        if (cancelled) {
          await session.stop();
          return;
        }
        video.srcObject = session.stream;
        await video.play().catch(() => undefined);
        videoPlaybackManager.register(videoId, () => {
          video.pause();
          setIsPlaying(false);
        });
      } catch (e) {
        fallBack((e as Error)?.message || 'subscribe failed');
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      videoPlaybackManager.unregister(videoId);
      void session?.stop();
      // Leaving a dead srcObject attached stops the HLS path from ever
      // getting a picture onto this element.
      if (video.srcObject) video.srcObject = null;
    };
  }, [transport, whepPlaybackId, streamEnded, videoId, stream.id]);

  useEffect(() => {
    if (transport !== 'hls') return;
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

    // Prefer native HLS wherever the browser provides it (Safari + every iOS
    // browser): the hardware media pipeline runs far cooler than hls.js's
    // software MSE, and it skips the ~540 kB hls.js download. iOS 17+ added
    // MediaSource, so the old `!('MediaSource' in window)` guard wrongly routed
    // modern iPhones through the hls.js decoder that was overheating them.
    // Chrome/Firefox/Android return "" here and fall through to hls.js below.
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native playback has none of hls.js's built-in resilience, so re-create
      // the essentials here: multi-CDN failover through urlsToTry, bounded
      // reconnect attempts for live streams, and the error overlay.
      let nativeUrlIndex = 0;
      let nativeRetries = 0;
      const nativeTimeouts = new Set<ReturnType<typeof setTimeout>>();
      const scheduleNative = (fn: () => void, delay: number) => {
        const id = setTimeout(() => {
          nativeTimeouts.delete(id);
          fn();
        }, delay);
        nativeTimeouts.add(id);
      };
      const loadCurrent = () => {
        video.src = urlsToTry[nativeUrlIndex];
        video.load();
      };
      const onNativeError = () => {
        if (nativeUrlIndex < urlsToTry.length - 1) {
          nativeUrlIndex++;
          setError('Trying alternate source...');
          loadCurrent();
        } else if (stream.isLive && nativeRetries < 5) {
          nativeRetries++;
          nativeUrlIndex = 0;
          setError('Reconnecting...');
          scheduleNative(loadCurrent, 3000 * nativeRetries);
        } else {
          setError('Stream unavailable');
          if (!stream.isLive) setStreamEnded(true);
        }
      };
      const onNativePlaying = () => {
        nativeRetries = 0;
        setError(null);
      };
      video.addEventListener('error', onNativeError);
      video.addEventListener('playing', onNativePlaying);
      video.src = urlsToTry[0];
      videoPlaybackManager.register(videoId, () => {
        video.pause();
        setIsPlaying(false);
      });
      return () => {
        nativeTimeouts.forEach(clearTimeout);
        video.removeEventListener('error', onNativeError);
        video.removeEventListener('playing', onNativePlaying);
        videoPlaybackManager.unregister(videoId);
      };
    }

    let disposed = false;
    // Retry timers must die with the effect — a timer firing after cleanup
    // would call loadSource/startLoad on a destroyed hls instance.
    const retryTimeouts = new Set<ReturnType<typeof setTimeout>>();
    const scheduleRetry = (fn: () => void, delay: number) => {
      const id = setTimeout(() => {
        retryTimeouts.delete(id);
        if (disposed) return;
        fn();
      }, delay);
      retryTimeouts.add(id);
    };
    (async () => {
    const { default: Hls } = await import('hls.js');
    if (disposed) return;
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
              scheduleRetry(() => {
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
              scheduleRetry(tryLoad, 15000);
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
              scheduleRetry(() => hls.loadSource(currentUrl()), 5000);
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
    })().catch(() => {
      // hls.js chunk failed to load (flaky network / deploy skew)
      if (!disposed) setError('Stream unavailable');
    });

    videoPlaybackManager.register(videoId, () => {
      video.pause();
      setIsPlaying(false);
    });

    return () => {
      disposed = true;
      retryTimeouts.forEach(clearTimeout);
      retryTimeouts.clear();
      hlsRef.current?.destroy();
      videoPlaybackManager.unregister(videoId);
    };
    // streamEnded is a dependency on purpose: the <video> only mounts when it
    // is false, and when the late-isLive resync clears the latch this effect
    // must run again on the re-render that mounts the element — the isLive
    // flip alone fires it one render too early, against a null videoRef.
  }, [stream.isLive, stream.thumbnail, videoId, hasPlaybackUrl, urlsToTry, streamEnded, transport]);

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
    // Exit simulated fullscreen (SafePal/WebView)
    if (isFullscreen && !document.fullscreenElement && !(document as any).webkitFullscreenElement) {
      setIsFullscreen(false);
      return;
    }

    if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
      (document as any).webkitExitFullscreen?.();
    } else {
      const el = containerRef.current as any;
      if (!el) return;
      const activateSimulated = () => {
        if (!document.fullscreenElement && !(document as any).webkitFullscreenElement) {
          setIsFullscreen(true);
        }
      };
      if (el.requestFullscreen) {
        el.requestFullscreen().catch(activateSimulated);
        setTimeout(activateSimulated, 300);
      } else if (el.webkitRequestFullscreen) {
        try { el.webkitRequestFullscreen(); } catch { activateSimulated(); }
        setTimeout(activateSimulated, 300);
      } else {
        setIsFullscreen(true);
      }
    }
  }, [isFullscreen]);

  const handleLike = useCallback(async () => {
    if (!isAuthenticated) {
      toast.error('Sign in to like');
      return;
    }
    const streamStatus = (stream as any).status || (stream as any).stream?.status;
    if (streamStatus && String(streamStatus).toLowerCase() === 'ended') {
      toast.info('Stream ended, tune in live to engage');
      return;
    }
    if (!apiStreamId) {
      toast.error('Likes are unavailable for this stream right now');
      return;
    }
    try {
      // The backend toggles: an already-liked address gets un-liked and the
      // response says so — reflect that instead of always claiming a like.
      const res = await like(apiStreamId);
      const nowLiked = res?.isLiked !== false;
      setIsLiked(nowLiked);
      toast.success(nowLiked ? 'Stream liked!' : 'Like removed');
    } catch (err) {
      console.error('[LiveStream] Like failed:', err);
      toast.error('Failed to like stream');
    }
  }, [apiStreamId, isAuthenticated, like, stream]);

  // The on-chain tip path encodes the tokenId with BigInt(), so it must be
  // the numeric NFT tokenId — the livestream-API fallback route can hand this
  // card a 24-hex Mongo _id as stream.id, which would throw mid-flow (after
  // a possible approval tx). Gate gifting on it instead.
  const numericTokenId = /^\d+$/.test(stream.id) ? stream.id : undefined;

  // The real payment: an on-chain DHB tip to the streamer on Base, recorded
  // in tip_records under the NFT tokenId (feeding the post tip counter and
  // the backend's receivedTips crediting). onSubmitted then records it on the
  // stream itself so the activity log and GiftSent broadcast fire.
  const { tip: sendGiftTip, isTipping: isSendingGift } = useTipPayment({
    creatorAddress: stream.creatorId,
    tokenId: numericTokenId,
    onSubmitted: (txHash, amount) => {
      queryClient.setQueryData(['post-tip-count', stream.id], (old: number | undefined) => (old || 0) + amount);
      if (!apiStreamId || !stream.creatorId) return;
      const payload = {
        transactionHash: txHash,
        tokenId: stream.id,
        amount,
        recipient: stream.creatorId,
        tokenAddress: DHB_TOKEN.address,
        timestamp: Date.now(),
      };
      // The backend accepts gift records only while ITS status is LIVE or
      // PAUSED, which flips on the Livepeer ingest webhook — often seconds
      // after this card already renders live (the platform flags streams
      // live before ingest connects). Retry with backoff so a gift sent in
      // that window still lands in the activity feed. The DHB itself already
      // moved on-chain either way.
      const record = (attempt: number) => {
        gift(apiStreamId, payload).catch((err) => {
          if (attempt < 3) {
            setTimeout(() => record(attempt + 1), attempt === 1 ? 8000 : 20000);
          } else {
            logger.warn('Gift activity record failed after retries', err);
          }
        });
      };
      record(1);
    },
    onSuccess: () => {
      setGiftAmount('');
      setShowGiftDrawer(false);
    },
  });

  const handleSendGift = useCallback(() => {
    if (!isAuthenticated) {
      toast.error('Sign in to send gifts');
      return;
    }
    if (streamEnded) {
      toast.info('Stream ended, tune in live to engage');
      return;
    }
    if (!numericTokenId) {
      toast.error('Gifting is unavailable for this stream');
      return;
    }
    const amount = parseFloat(giftAmount);
    if (!amount || amount < MIN_TIP_DHB) {
      toast.error(`Minimum gift is ${MIN_TIP_DHB} DHB`);
      return;
    }
    // Full on-chain flow with its own progress/error toasts; onSuccess above
    // closes the drawer.
    sendGiftTip(amount);
  }, [isAuthenticated, streamEnded, numericTokenId, giftAmount, sendGiftTip]);

  const handleEndStream = useCallback(async () => {
    if (!isAuthenticated) return;
    // PATCH /api/live/{id}/settings requires the Mongo ObjectId. Without it
    // the old code fell back to the tokenId, which endLiveStream silently
    // skips — the UI said "Stream ended" while every other surface kept the
    // stream live. Note the PATCH plants the client-honored settings marker;
    // the backend's own status only transitions once ingest stops and the
    // Livepeer idle webhook fires.
    if (!apiStreamId) {
      toast.error('Could not end the stream from here — use the Go Live panel');
      return;
    }
    try {
      await end(apiStreamId);
      // Also clear the Supabase live-session row: it is what keeps this post
      // rendering as live for viewers whenever the API status lags or fails.
      const token = getAuthToken();
      const addr = walletAddress?.toLowerCase();
      if (token && addr) {
        supabase.functions.invoke('end-stream-session', {
          body: { tokenId: stream.id },
          headers: { 'x-wallet-address': addr, 'x-dehub-token': token },
        }).then(({ error: fnError }) => {
          if (fnError) logger.warn('end-stream-session failed (non-blocking)', fnError);
        }).catch((e) => logger.warn('end-stream-session failed (non-blocking)', e));
      }
      setStreamEnded(true);
      toast.success('Stream ended');
    } catch (err) {
      console.error('[LiveStream] End failed:', err);
      toast.error('Failed to end stream');
    }
  }, [stream.id, apiStreamId, isAuthenticated, end, walletAddress]);

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
          badgeBalance={stream.creatorBadgeBalance}
        />
        <div className="flex items-center gap-2 pr-3">
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
            <Sparkles className="w-[23.5px] h-[23.5px]" />
          </motion.button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button onClick={(e) => { if (!walletAddress) { e.preventDefault(); e.stopPropagation(); openLoginModal(); } }} aria-label="Post options" className="w-8 h-[37.5px] rounded-xl flex items-start justify-center pt-[6.25px] text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
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
              {!isStreamOwner && (
                <DropdownMenuItem
                  onClick={() => {
                    if (!walletAddress) { openLoginModal(); return; }
                    if (!stream.creatorId) return;
                    blockAuthor(stream.creatorId, stream.streamer || undefined);
                  }}
                  className="text-white hover:bg-zinc-700 cursor-pointer gap-2"
                >
                  <Ban className="w-4 h-4" /> {t('postOptions.blockCreator')}
                </DropdownMenuItem>
              )}
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
      <div ref={containerRef} data-media-full className={`aspect-video bg-black relative rounded-lg overflow-hidden${isFullscreen ? ' fixed inset-0 z-[9999] !aspect-auto w-screen h-screen rounded-none' : ''}`}>
        {streamEnded && stream.replayUrl ? (
          /* The broadcast is over but the recording was captured: play that
             instead of the tombstone. A plain mp4 off our own CDN, so no
             hls.js and no retry ladder — native controls are the whole
             player. */
          <>
            <video
              className="w-full h-full object-contain"
              src={stream.replayUrl}
              poster={stream.thumbnail || undefined}
              controls
              playsInline
              preload="metadata"
              {...{"webkit-playsinline": ""}}
            />
            {/* PARTIAL when the capture was cut to the creator's daily
                allowance — presenting the opening stretch as the whole
                broadcast would be a lie viewers notice mid-video. */}
            <span
              className="absolute top-3 left-3 rounded bg-black/70 px-2 py-0.5 text-xs font-semibold text-white"
              title={
                stream.replayTruncated
                  ? 'Only the start of this stream was kept — the replay hit the creator’s daily limit'
                  : undefined
              }
            >
              {stream.replayTruncated ? 'PARTIAL REPLAY' : 'REPLAY'}
            </span>
          </>
        ) : streamEnded ? (
          /* Past live with nothing recorded: show the stream's cover image if
             there is one, otherwise a staticy TV screen — never an empty
             black frame. */
          <LiveEndedMedia thumbnail={stream.thumbnail} label="Stream ended" rounded="rounded-none" />
        ) : (
          <>
            <video
              ref={videoRef}
              className="w-full h-full object-contain"
              playsInline
              {...{"webkit-playsinline": ""}}
              muted={isMuted}
              poster={stream.thumbnail || undefined}
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
                  <span data-live-badge className="px-2 py-0.5 bg-red-500 text-white text-xs font-semibold rounded">
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
                    {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            </div>

            {/* The product the host has put "on air". Sits inside the player
                container so it survives fullscreen, and above the control bar
                so it never covers play/mute. Renders nothing until something
                is pinned. */}
            <StreamShopPinnedCard tokenId={stream.id} />
          </>
        )}
      </div>

      {/* Info & Actions */}
      <div className="pt-3">
        <ActionBar
          postId={stream.id}
          utilityDesktopAnchor
          className="p-0 mb-2"
          onComment={() => setShowComments(prev => !prev)}
          onLike={handleLike}
          likeCount={stream.likeCount}
          commentCount={stream.commentCount}
          tipCount={tipCount}
          onTip={() => setShowGiftDrawer(true)}
        />
        {!streamEnded && (
          <p className="font-semibold text-white text-sm">{stream.viewers} tuned in</p>
        )}
        <h3 className="text-white text-sm mt-1">{stream.title}</h3>
        <p className="text-zinc-500 text-xs mt-1">{stream.game}</p>
      </div>

      {/* Comments */}
      <CommentsWrapper
        open={showComments}
        onOpenChange={setShowComments}
        tokenId={stream.id}
      />

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
            {/* Balance display — gifts move real DHB, so show the real balance */}
            <div className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-2.5 border border-white/10">
              <span className="text-xs text-zinc-400">Your balance</span>
              <div className="flex items-center gap-1.5">
                <img src={dehubCoin} alt="DHB" className="w-4 h-4" />
                <span className="text-sm font-medium text-white">
                  {balanceLoading ? '...' : (dhbBalance ?? '—')}
                </span>
                <span className="text-xs text-zinc-500">DHB</span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-zinc-400">Amount (DHB)</label>
              <Input
                type="number"
                value={giftAmount}
                onChange={(e) => setGiftAmount(e.target.value)}
                placeholder="Enter amount"
                className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
                min={MIN_TIP_DHB}
                step="1"
              />
              <p className="text-[11px] text-zinc-500">
                Sent on-chain to the streamer's wallet and shown in the stream activity.
              </p>
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
                    {activity.timestamp && !Number.isNaN(new Date(activity.timestamp).getTime())
                      ? formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })
                      : ''}
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
