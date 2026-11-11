import { useTranslation as _useCopy } from 'react-i18next';
import { useSurfaceDraft } from '@/hooks/use-surface-draft';
import { BrandIcon } from '@/components/app/war/WarHudIcon';
import { AppState } from '@/components/app/AppState';
import { IslandAction, PageIsland, usePhonePill } from '@/components/app/page-kit/PageKit';
import { DhbCoin } from '@/components/app/DhbAmount';
import { lazy, Suspense, useState, useEffect, useRef, useCallback, type CSSProperties } from 'react';
import CloseIcon from '@/components/ui/cut-icons/close';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { Loader2 } from "lucide-react";
import RefreshCw from "@/components/ui/cut-icons/refresh";
import Trash2 from "@/components/ui/cut-icons/delete";
import Ban from "@/components/ui/cut-icons/blocked";

import Search from "@/components/ui/cut-icons/search";
import Plus from "@/components/ui/cut-icons/add";
import MessageCircle from "@/components/ui/cut-icons/message-envelope";
import Fullscreen from "@/components/ui/cut-icons/fullscreen";
import ExitFullscreen from "@/components/ui/cut-icons/exit-fullscreen";
import { FullScreenChatShell } from '@/components/app/chat/FullScreenChatShell';
import { ChatTextSizeButton } from '@/components/app/chat/ChatTextSizeButton';
import { ChatIconButton, ChatListTop, ChatMeDock } from '@/components/app/chat/FullScreenChatChrome';
import { ChatRowContextMenu, type ChatOptionsHandlers } from '@/components/app/chat/ChatOptionsMenu';
import { isArchived, isMuted, useChatPrefs, useClearChatHistory } from '@/hooks/use-chat-prefs';
import type { ChatPref } from '@/lib/api/dehub/chat-prefs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Archive, BellOff, Pin, ChevronLeft } from 'lucide-react';

import { VerifiedBadge } from '@/components/app/VerifiedBadge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { PublicChat, DirectMessageChat, NewConversationModal, NewMessageSelector } from '@/components/app/chat';
import { NewMessageDrawer, type NewMessageDrawerHandle } from '@/components/app/chat/NewMessageDrawer';
import { flushSync } from 'react-dom';
import { OnlineDot } from '@/components/app/chat/OnlineDot';

import { useAuth } from '@/contexts/AuthContext';
import { usePublicChatReading, usePublicChatUnreadCount } from '@/hooks/use-public-chat-unread';
import { AuthGate } from '@/components/app/AuthGate';
import { useConversations, useCreateConversation, useUserSearchForDM, useDeleteConversation } from '@/hooks/use-messages';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { getMediaUrl, getAccountInfo, type DeHubConversation, type DeHubUser } from '@/lib/api/dehub';
import { buildAvatarUrl, extractAvatarPath } from '@/lib/media-url';
import { formatDistanceToNow } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { BadgedName } from '@/components/app/BadgedName';
import { useDMRealtime } from '@/hooks/use-dm-realtime';
import { conversationIdentity } from '@/lib/conversation-identity';
import { encryptedMediaLabel } from '@/lib/dm-e2ee/media-label';
import { useDraftText } from '@/hooks/use-draft';
import { SwipeableRow } from '@/components/ui/swipeable-row';
import { showUndoToast } from '@/components/ui/undo-toast';
import { scheduleDelete, undoDelete, usePendingDeletes, UNDO_WINDOW_MS } from '@/lib/undoable-delete';
import { useKeyboardOpen, useVisualViewportBox } from '@/hooks/use-keyboard-open';
import { emitSendMessage } from '@/lib/api/dehub/dm-socket';
import { prepareOutgoing } from '@/lib/dm-e2ee/keys';
import chatBubbleIcon from '@/assets/icons/chat-bubble.webp';
import messagesBubbleIcon from '@/assets/icons/messages-3d-icon.webp';
import dehubLogo from '@/assets/dehub-logo.png';
import { SEOHead } from '@/components/SEOHead';
import { blockUser } from '@/lib/api/dehub/blocks';
import { toast } from 'sonner';
import { LiveRipple } from '@/components/app/LiveRipple';
import { NewGroupChannelSheet, type NewChatKind } from '@/components/app/chat/NewGroupChannelSheet';
import { GroupChatRow } from '@/components/app/chat/GroupChatRow';
import { useUserCommunities } from '@/hooks/use-communities';
import { chatsFromMemberships } from '@/lib/community-kinds';

/**
 * The other person's name with their badge sitting on its baseline, the same
 * BadgedName system the feed uses. The badge rides straight after the name
 * (before the online dot) so it reads as part of the name.
 */
function ConversationName({ user, children }: { user?: DeHubUser; children: React.ReactNode }) {
  return (
    <BadgedName
      badgeBalance={user?.badgeBalance}
      badgeLock={user?.badgeLock}
      username={user?.username}
      lookupId={user ? user.username || user.address || user.wallet_address : null}
      className="font-semibold text-white"
    >
      {children}
    </BadgedName>
  );
}

