/**
 * Direct Messages Hooks
 * =====================
 * React Query hooks for managing DM conversations and messages.
 * Uses Socket.io /dm namespace for real-time events.
 */

import { useEffect, useRef, useReducer } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import {
  getContacts,
  getConversations,
  getMessages,
  uploadAndSendMedia,
  
  createConversation,
  markConversationAsRead,
  deleteConversation,
  searchUsersForDM,
  blockConversation,
  unblockConversation,
  createGroup,
  getGroupInfo,
  joinGroup,
  updateGroup,
  leaveGroup,
  blockUserInGroup,
  getUserOnlineStatus,
  getDMVideos,
  type DeHubConversation,
  type DmMessage,
  type DmMsgType,
  type DeHubUser,
  type GroupInfo,
} from '@/lib/api/dehub';
import {
  emitCreateAndStart,
  emitSendMessage,
  emitReadReceipt,
  onDmSendMessage,
  onEditMessage,
  onDmDeleteMessage,
  onReValidateMessage,
  onFeeConfirmed,
  onReadReceipt,
  type SendMessagePayload,
} from '@/lib/api/dehub/dm-socket';

/**
 * Blob URL for an optimistic message with auto-revoke. The optimistic entry is
 * replaced by the server copy (socket refetch, 2-3s) or rolled back on error,
 * so revoking after 60s cannot blank a visible image but prevents the full
 * photo/voice blob leaking for the rest of the session.
 */
export function createTransientBlobUrl(file: Blob, ttlMs = 60_000): string {
  const url = URL.createObjectURL(file);
  setTimeout(() => {
    try { URL.revokeObjectURL(url); } catch { /* noop */ }
  }, ttlMs);
  return url;
}

// ─── Read-state persistence (survives refresh) ───────────────────────────────

const READ_CONVOS_KEY_PREFIX = 'dehub-read-conversations';

/** Wallet-scoped storage key to prevent cross-account contamination */
function getReadConvosKey(): string {
  const wallet = typeof window !== 'undefined' ? localStorage.getItem('dehub_wallet') : null;
  return wallet ? `${READ_CONVOS_KEY_PREFIX}:${wallet.toLowerCase()}` : READ_CONVOS_KEY_PREFIX;
}

/** Get durable read timestamps — no TTL pruning, entries persist until explicitly cleared */
function getReadConversations(): Record<string, number> {
  try {
    const raw = localStorage.getItem(getReadConvosKey());
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, number>;
  } catch { return {}; }
}

function persistReadConversation(conversationId: string): void {
  try {
    const store = getReadConversations();
    store[conversationId] = Date.now();
    localStorage.setItem(getReadConvosKey(), JSON.stringify(store));
  } catch { /* storage full */ }
}

// ─── Open conversation registry ──────────────────────────────────────────────
// Tracks which conversations are currently rendered/open so we can force
// their unreadCount to 0 — prevents the badge from re-appearing after a
// socket-triggered refetch races ahead of the server's markAsRead processing.
const openConversationIds = new Set<string>();
const openConversationListeners = new Set<() => void>();

function notifyOpenConversationsChanged() {
  openConversationListeners.forEach(fn => { try { fn(); } catch { /* noop */ } });
}

export function registerOpenConversation(conversationId: string | null | undefined): () => void {
  if (!conversationId) return () => {};
  openConversationIds.add(conversationId);
  notifyOpenConversationsChanged();
  return () => {
    openConversationIds.delete(conversationId);
    notifyOpenConversationsChanged();
  };
}

// ─── Query keys ───────────────────────────────────────────────────────────────

const MESSAGES_BASE_KEY = ['messages'] as const;

export const messagesKeys = {
  all: MESSAGES_BASE_KEY,
  conversations: () => [...MESSAGES_BASE_KEY, 'conversations'] as const,
  conversation: (id: string) => [...MESSAGES_BASE_KEY, 'conversation', id] as const,
  messages: (conversationId: string) => [...MESSAGES_BASE_KEY, 'thread', conversationId] as const,
  userSearch: (query: string) => [...MESSAGES_BASE_KEY, 'userSearch', query] as const,
};

// ─── Conversations ────────────────────────────────────────────────────────────

