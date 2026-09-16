/**
 * CallMiniPlayer - Floating mini player for active calls
 * Similar to StageMiniPlayer / PiP — shows when call drawer is minimized.
 * For video calls, shows a 16:9 webcam preview.
 */

import { Mic, MicOff, PhoneOff, Maximize2, Phone, Video } from 'lucide-react';
import { motion, useDragControls } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useCall } from '@/contexts/CallContext';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { usePeerIdentity } from './CallChrome';

export function CallMiniPlayer() {
  const {
    isCallActive,
    isConnecting,
    isIncoming,
    currentCall,
    isMuted,
    isCameraOff,
    callDuration,
    isMinimized,
    toggleMute,
    endCall,
    maximizeCall,
    localVideoTrack,
  } = useCall();

  const dragControls = useDragControls();
  const { t } = useTranslation();
  const miniVideoContainerRef = useRef<HTMLDivElement>(null);

  const peerAddress = currentCall
    ? (isIncoming ? currentCall.caller_address : currentCall.recipient_address)
    : '';
  const peer = usePeerIdentity(peerAddress);

  // Play local video track into mini player container
  useEffect(() => {
    if (!isMinimized || !localVideoTrack?.current || !miniVideoContainerRef.current) return;
    if (currentCall?.call_type !== 'video') return;

    const container = miniVideoContainerRef.current;
    // Clear previous children
    container.innerHTML = '';

    try {
      localVideoTrack.current.play(container);
    } catch (e) {
      console.warn('Mini player video play error:', e);
    }

    return () => {
      container.innerHTML = '';
    };
  }, [isMinimized, localVideoTrack, currentCall?.call_type]);

  const isVisible = isMinimized && (isCallActive || isConnecting) && currentCall;

  if (!isVisible) return null;

  const displayName = peer.name;
  const isVideo = currentCall.call_type === 'video';
  const statusText = isConnecting
    ? t('calls.connecting')
    : callDuration !== '00:00'
      ? callDuration
      : t('calls.connected');

  if (isVideo) {
    return (
      <motion.div
        drag
        dragControls={dragControls}
        dragMomentum={false}
        dragElastic={0}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="fixed bottom-20 right-4 z-50 select-none"
        style={{ touchAction: 'none' }}
      >
        <div className="bg-black/40 backdrop-blur-[24px] border border-white/10 rounded-2xl shadow-2xl overflow-hidden w-[240px]">
          {/* Video preview - 16:9 */}
          <div
            ref={miniVideoContainerRef}
            className="w-full bg-black/60 relative cursor-grab active:cursor-grabbing"
            style={{ aspectRatio: '16/9' }}
            onPointerDown={(e) => dragControls.start(e)}
          >
            {isCameraOff && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <Video className="w-6 h-6 text-muted-foreground" />
              </div>
            )}
          </div>

          {/* Info bar */}
          <div className="flex items-center gap-2 px-3 py-1.5">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-foreground opacity-60" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-foreground" />
            </span>
            <span className="text-foreground text-xs font-medium truncate max-w-[100px]">
              {displayName}
            </span>
            <span className="ml-auto text-[10px] text-muted-foreground">
              {statusText}
            </span>
          </div>

          {/* Controls */}
          <div className="relative flex items-center justify-center gap-2 px-3 pb-2.5 pt-0.5">
            <button
              onClick={toggleMute}
              className={cn(
                "w-8 h-8 rounded-xl flex items-center justify-center transition-all",
                isMuted
                  ? "bg-foreground text-background hover:bg-foreground/90"
                  : "bg-foreground/10 hover:bg-foreground/20 text-foreground"
              )}
              title={isMuted ? t('calls.unmute') : t('calls.mute')}
            >
              {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>

            <button
              onClick={endCall}
              className="w-8 h-8 rounded-xl bg-foreground text-background hover:bg-foreground/90 flex items-center justify-center transition-all"
              title={t('calls.end')}
            >
              <PhoneOff className="w-4 h-4" />
            </button>

            <button
              onClick={maximizeCall}
              className="absolute right-3 text-muted-foreground hover:text-foreground transition-colors"
              title={t('calls.expand')}
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  // Audio call mini player (unchanged)
  return (
    <motion.div
      drag
      dragControls={dragControls}
      dragMomentum={false}
      dragElastic={0}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="fixed bottom-20 right-4 z-50 select-none"
      style={{ touchAction: 'none' }}
    >
      <div className="bg-black/40 backdrop-blur-[24px] border border-white/10 rounded-2xl shadow-2xl overflow-hidden min-w-[180px]">
        <div
          className="flex items-center gap-2 px-3 pt-2.5 pb-1 cursor-grab active:cursor-grabbing"
          onPointerDown={(e) => dragControls.start(e)}
        >
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-foreground opacity-60" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-foreground" />
          </span>
          <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="text-foreground text-xs font-medium truncate max-w-[100px]">
            {displayName}
          </span>
          <span className="ml-auto text-[10px] text-muted-foreground">
            {statusText}
          </span>
        </div>

        <div className="relative flex items-center justify-center gap-2 px-3 pb-2.5 pt-1">
          <button
            onClick={toggleMute}
            className={cn(
              "w-8 h-8 rounded-xl flex items-center justify-center transition-all",
              isMuted
                ? "bg-foreground text-background hover:bg-foreground/90"
                : "bg-foreground/10 hover:bg-foreground/20 text-foreground"
            )}
            title={isMuted ? t('calls.unmute') : t('calls.mute')}
          >
            {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          <button
            onClick={endCall}
            className="w-8 h-8 rounded-xl bg-foreground text-background hover:bg-foreground/90 flex items-center justify-center transition-all"
            title={t('calls.end')}
          >
            <PhoneOff className="w-4 h-4" />
          </button>

          <button
            onClick={maximizeCall}
            className="absolute right-3 text-muted-foreground hover:text-foreground transition-colors"
            title={t('calls.expand')}
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
