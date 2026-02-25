import { DEHUB_API_BASE, apiCall, getAuthToken } from './core';
import { supabase } from '@/integrations/supabase/client';
import type { DeHubUser, DeHubNFT } from './types';

export type DMMessageType = 'text' | 'image' | 'gif' | 'audio' | 'video' | 'tip';

export interface GroupInfo {
  id: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  creatorAddress: string;
  memberCount: number;
  members?: DeHubUser[];
  isPublic?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DeHubConversation {
  id: string;
  participants: DeHubUser[];
  lastMessage?: DeHubDMMessage;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
  otherUser?: DeHubUser;
  groupInfo?: GroupInfo;
  isGroup?: boolean;
  isBlocked?: boolean;
}

export interface DeHubDMMessage {
  id: string;
  conversationId: string;
  sender: DeHubUser;
  content: string;
  type: DMMessageType;
  mediaUrl?: string;
  createdAt: string;
  readAt?: string;
  tipAmount?: number;
  tipCurrency?: string;
  duration?: number;
}

export interface UserOnlineStatus {
  address: string;
  online: boolean;
  lastSeen?: string;
}

interface ConversationsApiResponse {
  result: {
    items: DeHubConversation[];
    totalCount: number;
    hasMore: boolean;
  };
}

interface MessagesApiResponse {
  result: {
    items: DeHubDMMessage[];
    totalCount: number;
    hasMore: boolean;
  };
}

export async function getConversations(
  page: number = 0,
  limit: number = 20,
  searchQuery?: string
): Promise<{ items: DeHubConversation[]; totalCount: number; hasMore: boolean }> {
  console.log('[DM API] getConversations called', { page, limit, searchQuery });

  if (!searchQuery) {
    const token = getAuthToken();
    if (!token) {
      console.log('[DM API] No auth token available');
      return { items: [], totalCount: 0, hasMore: false };
    }

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const userAddress = payload.address?.toLowerCase();
      console.log('[DM API] Parsed user address from JWT:', userAddress);

      if (!userAddress) {
        console.warn('[DM API] No user address in JWT payload');
        return { items: [], totalCount: 0, hasMore: false };
      }

      // Fetch from DeHub API only
      let dehubItems: DeHubConversation[] = [];
      try {
        console.log('[DM API] Fetching from /api/dm/contacts/' + userAddress);
        const response = await apiCall<any>(
          `/api/dm/contacts/${userAddress}`,
          { params: { page, limit }, requiresAuth: true }
        );
        console.log('[DM API] getConversations raw response:', response);

        if (Array.isArray(response)) dehubItems = response;
        else if (response?.result && Array.isArray(response.result)) dehubItems = response.result;
        else if (response?.result?.items && Array.isArray(response.result.items)) dehubItems = response.result.items;
        else if (response?.items && Array.isArray(response.items)) dehubItems = response.items;
      } catch (err) {
        console.warn('[DM API] DeHub getConversations failed:', err);
      }

      const items = dehubItems
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

      console.log('[DM API] Returning merged conversations:', { count: items.length });
      return {
        items,
        totalCount: items.length,
        hasMore: items.length >= limit
      };
    } catch (error) {
      console.error('[DM API] Failed to fetch conversations:', error);
      throw error;
    }
  }

  console.log('[DM API] Searching conversations with query:', searchQuery);
  try {
    const response = await apiCall<any>("/api/dm/search", {
      params: { query: searchQuery, page, limit },
      requiresAuth: true,
    });
    console.log('[DM API] Search response:', response);

    if (response?.result?.items) {
      return response.result;
    }
    if (response?.result && Array.isArray(response.result)) {
      return { items: response.result, totalCount: response.result.length, hasMore: response.result.length >= limit };
    }
    if (Array.isArray(response)) {
      return { items: response, totalCount: response.length, hasMore: response.length >= limit };
    }

    return { items: [], totalCount: 0, hasMore: false };
  } catch (error) {
    console.error('[DM API] Search failed:', error);
    throw error;
  }
}

