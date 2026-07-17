import React from 'react';
import { Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCall } from '@/contexts/CallContext';
import { useAuth } from '@/contexts/AuthContext';

interface DmVideoCallButtonProps {
  recipientAddress: string;
  className?: string;
}

export const DmVideoCallButton: React.FC<DmVideoCallButtonProps> = ({ recipientAddress, className }) => {
  const { startCall, isCallActive, isConnecting } = useCall();
  const { walletAddress } = useAuth();

  const handleStartCall = () => {
    if (walletAddress && recipientAddress && walletAddress !== recipientAddress) {
      startCall(recipientAddress, 'video');
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
      title="Video call"
    >
      <Video className="h-5 w-5" />
    </Button>
  );
};
