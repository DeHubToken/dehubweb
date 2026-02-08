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
  const [topic, setTopic] = useState('');
  const [description, setDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (!topic.trim()) {
      toast.error('Topic is required');
      return;
    }
    setIsCreating(true);
    try {
      const room = await createTopicRoom({
        topic: topic.trim(),
        description: description.trim() || undefined,
      });
      toast.success('Chat room created!');
      onCreated(room);
      setTopic('');
      setDescription('');
      onOpenChange(false);
    } catch (err) {
      console.error('[LiveChat] Failed to create room:', err);
      toast.error('Failed to create room');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <MessageSquarePlus className="w-5 h-5" />
            New Topic Room
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Create a chat room around a topic
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <label className="text-sm text-zinc-400">Topic *</label>
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Gaming, Crypto, Art"
              className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
              maxLength={100}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm text-zinc-400">Description</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this room about?"
              className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 resize-none"
              rows={3}
              maxLength={300}
            />
          </div>

          <Button
            onClick={handleCreate}
            disabled={isCreating || !topic.trim()}
            className="w-full rounded-xl bg-white text-black hover:bg-zinc-200 font-semibold gap-2"
          >
            {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquarePlus className="w-4 h-4" />}
            Create Room
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
