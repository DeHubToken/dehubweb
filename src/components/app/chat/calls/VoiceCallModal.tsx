import React, { useState, useEffect } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useCall } from '@/contexts/CallContext';
import { LiquidGlassBubble } from '@/components/ui/liquid-glass-bubble';
import { getAccountInfo } from '@/lib/api/dehub/users';

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
  } = useCall();

  const [audioNeedsInteraction, setAudioNeedsInteraction] = useState(false);

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

  if (!isVisible || !currentCall || currentCall.call_type !== 'audio') {
    return null;
  }

  const getCallTitle = () => {
    if (isIncoming) return 'Incoming Call';
    if (isConnecting) return 'Connecting...';
    if (isCallActive) return 'Voice Call Active';
    return 'Voice Call';
  };

  const [peerName, setPeerName] = useState<string | null>(null);

  const peerAddress = isIncoming ? currentCall.caller_address : currentCall.recipient_address;

  useEffect(() => {
    setPeerName(null);
    getAccountInfo(peerAddress).then(u => {
      if (u?.username) setPeerName(u.username);
    }).catch(() => {});
  }, [peerAddress]);

  const displayName = peerName || `${peerAddress.slice(0, 6)}...${peerAddress.slice(-4)}`;

  return (
    <Dialog open={isVisible} onOpenChange={() => {}}>
      <DialogContent className="bg-black/60 backdrop-blur-[24px] border border-white/10 shadow-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white text-center">{getCallTitle()}</DialogTitle>
          <DialogDescription className="sr-only">
            Use the controls to accept, mute, or end the call.
          </DialogDescription>
        </DialogHeader>

        <audio
          ref={remoteAudioRef}
          autoPlay
          playsInline
          className="hidden"
          onPlay={() => setAudioNeedsInteraction(false)}
          onAbort={() => setAudioNeedsInteraction(true)}
        />

        <div className="flex flex-col items-center space-y-6 py-4" onClick={handleUserInteraction}>
          <LiquidGlassBubble shimmer className="w-24 h-24 !rounded-full">
            <div className="w-full h-full flex items-center justify-center">
              <Phone className="h-8 w-8 text-white" />
            </div>
          </LiquidGlassBubble>

          <div className="text-center">
            <p className="text-lg font-semibold text-white">{displayName}</p>
            {isConnecting && <p className="text-sm text-white/50">Connecting...</p>}
            {isCallActive && callDuration !== '00:00' && (
              <p className="text-sm text-white font-medium">{callDuration}</p>
            )}
          </div>

          <div className="flex items-center space-x-4">
            {isIncoming ? (
              <>
                <Button onClick={rejectCall} variant="destructive" size="lg" className="rounded-full w-16 h-16">
                  <PhoneOff className="h-6 w-6" />
                </Button>
                <Button
                  onClick={() => {
                    acceptCall();
                    handleUserInteraction();
                  }}
                  size="lg"
                  className="rounded-full w-16 h-16 bg-green-600 hover:bg-green-700 text-white"
                >
                  <Phone className="h-6 w-6" />
                </Button>
              </>
            ) : (
              <>
                {isCallActive && (
                  <button
                    onClick={() => {
                      toggleMute();
                      handleUserInteraction();
                    }}
                    className={`rounded-full w-12 h-12 flex items-center justify-center transition-all ${
                      isMuted
                        ? 'bg-red-500/80 hover:bg-red-500 text-white'
                        : 'bg-white/10 hover:bg-white/20 text-white'
                    }`}
                  >
                    {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                  </button>
                )}
                <Button onClick={endCall} variant="destructive" size="lg" className="rounded-full w-16 h-16">
                  <PhoneOff className="h-6 w-6" />
                </Button>
              </>
            )}
          </div>

          {isCallActive && (
            <div className="text-center">
              <p className="text-sm text-white/50">{isMuted ? 'Muted' : 'Unmuted'}</p>
              {audioNeedsInteraction && (
                <div className="flex items-center justify-center gap-2 mt-2 p-2 bg-white/10 rounded-lg">
                  <Volume2 className="h-4 w-4 text-white/60" />
                  <p className="text-xs text-white/60">Click to enable audio</p>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default VoiceCallModal;
