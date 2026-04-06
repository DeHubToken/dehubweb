import React from 'react';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useCall } from '@/contexts/CallContext';
import { useAuth } from '@/contexts/AuthContext';

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
  } = useCall();

  if (!walletAddress) return null;

  const isVisible = (isCallActive || isIncoming || isConnecting) && currentCall?.call_type === 'video';

  if (!isVisible || !currentCall) {
    return null;
  }

  const getCallTitle = () => {
    if (isIncoming) return 'Incoming Video Call';
    if (isConnecting) return 'Connecting...';
    if (isCallActive) return 'Video Call Active';
    return 'Video Call';
  };

  const getCallAddress = () => {
    const address = isIncoming ? currentCall.caller_address : currentCall.recipient_address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <Dialog open={isVisible} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-4xl h-[600px] p-0">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="text-center">{getCallTitle()}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col h-full relative">
          <div className="flex-1 bg-background rounded-lg overflow-hidden relative">
            {isCallActive ? (
              <video ref={remoteVideoRef} autoPlay playsInline muted={false} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center mx-auto mb-4">
                    <Video className="h-8 w-8 text-white" />
                  </div>
                  <p className="text-lg font-semibold">{getCallAddress()}</p>
                  {isConnecting && <p className="text-sm text-muted-foreground">Connecting...</p>}
                </div>
              </div>
            )}

            <div className="absolute top-4 right-4 w-48 h-36 bg-background rounded-lg overflow-hidden border-2 border-border">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${isCameraOff ? 'hidden' : ''}`}
              />
              {isCameraOff && (
                <div className="w-full h-full bg-gradient-to-br from-muted to-muted/80 flex items-center justify-center">
                  <VideoOff className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
            </div>
          </div>

          <div className="p-6">
            <div className="flex items-center justify-center space-x-4">
              {isIncoming ? (
                <>
                  <Button onClick={rejectCall} variant="destructive" size="lg" className="rounded-full w-16 h-16">
                    <PhoneOff className="h-6 w-6" />
                  </Button>
                  <Button
                    onClick={acceptCall}
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
                    <>
                      <Button onClick={toggleMute} variant={isMuted ? 'destructive' : 'secondary'} size="lg" className="rounded-full w-12 h-12">
                        {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                      </Button>
                      <Button
                        onClick={toggleCamera}
                        variant={isCameraOff ? 'destructive' : 'secondary'}
                        size="lg"
                        className="rounded-full w-12 h-12"
                      >
                        {isCameraOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
                      </Button>
                      <Button onClick={switchCamera} variant="secondary" size="lg" className="rounded-full w-12 h-12">
                        <RotateCcw className="h-5 w-5" />
                      </Button>
                    </>
                  )}
                  <Button onClick={endCall} variant="destructive" size="lg" className="rounded-full w-16 h-16">
                    <PhoneOff className="h-6 w-6" />
                  </Button>
                </>
              )}
            </div>

            {isCallActive && (
              <div className="text-center mt-4">
                <p className="text-sm text-muted-foreground">
                  {isMuted && 'Muted'} {isCameraOff && 'Camera Off'}
                  {!isMuted && !isCameraOff && 'Connected'}
                </p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default VideoCallModal;
