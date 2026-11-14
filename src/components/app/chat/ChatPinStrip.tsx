import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { buildAvatarUrl } from '@/lib/media-url';
import { cn } from '@/lib/utils';
import type { DeHubConversation } from '@/lib/api/dehub';
import { ChatRowContextMenu, type ChatOptionsHandlers } from './ChatOptionsMenu';

/*
 * Pinned chats as round bubbles above the list (Glass theme, full-screen chat
 * on computers). Hidden everywhere else; the pinned rows stay in the list there.
 */
export function ChatPinStrip({ conversations, selectedId, optionsFor, onOpen }: {
  conversations: DeHubConversation[];
  selectedId?: string;
  optionsFor: (c: DeHubConversation) => ChatOptionsHandlers;
  onOpen: (c: DeHubConversation) => void;
}) {
  if (!conversations.length) return null;
  return (
    <div data-chat-pin-strip className="hidden gap-2.5 overflow-x-auto px-3 pb-2.5 pt-1">
      {conversations.map((c) => {
        const user = c.otherUser || c.participants?.[0];
        const name = user?.displayName || user?.display_name || user?.username || user?.address?.slice(0, 6) || '';
        const first = name.split(/\s+/)[0];
        const src = buildAvatarUrl(user?.address || '', user?.avatarImageUrl || user?.avatarUrl);
        const opts = optionsFor(c);
        const unread = c.unreadCount > 0 ? c.unreadCount : opts.pref?.markedUnread ? -1 : 0;
        return (
          <ChatRowContextMenu key={c.id} {...opts}>
            <button
              type="button"
              data-chat-pin
              data-selected={selectedId === c.id ? '' : undefined}
              onClick={() => onOpen(c)}
              title={name}
              className="flex w-16 shrink-0 flex-col items-center gap-1.5 text-[12px] text-zinc-200"
            >
              <span className="relative">
                <Avatar data-chat-pin-avatar className="h-14 w-14 rounded-full">
                  {src && <AvatarImage src={src} alt="" className="rounded-full object-cover" />}
                  <AvatarFallback className="rounded-full bg-zinc-700 text-lg font-semibold text-white">
                    {(name.startsWith('0x') ? name.charAt(2) : name.charAt(0)).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                {unread !== 0 && (
                  <span
                    data-count-badge
                    className={cn(
                      'absolute -right-0.5 -top-0.5 flex items-center justify-center rounded-full bg-white text-[10px] font-bold leading-none text-zinc-950',
                      unread > 0 ? 'h-[18px] min-w-[18px] px-1' : 'h-3 w-3',
                    )}
                  >
                    {unread > 0 ? (unread > 99 ? '99+' : unread) : null}
                  </span>
                )}
              </span>
              <span className="w-full truncate text-center">{first}</span>
            </button>
          </ChatRowContextMenu>
        );
      })}
    </div>
  );
}
