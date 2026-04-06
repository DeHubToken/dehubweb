import React from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Phone, Video, MessageSquare, WifiOff } from 'lucide-react';

interface CallFailureDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSendCallbackRequest: () => void;
  callType: 'audio' | 'video';
  failureReason: 'user_offline' | 'technical_error';
  recipientAddress: string;
}

const CallFailureDialog: React.FC<CallFailureDialogProps> = ({
  isOpen,
  onClose,
  onSendCallbackRequest,
  callType,
  failureReason,
  recipientAddress,
}) => {
  const isUserOffline = failureReason === 'user_offline';

  const getTitle = () => {
    if (isUserOffline) return 'User appears to be offline';
    return 'Call failed';
  };

  const getDescription = () => {
    if (isUserOffline) {
      return `${recipientAddress.slice(0, 6)}... is not currently available for ${callType === 'video' ? 'video' : 'voice'} calls. You can send a callback request and they can call you back when online.`;
    }
    return 'The call could not be completed. Please check your connection and try again.';
  };

  const getIcon = () => {
    if (isUserOffline) {
      return <WifiOff className="h-12 w-12 text-muted-foreground mx-auto mb-4" />;
    }
    return callType === 'video' ? (
      <Video className="h-12 w-12 text-destructive mx-auto mb-4" />
    ) : (
      <Phone className="h-12 w-12 text-destructive mx-auto mb-4" />
    );
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="text-center">{getIcon()}</div>
          <AlertDialogTitle className="text-center">{getTitle()}</AlertDialogTitle>
          <AlertDialogDescription className="text-center">{getDescription()}</AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <AlertDialogCancel onClick={onClose}>Close</AlertDialogCancel>

          {isUserOffline && (
            <Button
              onClick={() => {
                onSendCallbackRequest();
                onClose();
              }}
              className="gap-2"
            >
              <MessageSquare className="h-4 w-4" />
              Send callback request
            </Button>
          )}

          {!isUserOffline && <AlertDialogAction onClick={onClose}>Try again</AlertDialogAction>}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default CallFailureDialog;
