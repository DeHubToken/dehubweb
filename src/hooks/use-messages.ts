/**
 * Direct Messages Hooks
 * =====================
 * React Query hooks for managing DM conversations and messages.
 */

import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  getConversations,
  getMessages,
  sendMessage,
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
  uploadChatImage,
  getUserOnlineStatus,
  getDMVideos,
  type DeHubConversation,
  type DeHubDMMessage,
  type DeHubUser,
  type GroupInfo,
  type DMMessageType,
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
      console.log('[useConversations] Fetching conversations...', { searchQuery, isAuthenticated });
      try {
        // Pass undefined for empty search to use contacts endpoint instead of broken search
        const response = await getConversations(0, 50, searchQuery || undefined);
        console.log('[useConversations] Response:', response);
        return response.items || [];
      } catch (error) {
        console.error('[useConversations] Error fetching conversations:', error);
        throw error;
      }
    },
    enabled: isAuthenticated,
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 30 * 1000, // Poll every 30s for new messages
    retry: 2, // Retry twice on API errors
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
      console.log('[useMessages] Fetching messages...', { conversationId, pageParam });
      if (!conversationId) return { items: [], totalCount: 0, hasMore: false };
      try {
        const result = await getMessages(conversationId, pageParam, 30);
        console.log('[useMessages] Response:', result);
        return result;
      } catch (error) {
        console.error('[useMessages] Error:', error);
        throw error;
      }
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

  // Supabase Realtime Subscription for instant updates
  useEffect(() => {
    if (!isAuthenticated || !conversationId) return;

    console.log('[useMessages] Setting up realtime subscription for:', conversationId);

    // Subscribe to new messages in direct_messages table
    const channel = supabase
      .channel(`dm:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'direct_messages',
          // Filter by conversation_id OR addresses (to catch new conversations where ID isn't known yet)
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          console.log('[useMessages] New message received via Realtime:', payload);
          // Invalidate messages query to trigger a refetch
          queryClient.invalidateQueries({ queryKey: messagesKeys.messages(conversationId) });
          // Also invalidate conversations to update the sidebar
          queryClient.invalidateQueries({ queryKey: messagesKeys.conversations() });
        }
      )
      .subscribe();

    return () => {
      console.log('[useMessages] Cleaning up realtime subscription for:', conversationId);
      supabase.removeChannel(channel);
    };
  }, [conversationId, isAuthenticated, queryClient]);

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
      tipAmount,
      tipCurrency,
      mediaFile,
    }: {
      content: string;
      type?: DMMessageType;
      mediaUrl?: string;
      tipAmount?: number;
      tipCurrency?: string;
      mediaFile?: File;
    }) => {
      return sendMessage(conversationId, content, type, mediaUrl, tipAmount, tipCurrency, mediaFile);
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
        type: type as DMMessageType || 'text',
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
 * Takes recipientAddress and optional user data to construct virtual conversation
 */
export function useCreateConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ recipientAddress, recipientUser }: { recipientAddress: string; recipientUser?: Partial<import('@/lib/api/dehub').DeHubUser> }) =>
      createConversation(recipientAddress, recipientUser),
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

// ============================================
// BLOCK / UNBLOCK HOOKS
// ============================================

/**
 * Hook for blocking a conversation
 */
export function useBlockConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (conversationId: string) => blockConversation(conversationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messagesKeys.conversations() });
    },
  });
}

/**
 * Hook for unblocking a conversation
 */
export function useUnblockConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (conversationId: string) => unblockConversation(conversationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messagesKeys.conversations() });
    },
  });
}

// ============================================
// GROUP CHAT HOOKS
// ============================================

/**
 * Hook for creating a new group chat
 */
export function useCreateGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ name, memberAddresses, description }: {
      name: string;
      memberAddresses: string[];
      description?: string
    }) => createGroup(name, memberAddresses, description),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messagesKeys.conversations() });
    },
  });
}

/**
 * Hook for fetching group info
 */
export function useGroupInfo(groupId: string | null) {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: [...messagesKeys.conversation(groupId || ''), 'groupInfo'],
    queryFn: () => getGroupInfo(groupId!),
    enabled: isAuthenticated && !!groupId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook for joining a group
 */
export function useJoinGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (groupId: string) => joinGroup(groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messagesKeys.conversations() });
    },
  });
}

/**
 * Hook for updating a group
 */
export function useUpdateGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ groupId, updates }: {
      groupId: string;
      updates: { name?: string; description?: string; avatarUrl?: string }
    }) => updateGroup(groupId, updates),
    onSuccess: (_, { groupId }) => {
      queryClient.invalidateQueries({ queryKey: messagesKeys.conversation(groupId) });
      queryClient.invalidateQueries({ queryKey: messagesKeys.conversations() });
    },
  });
}

/**
 * Hook for leaving a group
 */
export function useLeaveGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (groupId: string) => leaveGroup(groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messagesKeys.conversations() });
    },
  });
}

/**
 * Hook for blocking a user in a group (admin action)
 */
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

// ============================================
// MEDIA UPLOAD HOOKS
// ============================================

/**
 * Hook for uploading chat images
 */
export function useUploadChatImage() {
  return useMutation({
    mutationFn: (file: File) => uploadChatImage(file),
  });
}

// ============================================
// USER STATUS HOOKS
// ============================================

/**
 * Hook for fetching a user's online status
 */
export function useUserOnlineStatus(address: string | null) {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: [...messagesKeys.all, 'userStatus', address],
    queryFn: () => getUserOnlineStatus(address!),
    enabled: isAuthenticated && !!address,
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // Refresh every minute
  });
}

// ============================================
// DM VIDEOS HOOK
// ============================================

/**
 * Hook for fetching videos shared in DMs
 */
export function useDMVideos() {
  const { isAuthenticated } = useAuth();

  return useInfiniteQuery({
    queryKey: [...messagesKeys.all, 'dmVideos'],
    queryFn: async ({ pageParam = 0 }) => {
      return getDMVideos(pageParam, 20);
    },
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.hasMore) {
        return allPages.length;
      }
      return undefined;
    },
    initialPageParam: 0,
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
