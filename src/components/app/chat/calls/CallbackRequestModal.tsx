import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Phone, Video, MessageSquare } from 'lucide-react';
import { useCallbackRequests } from '@/hooks/use-callback-requests';
import { LiquidGlassBubble } from '@/components/ui/liquid-glass-bubble';

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
      <DialogContent className="bg-black/60 backdrop-blur-[24px] border border-white/10 shadow-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            {callType === 'video' ? (
              <Video className="h-5 w-5 text-white/60" />
            ) : (
              <Phone className="h-5 w-5 text-white/60" />
            )}
            Send callback request
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-white/60">
            The user appears to be offline. Send a callback request and they can call you back.
          </p>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-white">
              <MessageSquare className="h-4 w-4 text-white/60" />
              <span>Optional message</span>
            </div>
            <Textarea
              placeholder="Let them know what you'd like to discuss..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={200}
              className="resize-none bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-white/20"
              rows={3}
            />
            <div className="text-xs text-white/40 text-right">{message.length}/200</div>
          </div>

          <div className="flex gap-2 justify-end">
            <button
              onClick={handleClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-all border border-white/10 disabled:opacity-40"
            >
              Cancel
            </button>
            <LiquidGlassBubble shimmer noBorder className="cursor-pointer" onClick={isSubmitting ? undefined : handleSubmit}>
              <span className="flex items-center gap-2 px-4 py-2 text-white text-sm font-medium">
                {callType === 'video' ? <Video className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
                {isSubmitting ? 'Sending...' : 'Send request'}
              </span>
            </LiquidGlassBubble>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CallbackRequestModal;
