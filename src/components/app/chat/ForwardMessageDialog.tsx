/**
 * ForwardMessageDialog
 * ====================
 * Lets the user pick a conversation to forward a DM message to.
 * Mirrors the mobile ForwardPickerModal.
 */

import { useMemo, useState } from 'react';
import { Search, X, CornerUpRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useConversations } from '@/hooks/use-messages';
import { buildAvatarUrl } from '@/lib/media-url';
import type { DeHubConversation } from '@/lib/api/dehub';

interface ForwardMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the target conversation id when the user picks one. */
  onSelect: (targetConversationId: string) => void;
  /** Conversation id the message is being forwarded FROM (excluded from the list). */
  excludeConversationId?: string;
}

function convName(conv: DeHubConversation): string {
  if (conv.isGroup || conv.groupInfo) return conv.groupInfo?.name || 'Group';
  const other = conv.otherUser || conv.participants?.[0];
  return (
    other?.displayName ||
    (other as any)?.display_name ||
    other?.username ||
    (other?.address ? `${other.address.slice(0, 6)}...${other.address.slice(-4)}` : 'User')
  );
}

export function ForwardMessageDialog({
  open,
  onOpenChange,
  onSelect,
  excludeConversationId,
}: ForwardMessageDialogProps) {
  const { conversations, isLoading } = useConversations();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const list = conversations.filter(
      (c) => (c.id || (c as any)._id) !== excludeConversationId,
    );
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((c) => convName(c).toLowerCase().includes(q));
  }, [conversations, search, excludeConversationId]);

  const handleSelect = (conv: DeHubConversation) => {
    const id = conv.id || (conv as any)._id;
    if (!id) return;
    onSelect(id);
    onOpenChange(false);
    setSearch('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-700 text-white max-w-sm p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="text-white text-base">Forward to</DialogTitle>
        </DialogHeader>

        {/* Search */}
        <div className="mx-4 mb-2 flex items-center gap-2 rounded-xl bg-zinc-800 px-3 py-2">
          <Search className="w-4 h-4 text-zinc-500 flex-shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations…"
            className="flex-1 bg-transparent text-sm text-white placeholder:text-zinc-500 outline-none"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-zinc-500 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* List */}
        <div className="max-h-[50vh] overflow-y-auto pb-4">
          {isLoading ? (
            <p className="text-center text-sm text-zinc-500 py-8">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-zinc-500 py-8">No conversations</p>
          ) : (
            filtered.map((conv) => {
              const other = conv.otherUser || conv.participants?.[0];
              const name = convName(conv);
              const avatarUrl = buildAvatarUrl(
                other?.address || '',
                other?.avatarImageUrl || (other as any)?.avatarUrl,
              );
              return (
                <button
                  key={conv.id || (conv as any)._id}
                  type="button"
                  onClick={() => handleSelect(conv)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 hover:bg-zinc-800 transition-colors text-left"
                >
                  <Avatar className="w-9 h-9 flex-shrink-0">
                    {avatarUrl && <AvatarImage src={avatarUrl} />}
                    <AvatarFallback className="bg-zinc-700 text-white text-xs font-medium">
                      {(name.startsWith('0x') ? name.charAt(2) : name.charAt(0)).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="flex-1 min-w-0 truncate text-sm font-medium text-white">
                    {name}
                  </span>
                  <CornerUpRight className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                </button>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