export function useConversations(searchQuery: string = '') {
  const { isAuthenticated, walletAddress } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [...messagesKeys.conversations(), searchQuery, walletAddress],
    queryFn: async () => {
      console.log('[useConversations] Fetching...', { searchQuery, walletAddress });
      let items: DeHubConversation[] = [];
      try {
        if (searchQuery) {
          const response = await getConversations(0, 50, searchQuery);
          items = response.items || [];
        } else if (walletAddress) {
          items = await getContacts(walletAddress, 0, 50);
        }
      } catch (error) {
        console.error('[useConversations] Error:', error);
        throw error;
      }
      // Apply localStorage read overrides so unread badges don't reappear after refresh
      const readOverrides = getReadConversations();
      return items.map(conv => {
        const convId = conv.id || (conv as any)._id;
        if (convId && readOverrides[convId] && conv.unreadCount > 0) {
          const lastMsgTime = conv.lastMessage?.createdAt ? new Date(conv.lastMessage.createdAt).getTime() : 0;
          if (lastMsgTime <= readOverrides[convId]) {
            return { ...conv, unreadCount: 0 };
          }
        }
        return conv;
      });
    },
  });

  // Real-time: when any DM message arrives, refresh the conversations list.
  // Only subscribe after the first successful REST fetch (avoids eager socket connect on load).
  const hasData = !!query.data;
  useEffect(() => {
    if (!isAuthenticated || !hasData) return;
    const unsub = onDmSendMessage(() => {
      queryClient.invalidateQueries({ queryKey: messagesKeys.conversations() });
    });
    return unsub;
  }, [isAuthenticated, hasData, queryClient]);

  // Re-render when the set of open conversations changes so the badge clears instantly
  const [, forceTick] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const listener = () => forceTick();
    openConversationListeners.add(listener);
    return () => { openConversationListeners.delete(listener); };
  }, []);

  // Zero-out unreadCount for any conversation currently open in the UI.
  const conversations = (query.data || []).map(conv => {
    const convId = conv.id || (conv as any)._id;
    if (convId && openConversationIds.has(convId) && conv.unreadCount > 0) {
      return { ...conv, unreadCount: 0 };
    }
    return conv;
  });

  return {
    conversations,
    allConversations: conversations,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    isRefetching: query.isRefetching,
  };
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export function useMessages(conversationId: string | null) {
  const { isAuthenticated, walletAddress, user } = useAuth();
  const queryClient = useQueryClient();

  // Refs stay current across renders without re-running the socket effect.
  // Same pattern as mobile DMContext.tsx (userIdRef / addressRef).
  const userIdRef = useRef<string | undefined>(undefined);
  const walletAddressRef = useRef<string | undefined>(undefined);
  useEffect(() => { userIdRef.current = user?._id || (user as any)?.id; }, [user?._id]);
  useEffect(() => { walletAddressRef.current = walletAddress?.toLowerCase(); }, [walletAddress]);

  const isVirtual = conversationId?.startsWith('new_') || (conversationId ? /^0x[0-9a-fA-F]{40}$/i.test(conversationId) : false);
  // MessagesPage stays mounted forever (PersistentPageCache CSS-hides it), so
  // polling must be tied to the ROUTE, not the mount — otherwise opening one
  // DM leaves a 5s poll running for the rest of the session. useLocation makes
  // this reactive: leaving /app/messages stops the interval, returning
  // restarts it (and the stale query refetches immediately).
  const { pathname } = useLocation();
  const isMessagesRouteActive = pathname === '/app/messages';
  const query = useInfiniteQuery({
    queryKey: messagesKeys.messages(conversationId || ''),
    queryFn: async ({ pageParam = 0 }) => {
      if (!conversationId) return { items: [], totalCount: 0, hasMore: false };
      const result = await getMessages(conversationId, pageParam, 30);
      // Preserve isRead:true from local cache — server may lag behind readReceipt socket events.
      // Same pattern as mobile dm.store: "Preserve local isRead:true — server may not persist read status"
      if (pageParam === 0) {
        const existing = queryClient.getQueryData<any>(messagesKeys.messages(conversationId));
        const existingReadIds = new Set<string>(
          (existing?.pages?.[0]?.items ?? [])
            .filter((m: DmMessage) => m.isRead)
            .map((m: DmMessage) => m._id)
        );
        if (existingReadIds.size > 0) {
          result.items = result.items.map((m: DmMessage) =>
            (!m.isRead && existingReadIds.has(m._id)) ? { ...m, isRead: true } : m
          );
        }
      }
      return result;
    },
    getNextPageParam: (lastPage, allPages) => lastPage.hasMore ? allPages.length : undefined,
    initialPageParam: 0,
    enabled: isAuthenticated && !!conversationId,
    staleTime: 10 * 1000,
    // Poll for new messages — backend doesn't reliably push socket events to
    // recipient. Route-gated (see isMessagesRouteActive above). Each tick
    // refetches EVERY loaded page (TanStack behavior), so once the user has
    // scrolled deep into history the poll cost scales with page count — back
    // off to 15s then. (maxPages would be wrong here: this query only pages
    // forward, so v5 would evict the NEWEST page — where incoming messages
    // land — when trimming.)
    refetchInterval: (q) => {
      if (!isMessagesRouteActive) return false;
      const pageCount = q.state.data?.pages?.length ?? 0;
      return pageCount > 4 ? 15_000 : 5000;
    },
  });

  // Flatten pages → single array, oldest first for chat display
  const messages: DmMessage[] = query.data?.pages
    .flatMap(page => page.items)
    .reverse() || [];

  // Real-time: new messages from socket
  useEffect(() => {
    if (!isAuthenticated || !conversationId) return;

    const unsubSend = onDmSendMessage((msg) => {
      // The server sometimes sends `conversation` as a populated object (after HTTP upload)
      // rather than a plain ID string (like client-emitted text messages).
      // Normalise to a string so the match check works in both cases.
      const rawConversation = msg.conversation;
      const dmId: string =
        typeof rawConversation === 'string'
          ? rawConversation
          : (rawConversation as any)?._id ||
            (msg as any).dmId ||
            (msg as any).conversationId ||
            '';
      const isMatch = dmId === conversationId ||
        (conversationId.startsWith('new_') &&
          msg.sender?.address?.toLowerCase() === conversationId.replace('new_', '').toLowerCase());
      if (!isMatch) return;

      // Implied read: if the OTHER user just sent a message, treat earlier sent lines as read
      // when we never got a `readReceipt` broadcast (fallback UX).
      const senderAddress = msg.sender?.address?.toLowerCase();
      const senderUserId = msg.sender?._id;
      // Use refs so the check always sees the latest identity even on first login
      // (same pattern as mobile DMContext.tsx userIdRef / addressRef), and fallback
      // to localStorage in case the effect hasn't synced the refs yet.
      const fallbackUser = (() => {
        try { return JSON.parse(localStorage.getItem('dehub_user') || '{}'); } catch { return {}; }
      })();
      const fallbackAddress = localStorage.getItem('dehub_wallet')?.toLowerCase();
      const meId = userIdRef.current || fallbackUser?._id || fallbackUser?.id;
      const meAddr = walletAddressRef.current || fallbackAddress;
      
      const isOwnMsg =
        (!!senderAddress && !!meAddr && senderAddress === meAddr) ||
        (!!senderUserId && !!meId && senderUserId === meId);
      const isFromOther = !isOwnMsg;
      if (isFromOther) {
        const msgTime = new Date(msg.createdAt ?? '').getTime();
        queryClient.setQueryData(messagesKeys.messages(conversationId), (old: any) => {
          if (!old?.pages) return old;
          return {
            ...old,
            pages: old.pages.map((page: any) => ({
              ...page,
              items: page.items.map((m: DmMessage) => {
                if (m.author !== 'me' || m.isRead) return m;
                const mTime = new Date(m.createdAt ?? '').getTime();
                // Mark as read any of our messages sent before their reply
                return mTime <= msgTime ? { ...m, isRead: true } : m;
              }),
            })),
          };
        });
      }
      queryClient.setQueryData(
        messagesKeys.messages(conversationId),
        (old: any) => {
          if (!old?.pages) return old;
          const pages = old.pages as Array<{ items: DmMessage[]; totalCount: number; hasMore: boolean }>;
          const newPages = pages.map(page => ({ ...page, items: [...page.items] }));
          const firstItems = newPages[0]?.items ?? [];
          const existingIdx = firstItems.findIndex(m => m._id === msg._id);
          const ownAddress = walletAddressRef.current || localStorage.getItem('dehub_wallet')?.toLowerCase();
          const fallbackUser = (() => {
            try { return JSON.parse(localStorage.getItem('dehub_user') || '{}'); } catch { return {}; }
          })();
          const ownUserId = userIdRef.current || fallbackUser?._id || fallbackUser?.id;
          const incomingAddress = msg.sender?.address?.toLowerCase();
          const incomingUserId = msg.sender?._id;
          const isOwnIncoming =
            (!!incomingAddress && !!ownAddress && incomingAddress === ownAddress) ||
            (!!incomingUserId && !!ownUserId && incomingUserId === ownUserId);

          const normalizedMsg: DmMessage = {
            ...msg,
            conversation: dmId || conversationId,
            // Keep explicit author so downstream read-receipt logic works reliably.
            author: isOwnIncoming ? 'me' : 'other',
            // Sender should not see own message as read until actual read receipt.
            ...(isOwnIncoming ? { isRead: false } : {}),
          } as DmMessage;
          const incomingAddressFromNormalized = normalizedMsg.sender?.address?.toLowerCase();
          const incomingUserIdFromNormalized = normalizedMsg.sender?._id;
          const incomingCreatedAt = new Date(normalizedMsg.createdAt ?? '').getTime();

          if (existingIdx >= 0) {
            // Update in place (e.g. media upload completed — merge mediaUrls, uploadStatus)
            const merged = {
              ...firstItems[existingIdx],
              ...normalizedMsg,
              mediaUrls: (normalizedMsg.mediaUrls?.length ? normalizedMsg.mediaUrls : firstItems[existingIdx].mediaUrls) ?? [],
              uploadStatus: normalizedMsg.uploadStatus ?? firstItems[existingIdx].uploadStatus,
            };
            newPages[0].items[existingIdx] = merged;
          } else {
            // Reconcile optimistic temp message (same sender + type + content within short window)
            // so we don't briefly render duplicates (temp + server copy).
            const optimisticIdx = firstItems.findIndex((candidate) => {
              if (!candidate._id?.startsWith('temp-')) return false;

              const sameType = (candidate.msgType ?? 'msg') === (normalizedMsg.msgType ?? 'msg');
              if (!sameType) return false;

              const candidateAddress = candidate.sender?.address?.toLowerCase();
              const candidateUserId = candidate.sender?._id;

              const isIncomingFromCurrentUser =
                (!!incomingAddressFromNormalized && !!ownAddress && incomingAddressFromNormalized === ownAddress) ||
                (!!incomingUserIdFromNormalized && !!ownUserId && incomingUserIdFromNormalized === ownUserId);
              if (!isIncomingFromCurrentUser) return false;

              const sameSender =
                (!!incomingAddressFromNormalized && !!candidateAddress && incomingAddressFromNormalized === candidateAddress) ||
                (!!incomingUserIdFromNormalized && !!candidateUserId && incomingUserIdFromNormalized === candidateUserId);
              if (!sameSender) return false;

              const candidateContent = (candidate.content || '').trim();
              const incomingContent = (normalizedMsg.content || '').trim();
              const sameContent = candidateContent === incomingContent;
              const isMediaLike = ['media', 'voice', 'gif'].includes(normalizedMsg.msgType as string);

              const candidateCreatedAt = new Date(candidate.createdAt ?? '').getTime();
              const closeInTime =
                Number.isFinite(candidateCreatedAt) && Number.isFinite(incomingCreatedAt)
                  ? Math.abs(candidateCreatedAt - incomingCreatedAt) < 30_000
                  : Number.isFinite(candidateCreatedAt)
                    ? Date.now() - candidateCreatedAt < 30_000
                    : true;

              return (sameContent || isMediaLike) && closeInTime;
            });

            if (optimisticIdx >= 0) {
              // Preserve `author` from the temp message — the server socket event doesn't
              // include it, but we need it later so onReadReceipt can identify sent messages.
              // For own messages, keep isRead:false from the optimistic entry — the server
              // echo often returns isRead:true (auto-read by sender) which causes a brief
              // double-tick flash before the real read receipt arrives.
              const optimistic = firstItems[optimisticIdx];
              const keepIsReadFalse = optimistic.author === 'me' && !optimistic.isRead;
              newPages[0].items[optimisticIdx] = {
                ...normalizedMsg,
                // Preserve author from optimistic — normalizedMsg.author may be 'other' if
                // address comparison fails (e.g. Smart Account vs EOA mismatch), which would
                // put the bubble on the wrong side.
                author: optimistic.author,
                ...(keepIsReadFalse ? { isRead: false } : {}),
              };
            } else {
              newPages[0] = { ...newPages[0], items: [normalizedMsg, ...firstItems] };
            }
          }
          return { ...old, pages: newPages };
        }
      );
    });

    const unsubEdit = onEditMessage((data) => {
      queryClient.setQueryData(
        messagesKeys.messages(conversationId),
        (old: any) => {
          if (!old?.pages) return old;
          const pages = old.pages.map((page: any) => ({
            ...page,
            items: page.items.map((m: DmMessage) =>
              m._id === data._id
                ? { ...m, content: data.content, isEdited: true, editedAt: data.editedAt }
                : m
            ),
          }));
          return { ...old, pages };
        }
      );
    });

    const unsubDelete = onDmDeleteMessage((data) => {
      queryClient.setQueryData(
        messagesKeys.messages(conversationId),
        (old: any) => {
          if (!old?.pages) return old;
          const pages = old.pages.map((page: any) => ({
            ...page,
            items: page.items.map((m: DmMessage) =>
              m._id === data._id ? { ...m, isDeleted: true, content: '' } : m
            ),
          }));
          return { ...old, pages };
        }
      );
    });

    const unsubFeeConfirmed = onFeeConfirmed(({ dmId }) => {
      if (dmId === conversationId) {
        queryClient.invalidateQueries({ queryKey: messagesKeys.messages(conversationId) });
      }
    });

    const unsubRevalidate = onReValidateMessage(({ dmId, message }) => {
      if (dmId !== conversationId) return;
      queryClient.setQueryData(
        messagesKeys.messages(conversationId),
        (old: any) => {
          if (!old?.pages) return old;
          const pages = old.pages.map((page: any) => ({
            ...page,
            items: page.items.map((m: DmMessage) =>
              m._id === message._id ? { ...m, ...message, mediaUrls: message.mediaUrls ?? m.mediaUrls, uploadStatus: message.uploadStatus ?? m.uploadStatus } : m
            ),
          }));
          return { ...old, pages };
        }
      );
    });

    // When the other person reads, mark all our sent messages as read
    const unsubReadReceipt = onReadReceipt((data: any) => {
      const dmId = data?.dmId || data?.conversationId;
      const readBy = data?.readBy;
      if (!dmId || dmId !== conversationId) return;
      // Ignore self-receipts: server echoes readReceipt to all participants including us.
      // readBy === our userId means WE read their messages, NOT that they read ours.
      // Use refs so the check always sees the latest identity even if this closure was
      // created before login completed — same pattern as mobile DMContext.tsx userIdRef.
      if (!readBy) return;
      const readByStr = String(readBy).toLowerCase();
      const fallbackUser = (() => {
        try { return JSON.parse(localStorage.getItem('dehub_user') || '{}'); } catch { return {}; }
      })();
      const fallbackAddress = localStorage.getItem('dehub_wallet')?.toLowerCase();
      const meId = userIdRef.current || fallbackUser?._id || fallbackUser?.id;
      const meAddr = walletAddressRef.current || fallbackAddress;
      
      // If we don't know our own MongoDB ID yet (during login), we cannot safely determine
      // if this readReceipt from the backend (which ONLY contains an ObjectId) is ours or not.
      // Eary return to avoid accidentally marking our own messages as read by the other person.
      // The 5s background polling will naturally sync the correct read state once auth settles.
      if (!meId) return;
      
      const isSelf =
        (!!meId && readByStr === String(meId).toLowerCase());
      if (isSelf) return; // Ignore our own read receipt
      queryClient.setQueryData(
        messagesKeys.messages(conversationId),
        (old: any) => {
          if (!old?.pages) return old;
          const pages = old.pages.map((page: any) => ({
            ...page,
            items: page.items.map((m: DmMessage) => {
              // author is 'me' for own messages (set by parseDmMessage or preserved on reconcile)
              if (m.author !== 'me' || m.isRead) return m;
              return { ...m, isRead: true };
            }),
          }));
          return { ...old, pages };
        }
      );
      // Do NOT invalidate here — an immediate refetch races with backend processing
      // and overwrites the optimistic isRead:true with the still-stale server value.
      // The 5s refetchInterval will sync naturally once the backend has caught up.
    });

    return () => {
      unsubSend();
      unsubEdit();
      unsubDelete();
      unsubFeeConfirmed();
      unsubRevalidate();
      unsubReadReceipt();
    };
  }, [conversationId, isAuthenticated, queryClient]);

  // Mark as read via socket + persist to localStorage
  const markAsRead = useMutation({
    mutationFn: () => {
      if (conversationId && !conversationId.startsWith('new_') && !/^0x[0-9a-fA-F]{40}$/i.test(conversationId)) {
        emitReadReceipt(conversationId);
        // Persist to localStorage so it survives page refresh
        persistReadConversation(conversationId);
      }
      return markConversationAsRead(conversationId!);
    },
    onMutate: async () => {
      // Optimistically set unreadCount to 0 in the conversations cache
      await queryClient.cancelQueries({ queryKey: messagesKeys.conversations() });
      queryClient.setQueriesData(
        { queryKey: messagesKeys.conversations() },
        (old: any) => {
          if (!Array.isArray(old)) return old;
          return old.map((conv: any) => {
            const convId = conv.id || conv._id;
            if (convId === conversationId) {
              return { ...conv, unreadCount: 0 };
            }
            return conv;
          });
        }
      );
    },
    onSettled: () => {
      // Don't force-refetch here — the optimistic update already cleared the badge,
      // and the localStorage override protects against stale server counts on next
      // natural refetch. An immediate invalidation risks the server returning
      // unreadCount > 0 before markAsRead/readReceipt is fully processed on the server.
    },
  });

  return {
    messages,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    refetch: query.refetch,
    markAsRead: markAsRead.mutate,
  };
}

