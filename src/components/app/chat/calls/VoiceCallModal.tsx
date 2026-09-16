import React, { useState } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Volume2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCall } from '@/contexts/CallContext';
import {
  CallSurface,
  CallIdentity,
  CallControl,
  CallControlPanel,
  usePeerIdentity,
} from './CallChrome';

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

  const { t } = useTranslation();
  const [audioNeedsInteraction, setAudioNeedsInteraction] = useState(false);

  const peerAddress = currentCall
    ? (isIncoming ? currentCall.caller_address : currentCall.recipient_address)
    : '';
  const peer = usePeerIdentity(peerAddress);

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

  const statusText = isIncoming
    ? t('calls.incoming')
    : isConnecting
      ? t('calls.connecting')
      : callDuration !== '00:00'
        ? callDuration
        : t('calls.connected');

  return (
    <CallSurface onMinimize={minimizeCall} minimizeLabel={t('calls.minimize')}>
      <audio
        ref={remoteAudioRef}
        autoPlay
        playsInline
        className="hidden"
        onPlay={() => setAudioNeedsInteraction(false)}
        onAbort={() => setAudioNeedsInteraction(true)}
      />

      <div
        className="flex min-h-0 flex-1 flex-col items-center justify-start px-6 pt-20"
        onClick={handleUserInteraction}
      >
        <CallIdentity
          kindIcon={Phone}
          kindLabel={t('calls.voiceCall')}
          name={peer.name}
          status={statusText}
          avatarUrl={peer.avatarUrl}
        />

        {audioNeedsInteraction && (
          <div className="mt-6 flex items-center gap-2 rounded-xl border border-border/60 bg-foreground/5 px-3 py-2">
            <Volume2 className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">{t('calls.tapToEnableAudio')}</p>
          </div>
        )}
      </div>

      <CallControlPanel>
        {isIncoming ? (
          <>
            <CallControl icon={PhoneOff} label={t('calls.decline')} onClick={rejectCall} />
            <CallControl
              icon={Phone}
              label={t('calls.accept')}
              onClick={() => {
                acceptCall();
                handleUserInteraction();
              }}
              primary
            />
          </>
        ) : (
          <>
            <CallControl
              icon={isMuted ? MicOff : Mic}
              label={isMuted ? t('calls.unmute') : t('calls.mute')}
              onClick={() => {
                toggleMute();
                handleUserInteraction();
              }}
              active={isMuted}
            />
            <CallControl icon={PhoneOff} label={t('calls.end')} onClick={endCall} primary />
          </>
        )}
      </CallControlPanel>
    </CallSurface>
  );
};

export default VoiceCallModal;
