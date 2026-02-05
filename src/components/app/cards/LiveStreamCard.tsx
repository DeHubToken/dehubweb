/**
 * Live Stream Card Component
 * ==========================
 * Displays a live stream with video player and "stream ended" fallback state.
 * Used on single post pages for live content that may or may not still be broadcasting.
 * 
 * @example
 * ```tsx
 * <LiveStreamCard stream={liveStreamData} />
 * ```
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Sparkles, MoreVertical, Flag, Ban, EyeOff, Bell, 
  Play, Volume2, VolumeX, Maximize, Radio
} from 'lucide-react';
import Hls from 'hls.js';
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
import { videoPlaybackManager } from '@/lib/video-playback-manager';
import type { LiveStream } from '@/types/feed.types';

interface LiveStreamCardProps {
  stream: LiveStream;
}

export function LiveStreamCard({ stream }: LiveStreamCardProps) {
  const [showComments, setShowComments] = useState(false);
  const [showAIChat, setShowAIChat] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(videoPlaybackManager.globalMuted);
  const [streamEnded, setStreamEnded] = useState(!stream.isLive);
  const [error, setError] = useState<string | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const videoId = `live-${stream.id}`;

  // Initialize HLS player for live streams
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream.isLive) return;

    // Assume stream URL would be in thumbnail for now (placeholder logic)
    // In real implementation, this would come from the stream data
    const streamUrl = stream.thumbnail;
    
    if (!streamUrl || !streamUrl.includes('.m3u8')) {
      // No valid stream URL, show ended state
      setStreamEnded(true);
      return;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
      });
      
      hls.loadSource(streamUrl);
      hls.attachMedia(video);
      
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            setError('Stream unavailable');
            setStreamEnded(true);
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          }
        }
      });
      
      hlsRef.current = hls;
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl;
    }

    // Register with playback manager
    videoPlaybackManager.register(videoId, () => {
      video.pause();
      setIsPlaying(false);
    });

    return () => {
      hlsRef.current?.destroy();
      videoPlaybackManager.unregister(videoId);
    };
  }, [stream.isLive, stream.thumbnail, videoId]);

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
    const video = videoRef.current;
    if (!video) return;

    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      video.requestFullscreen();
    }
  }, []);

  return (
    <div className="bg-zinc-900 rounded-2xl overflow-hidden isolate">
      {/* Header with AI and menu buttons */}
      <div className="flex items-center justify-between">
        <CardHeader
          username={stream.streamer}
          avatarSeed={stream.avatar}
          contentType="live"
          isLive={stream.isLive && !streamEnded}
          creatorId={stream.creatorId}
          creatorUsername={stream.creatorUsername}
        />
        <div className="flex items-center gap-1 pr-3">
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
              <button className="w-8 h-8 rounded-xl flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
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

      {/* Video Player or Stream Ended State */}
      <div className="aspect-video bg-black relative">
        {streamEnded || error ? (
          // Stream Ended State
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900">
            {/* Thumbnail as background with overlay */}
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
          // Live Video Player
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
            
            {/* Video Controls Overlay */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 hover:opacity-100 transition-opacity">
              <button
                onClick={togglePlay}
                className="w-16 h-16 rounded-xl bg-black/40 backdrop-blur-[24px] saturate-[180%] flex items-center justify-center border border-white/10 hover:bg-black/60 transition-colors"
              >
                <Play className="w-8 h-8 text-white fill-white ml-1" />
              </button>
            </div>
            
            {/* Bottom Controls */}
            <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent opacity-0 hover:opacity-100 transition-opacity">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-red-500 text-white text-xs font-semibold rounded">
                    LIVE
                  </span>
                  <span className="text-white text-sm">{stream.viewers} watching</span>
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
      <div className="p-3">
        <ActionBar 
          postId={stream.id} 
          className="p-0 mb-2" 
          onComment={() => setShowComments(true)}
          likeCount={stream.likeCount}
          commentCount={stream.commentCount}
        />
        {!streamEnded && (
          <p className="font-semibold text-white text-sm">{stream.viewers} watching</p>
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
