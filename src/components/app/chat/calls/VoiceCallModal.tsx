import React, { useState, useEffect } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Volume2 } from 'lucide-react';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { useCall } from '@/contexts/CallContext';
import { LiquidGlassBubble } from '@/components/ui/liquid-glass-bubble';
import { getAccountInfo } from '@/lib/api/dehub/users';
import { cn } from '@/lib/utils';

const VoiceCallModal: React.FC = () => {
  const {
    isCallActive,
    isIncoming,
    currentCall,
    isConnecting,
    isMuted,
    callDuration,
    remoteAudioRef,
    endCall,
    acceptCall,
    rejectCall,
    toggleMute,
    isMinimized,
    minimizeCall,
  } = useCall();

  const [audioNeedsInteraction, setAudioNeedsInteraction] = useState(false);
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

  const handleUserInteraction = async () => {
    if (remoteAudioRef?.current && isCallActive) {
      try {
        await remoteAudioRef.current.play();
        setAudioNeedsInteraction(false);
      } catch {
        setAudioNeedsInteraction(true);
      }
    }
  };

  const isVisible = isCallActive || isIncoming || isConnecting;

  if (!isVisible || !currentCall || currentCall.call_type !== 'audio' || isMinimized) {
    return null;
  }

  const displayName = peerName ? `@${peerName}` : (peerAddress ? `${peerAddress.slice(0, 6)}...${peerAddress.slice(-4)}` : '');

  const statusText = isIncoming ? 'Incoming call' : isConnecting ? 'Connecting...' : callDuration !== '00:00' ? callDuration : 'Connected';

  return (
    <Drawer open={isVisible && !isMinimized} onOpenChange={(open) => { if (!open) minimizeCall(); }}>
      <DrawerContent className="bg-black/60 backdrop-blur-[24px] border-t border-white/10 shadow-2xl">
        <audio
          ref={remoteAudioRef}
          autoPlay
          playsInline
          className="hidden"
          onPlay={() => setAudioNeedsInteraction(false)}
          onAbort={() => setAudioNeedsInteraction(true)}
        />

        <div className="flex flex-col items-center gap-3 px-6 pb-6 pt-2" onClick={handleUserInteraction}>
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
                  onClick={() => { acceptCall(); handleUserInteraction(); }}
                  className="rounded-full w-14 h-14 bg-green-600/80 hover:bg-green-600 flex items-center justify-center text-white transition-all"
                >
                  <Phone className="h-6 w-6" />
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => { toggleMute(); handleUserInteraction(); }}
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
                  onClick={endCall}
                  className="rounded-full w-14 h-14 bg-red-500/80 hover:bg-red-500 flex items-center justify-center text-white transition-all"
                >
                  <PhoneOff className="h-6 w-6" />
                </button>
              </>
            )}
          </div>

          {isCallActive && isMuted && (
            <p className="text-xs text-white/40">Muted</p>
          )}

          {audioNeedsInteraction && (
            <div className="flex items-center gap-2 p-2 bg-white/10 rounded-lg">
              <Volume2 className="h-4 w-4 text-white/60" />
              <p className="text-xs text-white/60">Tap to enable audio</p>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default VoiceCallModal;
