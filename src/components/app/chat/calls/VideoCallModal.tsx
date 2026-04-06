import React, { useState, useEffect } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, RotateCcw } from 'lucide-react';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { useCall } from '@/contexts/CallContext';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { getAccountInfo } from '@/lib/api/dehub/users';

const VideoCallModal: React.FC = () => {
  const { walletAddress } = useAuth();
  const {
    isCallActive,
    isIncoming,
    currentCall,
    isConnecting,
    isMuted,
    isCameraOff,
    localVideoRef,
    remoteVideoRef,
    endCall,
    acceptCall,
    rejectCall,
    toggleMute,
    toggleCamera,
    switchCamera,
    isMinimized,
    minimizeCall,
  } = useCall();

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

  if (!walletAddress) return null;

  const isVisible = (isCallActive || isIncoming || isConnecting) && currentCall?.call_type === 'video';

  if (!isVisible || !currentCall || isMinimized) {
    return null;
  }

  const displayName = peerName ? `@${peerName}` : (peerAddress ? `${peerAddress.slice(0, 6)}...${peerAddress.slice(-4)}` : '');
  const statusText = isIncoming ? 'Incoming video call' : isConnecting ? 'Connecting...' : 'Connected';

  return (
    <Drawer open={isVisible && !isMinimized} onOpenChange={(open) => { if (!open) minimizeCall(); }}>
      <DrawerContent className="bg-black/60 backdrop-blur-[24px] border-t border-white/10 shadow-2xl">
        <div className="flex flex-col items-center gap-3 px-6 pb-6 pt-2">
          {/* Video area */}
          <div className="w-full rounded-xl overflow-hidden relative max-h-[300px]" style={{ aspectRatio: '16/9' }}>
            {isCallActive ? (
              <video ref={remoteVideoRef} autoPlay playsInline muted={false} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-black/40 backdrop-blur-md flex items-center justify-center">
                <div className="w-32 h-24 lg:w-96 lg:h-72 rounded-lg overflow-hidden border border-white/20 bg-black/40">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover ${isCameraOff ? 'hidden' : ''}`}
                  />
                  {isCameraOff && (
                    <div className="w-full h-full bg-white/5 flex items-center justify-center">
                      <VideoOff className="h-6 w-6 text-white/40" />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Local video PiP during active call */}
            {isCallActive && (
              <div className="absolute top-2 right-2 w-24 h-18 rounded-lg overflow-hidden border border-white/20 bg-black/40">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover ${isCameraOff ? 'hidden' : ''}`}
                />
                {isCameraOff && (
                  <div className="w-full h-full bg-white/5 flex items-center justify-center">
                    <VideoOff className="h-5 w-5 text-white/40" />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Name + status */}
          <div className="text-center">
            <p className="text-base font-semibold text-white">{displayName}</p>
            <p className="text-sm text-white/50">{statusText}</p>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-4 pt-1">
            {isIncoming ? (
              <>
                <button
                  onClick={rejectCall}
                  className="rounded-full w-14 h-14 bg-red-500/80 hover:bg-red-500 flex items-center justify-center text-white transition-all"
                >
                  <PhoneOff className="h-6 w-6" />
                </button>
                <button
                  onClick={acceptCall}
                  className="rounded-full w-14 h-14 bg-green-600/80 hover:bg-green-600 flex items-center justify-center text-white transition-all"
                >
                  <Phone className="h-6 w-6" />
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={toggleMute}
                  className={cn(
                    "rounded-full w-12 h-12 flex items-center justify-center transition-all",
                    isMuted
                      ? "bg-red-500/80 hover:bg-red-500 text-white"
                      : "bg-white/10 hover:bg-white/20 text-white border border-white/10"
                  )}
                >
                  {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </button>
                <button
                  onClick={toggleCamera}
                  className={cn(
                    "rounded-full w-12 h-12 flex items-center justify-center transition-all",
                    isCameraOff
                      ? "bg-red-500/80 hover:bg-red-500 text-white"
                      : "bg-white/10 hover:bg-white/20 text-white border border-white/10"
                  )}
                >
                  {isCameraOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
                </button>
                <button
                  onClick={switchCamera}
                  className="rounded-full w-12 h-12 bg-white/10 hover:bg-white/20 text-white border border-white/10 flex items-center justify-center transition-all"
                >
                  <RotateCcw className="h-5 w-5" />
                </button>
                <button
                  onClick={endCall}
                  className="rounded-full w-14 h-14 bg-red-500/80 hover:bg-red-500 flex items-center justify-center text-white transition-all"
                >
                  <PhoneOff className="h-6 w-6" />
                </button>
              </>
            )}
          </div>

          {isCallActive && (isMuted || isCameraOff) && (
            <p className="text-xs text-white/40">
              {isMuted && 'Muted'} {isCameraOff && 'Camera Off'}
            </p>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default VideoCallModal;
