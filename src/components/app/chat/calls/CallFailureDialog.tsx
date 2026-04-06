import React from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog';
import { Phone, Video, MessageSquare, WifiOff } from 'lucide-react';
import { LiquidGlassBubble } from '@/components/ui/liquid-glass-bubble';

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
      return <WifiOff className="h-12 w-12 text-white/60 mx-auto mb-4" />;
    }
    return callType === 'video' ? (
      <Video className="h-12 w-12 text-red-400 mx-auto mb-4" />
    ) : (
      <Phone className="h-12 w-12 text-red-400 mx-auto mb-4" />
    );
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent className="bg-black/60 backdrop-blur-[24px] border border-white/10 shadow-2xl [&>button]:text-white/60 [&>button]:hover:text-white">
        <AlertDialogHeader>
          <div className="text-center">{getIcon()}</div>
          <AlertDialogTitle className="text-center text-white">{getTitle()}</AlertDialogTitle>
          <AlertDialogDescription className="text-center text-white/60">{getDescription()}</AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-all border border-white/10"
          >
            Close
          </button>

          {isUserOffline && (
            <LiquidGlassBubble shimmer noBorder className="cursor-pointer" onClick={() => {
              onSendCallbackRequest();
              onClose();
            }}>
              <span className="flex items-center gap-2 px-4 py-2 text-white text-sm font-medium">
                <MessageSquare className="h-4 w-4" />
                Send callback request
              </span>
            </LiquidGlassBubble>
          )}

          {!isUserOffline && (
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-all border border-white/10"
            >
              Try again
            </button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default CallFailureDialog;