// ─── Create and Start ─────────────────────────────────────────────────────────

/**
 * Emit createAndStart to get/create a DM conversation.
 * Returns DmConversation including dmFee.
 */
export function useCreateAndStart() {
  return useMutation({
    mutationFn: (userId: string) => emitCreateAndStart(userId),
  });
}

// ─── Send Message ─────────────────────────────────────────────────────────────

export function useSendMessage(conversationId: string) {
  const queryClient = useQueryClient();
  const { user, walletAddress } = useAuth();

  return useMutation({
    mutationFn: async ({
      content,
      msgType = 'msg',
      gifUrl,
      mediaFile,
      voiceDuration,
      replyTo,
      txHash,
    }: {
      content: string;
      msgType?: DmMsgType;
      gifUrl?: string;
      mediaFile?: File;
      voiceDuration?: number;
      replyTo?: string;
      txHash?: string;
    }): Promise<DmMessage> => {
      // Virtual conversations need createAndStart first to get real ID (applies to all message types)
      const isVirtual = conversationId.startsWith('new_') || /^0x[0-9a-fA-F]{40}$/i.test(conversationId);
      let resolvedId = conversationId;
      if (isVirtual) {
        const recipientAddress = conversationId.startsWith('new_')
          ? conversationId.replace('new_', '')
          : conversationId;
        try {
          const dmConversation = await emitCreateAndStart(recipientAddress);
          if (dmConversation?._id) {
            resolvedId = dmConversation._id;
          } else {
            throw new Error('Failed to create conversation');
          }
        } catch (err) {
          console.error('[useSendMessage] createAndStart failed:', err);
          throw new Error('Could not establish conversation. Please try again.');
        }
      }

      // Media/voice: upload file then return — resolvedId is now guaranteed real
      if (msgType === 'media' || msgType === 'voice') {
        if (!mediaFile) throw new Error('No file provided for media/voice message');
        const senderId = user?._id || walletAddress || '';
        return uploadAndSendMedia(mediaFile, resolvedId, senderId, {
          content,
          msgType,
          voiceDuration,
          replyTo,
          txHash,
        });
      }

      // Real conversation: emit via socket (fire and forget)
      const payload: SendMessagePayload = {
        dmId: resolvedId,
        content,
        type: msgType,
        gif: gifUrl,
        replyTo,
        txHash,
        voiceDuration,
      };
      emitSendMessage(payload);

      // Return an optimistic message with the resolved conversation ID
      const tempMessage: DmMessage = {
        _id: `temp-${Date.now()}`,
        conversation: resolvedId,
        sender: {
          _id: user?._id || walletAddress || '',
          username: user?.username || '',
          address: walletAddress || '',
          displayName: user?.displayName || user?.display_name || '',
          avatarImageUrl: user?.avatarImageUrl || '',
        },
        content,
        msgType,
        mediaUrls: gifUrl ? [{ url: gifUrl, type: 'image', mimeType: 'image/gif' }] : [],
        voiceDuration: null,
        isRead: false,
        isEdited: false,
        editedAt: null,
        isForwarded: false,
        replyTo: null,
        paymentStatus: null,
        paymentTxHash: null,
        tipAmount: null,
        tipSymbol: null,
        isDeleted: false,
        author: 'me',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      return tempMessage;
    },

    onMutate: async ({ content, msgType, gifUrl, mediaFile, voiceDuration }) => {
      await queryClient.cancelQueries({ queryKey: messagesKeys.messages(conversationId) });
      const previousMessages = queryClient.getQueryData(messagesKeys.messages(conversationId));

      // Optimistic: prepend temp message
      const optimisticMessage: DmMessage = {
        _id: `temp-${Date.now()}`,
        conversation: conversationId,
        sender: {
          _id: user?._id || '',
          username: user?.username || '',
          address: walletAddress || '',
          displayName: user?.displayName || user?.display_name || '',
          avatarImageUrl: user?.avatarImageUrl || '',
        },
        content,
        msgType: msgType || 'msg',
        mediaUrls: mediaFile
          ? [{ url: createTransientBlobUrl(mediaFile), type: msgType === 'voice' ? 'audio' : 'image', mimeType: mediaFile.type }]
          : gifUrl ? [{ url: gifUrl, type: 'image', mimeType: 'image/gif' }] : [],
        voiceDuration: voiceDuration ?? null,
        isRead: false,
        isEdited: false,
        editedAt: null,
        isForwarded: false,
        replyTo: null,
        paymentStatus: null,
        paymentTxHash: null,
        tipAmount: null,
        tipSymbol: null,
        isDeleted: false,
        author: 'me',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      queryClient.setQueryData(messagesKeys.messages(conversationId), (old: any) => {
        if (!old?.pages) return old;
        const newPages = [...old.pages];
        if (newPages[0]) {
          newPages[0] = { ...newPages[0], items: [optimisticMessage, ...newPages[0].items] };
        }
        return { ...old, pages: newPages };
      });

      return { previousMessages };
    },

    onError: (_err, _vars, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(messagesKeys.messages(conversationId), context.previousMessages);
      }
    },

    onSettled: (_data, _err, variables) => {
      // Don't immediately invalidate messages — the optimistic message is already visible.
      // The socket event (onDmSendMessage) will trigger a refetch when the server confirms.
      // Immediate invalidation causes the optimistic message to vanish briefly because
      // the server hasn't processed the fire-and-forget socket emit yet.

      // For media/voice, delay refetch to allow CDN processing
      if (variables?.mediaFile && (variables?.msgType === 'media' || variables?.msgType === 'voice')) {
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: messagesKeys.messages(conversationId) });
        }, 3000);
      } else {
        // For text/gif messages, delay the refetch so the server has time to persist
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: messagesKeys.messages(conversationId) });
        }, 2000);
      }
      queryClient.invalidateQueries({ queryKey: messagesKeys.conversations() });
    },
  });
}

