import React, { useState, useEffect } from 'react';
import { Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCall } from '@/contexts/CallContext';
import { useAuth } from '@/contexts/AuthContext';
import CallFailureDialog from './CallFailureDialog';
import CallbackRequestModal from './CallbackRequestModal';

interface DmVideoCallButtonProps {
  recipientAddress: string;
  className?: string;
}

export const DmVideoCallButton: React.FC<DmVideoCallButtonProps> = ({ recipientAddress, className }) => {
  const { startCall, isCallActive, isConnecting, callFailureReason, clearCallFailure } = useCall();
  const { walletAddress } = useAuth();
  const [showFailureDialog, setShowFailureDialog] = useState(false);
  const [showCallbackModal, setShowCallbackModal] = useState(false);

  const handleStartCall = () => {
    if (walletAddress && recipientAddress && walletAddress !== recipientAddress) {
      startCall(recipientAddress, 'video');
    }
  };

  useEffect(() => {
    if (callFailureReason === 'user_offline' && !isConnecting && !isCallActive) {
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
        title="Video call"
      >
        <Video className="h-5 w-5" />
      </Button>

      <CallFailureDialog
        isOpen={showFailureDialog}
        onClose={() => { setShowFailureDialog(false); clearCallFailure(); }}
        onSendCallbackRequest={() => setShowCallbackModal(true)}
        callType="video"
        failureReason={callFailureReason || 'technical_error'}
        recipientAddress={recipientAddress}
      />

      <CallbackRequestModal
        isOpen={showCallbackModal}
        onClose={() => setShowCallbackModal(false)}
        recipientAddress={recipientAddress}
        callType="video"
      />
    </>
  );
};
