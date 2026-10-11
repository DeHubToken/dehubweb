import { useTranslation as _useCopy } from 'react-i18next';
import { useSurfaceDraft } from '@/hooks/use-surface-draft';
import { useState } from 'react';
import { MessageSquarePlus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { createTopicRoom, type LiveChatRoom } from '@/lib/api/dehub';
import { toast } from 'sonner';

interface CreateTopicRoomModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (room: LiveChatRoom) => void;
}

export function CreateTopicRoomModal({ open, onOpenChange, onCreated }: CreateTopicRoomModalProps) {
  const { t: _copy } = _useCopy();
  const [topic, setTopic] = useSurfaceDraft("components/app/chat/CreateTopicRoomModal.tsx:topic", '');
  const [description, setDescription] = useSurfaceDraft("components/app/chat/CreateTopicRoomModal.tsx:description", '');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (!topic.trim()) {
      toast.error(_copy("copy.732563102145", { defaultValue: "Topic is required" }));
      return;
    }
    setIsCreating(true);
    try {
      const room = await createTopicRoom({
        topic: topic.trim(),
        description: description.trim() || undefined,
      });
      toast.success(_copy("copy.4d680f14a5a3", { defaultValue: "Chat room created!" }));
      onCreated(room);
      setTopic.complete(topic, '');
      setDescription.complete(description, '');
      onOpenChange(false);
    } catch (err) {
      console.error('[LiveChat] Failed to create room:', err);
      toast.error(_copy("copy.bc58154a4909", { defaultValue: "Failed to create room" }));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-black/60 backdrop-blur-[24px] border border-white/10 shadow-2xl text-white max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <MessageSquarePlus className="w-5 h-5" />{_copy("copy.cad72c1050b0", { defaultValue: "New Topic Room" })}</DialogTitle>
          <DialogDescription className="text-zinc-400">{_copy("copy.ee088652116b", { defaultValue: "Create a chat room around a topic" })}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <label className="text-sm text-zinc-400">{_copy("copy.7b08c3082435", { defaultValue: "Topic *" })}</label>
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Gaming, Crypto, Art"
              className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
              maxLength={100}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm text-zinc-400">{_copy("copy.526e0087cc3f", { defaultValue: "Description" })}</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={_copy("copy.3a66c60c652c", { defaultValue: "What's this room about?" })}
              className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 resize-none"
              rows={3}
              maxLength={300}
            />
          </div>

          <Button
            onClick={handleCreate}
            disabled={isCreating || !topic.trim()}
            variant="glass"
            className="w-full rounded-xl font-semibold gap-2"
          >
            {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquarePlus className="w-4 h-4" />}{_copy("copy.3f855ba1babc", { defaultValue: "Create Room" })}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