export async function getConversation(conversationId: string): Promise<DeHubConversation> {
  if (conversationId.startsWith('new_')) {
    const address = conversationId.replace('new_', '');
    return {
      id: conversationId,
      participants: [{ address } as any],
      otherUser: { address } as any,
      unreadCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  const response = await apiCall<{ result: DeHubConversation }>(`/api/dm/${conversationId}`, {
    requiresAuth: true,
  });
  return response.result;
}

export async function createConversation(
  recipientAddress: string,
  recipientUser?: Partial<DeHubUser>
): Promise<DeHubConversation> {
  console.log('[DM API] createConversation called', { recipientAddress, recipientUser });

  const otherUser: DeHubUser = recipientUser ? {
    _id: recipientUser._id || recipientAddress,
    address: recipientAddress,
    username: recipientUser.username,
    displayName: recipientUser.displayName || recipientUser.display_name,
    avatarImageUrl: recipientUser.avatarImageUrl || recipientUser.avatarUrl,
    isVerified: recipientUser.isVerified || recipientUser.is_verified,
  } : {
    _id: recipientAddress,
    address: recipientAddress,
  };

  const virtualConversation: DeHubConversation = {
    id: `new_${recipientAddress}`,
    participants: [otherUser],
    otherUser,
    lastMessage: undefined,
    unreadCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  console.log('[DM API] Created virtual conversation:', virtualConversation);
  return virtualConversation;
}

export async function deleteConversation(conversationId: string): Promise<{ success: boolean }> {
  return apiCall<{ success: boolean }>("/api/dm/delete-messages", {
    method: "POST",
    body: { conversationId },
    requiresAuth: true,
  });
}

export async function getMessages(
  conversationId: string,
  page: number = 0,
  limit: number = 30
): Promise<{ items: DeHubDMMessage[]; totalCount: number; hasMore: boolean }> {
  console.log('[DM API] getMessages called', { conversationId, page, limit });

  if (conversationId.startsWith('new_')) {
    console.log('[DM API] Virtual conversation - returning empty messages');
    return { items: [], totalCount: 0, hasMore: false };
  }

  try {
    // Fetch from DeHub API only
    let items: DeHubDMMessage[] = [];
    let hasMore = false;
    let totalCount = 0;

    const response = await apiCall<any>(`/api/dm/messages/${conversationId}`, {
      params: { page, limit },
      requiresAuth: true,
    });
    console.log('[DM API] getMessages raw response:', response);

    if (response?.result?.items && Array.isArray(response.result.items)) {
      items = response.result.items;
      hasMore = response.result.hasMore ?? items.length >= limit;
      totalCount = response.result.totalCount || items.length;
    } else if (response?.result && Array.isArray(response.result)) {
      items = response.result;
      hasMore = items.length >= limit;
      totalCount = items.length;
    } else if (response?.items && Array.isArray(response.items)) {
      items = response.items;
      hasMore = response.hasMore ?? items.length >= limit;
      totalCount = response.totalCount || items.length;
    } else if (response?.messages && Array.isArray(response.messages)) {
      items = response.messages;
      hasMore = response.hasMore ?? items.length >= limit;
      totalCount = response.totalCount || items.length;
    } else if (Array.isArray(response)) {
      items = response;
      hasMore = items.length >= limit;
      totalCount = items.length;
    }

    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return { items, totalCount, hasMore };
  } catch (error) {
    console.error('[DM API] getMessages failed:', error);
    throw error;
  }
}

export async function sendMessage(
  conversationId: string,
  content: string,
  type: DMMessageType = 'text',
  mediaUrl?: string,
  tipAmount?: number,
  tipCurrency?: string
): Promise<DeHubDMMessage> {
  console.log('[DM API] sendMessage called', { conversationId, content: content.substring(0, 50), type, mediaUrl });

  const token = getAuthToken();
  if (!token) {
    throw new Error("Authentication required");
  }

  const isNewConversation = conversationId.startsWith('new_');
  const recipientAddress = isNewConversation ? conversationId.replace('new_', '') : undefined;

  try {
    const senderAddress = localStorage.getItem('dehub_wallet');
    if (!senderAddress) {
      throw new Error("Wallet address not found. Please reconnect your wallet.");
    }

    const sender = senderAddress.toLowerCase();
    const currentUser = JSON.parse(localStorage.getItem('dehub_user') || '{}');

    const edgeBody: Record<string, unknown> = {
      sender,
      content,
      type,
      sender_username: currentUser?.username,
      sender_display_name: currentUser?.displayName,
      sender_avatar_url: currentUser?.avatarImageUrl,
    };

    if (mediaUrl) edgeBody.mediaUrl = mediaUrl;

    if (isNewConversation && recipientAddress) {
      edgeBody.receiver = recipientAddress.toLowerCase();
      console.log('[DM API] Sending message to new conversation with recipient:', recipientAddress);
    } else {
      edgeBody.conversationId = conversationId;
    }

    if (type === 'tip' && tipAmount !== undefined) {
      edgeBody.tipAmount = tipAmount;
      edgeBody.tipCurrency = tipCurrency || 'DHB';
    }

    console.log('[DM API] Sending message via dm-send edge function', { type, hasMedia: !!mediaUrl });
    const { data: edgeData, error: edgeError } = await supabase.functions.invoke('dm-send', {
      body: edgeBody,
      headers: {
        'x-wallet-address': sender,
        'x-dehub-token': token,
      },
    });

    if (edgeError) {
      console.error('[DM API] dm-send edge function error:', edgeError);
      throw new Error(edgeError.message || 'Failed to send message');
    }

    if (!edgeData?.ok) {
      console.error('[DM API] DeHub API rejected DM:', edgeData?.error);
      throw new Error(edgeData?.error || 'Failed to send message');
    }

    let data: any = edgeData?.result;

    console.log('[DM API] sendMessage response:', data);

    // Handle nested data or direct response
    const d = data?.data || data?.result?.data || data?.result || data;

    if (d && (d._id || d.id)) {
      // Use the receiver address as conversationId (matches Supabase storage)
      // Don't use DeHub _id as it breaks Supabase queries
      const receiverAddr = recipientAddress?.toLowerCase() || d.receiverAddress || d.receiver_address;
      const finalConversationId = d.conversationId || d.conversation_id || receiverAddr || conversationId;
      return {
        id: d.id || d._id,
        conversationId: finalConversationId,
        sender: d.sender || { address: d.sender_address || d.senderAddress || sender },
        content: d.content || d.text || content,
        type: d.type || d.message_type || type,
        mediaUrl: d.mediaUrl || d.media_url,
        createdAt: d.createdAt || d.created_at || new Date().toISOString(),
      };
    }

    console.warn('[DM API] Unknown response format for sendMessage:', data);
    return {
      id: `msg-${Date.now()}`,
      conversationId,
      sender: { address: sender },
      content,
      type,
      mediaUrl,
      createdAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[DM API] sendMessage failed:', error);
    throw error;
  }
}

export async function markConversationAsRead(conversationId: string): Promise<{ success: boolean }> {
  console.log('[DM API] markConversationAsRead called', { conversationId });

  if (conversationId.startsWith('new_')) {
    console.log('[DM API] Virtual conversation - skipping mark as read');
    return { success: true };
  }

  try {
    const response = await apiCall<any>("/api/dm/tnx", {
      method: "PUT",
      body: { conversationId, read: true },
      requiresAuth: true,
    });
    console.log('[DM API] markConversationAsRead response:', response);

    if (response?.success !== undefined) {
      return { success: response.success };
    }
    if (response?.result?.success !== undefined) {
      return { success: response.result.success };
    }
    return { success: true };
  } catch (error) {
    console.error('[DM API] markConversationAsRead failed:', error);
    return { success: false };
  }
}

export async function getDMContacts(
  address: string,
  page: number = 0,
  limit: number = 10
): Promise<{ items: DeHubUser[]; hasMore: boolean }> {
  const response = await apiCall<{ result: { items: DeHubUser[]; hasMore: boolean } }>(`/api/dm/contacts/${address}`, {
    params: { page, limit },
    requiresAuth: true,
  });
  return response.result || { items: [], hasMore: false };
}

export async function getDMUserStatus(address: string): Promise<{ online: boolean; lastSeen?: string }> {
  const response = await apiCall<{ result: { online: boolean; lastSeen?: string } }>(`/api/dm/user-status/${address}`, {
    requiresAuth: true,
  });
  return response.result || { online: false };
}

export async function searchUsersForDM(
  query: string,
  page: number = 0,
  limit: number = 10
): Promise<{ items: DeHubUser[]; hasMore: boolean }> {
  const trimmedQuery = query?.trim();
  if (!trimmedQuery || trimmedQuery.length < 2) {
    return { items: [], hasMore: false };
  }

  console.log('[DM API] searchUsersForDM called', { query: trimmedQuery, page, limit });

  try {
    const response = await apiCall<any>("/api/dm/search", {
      params: { q: trimmedQuery, page, limit },
      requiresAuth: true,
    });

    console.log('[DM API] searchUsersForDM response:', response);

    let accounts: DeHubUser[] = [];

    if (response?.users && Array.isArray(response.users)) {
      accounts = response.users;
    }
    else if (response?.accounts?.items && Array.isArray(response.accounts.items)) {
      accounts = response.accounts.items;
    }
    else if (response?.result?.accounts && Array.isArray(response.result.accounts)) {
      accounts = response.result.accounts;
    }
    else if (response?.accounts && Array.isArray(response.accounts)) {
      accounts = response.accounts;
    }
    else if (response?.result && Array.isArray(response.result)) {
      accounts = response.result;
    }
    else if (Array.isArray(response)) {
      accounts = response;
    }

    const items: DeHubUser[] = accounts.map((acc: any) => ({
      _id: acc._id || acc.id,
      id: acc.id || acc._id,
      address: acc.address,
      username: acc.username,
      displayName: acc.displayName || acc.display_name,
      display_name: acc.display_name || acc.displayName,
      avatarImageUrl: acc.avatarImageUrl || acc.avatarUrl,
      avatarUrl: acc.avatarUrl || acc.avatarImageUrl,
      isVerified: acc.isVerified || acc.verified,
      is_verified: acc.is_verified || acc.verified,
      bio: acc.bio,
      dmSettings: acc.dmSettings || acc.dmSetting,
    }));

    console.log('[DM API] searchUsersForDM returning', { count: items.length });
    return {
      items,
      hasMore: items.length >= limit
    };
  } catch (error) {
    console.error('[DM API] searchUsersForDM failed:', error);
    return { items: [], hasMore: false };
  }
}

// Block / Unblock

export async function blockConversation(conversationId: string): Promise<{ success: boolean }> {
  console.log('[DM API] blockConversation called', { conversationId });

  try {
    const response = await apiCall<any>("/api/dm/block", {
      method: "POST",
      body: { conversationId },
      requiresAuth: true,
    });
    console.log('[DM API] blockConversation response:', response);

    return { success: response?.success !== false };
  } catch (error) {
    console.error('[DM API] blockConversation failed:', error);
    throw error;
  }
}

export async function unblockConversation(conversationId: string): Promise<{ success: boolean }> {
  console.log('[DM API] unblockConversation called', { conversationId });

  try {
    const response = await apiCall<any>(`/api/dm/un-block/${conversationId}`, {
      method: "GET",
      requiresAuth: true,
    });
    console.log('[DM API] unblockConversation response:', response);

    return { success: response?.success !== false };
  } catch (error) {
    console.error('[DM API] unblockConversation failed:', error);
    throw error;
  }
}

// Group Chat

export async function createGroup(
  name: string,
  memberAddresses: string[],
  description?: string
): Promise<DeHubConversation> {
  console.log('[DM API] createGroup called', { name, memberAddresses, description });

  const token = getAuthToken();
  if (!token) {
    throw new Error("Authentication required");
  }

  try {
    const response = await apiCall<any>("/api/dm/group", {
      method: "POST",
      body: {
        name,
        memberAddresses,
        description,
      },
      requiresAuth: true,
    });
    console.log('[DM API] createGroup response:', response);

    if (response?.result) {
      return response.result;
    }
    if (response?.id || response?._id) {
      return {
        id: response._id || response.id,
        participants: response.members || [],
        unreadCount: 0,
        createdAt: response.createdAt || new Date().toISOString(),
        updatedAt: response.updatedAt || new Date().toISOString(),
        isGroup: true,
        groupInfo: {
          id: response._id || response.id,
          name: response.name || name,
          description: response.description,
          creatorAddress: response.creatorAddress,
          memberCount: memberAddresses.length,
          createdAt: response.createdAt || new Date().toISOString(),
          updatedAt: response.updatedAt || new Date().toISOString(),
        },
      };
    }

    throw new Error('Invalid response from createGroup');
  } catch (error) {
    console.error('[DM API] createGroup failed:', error);
    throw error;
  }
}

export async function getGroupInfo(groupId: string): Promise<GroupInfo> {
  console.log('[DM API] getGroupInfo called', { groupId });

  try {
    const response = await apiCall<any>("/api/dm/group/info", {
      method: "POST",
      body: { groupId },
      requiresAuth: true,
    });
    console.log('[DM API] getGroupInfo response:', response);

    if (response?.result) {
      return response.result;
    }
    return response;
  } catch (error) {
    console.error('[DM API] getGroupInfo failed:', error);
    throw error;
  }
}

export async function joinGroup(groupId: string): Promise<{ success: boolean }> {
  console.log('[DM API] joinGroup called', { groupId });

  try {
    const response = await apiCall<any>("/api/dm/group/join", {
      method: "POST",
      body: { groupId },
      requiresAuth: true,
    });
    console.log('[DM API] joinGroup response:', response);

    return { success: response?.success !== false };
  } catch (error) {
    console.error('[DM API] joinGroup failed:', error);
    throw error;
  }
}

export async function updateGroup(
  groupId: string,
  updates: { name?: string; description?: string; avatarUrl?: string }
): Promise<GroupInfo> {
  console.log('[DM API] updateGroup called', { groupId, updates });

  try {
    const response = await apiCall<any>("/api/dm/group", {
      method: "PUT",
      body: { groupId, ...updates },
      requiresAuth: true,
    });
    console.log('[DM API] updateGroup response:', response);

    if (response?.result) {
      return response.result;
    }
    return response;
  } catch (error) {
    console.error('[DM API] updateGroup failed:', error);
    throw error;
  }
}

export async function leaveGroup(groupId: string): Promise<{ success: boolean }> {
  console.log('[DM API] leaveGroup called', { groupId });

  try {
    const response = await apiCall<any>("/api/dm/group-user-exit", {
      method: "POST",
      body: { groupId },
      requiresAuth: true,
    });
    console.log('[DM API] leaveGroup response:', response);

    return { success: response?.success !== false };
  } catch (error) {
    console.error('[DM API] leaveGroup failed:', error);
    throw error;
  }
}

export async function blockUserInGroup(
  groupId: string,
  userAddress: string
): Promise<{ success: boolean }> {
  console.log('[DM API] blockUserInGroup called', { groupId, userAddress });

  try {
    const response = await apiCall<any>("/api/dm/group-user-block", {
      method: "POST",
      body: { groupId, userAddress },
      requiresAuth: true,
    });
    console.log('[DM API] blockUserInGroup response:', response);

    return { success: response?.success !== false };
  } catch (error) {
    console.error('[DM API] blockUserInGroup failed:', error);
    throw error;
  }
}

// Media Upload

export async function uploadChatImage(file: File): Promise<{ url: string }> {
  console.log('[DM API] uploadChatImage called', { fileName: file.name, size: file.size });

  const token = getAuthToken();
  if (!token) {
    throw new Error("Authentication required");
  }

  const walletAddress = localStorage.getItem('dehub_wallet');
  if (!walletAddress) {
    throw new Error("Wallet address not found");
  }

  try {
    const formData = new FormData();
    formData.append('file', file, file.name);

    console.log('[DM API] Uploading via DeHub /api/dm/upload');

    const response = await fetch(`${DEHUB_API_BASE}/api/dm/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({})) as Record<string, string>;
      throw new Error(errData.message || errData.error || `Upload failed: ${response.status}`);
    }

    const data = await response.json();
    const url = data?.url || data?.result?.url || data?.data?.url;

    if (!url) {
      console.error('[DM API] /api/dm/upload returned no URL:', data);
      throw new Error('Upload failed - no URL returned');
    }

    console.log('[DM API] Media uploaded successfully:', url);
    return { url };
  } catch (error) {
    console.error('[DM API] uploadChatImage failed:', error);
    throw error;
  }
}

// User Status

export async function getUserOnlineStatus(address: string): Promise<UserOnlineStatus> {
  console.log('[DM API] getUserOnlineStatus called', { address });

  try {
    const response = await apiCall<any>(`/api/dm/user-status/${address}`, {
      method: "GET",
      requiresAuth: true,
    });
    console.log('[DM API] getUserOnlineStatus response:', response);

    const result = response?.result || response;
    return {
      address,
      online: result?.online ?? false,
      lastSeen: result?.lastSeen,
    };
  } catch (error) {
    console.error('[DM API] getUserOnlineStatus failed:', error);
    return { address, online: false };
  }
}

// Subscription-gated DMs

export async function getDMPlanSettings(planId: string): Promise<{
  enabled: boolean;
  minTipDhb?: number;
  allowedMessageTypes?: DMMessageType[];
}> {
  console.log('[DM API] getDMPlanSettings called', { planId });

  try {
    const response = await apiCall<any>(`/api/dm/plan/${planId}`, {
      method: "GET",
      requiresAuth: true,
    });
    console.log('[DM API] getDMPlanSettings response:', response);

    return response?.result || response || { enabled: true };
  } catch (error) {
    console.error('[DM API] getDMPlanSettings failed:', error);
    return { enabled: true };
  }
}

export async function getDMVideos(
  page: number = 0,
  limit: number = 20
): Promise<{ items: DeHubNFT[]; hasMore: boolean }> {
  console.log('[DM API] getDMVideos called', { page, limit });

  try {
    const response = await apiCall<any>("/api/dm/dm-videos", {
      params: { page, limit },
      requiresAuth: true,
    });
    console.log('[DM API] getDMVideos response:', response);

    if (response?.result?.items) {
      return response.result;
    }
    if (response?.result && Array.isArray(response.result)) {
      return { items: response.result, hasMore: response.result.length >= limit };
    }
    if (Array.isArray(response)) {
      return { items: response, hasMore: response.length >= limit };
    }

    return { items: [], hasMore: false };
  } catch (error) {
    console.error('[DM API] getDMVideos failed:', error);
    return { items: [], hasMore: false };
  }
}
