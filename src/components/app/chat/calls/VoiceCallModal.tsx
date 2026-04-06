import React, { useState } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useCall } from '@/contexts/CallContext';

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

  const getCallAddress = () => {
    const address = isIncoming ? currentCall.caller_address : currentCall.recipient_address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <Dialog open={isVisible} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center">{getCallTitle()}</DialogTitle>
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
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center">
            <Phone className="h-8 w-8 text-white" />
          </div>

          <div className="text-center">
            <p className="text-lg font-semibold">{getCallAddress()}</p>
            {isConnecting && <p className="text-sm text-muted-foreground">Connecting...</p>}
            {isCallActive && callDuration !== '00:00' && (
              <p className="text-sm text-green-600 font-medium">{callDuration}</p>
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
                  variant="default"
                  size="lg"
                  className="rounded-full w-16 h-16 bg-green-600 hover:bg-green-700"
                >
                  <Phone className="h-6 w-6" />
                </Button>
              </>
            ) : (
              <>
                {isCallActive && (
                  <Button
                    onClick={() => {
                      toggleMute();
                      handleUserInteraction();
                    }}
                    variant={isMuted ? 'destructive' : 'secondary'}
                    size="lg"
                    className="rounded-full w-12 h-12"
                  >
                    {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                  </Button>
                )}
                <Button onClick={endCall} variant="destructive" size="lg" className="rounded-full w-16 h-16">
                  <PhoneOff className="h-6 w-6" />
                </Button>
              </>
            )}
          </div>

          {isCallActive && (
            <div className="text-center">
              <p className="text-sm text-muted-foreground">{isMuted ? 'Muted' : 'Unmuted'}</p>
              {audioNeedsInteraction && (
                <div className="flex items-center justify-center gap-2 mt-2 p-2 bg-yellow-100 dark:bg-yellow-900/20 rounded-lg">
                  <Volume2 className="h-4 w-4 text-yellow-600" />
                  <p className="text-xs text-yellow-600">Click to enable audio</p>
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