// ─── Create Conversation (virtual, for new DM flow) ───────────────────────────

export function useCreateConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ recipientAddress, recipientUser }: {
      recipientAddress: string;
      recipientUser?: Partial<DeHubUser>;
    }) => createConversation(recipientAddress, recipientUser),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messagesKeys.conversations() });
    },
  });
}

// ─── Delete Conversation ──────────────────────────────────────────────────────

// ─── Deleted conversations persistence ────────────────────────────────────────

const DELETED_CONVOS_KEY = 'dehub-deleted-conversations';

export function getDeletedConversationIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DELETED_CONVOS_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function persistDeletedConversation(conversationId: string) {
  const ids = getDeletedConversationIds();
  ids.add(conversationId);
  // Also persist the peer address variant so both "new_0x..." and the raw dmId are covered
  if (conversationId.startsWith('new_')) {
    ids.add(conversationId.replace('new_', ''));
  }
  localStorage.setItem(DELETED_CONVOS_KEY, JSON.stringify([...ids]));
}

export function useDeleteConversation() {
  const queryClient = useQueryClient();
  const { walletAddress } = useAuth();

  return useMutation({
    mutationFn: (conversationId: string) =>
      deleteConversation(conversationId, walletAddress || undefined),
    onMutate: async (conversationId: string) => {
      // Persist deletion so it survives refetches and page reloads
      persistDeletedConversation(conversationId);

      // Optimistically remove from ALL conversation query caches
      await queryClient.cancelQueries({ queryKey: messagesKeys.conversations() });
      const snapshot = queryClient.getQueriesData({ queryKey: messagesKeys.conversations() });
      queryClient.setQueriesData(
        { queryKey: messagesKeys.conversations() },
        (old: any) => {
          if (Array.isArray(old)) {
            return old.filter((c: any) => c.id !== conversationId);
          }
          return old;
        }
      );
      // Also remove cached messages for this conversation
      queryClient.removeQueries({ queryKey: messagesKeys.messages(conversationId) });
      return { snapshot };
    },
    onSuccess: () => {
      // Don't invalidate — the deleted ID is persisted and will be filtered on next fetch
    },
    onError: (_err, conversationId, context) => {
      // Rollback: remove from persisted deletions
      const ids = getDeletedConversationIds();
      ids.delete(conversationId);
      if (conversationId.startsWith('new_')) ids.delete(conversationId.replace('new_', ''));
      localStorage.setItem(DELETED_CONVOS_KEY, JSON.stringify([...ids]));
      // Restore cache
      queryClient.invalidateQueries({ queryKey: messagesKeys.conversations() });
    },
  });
}

