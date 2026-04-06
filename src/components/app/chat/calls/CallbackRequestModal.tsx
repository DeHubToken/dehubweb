import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Phone, Video, MessageSquare } from 'lucide-react';
import { useCallbackRequests } from '@/hooks/use-callback-requests';

interface CallbackRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  recipientAddress: string;
  callType: 'audio' | 'video';
}

const CallbackRequestModal: React.FC<CallbackRequestModalProps> = ({ isOpen, onClose, recipientAddress, callType }) => {
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { sendCallbackRequest } = useCallbackRequests();

  const handleSubmit = async () => {
    if (isSubmitting) return;

    setIsSubmitting(true);
    const success = await sendCallbackRequest(recipientAddress, callType, message.trim() || undefined);

    if (success) {
      setMessage('');
      onClose();
    }

    setIsSubmitting(false);
  };

  const handleClose = () => {
    setMessage('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {callType === 'video' ? (
              <Video className="h-5 w-5 text-primary" />
            ) : (
              <Phone className="h-5 w-5 text-primary" />
            )}
            Send callback request
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            The user appears to be offline. Send a callback request and they can call you back.
          </p>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <MessageSquare className="h-4 w-4" />
              <span>Optional message</span>
            </div>
            <Textarea
              placeholder="Let them know what you'd like to discuss..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={200}
              className="resize-none"
              rows={3}
            />
            <div className="text-xs text-muted-foreground text-right">{message.length}/200</div>
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={handleClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting} className="gap-2">
              {callType === 'video' ? <Video className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
              {isSubmitting ? 'Sending...' : 'Send request'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CallbackRequestModal;