function ConversationsSkeleton() {
  return (
    <div className="space-y-1">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-4">
          <Skeleton className="w-12 h-12 rounded-lg bg-white/[0.06]" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32 bg-white/[0.06]" />
            <Skeleton className="h-3 w-48 bg-white/[0.06]" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ConversationItem({
  conversation,
  onClick,
  isSelected,
  onDelete,
  onBlock,
  pref,
}: {
  conversation: DeHubConversation;
  onClick: () => void;
  isSelected: boolean;
  onDelete: (conversation: DeHubConversation) => void;
  onBlock: (conversation: DeHubConversation) => void;
  /** Your own pin / mute / marked-unread for this chat (full-screen chat). */
  pref?: ChatPref;
}) {
  const { t: _copy } = _useCopy();
  const { t } = useTranslation();
  const otherUser = conversation.otherUser || conversation.participants?.[0];
  const avatarUrl = buildAvatarUrl(otherUser?.address || '', otherUser?.avatarImageUrl || otherUser?.avatarUrl);
  const displayName = otherUser?.displayName || otherUser?.display_name || '';
  const username = otherUser?.username || '';
  const fallbackName = displayName || username ||
    (otherUser?.address ? `${otherUser.address.slice(0, 6)}...${otherUser.address.slice(-4)}` : 'User');
  const lastMessagePreview = conversation.lastMessage?.undecryptable
    ? `🔒 ${t('messages.cannotDecrypt')}`
    : conversation.lastMessage?.content || _copy("copy.f42e0f66017d", { defaultValue: "No messages yet" });
  const lastMessageTime = conversation.lastMessage?.createdAt 
    ? formatDistanceToNow(new Date(conversation.lastMessage.createdAt), { addSuffix: false })
    : '';

  // An unsent message left in this thread's composer. Shown in place of the
  // last message, the way every mail and chat client does it — a draft nobody
  // can see from the list is indistinguishable from a draft that was lost.
  const draft = useDraftText(conversationIdentity(conversation));

  return (
    <SwipeableRow
      actions={[
        {
          key: 'block',
          label: t('profileOptions.block'),
          icon: <Ban className="w-4 h-4" />,
          className: 'bg-zinc-700',
          onSelect: () => onBlock(conversation),
        },
        {
          key: 'delete',
          label: t('common.delete'),
          icon: <Trash2 className="w-4 h-4" />,
          className: 'bg-red-600',
          onSelect: () => onDelete(conversation),
          destructive: true,
        },
      ]}
    >
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-4 border-t border-white/[0.07] hover:bg-white/[0.04] transition-colors text-left ${
        isSelected ? 'bg-white/[0.07]' : ''
      }`}
    >
      <LiveRipple ids={[otherUser?.address, otherUser?.username]} className="relative rounded-lg">
        <Avatar className="w-12 h-12">
          {avatarUrl && <AvatarImage src={avatarUrl} />}
          <AvatarFallback className="bg-zinc-700 text-white font-medium">
            {(fallbackName.startsWith('0x') ? fallbackName.charAt(2) : fallbackName.charAt(0)).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </LiveRipple>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 min-w-0">
            {displayName ? (
              <>
                <ConversationName user={otherUser}>{displayName}</ConversationName>
                <OnlineDot address={otherUser?.address} />
                {username && <span className="text-zinc-500 text-sm truncate">@{username}</span>}
              </>
            ) : (
              <>
                <ConversationName user={otherUser}>{fallbackName}</ConversationName>
                <OnlineDot address={otherUser?.address} />
              </>
            )}
          </span>
          {lastMessageTime && (
            <span className="text-zinc-500 text-sm ml-auto flex-shrink-0 tabular-nums">{lastMessageTime}</span>
          )}
          {pref && isMuted(pref) && <BellOff data-chat-row-muted aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-zinc-500" />}
          {pref?.pinnedAt && <Pin data-chat-row-pinned aria-hidden="true" className="h-3.5 w-3.5 shrink-0 rotate-45 text-zinc-500" />}
          {pref?.markedUnread && !(conversation.unreadCount > 0) && (
            <span data-count-badge data-chat-row-marked-unread aria-label="Unread" className="ml-1 h-2.5 w-2.5 shrink-0 rounded-full bg-white" />
          )}
          {/* Count rides in the name row rather than welded to the avatar corner,
              matching the mobile app. White-on-near-black instead of red-500:
              the palette has no colour in it, and Osaka/Jungle still repaint
              this through [data-count-badge]. */}
          {conversation.unreadCount > 0 && (
            <div data-count-badge className="ml-0.5 min-w-[18px] h-[18px] px-1.5 bg-white rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-zinc-950 text-[10px] font-bold leading-none tabular-nums">
                {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
              </span>
            </div>
          )}
        </div>
        {draft ? (
          <p className="text-sm truncate text-white">
            <span className="font-medium">{_copy("copy.9565c5e214a4", { defaultValue: "Draft: " })}</span>
            {draft}
          </p>
        ) : (
          <p className={`text-sm truncate text-white ${conversation.unreadCount > 0 ? 'font-bold' : 'font-normal'}`}>
            {conversation.lastMessage?.encMedia
              ? encryptedMediaLabel(conversation.lastMessage.encMedia, _copy) :
             conversation.lastMessage?.type === 'image' ? _copy("copy.1b13ff986443", { defaultValue: "📷 Photo" }) :
             conversation.lastMessage?.type === 'gif' ? _copy("copy.fd0ce9669a4e", { defaultValue: "🎞️ GIF" }) :
             lastMessagePreview}
          </p>
        )}
      </div>
    </button>
    </SwipeableRow>
  );
}

/**
 * `fullscreen` is riftn.com/chat: the same inbox with nothing else on screen,
 * the list and the open chat side by side on a computer, and the cozy thread
 * layout (grouped bubbles, day pills, wallpaper). See FullScreenChatShell.
 */
// Settings open inside the full-screen chat (computers) rather than leaving it.
const EmbeddedSettings = lazy(() => import('@/pages/app/SettingsPage'));

export default function MessagesPage({ fullscreen = false }: { fullscreen?: boolean } = {}) {
  const { t: _copy } = _useCopy();
  const { t } = useTranslation();
  const location = useLocation();
  const [selectedConversation, setSelectedConversation] = useState<DeHubConversation | null>(null);
  const [showPublicChat, setShowPublicChat] = useState(false);
  // A conversation open on mobile reclaims the bottom-nav zone as well as the
  // header zone: the reply strip (orb flanked by two drafts) lives in that
  // band until the composer takes focus and the keyboard takes it instead.
  const chatOpen = !!selectedConversation || showPublicChat;
  // The inbox scrolls behind the floating nav. Reserve its clearance inside
  // the list, so a viewport-height gap cannot paint a strip behind the pill.
  const keyboardOpen = useKeyboardOpen();
  const mobileChatHeight = 'h-[calc(100dvh_-_var(--app-top-bar))]';
  // dvh only tracks the keyboard on Android (interactive-widget) — iOS keeps
  // the layout viewport full-size and just covers it. Sizing to the measured
  // visual viewport keeps the composer above the keyboard on both. On iOS,
  // Safari additionally PANS the page to chase the focused input (offsetTop
  // > 0), shoving the chat off the top and leaving a dead gap above the
  // keyboard — when that happens, pin the chat over the visible area instead:
  // position:fixed anchors to the layout viewport, so top = offsetTop lands
  // exactly on the visual viewport. Android never pans (offsetTop stays 0),
  // so its in-flow layout is untouched.
  const { height: vvHeight, offsetTop: vvOffsetTop } = useVisualViewportBox(keyboardOpen);
  const keyboardStyle: CSSProperties | undefined = keyboardOpen && vvHeight
    ? vvOffsetTop > 1
      ? { position: 'fixed', top: vvOffsetTop, left: 0, right: 0, height: vvHeight, zIndex: 40, background: '#000' }
      // The chat starts under the top bar, which is 0 on a phone now: taking a
      // fixed 44px off left a dead band between the composer and the keys.
      : { height: `calc(${vvHeight}px - var(--app-top-bar))` }
    : undefined;
  const [showMessageSelector, setShowMessageSelector] = useState(false);
  const [showNewConversation, setShowNewConversation] = useState(false);
  // Phones: the + opens the New message drawer directly, keyboard up.
  const [showNewMessageDrawer, setShowNewMessageDrawer] = useState(false);
  const newMessageDrawerRef = useRef<NewMessageDrawerHandle>(null);
  // The chat opened from that drawer, whose composer takes the caret on arrival.
  const [composerFocusFor, setComposerFocusFor] = useState<string | null>(null);
  const [newChatKind, setNewChatKind] = useState<NewChatKind | null>(null);
  const { data: myMemberships } = useUserCommunities();
  
  const [searchQuery, setSearchQuery] = useSurfaceDraft("pages/app/MessagesPage.tsx:searchQuery", '');
  const phonePill = usePhonePill();
  // Both search-backed queries key on the query string — passing the raw
  // input fired 2 network requests per KEYSTROKE (each prefix a fresh cache
  // key). Debounce to one request pair per pause in typing.
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);
  const groupChats = chatsFromMemberships(myMemberships).filter(c =>
    !searchQuery.trim() || c.name.toLowerCase().includes(searchQuery.trim().toLowerCase()));
  const { isAuthenticated, walletAddress } = useAuth();

  // Subscribe to DM realtime updates only when on messages page
  useDMRealtime();

  const{
    conversations,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useConversations(debouncedSearchQuery);

  const createConversation = useCreateConversation();

  const openNewMessage = useCallback(() => {
    const phone = typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
    if (!phone) {
      setShowMessageSelector(true);
      return;
    }
    // Inside the tap, so iOS lets the keyboard come up with the drawer.
    newMessageDrawerRef.current?.primeKeyboard();
    setShowNewMessageDrawer(true);
  }, []);

  /**
   * A person picked in the drawer: open the chat in place right away (a thread
   * you have never had starts as the usual virtual `new_0x…` one, which the
   * chat creates on the server itself), then let the drawer slide away and
   * hand the caret to the composer while the keyboard is still up.
   */
  const pickFromDrawer = useCallback((user: DeHubUser) => {
    const addr = (user.address || '').toLowerCase();
    if (!addr) return;
    const existing = conversations?.find(c => c.otherUser?.address?.toLowerCase() === addr);
    const now = new Date().toISOString();
    const conv: DeHubConversation = existing ?? {
      id: `new_${addr}`,
      participants: [user],
      otherUser: user,
      unreadCount: 0,
      createdAt: now,
      updatedAt: now,
    } as DeHubConversation;
    setComposerFocusFor(conversationIdentity(conv));
    flushSync(() => setSelectedConversation(conv));
    window.setTimeout(() => {
      setShowNewMessageDrawer(false);
      requestAnimationFrame(() => {
        const box = document.querySelector<HTMLTextAreaElement>('[data-chat-composer-input]');
        box?.focus({ preventScroll: true });
      });
    }, 60);
  }, [conversations]);
  const { data: userSearchResults, isLoading: isSearchingUsers } = useUserSearchForDM(debouncedSearchQuery);

  /*
   * Until now deleting a thread meant opening it first and going through its
   * menu. The row's left swipe does it from the list, as Mail and Messages do.
   */
  const deleteConversationMutation = useDeleteConversation();
  const pendingDeletes = usePendingDeletes();

  // The row is gone the moment it is swiped away, with Undo in the toast; the
  // real delete runs when that window closes. A swipe is one careless thumb
  // away, and a confirm dialog after every one defeats the point of swiping.
  const handleDeleteConversation = useCallback((conv: DeHubConversation) => {
    setSelectedConversation(prev => (prev?.id === conv.id ? null : prev));
    scheduleDelete(conv.id, () =>
      deleteConversationMutation.mutate(conv.id, {
        onError: () => toast.error(t('messages.deleteConversationFailed')),
      }),
    );
    showUndoToast(t('toasts.conversation_deleted'), {
      id: `dm-delete-${conv.id}`,
      duration: UNDO_WINDOW_MS,
      undoLabel: t('common.undo'),
      closeLabel: t('common.close'),
      onUndo: () => undoDelete(conv.id),
    });
  }, [deleteConversationMutation, t]);

  const visibleConversations = (conversations || []).filter(c => !pendingDeletes.has(c.id));

  const handleBlockConversationUser = useCallback(async (conv: DeHubConversation) => {
    const user = conv.otherUser || conv.participants?.[0];
    if (!user?.address) return;
    try {
      await blockUser(user.address, 'Blocked from message list');
      toast.success(_copy("copy.2b7bd96d731a", { defaultValue: "User blocked" }));
    } catch {
      toast.error(_copy("copy.d2b91e7b896f", { defaultValue: "Failed to block user" }));
    }
  }, [_copy]);

  // Full-screen chat on a computer: your own pins, archive, mutes and
  // "marked unread", plus the right-click menu on every row.
  const richList = fullscreen && !phonePill;
  const clearHistory = useClearChatHistory();
  const { byId: chatPrefs, update: updateChatPref } = useChatPrefs();
  const [showArchived, setShowArchived] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  // Opening any chat puts settings away.
  useEffect(() => {
    if (selectedConversation || showPublicChat) setShowSettings(false);
  }, [selectedConversation, showPublicChat]);
  const [clearTarget, setClearTarget] = useState<DeHubConversation | null>(null);
  const lastActivity = (c: DeHubConversation) => c.lastMessage?.createdAt || c.updatedAt;
  const archivedConversations = richList
    ? visibleConversations.filter(c => isArchived(chatPrefs.get(c.id), lastActivity(c)))
    : [];
  const pinnedAt = (c: DeHubConversation) => {
    const at = chatPrefs.get(c.id)?.pinnedAt;
    return at ? new Date(at).getTime() : 0;
  };
  const listedConversations = !richList
    ? visibleConversations
    : showArchived
      ? archivedConversations
      : visibleConversations
          .filter(c => !isArchived(chatPrefs.get(c.id), lastActivity(c)))
          .sort((a, b) => pinnedAt(b) - pinnedAt(a));
  const chatOptionsFor = (conv: DeHubConversation): ChatOptionsHandlers => {
    const peer = (conv.otherUser || conv.participants?.[0])?.address;
    return {
      pref: chatPrefs.get(conv.id),
      // The server's unread count clears when the chat is opened; the menu
      // only flips your own "marked unread" flag.
      hasUnread: false,
      onPref: (patch) => updateChatPref(conv.id, patch),
      onOpenWindow: peer
        ? () => { window.open(`/chat?with=${encodeURIComponent(peer)}`, `riftn-chat-${conv.id}`, 'popup,width=520,height=780'); }
        : undefined,
      onBlock: () => handleBlockConversationUser(conv),
      onClearHistory: () => setClearTarget(conv),
      onDelete: () => handleDeleteConversation(conv),
    };
  };
  const openConversation = (conv: DeHubConversation) => {
    setShowPublicChat(false);
    setSelectedConversation({ ...conv, unreadCount: 0 });
    if (chatPrefs.get(conv.id)?.markedUnread) updateChatPref(conv.id, { unread: false });
  };

  // Get existing conversation addresses to filter search results
  const existingAddresses = new Set(
    (conversations || []).map(c => c.otherUser?.address?.toLowerCase()).filter(Boolean)
  );

  // Filter user search results to exclude users we already have conversations with
  const newUserResults = (userSearchResults?.items || []).filter(
    (user: DeHubUser) => !existingAddresses.has(user.address?.toLowerCase())
  );

  /** Handle clicking a user search result — always create conversation and open chat */
  const handleSelectSearchUser = (user: DeHubUser) => {
    const dmSettingsObj = (() => {
      const raw = (user as any).dmSettings || (user as any).dmSetting;
      return Array.isArray(raw) ? raw[0] : raw;
    })();
    const dmDisabled = dmSettingsObj?.disables?.includes('NEW_DM') || dmSettingsObj?.disables?.includes('all');
    if (dmDisabled) return;

    const userAddress = user.address || (user as any)._id;
    if (!userAddress) return;

    createConversation.mutateAsync({
      recipientAddress: userAddress,
      recipientUser: user,
    }).then(conv => {
      setSelectedConversation(conv);
      setSearchQuery.complete(searchQuery, '');
    }).catch(() => {});
  };

  // Capture navigation state into a ref immediately (before it can be cleared)
  const pendingDmRef = useRef<{ address: string; username?: string; autoSendBody?: string } | null>(null);
  const pendingAutoSendRef = useRef<{ peerAddress: string; body: string } | null>(null);
  const pendingDraftRef = useRef<{ peerAddress: string; body: string } | null>(null);
  // Draft carried into a fee-gated chat's composer (see auto-send effect below).
  const [composerPrefill, setComposerPrefill] = useState<{ convId: string; text: string } | null>(null);
  const [pendingDmTrigger, setPendingDmTrigger] = useState(0);
  
  // Account-info lookup fired the moment the "Message" navigation arrives so
  // it overlaps the conversations load below (was a serial 3-round-trip chain).
  const pendingUserPromiseRef = useRef<Promise<DeHubUser | null> | null>(null);

  // `?chat=public` is the same landing in a URL, which is all a push or an
  // email can carry: a mention in the public chat opens the room itself.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('chat') === 'public') setShowPublicChat(true);
    // `?with=<address>` opens that chat: what "Open in new window" links to.
    const peer = params.get('with');
    if (peer && /^0x[0-9a-fA-F]{40}$/.test(peer)) {
      pendingDmRef.current = { address: peer };
      pendingUserPromiseRef.current = getAccountInfo(peer).catch(() => null);
      setPendingDmTrigger(prev => prev + 1);
    }
  }, [location.search]);

  useEffect(() => {
    const state = location.state as { openDmWith?: string; username?: string; autoSendBody?: string; draftBody?: string; openPublicChat?: boolean } | null;
    // Where a public-chat notification lands. Without it the card drops the
    // reader on the conversation list and makes them find the room that just
    // interrupted them.
    if (state?.openPublicChat) {
      setShowPublicChat(true);
      window.history.replaceState({}, document.title);
      return;
    }
    if (state?.openDmWith) {
      pendingDmRef.current = { address: state.openDmWith, username: state.username, autoSendBody: state.autoSendBody };
      if (state.autoSendBody) {
        pendingAutoSendRef.current = { peerAddress: state.openDmWith.toLowerCase(), body: state.autoSendBody };
      }
      // `draftBody` is autoSendBody's opposite number: open the chat with the
      // message typed but NOT sent. Welcoming a new member is the case that
      // needs it — a canned greeting fired off without the sender ever seeing
      // it reads as a bot, and the point of the feature is that a person said
      // hello. Mobile's `sharedText` behaves the same way.
      if (state.draftBody) {
        pendingDraftRef.current = { peerAddress: state.openDmWith.toLowerCase(), body: state.draftBody };
      }
      // Start the _id lookup now — if an existing conversation is found the
      // result is simply discarded.
      pendingUserPromiseRef.current = getAccountInfo(state.openDmWith).catch(() => null);
      window.history.replaceState({}, document.title);
      setPendingDmTrigger(prev => prev + 1);
    }
  }, [location.state]); // re-run when navigation state changes

  // Process the pending DM once conversations have finished loading
  useEffect(() => {
    if (!pendingDmRef.current || !isAuthenticated || isLoading) return;
    const { address, username } = pendingDmRef.current;
    pendingDmRef.current = null;

    const targetAddress = address.toLowerCase();
    const existing = conversations?.find(c =>
      c.otherUser?.address?.toLowerCase() === targetAddress
    );

    if (existing) {
      pendingUserPromiseRef.current = null;
      setSelectedConversation(existing);
    } else {
      // The account_info lookup (for the MongoDB _id createAndStart requires)
      // was fired when the navigation arrived — by now it has usually resolved
      // in parallel with the conversations load.
      const userPromise = pendingUserPromiseRef.current ?? getAccountInfo(address).catch(() => null);
      pendingUserPromiseRef.current = null;
      userPromise
        .then((user: DeHubUser | null) =>
          user
            ? createConversation.mutateAsync({
                recipientAddress: address,
                recipientUser: {
                  _id: user._id || address,
                  address,
                  username: username ?? user.username,
                  displayName: user.displayName ?? user.display_name,
                  avatarImageUrl: user.avatarImageUrl ?? user.avatarUrl,
                  dmSettings: (user as any).dmSettings,
                },
              })
            : createConversation.mutateAsync({
                recipientAddress: address,
                recipientUser: { address, username } as Partial<DeHubUser>,
              })
        )
        .then((conv) => setSelectedConversation(conv))
        .catch(() => {});
    }
  }, [isAuthenticated, conversations, isLoading, pendingDmTrigger]);

  // When conversations list gets a real dmId for the same peer (e.g. after getContacts returns Riftn data),
  // upgrade selectedConversation so we use socket/Riftn instead of Supabase
  useEffect(() => {
    if (!selectedConversation || !conversations?.length) return;
    const selId = selectedConversation.id;
    const isVirtual = selId.startsWith('new_') || /^0x[0-9a-fA-F]{40}$/i.test(selId);
    if (!isVirtual) return;
    const peerAddr = (selId.startsWith('new_') ? selId.replace('new_', '') : selId).toLowerCase();
    const realConv = conversations.find(
      c => c.id !== selId &&
        c.otherUser?.address?.toLowerCase() === peerAddr
    );
    if (realConv) {
      setSelectedConversation(realConv);
    }
  }, [selectedConversation, conversations]);

  // Refetch conversations more often when we have a virtual convo selected, to pick up real dmId from Riftn sooner.
  // Route-gated: this page stays mounted forever (PersistentPageCache), so
  // without the pathname check the interval would poll for the whole session
  // after the user navigates away mid-handshake.
  const hasVirtualSelected = selectedConversation &&
    (selectedConversation.id.startsWith('new_') || /^0x[0-9a-fA-F]{40}$/i.test(selectedConversation.id));
  // The route this instance answers on. /chat mounts its own copy outside the
  // app layout, so each copy only polls and pushes history while it is shown.
  const routeBase = fullscreen ? '/chat' : '/app/messages';
  const isMessagesRouteActive = location.pathname === routeBase;
  const publicUnread = usePublicChatUnreadCount();
  usePublicChatReading(isMessagesRouteActive && showPublicChat);

  /*
   * Back out of a chat to the conversation LIST, not out of Messages entirely.
   *
   * Opening a thread is component state and used to push no history entry at
   * all, so /app/messages was a single stack entry and the device Back popped
   * the whole route — landing the user on the home feed.
   *
   * The entry is carried in the SEARCH, not a route param: the pathname has to
   * stay exactly '/app/messages' or three separate things break. PersistentPageCache
   * matches it with strict equality, the messages route has no child route, and
   * the 5s message poll is gated on the same literal string. Pushed through
   * react-router rather than history.pushState so its internal index survives.
   */
  const navigate = useNavigate();
  const chatEntryRef = useRef(false);
  const chatParamPresent = new URLSearchParams(location.search).get('chat') === '1';

  useEffect(() => {
    if (!isMessagesRouteActive) return;
    if (chatOpen && !chatEntryRef.current) {
      chatEntryRef.current = true;
      navigate(`${routeBase}?chat=1`);
    }
  }, [chatOpen, isMessagesRouteActive, navigate, routeBase]);

  // Back was pressed: the param is gone, so close the chat rather than leave
  // the route. This also clears a selection that would otherwise survive —
  // MessagesPage never unmounts, so tapping Messages used to reopen the last
  // thread instead of the list.
  useEffect(() => {
    if (!isMessagesRouteActive) return;
    if (!chatParamPresent && chatEntryRef.current) {
      chatEntryRef.current = false;
      setSelectedConversation(null);
      setShowPublicChat(false);
    }
  }, [chatParamPresent, isMessagesRouteActive]);

  // The in-app arrow has to CONSUME the entry we pushed, or it is left dangling
  // and the next Back walks straight back into the chat. Don't clear the ref
  // here — navigate(-1)'s popstate is async, so clearing it early loses the
  // race with the effect above: it'd see chatEntryRef already false, skip
  // clearing the selection, and the push effect would immediately re-push
  // '?chat=1' since chatOpen was still true — undoing the back nav and
  // forcing a second tap. Leave it true and let that effect reset it once
  // the URL actually changes.
  const closeChat = useCallback(() => {
    if (chatEntryRef.current) {
      navigate(-1);
      return;
    }
    setSelectedConversation(null);
    setShowPublicChat(false);
  }, [navigate]);
  useEffect(() => {
    if (!hasVirtualSelected || !isMessagesRouteActive) return;
    // Poll at 1.5s for first 30s, then 5s
    const fast = setInterval(() => refetch(), 1500);
    let slowInterval: ReturnType<typeof setInterval>;
    const slow = setTimeout(() => {
      clearInterval(fast);
      slowInterval = setInterval(() => refetch(), 5000);
    }, 30000);
    return () => { clearInterval(fast); clearTimeout(slow); clearInterval(slowInterval); };
  }, [hasVirtualSelected, isMessagesRouteActive, refetch]);

  // Auto-send a queued invite/draft message once the selected conversation has a real dmId
  useEffect(() => {
    const pending = pendingAutoSendRef.current;
    if (!pending || !selectedConversation) return;
    const peerAddr = selectedConversation.otherUser?.address?.toLowerCase();
    if (peerAddr !== pending.peerAddress) return;

    // Fee-gated chats must go through the composer's payment flow: a bare
    // emit carries no txHash, so the server rejects it and the queued share
    // used to vanish silently (user landed on an EMPTY composer and had to
    // retype + press send again). Prefill the composer instead — one tap on
    // Send runs the existing pay-and-send path.
    const holder = selectedConversation.otherUser as { dmSettings?: unknown; dmSetting?: unknown } | undefined;
    const rawSettings = holder?.dmSettings ?? holder?.dmSetting;
    const settings = (Array.isArray(rawSettings) ? rawSettings[0] : rawSettings) as { perMessageFee?: number } | undefined;
    const feeRequired =
      (Number(settings?.perMessageFee) || 0) > 0 ||
      (selectedConversation.dmFee?.required && !selectedConversation.dmFee.hasFreeAccess);
    if (feeRequired) {
      pendingAutoSendRef.current = null;
      setComposerPrefill({ convId: selectedConversation.id, text: pending.body });
      return;
    }

    const dmId = selectedConversation.id;
    const isVirtual = dmId.startsWith('new_') || /^0x[0-9a-fA-F]{40}$/i.test(dmId);
    if (isVirtual) return; // wait for real dmId
    pendingAutoSendRef.current = null;
    void prepareOutgoing(selectedConversation.otherUser?.address, pending.body)
      .then(wire => emitSendMessage({ dmId, content: wire.content, type: 'msg' }))
      .catch(() => { setComposerPrefill({ convId: dmId, text: pending.body }); });
  }, [selectedConversation]);

  // Drop a queued draft into the composer once the right chat is on screen.
  // Waits for a real dmId for the same reason the auto-send does: the prefill
  // is keyed by conversation id, and a virtual `new_0x…` id is replaced the
  // moment the conversation list catches up, which would take the draft with it.
  useEffect(() => {
    const pending = pendingDraftRef.current;
    if (!pending || !selectedConversation) return;
    if (selectedConversation.otherUser?.address?.toLowerCase() !== pending.peerAddress) return;

    const dmId = selectedConversation.id;
    if (dmId.startsWith('new_') || /^0x[0-9a-fA-F]{40}$/i.test(dmId)) return;
    pendingDraftRef.current = null;
    setComposerPrefill({ convId: dmId, text: pending.body });
  }, [selectedConversation]);

  // /chat's own title, card and canonical. Shown signed out too, so a shared
  // riftn.com/chat link unfurls as the chat page rather than the homepage.
  const chatSeo = fullscreen ? (
    <>
      <SEOHead
        title="Chat: Full-Screen Messages on Riftn"
        description="Your Riftn messages full screen: every conversation on the left, the open chat on the right, grouped bubbles and day markers. Direct messages, group chats and the public chat in one place."
        url="https://riftn.com/chat"
        image="https://riftn.com/og/chat.jpg"
      />
      <h1 className="sr-only">{_copy('fullscreenChat.h1', { defaultValue: 'Riftn Chat: full-screen messages' })}</h1>
    </>
  ) : null;
  // The shell is fixed to the window, so on iOS (which covers the page with
  // the keyboard instead of resizing it) it follows the visible area.
  const shellKeyboardStyle: CSSProperties | undefined = keyboardOpen && vvHeight
    ? { top: vvOffsetTop, height: vvHeight, bottom: 'auto' }
    : undefined;

  // Block access for unauthenticated users
  if (!isAuthenticated) {
    const gate = (
      <AuthGate description={_copy("copy.b38dabfa0639", { defaultValue: "Log in to access your messages and chat with others." })} />
    );
    return fullscreen ? (
      <div id="app-root" data-fullscreen-chat className="fixed inset-0 z-[70] flex flex-col overflow-y-auto bg-black text-white">
        {chatSeo}
        <div className="m-auto w-full max-w-md p-4">{gate}</div>
      </div>
    ) : gate;
  }

  // If Public Chat is open, show full-screen chat
  const publicChatPane = fullscreen && showPublicChat ? (
    <div className="h-full overflow-hidden pt-1">
      <PublicChat onBack={closeChat} />
    </div>
  ) : null;
  if (showPublicChat && !fullscreen) {
    return (
      /* No horizontal padding: the chat surfaces run to the column edges on
         every theme. The rows and composer carry their own inner padding. */
      <div style={keyboardStyle} className={`${mobileChatHeight} lg:h-[calc(100dvh-32px)] pt-1 pb-0 sm:pt-1 sm:pb-3 lg:pt-2 overflow-hidden`}>
          <PublicChat
            onBack={closeChat}
          />
      </div>
    );
  }

  const newMessageDrawer = (
    <NewMessageDrawer
        ref={newMessageDrawerRef}
        open={showNewMessageDrawer}
        onOpenChange={setShowNewMessageDrawer}
        conversations={conversations ?? []}
        myAddress={walletAddress}
        onPick={pickFromDrawer}
        onGroup={() => { setShowNewMessageDrawer(false); setNewChatKind('group'); }}
        onChannel={() => { setShowNewMessageDrawer(false); setNewChatKind('channel'); }}
      />
  );

  const settingsPane = fullscreen && !phonePill && showSettings ? (
    <div data-fsc-settings className="h-full overflow-y-auto">
      <div className="sticky top-0 z-[60] flex justify-end px-4 pt-3">
        <ChatIconButton label={_copy('fullscreenChat.closeSettings', { defaultValue: 'Close settings' })} onClick={() => setShowSettings(false)} data-fsc-settings-close="">
          <CloseIcon />
        </ChatIconButton>
      </div>
      <div className="mx-auto -mt-11 w-full max-w-[47.5rem] px-4">
        <Suspense fallback={null}>
          <EmbeddedSettings initialTab="messages" />
        </Suspense>
      </div>
    </div>
  ) : null;

  const dmPane = fullscreen && selectedConversation && !showPublicChat ? (
    <DirectMessageChat
      key={conversationIdentity(selectedConversation)}
      conversation={selectedConversation}
      initialComposerText={composerPrefill?.convId === selectedConversation.id ? composerPrefill.text : undefined}
      focusComposer={composerFocusFor === conversationIdentity(selectedConversation)}
      onBack={closeChat}
      cozy
      options={richList ? (({ onBlock: _b, onDelete: _d, ...rest }) => rest)(chatOptionsFor(selectedConversation)) : undefined}
    />
  ) : null;

  // If a DM conversation is selected, show it
  if (selectedConversation && !fullscreen) {
    /* No horizontal padding: the chat surfaces run to the column edges on
       every theme. The rows and composer carry their own inner padding. */
    return (
      <>
      <div style={keyboardStyle} className={`${mobileChatHeight} lg:h-[calc(100dvh-32px)] pt-1 pb-0 sm:pt-1 sm:pb-3 lg:pt-2 overflow-hidden`}>
        <DirectMessageChat
          /*
           * Keyed on WHO, not on the conversation id. A thread you have never
           * opened starts as "new_0x<addr>" and is swapped for a real ObjectId
           * a second or two later by the effect above — keyed on the id, that
           * swap remounted the whole chat and threw away the message being
           * typed, the scroll position and the reply target. DirectMessageChat
           * already adopts a new real id in place; this lets it.
           */
          key={conversationIdentity(selectedConversation)}
          conversation={selectedConversation}
          initialComposerText={composerPrefill?.convId === selectedConversation.id ? composerPrefill.text : undefined}
          focusComposer={composerFocusFor === conversationIdentity(selectedConversation)}
          onBack={closeChat}
        />
      </div>
      {newMessageDrawer}
      </>
    );
  }

  // Computers only: phones keep the pill header they already have.
  const fullscreenTop = fullscreen && !phonePill ? (
    <ChatListTop
      title={_copy('fullscreenChat.title', { defaultValue: 'Chat' })}
      search={(
        <input
          type="text"
          data-fsc-search
          placeholder={_copy('fullscreenChat.search', { defaultValue: 'Search chats' })}
          aria-label={_copy('fullscreenChat.search', { defaultValue: 'Search chats' })}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-10 w-full bg-transparent pl-2.5 text-[15px] text-white placeholder:text-zinc-500 outline-none"
        />
      )}
      searchActions={(
        <>
          <ChatIconButton label={_copy("copy.0e9161011702", { defaultValue: "Refresh" })} onClick={() => refetch()} data-messages-search-action="">
            <RefreshCw className={isRefetching ? 'animate-spin' : ''} />
          </ChatIconButton>
          <ChatIconButton label={_copy("copy.4787aa7e2d5c", { defaultValue: "Start new conversation" })} onClick={openNewMessage} data-messages-search-action="">
            <Plus />
          </ChatIconButton>
        </>
      )}
      actions={(
        <>
          <ChatTextSizeButton className="rounded-full" />
          <ChatIconButton label={_copy('fullscreenChat.exit', { defaultValue: 'Leave full screen' })} onClick={() => navigate('/app/messages')} data-chat-exit-fullscreen="">
            <ExitFullscreen />
          </ChatIconButton>
        </>
      )}
    />
  ) : null;

  const listColumn = (
      <div className={fullscreen ? 'h-full' : 'h-full lg:h-[calc(100dvh-32px)] max-h-full'}>
        {/* Full Width Messages Panel. A list, not a set of cards, so it carries
            no surface at all — see [data-bento-flat] in index.css. The
            [data-page-bento] hook stays: the Osaka and Jungle `#app-root` class
            nets exclude on it, and without it every bg-zinc-8/9 descendant in
            here becomes a frosted rectangle. */}
        <div data-page-bento data-bento-flat className="relative w-full h-full flex flex-col overflow-hidden">
          {/* Header */}
          {fullscreenTop ?? (<PageIsland
            className={fullscreen ? 'shrink-0 top-0 lg:top-0 px-2 pt-2' : 'shrink-0'}
            icon={<BrandIcon src={messagesBubbleIcon} alt={_copy("copy.04d7b4833927", { defaultValue: "Messages" })} className="h-8 w-8 object-contain" />}
            title={fullscreen ? _copy('fullscreenChat.title', { defaultValue: 'Chat' }) : t('messages.title')}
            actions={fullscreen ? (
              <>
                <ChatTextSizeButton />
                <button
                  type="button"
                  data-kit-square
                  data-chat-exit-fullscreen
                  onClick={() => navigate('/app/messages')}
                  aria-label={_copy('fullscreenChat.exit', { defaultValue: 'Leave full screen' })}
                  title={_copy('fullscreenChat.exit', { defaultValue: 'Leave full screen' })}
                >
                  <ExitFullscreen className="h-[18px] w-[18px]" />
                </button>
              </>
            ) : phonePill ? (
              // Phones: search waits in the drawer behind the pill's search
              // button, so starting a chat lives on the pill itself.
              <IslandAction label={_copy("copy.4787aa7e2d5c", { defaultValue: "Start new conversation" })} onClick={openNewMessage}>
                <Plus />
              </IslandAction>
            ) : undefined}
          >
            <div className="relative flex items-center">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <Input
                data-search-surface
                placeholder={t('messages.searchConversations')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`pl-10 ${fullscreen ? 'pr-[68px]' : 'pr-[100px]'} bg-white/[0.06] border-0 text-white placeholder:text-zinc-500 rounded-lg`}
              />
              {/* Refresh and new message sit quietly inside the search field
                  instead of as island squares next to the title. */}
              <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center">
                <button
                  type="button"
                  data-messages-search-action
                  onClick={() => refetch()}
                  disabled={isRefetching}
                  aria-label={_copy("copy.0e9161011702", { defaultValue: "Refresh" })}
                  title={_copy("copy.0e9161011702", { defaultValue: "Refresh" })}
                  className="h-7 w-7 flex items-center justify-center rounded-md text-zinc-500 hover:text-white transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`h-4 w-4 ${isRefetching ? 'animate-spin' : ''}`} />
                </button>
                {!(phonePill && !fullscreen) && (
                  <button
                    type="button"
                    data-messages-search-action
                    onClick={openNewMessage}
                    aria-label={_copy("copy.4787aa7e2d5c", { defaultValue: "Start new conversation" })}
                    title={_copy("copy.4787aa7e2d5c", { defaultValue: "Start new conversation" })}
                    className="h-7 w-7 flex items-center justify-center rounded-md text-zinc-500 hover:text-white transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                )}
                {!fullscreen && (
                  <button
                    type="button"
                    data-messages-search-action
                    data-open-fullscreen-chat
                    onClick={() => navigate('/chat')}
                    aria-label={_copy('fullscreenChat.open', { defaultValue: 'Open full screen chat' })}
                    title={_copy('fullscreenChat.open', { defaultValue: 'Open full screen chat' })}
                    className="h-7 w-7 flex items-center justify-center rounded-md text-zinc-500 hover:text-white transition-colors"
                  >
                    <Fullscreen className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </PageIsland>)}

          {/* Conversation List */}
          <div className={`flex-1 min-h-0 overflow-y-auto ${fullscreen && !phonePill ? 'pt-1 pb-24' : fullscreen ? 'pt-3 pb-4' : 'pt-3 pb-[76px] lg:pb-0'}`}>
            {/* Public Chat (pinned) */}
            <button
              onClick={() => { setSelectedConversation(null); setShowPublicChat(true); }}
              data-selected={fullscreen && showPublicChat ? '' : undefined}
              className={`w-full flex items-center gap-3 p-4 border-t border-white/[0.07] hover:bg-white/[0.04] transition-colors text-left ${fullscreen && showPublicChat ? 'bg-white/[0.06]' : ''}`}
            >
              <div data-keep-dark className="w-12 h-12 rounded-lg bg-black flex items-center justify-center flex-shrink-0">
                <img 
                  src={dehubLogo} 
                  alt={_copy("copy.f73b495201cb", { defaultValue: "Public Chat" })} 
                  className="w-8 h-8 object-contain"
                />
              </div>
              <div className="flex-1 min-w-0">
                <span className="font-semibold text-white truncate block">{t('publicChat.title')}</span>
                <p className="text-zinc-500 text-sm truncate">{t('publicChat.subtitle')}</p>
              </div>
              {publicUnread > 0 && (
                <span data-unread-chip data-public-chat-unread className="min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center leading-none">
                  {publicUnread > 99 ? '99+' : publicUnread}
                </span>
              )}
            </button>

            {/* Groups and channels you are in */}
            {groupChats.map((chat) => (
              <GroupChatRow key={chat.id} community={chat} onClick={() => navigate(`/app/communities/${chat.slug}?tab=chat`)} />
            ))}

            {/* Loading State */}
            {isLoading && <ConversationsSkeleton />}

            {/* Error State */}
            {isError && (
              <AppState
                icon="messages"
                title={t('messages.failedToLoad')}
                description={_copy("copy.be26771e6ef9", { defaultValue: "Your conversations are still safe. Try loading them again." })}
                kind="error"
                size="drawer"
                primaryAction={{ label: t('messages.tryAgain'), onClick: () => refetch() }}
              />
            )}



            {/* Empty state */}
            {!isLoading && !isError && !searchQuery.trim() && visibleConversations.length === 0 && (
              <AppState
                icon="messages"
                title={t('messages.noConversationsYet', 'No conversations yet')}
                description={_copy("copy.31dfdb14602d", { defaultValue: "Start a conversation and it will appear here." })}
                size="drawer"
              />
            )}

            {/* Conversations */}
            {richList && showArchived && (
              <button
                type="button"
                data-chat-archive-back
                onClick={() => setShowArchived(false)}
                className="flex w-full items-center gap-2 border-t border-white/[0.07] px-4 py-3 text-left text-[15px] font-semibold text-white hover:bg-white/[0.04]"
              >
                <ChevronLeft className="h-4 w-4 text-zinc-400" />
                {_copy('chatMenu.archivedChats', { defaultValue: 'Archived chats' })}
              </button>
            )}
            {!isLoading && !isError && listedConversations.map((conv) => {
              const row = (
                <ConversationItem
                  key={conv.id}
                  conversation={conv}
                  onClick={() => openConversation(conv)}
                  isSelected={selectedConversation?.id === conv.id}
                  onDelete={handleDeleteConversation}
                  onBlock={handleBlockConversationUser}
                  pref={richList ? chatPrefs.get(conv.id) : undefined}
                />
              );
              return richList ? (
                <ChatRowContextMenu key={conv.id} {...chatOptionsFor(conv)}>
                  <div data-chat-row>{row}</div>
                </ChatRowContextMenu>
              ) : row;
            })}
            {richList && !showArchived && archivedConversations.length > 0 && !searchQuery.trim() && (
              <button
                type="button"
                data-chat-archive-open
                onClick={() => setShowArchived(true)}
                className="flex w-full items-center gap-3 border-t border-white/[0.07] px-4 py-3 text-left text-[14px] text-zinc-400 hover:bg-white/[0.04] hover:text-white"
              >
                <Archive className="h-[18px] w-[18px]" />
                <span className="flex-1">{_copy('chatMenu.archivedChats', { defaultValue: 'Archived chats' })}</span>
                <span className="tabular-nums">{archivedConversations.length}</span>
              </button>
            )}

            {/* User search results (people not in existing conversations) */}
            {searchQuery.trim().length >= 2 && newUserResults.length > 0 && (
              <>
                <div className="px-4 py-2 mt-2">
                  <p className="text-zinc-500 text-xs uppercase tracking-wider font-medium">{_copy("copy.4787aa7e2d5c", { defaultValue: "Start new conversation" })}</p>
                </div>
                {newUserResults.map((user: DeHubUser) => {
                  const avatarPath = extractAvatarPath(user);
                  const avatarUrl = user.address ? buildAvatarUrl(user.address, avatarPath) : undefined;
                  const displayName = user.displayName || (user as any).display_name || user.username || _copy("copy.b512d97e7cbf", { defaultValue: "User" });
                  const isVerified = user.isVerified || (user as any).is_verified;
                  const dmSettingsObj = (() => {
                    const raw = (user as any).dmSettings || (user as any).dmSetting;
                    return Array.isArray(raw) ? raw[0] : raw;
                  })();
                  const dmDisabled = dmSettingsObj?.disables?.includes('NEW_DM') || dmSettingsObj?.disables?.includes('all');
                  const perMessageFee = dmSettingsObj?.perMessageFee;

                  return (
                    <button
                      key={user._id || user.address}
                      onClick={() => handleSelectSearchUser(user)}
                      disabled={dmDisabled}
                      className={`w-full flex items-center gap-3 p-4 border-t border-white/[0.07] transition-colors text-left ${
                        dmDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white/[0.04]'
                      }`}
                    >
                      <Avatar className="w-12 h-12">
                        {avatarUrl && <AvatarImage src={avatarUrl} />}
                        <AvatarFallback className="bg-zinc-700 text-white font-medium">
                          {displayName.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <ConversationName user={user}>{displayName}</ConversationName>
                          {isVerified && <VerifiedBadge className="w-3.5 h-3.5" />}
                        </div>
                        {user.username && (
                          <p className="text-sm text-zinc-500 truncate">@{user.username}</p>
                        )}
                        {dmDisabled && (
                          <p className="text-xs text-red-400 mt-0.5">{_copy("copy.c20ed70dd868", { defaultValue: "DMs disabled" })}</p>
                        )}
                        {!dmDisabled && perMessageFee && perMessageFee > 0 && (
                          <p className="text-xs text-amber-400 mt-0.5">
                            {perMessageFee.toLocaleString()} <DhbCoin />{_copy("copy.cf92bc9b461f", { defaultValue: " to message" })}</p>
                        )}
                      </div>
                      {!dmDisabled && (
                        <MessageCircle className="w-5 h-5 text-zinc-400 flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </>
            )}

            {/* Searching indicator */}
            {searchQuery.trim().length >= 2 && isSearchingUsers && (
              <div className="flex items-center justify-center gap-2 py-4 text-zinc-500 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />{_copy("copy.3084651a3386", { defaultValue: "Searching users..." })}</div>
            )}
          </div>
          {fullscreen && !phonePill && <ChatMeDock onOpenSettings={() => setShowSettings(true)} />}
        </div>
      </div>
  );

  const dialogs = (
    <>
      <AlertDialog open={!!clearTarget} onOpenChange={(open) => { if (!open) setClearTarget(null); }}>
        <AlertDialogContent className="bg-black/60 backdrop-blur-[24px] border border-white/10 shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">{_copy('chatMenu.clearTitle', { defaultValue: 'Clear history?' })}</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">{_copy('chatMenu.clearBody', { defaultValue: 'Every message in this chat disappears for you. The other person keeps their copy.' })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700">{_copy("copy.19766ed6ccb2", { defaultValue: "Cancel" })}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (clearTarget) void clearHistory(clearTarget); setClearTarget(null); }}>{_copy('chatMenu.clearHistory', { defaultValue: 'Clear history' })}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Message Type Selector */}
      <NewMessageSelector
        open={showMessageSelector}
        onOpenChange={setShowMessageSelector}
        onSelectDM={() => setShowNewConversation(true)}
        onSelectGroup={() => setNewChatKind('group')}
        onSelectChannel={() => setNewChatKind('channel')}
      />

      <NewGroupChannelSheet
        kind={newChatKind ?? 'group'}
        open={!!newChatKind}
        onOpenChange={(open) => { if (!open) setNewChatKind(null); }}
      />

      <NewConversationModal
        open={showNewConversation}
        onOpenChange={setShowNewConversation}
        onConversationCreated={(conversation) => {
          setShowPublicChat(false);
          setSelectedConversation(conversation);
        }}
      />
      {newMessageDrawer}
    </>
  );

  if (fullscreen) {
    return (
      <FullScreenChatShell
        style={shellKeyboardStyle}
        chatOpen={chatOpen}
        chat={settingsPane ?? publicChatPane ?? dmPane}
        list={<>{chatSeo}{listColumn}{dialogs}</>}
      />
    );
  }

  return (
    <div style={keyboardStyle} className={`${mobileChatHeight} pt-1 lg:h-full lg:pt-2 lg:pb-3 overflow-hidden`}>
      <SEOHead title={_copy("copy.3875aefdf8b8", { defaultValue: "Messages: Direct & Group Chat" })} description={_copy("copy.a058b8f54f71", { defaultValue: "Send direct messages, create group chats, share media and connect with other users privately on Riftn, your inbox on the user-owned social platform." })} url="https://riftn.com/app/messages" />
      <h1 className="sr-only">{_copy("copy.6b5c348f0adc", { defaultValue: "Riftn Messages — Decentralised Social Media, Censorship Resistant & Freedom of Speech" })}</h1>
      {listColumn}
      {dialogs}
    </div>
  );
}