// ─── User search ──────────────────────────────────────────────────────────────

export function useUserSearchForDM(query: string) {
  const { isAuthenticated } = useAuth();
  const debouncedQuery = query.trim();

  return useQuery({
    queryKey: messagesKeys.userSearch(debouncedQuery),
    queryFn: () => searchUsersForDM(debouncedQuery, 0, 10),
    enabled: isAuthenticated && debouncedQuery.length >= 2,
    staleTime: 60 * 1000,
  });
}

// ─── Unread count ─────────────────────────────────────────────────────────────

export function useTotalUnreadCount() {
  const { conversations } = useConversations();
  return conversations.reduce((sum, conv) => sum + (conv.unreadCount || 0), 0);
}

// ─── Block / Unblock ──────────────────────────────────────────────────────────

export function useBlockConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: string) => blockConversation(conversationId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: messagesKeys.conversations() }); },
  });
}

export function useUnblockConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: string) => unblockConversation(conversationId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: messagesKeys.conversations() }); },
  });
}

// ─── Group Chat ───────────────────────────────────────────────────────────────

export function useCreateGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, memberAddresses, description }: {
      name: string; memberAddresses: string[]; description?: string;
    }) => createGroup(name, memberAddresses, description),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: messagesKeys.conversations() }); },
  });
}

