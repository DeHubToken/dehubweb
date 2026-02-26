/**
 * Direct Messages Hooks
 * =====================
 * React Query hooks for managing DM conversations and messages.
 * Uses Socket.io /dm namespace for real-time events.
 */

import { useEffect } from 'react';
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
  type SendMessagePayload,
} from '@/lib/api/dehub/dm-socket';

// ─── Query keys ───────────────────────────────────────────────────────────────

export const messagesKeys = {
  all: ['messages'] as const,
  conversations: () => [...messagesKeys.all, 'conversations'] as const,
  conversation: (id: string) => [...messagesKeys.all, 'conversation', id] as const,
  messages: (conversationId: string) => [...messagesKeys.all, 'thread', conversationId] as const,
  userSearch: (query: string) => [...messagesKeys.all, 'userSearch', query] as const,
};

// ─── Conversations ────────────────────────────────────────────────────────────

export function useConversations(searchQuery: string = '') {
  const { isAuthenticated, walletAddress } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [...messagesKeys.conversations(), searchQuery],
    queryFn: async () => {
      console.log('[useConversations] Fetching...', { searchQuery, walletAddress });
      try {
        if (searchQuery) {
          const response = await getConversations(0, 50, searchQuery);
          return response.items || [];
        }
        if (!walletAddress) return [];
        return await getContacts(walletAddress, 0, 50);
      } catch (error) {
        console.error('[useConversations] Error:', error);
        throw error;
      }
    },
    enabled: isAuthenticated,
    staleTime: 15 * 1000,
    refetchOnWindowFocus: true,
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

  return {
    conversations: query.data || [],
    allConversations: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    isRefetching: query.isRefetching,
  };
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export function useMessages(conversationId: string | null) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const query = useInfiniteQuery({
    queryKey: messagesKeys.messages(conversationId || ''),
    queryFn: async ({ pageParam = 0 }) => {
      if (!conversationId) return { items: [], totalCount: 0, hasMore: false };
      return getMessages(conversationId, pageParam, 30);
    },
    getNextPageParam: (lastPage, allPages) => lastPage.hasMore ? allPages.length : undefined,
    initialPageParam: 0,
    enabled: isAuthenticated && !!conversationId,
    staleTime: 10 * 1000,
  });

  // Flatten pages → single array, oldest first for chat display
  const messages: DmMessage[] = query.data?.pages
    .flatMap(page => page.items)
    .reverse() || [];

  // Real-time: new messages from socket
  useEffect(() => {
    if (!isAuthenticated || !conversationId) return;

    const unsubSend = onDmSendMessage((msg) => {
      if (msg.conversation !== conversationId) return;
      queryClient.setQueryData(
        messagesKeys.messages(conversationId),
        (old: any) => {
          if (!old?.pages) return old;
          const pages = old.pages as Array<{ items: DmMessage[]; totalCount: number; hasMore: boolean }>;
          // Prepend to first page (newest first storage order)
          const newPages = [...pages];
          if (newPages[0]) {
            // Avoid duplicates
            const existing = newPages[0].items.some(m => m._id === msg._id);
            if (!existing) {
              newPages[0] = { ...newPages[0], items: [msg, ...newPages[0].items] };
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

    return () => {
      unsubSend();
      unsubEdit();
      unsubDelete();
    };
  }, [conversationId, isAuthenticated, queryClient]);

  // Mark as read via socket
  const markAsRead = useMutation({
    mutationFn: () => {
      if (conversationId && !conversationId.startsWith('new_') && !/^0x[0-9a-fA-F]{40}$/i.test(conversationId)) {
        emitReadReceipt(conversationId);
      }
      return markConversationAsRead(conversationId!);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messagesKeys.conversations() });
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
      if (msgType === 'media' || msgType === 'voice') {
        if (!mediaFile) throw new Error('No file provided for media/voice message');
        const senderId = user?._id || walletAddress || '';
        return uploadAndSendMedia(mediaFile, conversationId, senderId, {
          content,
          msgType,
          voiceDuration,
          replyTo,
          txHash,
        });
      }

      // Text / GIF — emit via socket (fire and forget)
      const payload: SendMessagePayload = {
        dmId: conversationId,
        content,
        type: msgType,
        gif: gifUrl,
        replyTo,
        txHash,
        voiceDuration,
      };
      emitSendMessage(payload);

      // Return an optimistic message (server echo arrives via socket listener)
      const tempMessage: DmMessage = {
        _id: `temp-${Date.now()}`,
        conversation: conversationId,
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

    onMutate: async ({ content, msgType, gifUrl, mediaFile }) => {
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
          ? [{ url: URL.createObjectURL(mediaFile), type: 'image', mimeType: mediaFile.type }]
          : gifUrl ? [{ url: gifUrl, type: 'image', mimeType: 'image/gif' }] : [],
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

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: messagesKeys.messages(conversationId) });
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

export function useDeleteConversation() {
  const queryClient = useQueryClient();
  const { walletAddress } = useAuth();

  return useMutation({
    mutationFn: (conversationId: string) =>
      deleteConversation(conversationId, walletAddress || undefined),
    onSuccess: () => {
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
  return useQuery({
    queryKey: [...messagesKeys.all, 'userStatus', address],
    queryFn: () => getUserOnlineStatus(address!),
    enabled: isAuthenticated && !!address,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 3 * 60 * 1000,
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
