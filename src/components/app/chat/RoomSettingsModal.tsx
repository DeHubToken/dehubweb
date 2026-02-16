import { useState } from 'react';
import { Settings, Loader2, UserPlus, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { addLiveChatModerator, updateLiveChatRoomSettings, type LiveChatRoom } from '@/lib/api/dehub';
import { toast } from 'sonner';

interface RoomSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  room: LiveChatRoom | null;
  onUpdated: () => void;
}

export function RoomSettingsModal({ open, onOpenChange, room, onUpdated }: RoomSettingsModalProps) {
  const [roomName, setRoomName] = useState(room?.name || room?.topic || '');
  const [roomDescription, setRoomDescription] = useState(room?.description || '');
  const [modAddress, setModAddress] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isAddingMod, setIsAddingMod] = useState(false);

  // Sync state when room changes
  useState(() => {
    if (room) {
      setRoomName(room.name || room.topic || '');
      setRoomDescription(room.description || '');
    }
  });

  const handleSaveSettings = async () => {
    if (!room) return;
    setIsSaving(true);
    try {
      await updateLiveChatRoomSettings(room.id, {
        name: roomName.trim(),
        description: roomDescription.trim(),
      });
      toast.success('Room settings updated');
      onUpdated();
    } catch (err) {
      console.error('[LiveChat] Failed to update room settings:', err);
      toast.error('Failed to update settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddModerator = async () => {
    if (!room || !modAddress.trim()) {
      toast.error('Enter a wallet address');
      return;
    }
    setIsAddingMod(true);
    try {
      await addLiveChatModerator(room.id, modAddress.trim());
      toast.success('Moderator added');
      setModAddress('');
      onUpdated();
    } catch (err) {
      console.error('[LiveChat] Failed to add moderator:', err);
      toast.error('Failed to add moderator');
    } finally {
      setIsAddingMod(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Settings className="w-5 h-5" />
            Room Settings
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Manage room details and moderators
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {/* Room settings */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm text-zinc-400">Room Name</label>
              <Input
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="Room name"
                className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm text-zinc-400">Description</label>
              <Input
                value={roomDescription}
                onChange={(e) => setRoomDescription(e.target.value)}
                placeholder="Room description"
                className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
              />
            </div>
            <Button
              onClick={handleSaveSettings}
              disabled={isSaving}
              className="w-full rounded-xl bg-white/10 border border-white/20 hover:bg-white/20 text-white font-medium gap-2"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Settings className="w-4 h-4" />}
              Save Settings
            </Button>
          </div>

          {/* Divider */}
          <div className="border-t border-zinc-800" />

          {/* Add moderator */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Add Moderator
            </h4>
            <div className="flex gap-2">
              <Input
                value={modAddress}
                onChange={(e) => setModAddress(e.target.value)}
                placeholder="Wallet address (0x...)"
                className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 flex-1 text-sm"
              />
              <Button
                onClick={handleAddModerator}
                disabled={isAddingMod || !modAddress.trim()}
                size="icon"
                className="rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 flex-shrink-0"
              >
                {isAddingMod ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              </Button>
            </div>

            {/* Current moderators */}
            {room?.moderators && room.moderators.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs text-zinc-500">Current Moderators</p>
                {room.moderators.map((addr) => (
                  <div key={addr} className="flex items-center gap-2 text-xs text-zinc-400 bg-zinc-800/50 rounded-lg px-3 py-1.5">
                    <ShieldCheck className="w-3 h-3 text-emerald-500" />
                    <span className="truncate">{addr}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