export function useGroupInfo(groupId: string | null) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: [...messagesKeys.conversation(groupId || ''), 'groupInfo'],
    queryFn: () => getGroupInfo(groupId!),
    enabled: isAuthenticated && !!groupId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useJoinGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (groupId: string) => joinGroup(groupId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: messagesKeys.conversations() }); },
  });
}

export function useUpdateGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, updates }: {
      groupId: string; updates: { name?: string; description?: string; avatarUrl?: string };
    }) => updateGroup(groupId, updates),
    onSuccess: (_, { groupId }) => {
      queryClient.invalidateQueries({ queryKey: messagesKeys.conversation(groupId) });
      queryClient.invalidateQueries({ queryKey: messagesKeys.conversations() });
    },
  });
}

export function useLeaveGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (groupId: string) => leaveGroup(groupId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: messagesKeys.conversations() }); },
  });
}

export function useBlockUserInGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, userAddress }: { groupId: string; userAddress: string }) =>
      blockUserInGroup(groupId, userAddress),
    onSuccess: (_, { groupId }) => {
      queryClient.invalidateQueries({ queryKey: messagesKeys.conversation(groupId) });
    },
  });
}

// ─── User Status ──────────────────────────────────────────────────────────────

export function useUserOnlineStatus(address: string | null) {
  const { isAuthenticated } = useAuth();
  // Consumers are conversation rows in the forever-mounted MessagesPage —
  // route-gate the poll like the message poll above (N conversations would
  // otherwise each ping status every 3 min for the whole session).
  const { pathname } = useLocation();
  const isMessagesRouteActive = pathname === '/app/messages';
  return useQuery({
    queryKey: [...messagesKeys.all, 'userStatus', address],
    queryFn: () => getUserOnlineStatus(address!),
    enabled: isAuthenticated && !!address,
    staleTime: 2 * 60 * 1000,
    refetchInterval: isMessagesRouteActive ? 3 * 60 * 1000 : false,
  });
}

// ─── DM Videos ────────────────────────────────────────────────────────────────

export function useDMVideos() {
  const { isAuthenticated } = useAuth();
  return useInfiniteQuery({
    queryKey: [...messagesKeys.all, 'dmVideos'],
    queryFn: async ({ pageParam = 0 }) => getDMVideos(pageParam, 20),
    getNextPageParam: (lastPage, allPages) => lastPage.hasMore ? allPages.length : undefined,
    initialPageParam: 0,
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });
}
