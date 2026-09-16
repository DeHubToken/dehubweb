import React from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog';
import { Phone, Video, WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { usePeerIdentity } from './CallChrome';

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
  const { t } = useTranslation();
  const peer = usePeerIdentity(recipientAddress);

  const isUserOffline = failureReason === 'user_offline';
  const FailureIcon = isUserOffline ? WifiOff : callType === 'video' ? Video : Phone;

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="text-center">
            <FailureIcon className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          </div>
          <AlertDialogTitle className="text-center">
            {isUserOffline ? t('calls.offlineTitle') : t('calls.failedTitle')}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-center">
            {isUserOffline
              ? t('calls.offlineDesc', { name: peer.name })
              : t('calls.failedDesc')}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            {t('calls.close')}
          </Button>

          <Button
            className="flex-1"
            onClick={() => {
              if (isUserOffline) onSendCallbackRequest();
              onClose();
            }}
          >
            {isUserOffline ? t('calls.callbackRequest') : t('calls.tryAgain')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default CallFailureDialog;
