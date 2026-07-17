import React from 'react';
import { Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCall } from '@/contexts/CallContext';
import { useAuth } from '@/contexts/AuthContext';

interface DmVoiceCallButtonProps {
  recipientAddress: string;
  className?: string;
}

export const DmVoiceCallButton: React.FC<DmVoiceCallButtonProps> = ({ recipientAddress, className }) => {
  const { startCall, isCallActive, isConnecting } = useCall();
  const { walletAddress } = useAuth();

  const handleStartCall = () => {
    if (walletAddress && recipientAddress && walletAddress !== recipientAddress) {
      startCall(recipientAddress, 'audio');
    }
  };

  if (!walletAddress || walletAddress === recipientAddress) {
    return null;
  }

  return (
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
  );
};
