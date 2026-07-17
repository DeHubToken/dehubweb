/**
 * NewMessageSelector Component
 * ==============================
 * Modal for selecting between creating a DM or Group chat.
 * Note: DeHub backend supports 1:1 DMs only — Create Group is hidden.
 */

import { MessageCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface NewMessageSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectDM: () => void;
  onSelectGroup?: () => void;
}

export function NewMessageSelector({ 
  open, 
  onOpenChange, 
  onSelectDM,
}: NewMessageSelectorProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-black/60 backdrop-blur-[24px] border border-white/10 shadow-2xl max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-white text-center">Create</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 pt-2">
          <Button
            variant="ghost"
            onClick={() => {
              onOpenChange(false);
              onSelectDM();
            }}
            className="w-full h-auto p-4 flex items-center gap-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl justify-start"
          >
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center">
              <MessageCircle className="w-6 h-6 text-white" />
            </div>
            <div className="text-left">
              <p className="font-semibold text-white">Create DM</p>
              <p className="text-sm text-white/60">Start a private conversation</p>
            </div>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
