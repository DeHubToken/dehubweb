import React from 'react';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCall } from '@/contexts/CallContext';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import {
  CallSurface,
  CallIdentity,
  CallControl,
  CallControlPanel,
  usePeerIdentity,
} from './CallChrome';

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

  const { t } = useTranslation();

  const peerAddress = currentCall
    ? (isIncoming ? currentCall.caller_address : currentCall.recipient_address)
    : '';
  const peer = usePeerIdentity(peerAddress);

  if (!walletAddress) return null;

  const isVisible = (isCallActive || isIncoming || isConnecting) && currentCall?.call_type === 'video';

  if (!isVisible || !currentCall || isMinimized) {
    return null;
  }

  const statusText = isIncoming
    ? t('calls.incoming')
    : isConnecting
      ? t('calls.connecting')
      : t('calls.connected');

  return (
    <CallSurface onMinimize={minimizeCall} minimizeLabel={t('calls.minimize')}>
      {/* Remote video fills the surface once the call is up; before that this is
          the ringing screen and shows who is on the other end. */}
      {isCallActive ? (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-start px-6 pt-20">
          <CallIdentity
            kindIcon={Video}
            kindLabel={t('calls.videoCall')}
            name={peer.name}
            status={statusText}
            avatarUrl={peer.avatarUrl}
          />
        </div>
      )}

      {/* Local preview */}
      <div
        className={cn(
          'absolute left-4 top-16 h-40 w-28 overflow-hidden rounded-2xl border border-border/60 bg-muted',
          !isCallActive && 'bottom-auto',
        )}
      >
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className={cn('h-full w-full object-cover', isCameraOff && 'hidden')}
        />
        {isCameraOff && (
          <div className="flex h-full w-full items-center justify-center">
            <VideoOff className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Name + duration ride over the remote video once it is up */}
      {isCallActive && (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center gap-0.5 bg-gradient-to-b from-background/85 to-transparent px-5 pb-8 pt-5">
          <p className="max-w-[80vw] truncate text-lg font-semibold text-foreground">{peer.name}</p>
          <p className="text-[13px] tabular-nums text-muted-foreground">{statusText}</p>
        </div>
      )}

      <div className={cn('mt-auto', isCallActive && 'relative z-10')}>
        <CallControlPanel>
          {isIncoming ? (
            <>
              <CallControl icon={PhoneOff} label={t('calls.decline')} onClick={rejectCall} />
              <CallControl icon={Phone} label={t('calls.accept')} onClick={acceptCall} primary />
            </>
          ) : (
            <>
              <CallControl
                icon={isMuted ? MicOff : Mic}
                label={isMuted ? t('calls.unmute') : t('calls.mute')}
                onClick={toggleMute}
                active={isMuted}
              />
              <CallControl
                icon={isCameraOff ? VideoOff : Video}
                label={t('calls.camera')}
                onClick={toggleCamera}
                active={isCameraOff}
              />
              <CallControl icon={RotateCcw} label={t('calls.flip')} onClick={switchCamera} />
              <CallControl icon={PhoneOff} label={t('calls.end')} onClick={endCall} primary />
            </>
          )}
        </CallControlPanel>
      </div>
    </CallSurface>
  );
};

export default VideoCallModal;
