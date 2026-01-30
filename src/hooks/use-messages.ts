/**
 * Direct Messages Hooks
 * =====================
 * React Query hooks for managing DM conversations and messages.
 */

import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import {
  getConversations,
  getMessages,
  sendMessage,
  createConversation,
  markConversationAsRead,
  deleteConversation,
  searchUsersForDM,
  type DeHubConversation,
  type DeHubDMMessage,
  type DeHubUser,
} from '@/lib/api/dehub';

// Query keys for cache management
export const messagesKeys = {
  all: ['messages'] as const,
  conversations: () => [...messagesKeys.all, 'conversations'] as const,
  conversation: (id: string) => [...messagesKeys.all, 'conversation', id] as const,
  messages: (conversationId: string) => [...messagesKeys.all, 'thread', conversationId] as const,
  userSearch: (query: string) => [...messagesKeys.all, 'userSearch', query] as const,
};

/**
 * Hook to fetch and manage conversation list
 */
export function useConversations(searchQuery: string = '') {
  const { isAuthenticated } = useAuth();
  
  const query = useQuery({
    queryKey: [...messagesKeys.conversations(), searchQuery],
    queryFn: async () => {
      // Pass undefined for empty search to use contacts endpoint instead of broken search
      const response = await getConversations(0, 50, searchQuery || undefined);
      return response.items || [];
    },
    enabled: isAuthenticated,
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 30 * 1000, // Poll every 30s for new messages
    retry: 1, // Don't retry too many times on API errors
  });

  // Server-side search is now used via the query parameter
  // No need for client-side filtering anymore
  const filteredConversations = query.data || [];

  return {
    conversations: filteredConversations,
    allConversations: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    isRefetching: query.isRefetching,
  };
}

/**
 * Hook to fetch messages for a specific conversation with infinite scroll
 */
export function useMessages(conversationId: string | null) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  
  const query = useInfiniteQuery({
    queryKey: messagesKeys.messages(conversationId || ''),
    queryFn: async ({ pageParam = 0 }) => {
      if (!conversationId) return { items: [], totalCount: 0, hasMore: false };
      return getMessages(conversationId, pageParam, 30);
    },
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.hasMore) {
        return allPages.length;
      }
      return undefined;
    },
    initialPageParam: 0,
    enabled: isAuthenticated && !!conversationId,
    staleTime: 60 * 1000, // 1 minute
    refetchInterval: 10 * 1000, // Poll every 10s for new messages
  });

  // Flatten pages into single array (newest last for chat display)
  const messages = query.data?.pages
    .flatMap((page) => page.items)
    .reverse() || [];

  // Mark as read when viewing
  const markAsRead = useMutation({
    mutationFn: () => markConversationAsRead(conversationId!),
    onSuccess: () => {
      // Update conversation unread count in cache
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

/**
 * Hook for sending messages with optimistic updates
 */
export function useSendMessage(conversationId: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      content,
      type = 'text',
      mediaUrl,
    }: {
      content: string;
      type?: 'text' | 'image' | 'gif';
      mediaUrl?: string;
    }) => {
      return sendMessage(conversationId, content, type, mediaUrl);
    },
    onMutate: async ({ content, type, mediaUrl }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: messagesKeys.messages(conversationId) });

      // Snapshot previous value
      const previousMessages = queryClient.getQueryData(messagesKeys.messages(conversationId));

      // Optimistically add the message
      const optimisticMessage: DeHubDMMessage = {
        id: `temp-${Date.now()}`,
        conversationId,
        sender: {
          address: user?.address,
          username: user?.username,
          displayName: user?.displayName,
          avatarImageUrl: user?.avatarImageUrl,
        } as DeHubUser,
        content,
        type: type || 'text',
        mediaUrl,
        createdAt: new Date().toISOString(),
      };

      queryClient.setQueryData(messagesKeys.messages(conversationId), (old: any) => {
        if (!old?.pages) return old;
        const newPages = [...old.pages];
        if (newPages[0]) {
          newPages[0] = {
            ...newPages[0],
            items: [optimisticMessage, ...newPages[0].items],
          };
        }
        return { ...old, pages: newPages };
      });

      return { previousMessages };
    },
    onError: (_err, _variables, context) => {
      // Rollback on error
      if (context?.previousMessages) {
        queryClient.setQueryData(messagesKeys.messages(conversationId), context.previousMessages);
      }
    },
    onSettled: () => {
      // Refetch to sync with server
      queryClient.invalidateQueries({ queryKey: messagesKeys.messages(conversationId) });
      queryClient.invalidateQueries({ queryKey: messagesKeys.conversations() });
    },
  });
}

/**
 * Hook for creating a new conversation
 */
export function useCreateConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (recipientAddress: string) => createConversation(recipientAddress),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messagesKeys.conversations() });
    },
  });
}

/**
 * Hook for deleting a conversation
 */
export function useDeleteConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (conversationId: string) => deleteConversation(conversationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messagesKeys.conversations() });
    },
  });
}

/**
 * Hook for searching users to start a new conversation
 */
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

/**
 * Get total unread count across all conversations
 */
export function useTotalUnreadCount() {
  const { conversations } = useConversations();
  return conversations.reduce((sum, conv) => sum + (conv.unreadCount || 0), 0);
}
