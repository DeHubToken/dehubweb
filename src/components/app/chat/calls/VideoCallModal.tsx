import React from 'react';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, RotateCcw } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useCall } from '@/contexts/CallContext';
import { useAuth } from '@/contexts/AuthContext';
import { LiquidGlassBubble } from '@/components/ui/liquid-glass-bubble';
import { cn } from '@/lib/utils';

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
      <DialogContent className="bg-black/60 backdrop-blur-[24px] border border-white/10 shadow-2xl sm:max-w-4xl h-[600px] p-0 [&>button]:text-white/60 [&>button]:hover:text-white">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="text-white text-center">{getCallTitle()}</DialogTitle>
          <DialogDescription className="sr-only">Video call controls</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col h-full relative">
          {/* Main video area */}
          <div className="flex-1 rounded-lg overflow-hidden relative mx-4">
            {isCallActive ? (
              <video ref={remoteVideoRef} autoPlay playsInline muted={false} className="w-full h-full object-cover rounded-lg" />
            ) : (
              <div className="w-full h-full bg-white/5 backdrop-blur-sm rounded-lg flex items-center justify-center">
                <div className="text-center">
                  <div className="w-48 h-36 rounded-xl overflow-hidden border border-white/20 bg-black/40 backdrop-blur-md mx-auto mb-4">
                    <video
                      ref={localVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className={`w-full h-full object-cover ${isCameraOff ? 'hidden' : ''}`}
                    />
                    {isCameraOff && (
                      <div className="w-full h-full bg-white/5 flex items-center justify-center">
                        <VideoOff className="h-8 w-8 text-white/40" />
                      </div>
                    )}
                  </div>
                  <p className="text-lg font-semibold text-white">{getCallAddress()}</p>
                  {isConnecting && <p className="text-sm text-white/50">Connecting...</p>}
                </div>
              </div>
            )}

            {/* Local video preview (during active call only) */}
            {isCallActive && (
              <div className="absolute top-4 right-4 w-48 h-36 rounded-xl overflow-hidden border border-white/20 bg-black/40 backdrop-blur-md">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover ${isCameraOff ? 'hidden' : ''}`}
                />
                {isCameraOff && (
                  <div className="w-full h-full bg-white/5 flex items-center justify-center">
                    <VideoOff className="h-8 w-8 text-white/40" />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="p-6">
            <div className="flex items-center justify-center space-x-4">
              {isIncoming ? (
                <>
                  <button
                    onClick={rejectCall}
                    className="rounded-full w-16 h-16 bg-red-500/80 hover:bg-red-500 flex items-center justify-center text-white transition-all"
                  >
                    <PhoneOff className="h-6 w-6" />
                  </button>
                  <button
                    onClick={acceptCall}
                    className="rounded-full w-16 h-16 bg-green-600/80 hover:bg-green-600 flex items-center justify-center text-white transition-all"
                  >
                    <Phone className="h-6 w-6" />
                  </button>
                </>
              ) : (
                <>
                  {isCallActive && (
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
                    </>
                  )}
                  <button
                    onClick={endCall}
                    className="rounded-full w-16 h-16 bg-red-500/80 hover:bg-red-500 flex items-center justify-center text-white transition-all"
                  >
                    <PhoneOff className="h-6 w-6" />
                  </button>
                </>
              )}
            </div>

            {isCallActive && (
              <div className="text-center mt-4">
                <p className="text-sm text-white/50">
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
