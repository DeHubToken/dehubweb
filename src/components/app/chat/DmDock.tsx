/**
 * DM Dock
 * =======
 * Direct messages as floating bottom-right windows — the same model the post
 * AI chat uses, so hitting "Message" on a profile no longer navigates the
 * reader away from whatever they were looking at. Desktop gets a stacked,
 * resizable panel that minimises into the shared chat rail. A phone has no
 * room for a window, so there the same call hands off to the Messages route
 * exactly as before — the dock is a desktop affordance, not a second DM view.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Minus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useConversations, useCreateConversation } from '@/hooks/use-messages';
import { useMinimizedChats } from '@/hooks/use-minimized-chats';
import { useOpenChatsRegistry } from '@/hooks/use-open-chats-registry';
import { useDmDock, closeDmDock, type DockedDm } from '@/hooks/use-dm-dock';
import { getAccountInfo, type DeHubConversation, type DeHubUser } from '@/lib/api/dehub';
import { buildAvatarUrl } from '@/lib/media-url';
import { emitSendMessage } from '@/lib/api/dehub/dm-socket';
import { prepareOutgoing } from '@/lib/dm-e2ee/keys';
import { DirectMessageChat } from './DirectMessageChat';

/** A thread nobody has opened yet carries a placeholder id until the server hands one back. */
const isVirtualId = (id: string) => id.startsWith('new_') || /^0x[0-9a-fA-F]{40}$/i.test(id);

function perMessageFeeRequired(conversation: DeHubConversation): boolean {
  const holder = conversation.otherUser as { dmSettings?: unknown; dmSetting?: unknown } | undefined;
  const raw = holder?.dmSettings ?? holder?.dmSetting;
  const settings = (Array.isArray(raw) ? raw[0] : raw) as { perMessageFee?: number } | undefined;
  return (
    (Number(settings?.perMessageFee) || 0) > 0 ||
    Boolean(conversation.dmFee?.required && !conversation.dmFee.hasFreeAccess)
  );
}

const MIN_WIDTH = 320;
const MAX_WIDTH = 600;
const CHAT_GAP = 12;

