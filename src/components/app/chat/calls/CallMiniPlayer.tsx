/**
 * CallMiniPlayer - Floating mini player for active calls
 * Similar to StageMiniPlayer / PiP — shows when call drawer is minimized.
 */

import { Mic, MicOff, PhoneOff, Maximize2, Phone, Video } from 'lucide-react';
import { motion, useDragControls } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useCall } from '@/contexts/CallContext';
import { useEffect, useState } from 'react';
import { getAccountInfo } from '@/lib/api/dehub/users';

export function CallMiniPlayer() {
  const {
    isCallActive,
    isConnecting,
    isIncoming,
    currentCall,
    isMuted,
    callDuration,
    isMinimized,
    toggleMute,
    endCall,
    maximizeCall,
  } = useCall();

  const dragControls = useDragControls();
  const [peerName, setPeerName] = useState<string | null>(null);

  const peerAddress = currentCall
    ? (isIncoming ? currentCall.caller_address : currentCall.recipient_address)
    : '';

  useEffect(() => {
    if (!peerAddress) return;
    setPeerName(null);
    getAccountInfo(peerAddress).then(u => {
      if (u?.username) setPeerName(u.username);
    }).catch(() => {});
  }, [peerAddress]);

  const isVisible = isMinimized && (isCallActive || isConnecting) && currentCall;

  if (!isVisible) return null;

  const displayName = peerName || (peerAddress ? `${peerAddress.slice(0, 6)}...${peerAddress.slice(-4)}` : '');
  const isVideo = currentCall.call_type === 'video';
  const statusText = isConnecting ? 'Connecting...' : callDuration !== '00:00' ? callDuration : 'Connected';

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
        {/* Drag handle + info */}
        <div
          className="flex items-center gap-2 px-3 pt-2.5 pb-1 cursor-grab active:cursor-grabbing"
          onPointerDown={(e) => dragControls.start(e)}
        >
          {/* Live pulse */}
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>

          {isVideo ? (
            <Video className="w-3.5 h-3.5 text-white/60 shrink-0" />
          ) : (
            <Phone className="w-3.5 h-3.5 text-white/60 shrink-0" />
          )}

          <span className="text-white text-xs font-medium truncate max-w-[100px]">
            {displayName}
          </span>

          <span className="ml-auto text-[10px] text-white/40">
            {statusText}
          </span>
        </div>

        {/* Controls */}
        <div className="relative flex items-center justify-center gap-2 px-3 pb-2.5 pt-1">
          <button
            onClick={toggleMute}
            className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center transition-all",
              isMuted
                ? "bg-red-500/80 hover:bg-red-500 text-white"
                : "bg-white/10 hover:bg-white/20 text-white"
            )}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          <button
            onClick={endCall}
            className="w-8 h-8 rounded-full bg-red-500/80 hover:bg-red-500 flex items-center justify-center text-white transition-all"
            title="End call"
          >
            <PhoneOff className="w-4 h-4" />
          </button>

          <button
            onClick={maximizeCall}
            className="absolute right-3 text-white/50 hover:text-white transition-colors"
            title="Expand"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
