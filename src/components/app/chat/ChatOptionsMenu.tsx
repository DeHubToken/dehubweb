import type { ComponentType, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Archive, ArchiveRestore, Bell, BellOff, Eraser, Hand, MessageCircle, MessageCircleDashed, Pin, PinOff, PictureInPicture2, Trash2 } from 'lucide-react';
import * as Ctx from '@/components/ui/context-menu';
import * as Drop from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { ChatPref, ChatPrefPatch } from '@/lib/api/dehub/chat-prefs';
import { isMuted } from '@/hooks/use-chat-prefs';

/*
 * One chat's options, in the same order whether you right-click it in the
 * chat list or press the three dots at the top of an open chat:
 * Open in new window, Archive, Pin, Mute (for how long), Mark as unread,
 * Block, Clear history, Delete chat.
 */

export interface ChatOptionsHandlers {
  pref: ChatPref | undefined;
  /** False when the chat has nothing unread to clear, so the row offers "Mark as unread". */
  hasUnread: boolean;
  isBlocked?: boolean;
  onPref: (patch: ChatPrefPatch) => void;
  onOpenWindow?: () => void;
  onBlock: () => void;
  onClearHistory: () => void;
  onDelete: () => void;
}

type Kit = {
  Item: ComponentType<{ onSelect?: (e: Event) => void; className?: string; children: ReactNode }>;
  Sub: ComponentType<{ children: ReactNode }>;
  SubTrigger: ComponentType<{ className?: string; children: ReactNode }>;
  SubContent: ComponentType<{ className?: string; children: ReactNode }>;
  Separator: ComponentType<{ className?: string }>;
  Portal: ComponentType<{ children: ReactNode }>;
};

const CONTEXT: Kit = {
  Item: Ctx.ContextMenuItem as Kit['Item'],
  Sub: Ctx.ContextMenuSub as Kit['Sub'],
  SubTrigger: Ctx.ContextMenuSubTrigger as Kit['SubTrigger'],
  SubContent: Ctx.ContextMenuSubContent as Kit['SubContent'],
  Separator: Ctx.ContextMenuSeparator as Kit['Separator'],
  Portal: Ctx.ContextMenuPortal as Kit['Portal'],
};
const DROPDOWN: Kit = {
  Item: Drop.DropdownMenuItem as Kit['Item'],
  Sub: Drop.DropdownMenuSub as Kit['Sub'],
  SubTrigger: Drop.DropdownMenuSubTrigger as Kit['SubTrigger'],
  SubContent: Drop.DropdownMenuSubContent as Kit['SubContent'],
  Separator: Drop.DropdownMenuSeparator as Kit['Separator'],
  Portal: Drop.DropdownMenuPortal as Kit['Portal'],
};

/** Menus opened from riftn.com/chat must sit above its full-screen layer (z-70). */
export const CHAT_MENU_CONTENT = 'z-[150] min-w-[15rem] rounded-2xl border border-white/10 bg-zinc-900/95 p-1.5 shadow-2xl backdrop-blur-xl';
const ROW = 'flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-[14px] text-zinc-100 outline-none focus:bg-white/10 focus:text-white data-[highlighted]:bg-white/10 data-[highlighted]:text-white data-[state=open]:text-white [&>svg:first-child]:h-[18px] [&>svg:first-child]:w-[18px] [&>svg:first-child]:shrink-0 [&>svg:first-child]:text-zinc-400';

const HOUR = 3600_000;