function DmDockPanel({ dm }: { dm: DockedDm }) {
  const { t } = useTranslation();
  const peerKey = dm.address.toLowerCase();
  const chatId = `dm-dock-${peerKey}`;
  const { isAuthenticated } = useAuth();
  const { conversations, isLoading, refetch } = useConversations();
  const createConversation = useCreateConversation();
  const { addChat, removeChat, isMinimized } = useMinimizedChats();
  const isThisMinimized = isMinimized(chatId);
  const { position } = useOpenChatsRegistry(chatId, !isThisMinimized);

  const [conversation, setConversation] = useState<DeHubConversation | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const startedRef = useRef(false);

  const [chatWidth, setChatWidth] = useState(380);
  const isResizingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(380);

  const close = useCallback(() => {
    removeChat(chatId);
    closeDmDock(dm.address);
  }, [chatId, dm.address, removeChat]);

  const minimize = useCallback(() => {
    const peer = conversation?.otherUser;
    addChat({
      id: chatId,
      type: 'dm',
      title: peer?.displayName || peer?.username || dm.displayName || dm.username || dm.address,
      author: dm.address,
      avatar: dm.avatarUrl || buildAvatarUrl(peer?.address || dm.address, peer?.avatarImageUrl || peer?.avatarUrl),
    });
  }, [addChat, chatId, conversation, dm]);

  // An orb must never outlive the panel it restores.
  useEffect(() => () => { removeChat(chatId); }, [chatId, removeChat]);

  // Resolve the thread: an existing conversation if there is one, otherwise
  // create it. Same handshake MessagesPage runs for `openDmWith`.
  useEffect(() => {
    if (!isAuthenticated || conversation || startedRef.current || isLoading) return;
    const existing = conversations?.find(c => c.otherUser?.address?.toLowerCase() === peerKey);
    if (existing) { setConversation(existing); return; }

    startedRef.current = true;
    setFailed(false);
    getAccountInfo(dm.address)
      .catch(() => null)
      .then((user: DeHubUser | null) => createConversation.mutateAsync({
        recipientAddress: dm.address,
        recipientUser: user
          ? ({
              _id: user._id || dm.address,
              address: dm.address,
              username: dm.username ?? user.username,
              displayName: user.displayName ?? user.display_name,
              avatarImageUrl: user.avatarImageUrl ?? user.avatarUrl,
              dmSettings: (user as { dmSettings?: unknown }).dmSettings,
            } as Partial<DeHubUser>)
          : ({ address: dm.address, username: dm.username } as Partial<DeHubUser>),
      }))
      .then(setConversation)
      .catch(() => { startedRef.current = false; setFailed(true); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, conversations, isLoading, conversation, peerKey, attempt]);

  // Swap the placeholder id for the real one as soon as the list catches up —
  // without it the thread stays on the pre-socket path and never sends.
  useEffect(() => {
    if (!conversation || !conversations?.length) return;
    if (!isVirtualId(conversation.id)) return;
    const real = conversations.find(
      c => c.id !== conversation.id && c.otherUser?.address?.toLowerCase() === peerKey
    );
    if (real) setConversation(real);
  }, [conversation, conversations, peerKey]);

  // Chase the real id while the thread is still virtual.
  useEffect(() => {
    if (!conversation || !isVirtualId(conversation.id)) return;
    const fast = setInterval(() => { void refetch(); }, 1500);
    const stop = setTimeout(() => clearInterval(fast), 30000);
    return () => { clearInterval(fast); clearTimeout(stop); };
  }, [conversation, refetch]);

  // A share carried in on `autoSendBody` fires once the thread is real. Paid
  // threads prefill the composer instead: a bare emit carries no txHash and
  // the server drops it.
  const [prefill, setPrefill] = useState<string | undefined>(dm.draftBody);
  const autoSendRef = useRef(dm.autoSendBody);
  useEffect(() => { if (dm.draftBody) setPrefill(dm.draftBody); }, [dm.draftBody]);
  useEffect(() => { if (dm.autoSendBody) autoSendRef.current = dm.autoSendBody; }, [dm.autoSendBody]);
  useEffect(() => {
    const body = autoSendRef.current;
    if (!body || !conversation || isVirtualId(conversation.id)) return;
    autoSendRef.current = undefined;
    if (perMessageFeeRequired(conversation)) { setPrefill(body); return; }
    const dmId = conversation.id;
    void prepareOutgoing(conversation.otherUser?.address, body).then(wire => {
      emitSendMessage({ dmId, content: wire.content, type: 'msg' });
    });
  }, [conversation]);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = chatWidth;

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isResizingRef.current) return;
      const delta = startXRef.current - ev.clientX;
      setChatWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidthRef.current + delta)));
    };
    const handleMouseUp = () => {
      isResizingRef.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [chatWidth]);

  const windowControls = (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={minimize}
        className="text-white/60 hover:text-white hover:bg-white/10 h-8 w-8"
      >
        <Minus className="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={close}
        className="text-white/60 hover:text-white hover:bg-white/10 h-8 w-8"
      >
        <X className="w-4 h-4" />
      </Button>
    </>
  );

  const body = conversation ? (
    <DirectMessageChat
      key={peerKey}
      dock
      conversation={conversation}
      initialComposerText={prefill}
      onBack={close}
      headerActions={windowControls}
    />
  ) : (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-end px-3 py-2 border-b border-white/[0.07]">
        {windowControls}
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
        {failed ? (
          <>
            <p className="text-sm text-zinc-400">{t('messages.failedToLoad')}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setFailed(false); setAttempt(n => n + 1); }}
            >
              {t('common.tryAgain')}
            </Button>
          </>
        ) : (
          <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
        )}
      </div>
    </div>
  );

  if (isThisMinimized) return null;

  const rightOffset = 16 + (position >= 0 ? position : 0) * (chatWidth + CHAT_GAP);

  return createPortal(
    <AnimatePresence>
      <motion.div
        key={chatId}
        initial={{ opacity: 0, y: 40, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.95 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        data-overlay-content
        className="fixed bottom-4 z-50 flex flex-col bg-black/60 backdrop-blur-[24px] saturate-[180%] border border-white/10 shadow-2xl rounded-2xl overflow-hidden"
        style={{ right: `${rightOffset}px`, width: `${chatWidth}px`, height: '520px' }}
      >
        {/* Resize handles — top-left corner and left edge, as on the AI chat. */}
        <div
          onMouseDown={handleResizeStart}
          className="absolute top-0 left-0 w-4 h-4 cursor-nw-resize z-10 group"
        >
          <div className="absolute top-1 left-1 w-2 h-2 rounded-sm bg-white/0 group-hover:bg-white/30 transition-colors" />
        </div>
        <div
          onMouseDown={handleResizeStart}
          className="absolute top-0 left-0 w-1.5 h-full cursor-ew-resize z-10 hover:bg-white/10 transition-colors"
        />
        <div className="flex-1 overflow-hidden">{body}</div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}

export function DmDock() {
  const { dms } = useDmDock();
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated || dms.length === 0) return null;

  return (
    <>
      {dms.map(dm => <DmDockPanel key={dm.address.toLowerCase()} dm={dm} />)}
    </>
  );
}
