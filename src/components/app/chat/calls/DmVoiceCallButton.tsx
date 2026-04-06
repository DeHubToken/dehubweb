import React, { useState, useEffect } from 'react';
import { Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCall } from '@/contexts/CallContext';
import { useAuth } from '@/contexts/AuthContext';
import CallFailureDialog from './CallFailureDialog';
import CallbackRequestModal from './CallbackRequestModal';

interface DmVoiceCallButtonProps {
  recipientAddress: string;
  className?: string;
}

export const DmVoiceCallButton: React.FC<DmVoiceCallButtonProps> = ({ recipientAddress, className }) => {
  const { startCall, isCallActive, isConnecting, callFailureReason, clearCallFailure } = useCall();
  const { walletAddress } = useAuth();
  const [showFailureDialog, setShowFailureDialog] = useState(false);
  const [showCallbackModal, setShowCallbackModal] = useState(false);

  const handleStartCall = () => {
    if (walletAddress && recipientAddress && walletAddress !== recipientAddress) {
      startCall(recipientAddress, 'audio');
    }
  };

  useEffect(() => {
    if (callFailureReason && !isConnecting && !isCallActive) {
      setShowFailureDialog(true);
    }
  }, [callFailureReason, isConnecting, isCallActive]);

  if (!walletAddress || walletAddress === recipientAddress) {
    return null;
  }

  return (
    <>
      <Button
        type="button"
        onClick={handleStartCall}
        disabled={isCallActive || isConnecting}
        variant="ghost"
        size="icon"
        className={className}
        title="Voice call"
      >
        <Phone className="h-5 w-5" />
      </Button>

      <CallFailureDialog
        isOpen={showFailureDialog}
        onClose={() => { setShowFailureDialog(false); clearCallFailure(); }}
        onSendCallbackRequest={() => setShowCallbackModal(true)}
        callType="audio"
        failureReason={callFailureReason || 'technical_error'}
        recipientAddress={recipientAddress}
      />

      <CallbackRequestModal
        isOpen={showCallbackModal}
        onClose={() => setShowCallbackModal(false)}
        recipientAddress={recipientAddress}
        callType="audio"
      />
    </>
  );
};