function ChatOptionItems({ kit, h }: { kit: Kit; h: ChatOptionsHandlers }) {
  const { t } = useTranslation();
  const { Item, Sub, SubTrigger, SubContent, Separator, Portal } = kit;
  const muted = isMuted(h.pref);
  const pinned = !!h.pref?.pinnedAt;
  const archived = !!h.pref?.archivedAt;
  const unread = h.hasUnread || !!h.pref?.markedUnread;
  const muteFor = (ms: number | 'forever') => () =>
    h.onPref({ mutedUntil: ms === 'forever' ? 'forever' : new Date(Date.now() + ms).toISOString() });

  return (
    <>
      {h.onOpenWindow && (
        <>
          <Item className={ROW} onSelect={h.onOpenWindow}>
            <PictureInPicture2 />{t('chatMenu.openWindow', 'Open in new window')}
          </Item>
          <Separator className="my-1 h-px bg-white/10" />
        </>
      )}
      <Item className={ROW} onSelect={() => h.onPref({ archived: !archived })}>
        {archived ? <ArchiveRestore /> : <Archive />}
        {archived ? t('chatMenu.unarchive', 'Unarchive') : t('chatMenu.archive', 'Archive')}
      </Item>
      {!archived && (
        <Item className={ROW} onSelect={() => h.onPref({ pinned: !pinned })}>
          {pinned ? <PinOff /> : <Pin />}
          {pinned ? t('chatMenu.unpin', 'Unpin') : t('chatMenu.pin', 'Pin')}
        </Item>
      )}
      {muted ? (
        <Item className={ROW} onSelect={() => h.onPref({ mutedUntil: null })}>
          <Bell />{t('chatMenu.unmute', 'Unmute notifications')}
        </Item>
      ) : (
        <Sub>
          <SubTrigger className={cn(ROW, 'data-[state=open]:bg-white/10 [&>svg:last-child]:text-zinc-500')}>
            <BellOff />{t('chatMenu.mute', 'Mute notifications')}
          </SubTrigger>
          {/* Portalled: the menu clips its own overflow, which hid the list. */}
          <Portal>
          <SubContent className={cn(CHAT_MENU_CONTENT, 'min-w-[11rem]')}>
            <Item className={ROW} onSelect={muteFor(HOUR)}>{t('chatMenu.mute1h', 'For 1 hour')}</Item>
            <Item className={ROW} onSelect={muteFor(8 * HOUR)}>{t('chatMenu.mute8h', 'For 8 hours')}</Item>
            <Item className={ROW} onSelect={muteFor(24 * HOUR)}>{t('chatMenu.mute1d', 'For 1 day')}</Item>
            <Item className={ROW} onSelect={muteFor(7 * 24 * HOUR)}>{t('chatMenu.mute7d', 'For 7 days')}</Item>
            <Item className={ROW} onSelect={muteFor('forever')}>{t('chatMenu.muteForever', 'Until I turn it back on')}</Item>
          </SubContent>
          </Portal>
        </Sub>
      )}
      <Item className={ROW} onSelect={() => h.onPref({ unread: !unread })}>
        {unread ? <MessageCircle /> : <MessageCircleDashed />}
        {unread ? t('chatMenu.markRead', 'Mark as read') : t('chatMenu.markUnread', 'Mark as unread')}
      </Item>
      <Item className={ROW} onSelect={h.onBlock}>
        <Hand />{h.isBlocked ? t('chatMenu.unblock', 'Unblock user') : t('chatMenu.block', 'Block user')}
      </Item>
      <Item className={ROW} onSelect={h.onClearHistory}>
        <Eraser />{t('chatMenu.clearHistory', 'Clear history')}
      </Item>
      <Item className={cn(ROW, 'text-red-400 focus:text-red-300 data-[highlighted]:text-red-300 [&>svg:first-child]:text-red-400')} onSelect={h.onDelete}>
        <Trash2 />{t('chatMenu.delete', 'Delete chat')}
      </Item>
    </>
  );
}

/** Right-click a chat row on a computer for its options. */
export function ChatRowContextMenu({ children, ...h }: ChatOptionsHandlers & { children: ReactNode }) {
  return (
    <Ctx.ContextMenu>
      <Ctx.ContextMenuTrigger asChild>{children}</Ctx.ContextMenuTrigger>
      <Ctx.ContextMenuContent data-chat-options-menu className={CHAT_MENU_CONTENT}>
        <ChatOptionItems kit={CONTEXT} h={h} />
      </Ctx.ContextMenuContent>
    </Ctx.ContextMenu>
  );
}

/** The same options inside an open chat's three-dot menu. */
export function ChatOptionsDropdownItems(h: ChatOptionsHandlers) {
  return <ChatOptionItems kit={DROPDOWN} h={h} />;
}
