import { useTranslation as _useCopy } from 'react-i18next';
/**
 * DmPollDialog
 * ============
 * Glass drawer for sending a poll into a chat. Same editor as a post's poll;
 * the poll lands in the thread as its own message and the chat's members vote.
 */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { PollEditor } from '@/features/post/components/PollEditor';
import type { PollData } from '@/features/post/types';
import { useCreatePoll } from '@/hooks/use-polls';
import { messagesKeys } from '@/hooks/use-messages';

interface DmPollDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  onSent?: () => void;
}

const blankPoll = (): PollData => ({
  question: '',
  options: [{ id: '1', text: '' }, { id: '2', text: '' }],
  duration: 24,
  isMultipleChoice: false,
});

export function DmPollDialog({ open, onOpenChange, conversationId, onSent }: DmPollDialogProps) {
  const { t: _copy } = _useCopy();
  const queryClient = useQueryClient();
  const createPoll = useCreatePoll();
  const [poll, setPoll] = useState<PollData>(blankPoll);

  const options = poll.options.map(o => o.text.trim()).filter(Boolean);
  const canCreate = poll.question.trim().length > 0 && options.length >= 2 && !createPoll.isPending;

  const submit = () => {
    if (!canCreate) return;
    createPoll.mutate(
      {
        conversationId,
        question: poll.question.trim(),
        options,
        expiresAt: new Date(Date.now() + poll.duration * 3600 * 1000).toISOString(),
        isMultipleChoice: !!poll.isMultipleChoice,
      },
      {
        onSuccess: () => {
          // The other side gets it live; the sender's thread picks it up here.
          queryClient.invalidateQueries({ queryKey: messagesKeys.messages(conversationId) });
          queryClient.invalidateQueries({ queryKey: messagesKeys.head(conversationId) });
          queryClient.invalidateQueries({ queryKey: messagesKeys.conversations() });
          setPoll(blankPoll());
          onOpenChange(false);
          onSent?.();
        },
      },
    );
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent scrollable column glass className="px-4 pb-6">
        <DrawerHeader className="px-0 pb-1">
          <div className="flex items-center justify-between gap-3">
          <DrawerTitle className="text-white text-lg text-left">{_copy("copy.b2b9c2e81c4c", { defaultValue: "Create Poll" })}</DrawerTitle>
          <Button
            type="button"
            size="sm"
            disabled={!canCreate}
            onClick={submit}
            className="rounded-full bg-white text-black hover:bg-white/90 disabled:bg-white/10 disabled:text-white/50"
          >
            {createPoll.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : _copy("copy.4759498ac2a7", { defaultValue: "Create" })}
          </Button>
          </div>
        </DrawerHeader>
        <PollEditor poll={poll} onChange={setPoll} onRemove={() => onOpenChange(false)} />
      </DrawerContent>
    </Drawer>
  );
}
