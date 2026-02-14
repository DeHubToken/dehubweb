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
      const userAddress = payload.address;
      console.log('[DM API] Parsed user address from JWT:', userAddress);
      
      if (!userAddress) {
        console.warn('[DM API] No user address in JWT payload');
        return { items: [], totalCount: 0, hasMore: false };
      }
      
      console.log('[DM API] Fetching from /api/dm/contacts/' + userAddress);
      const response = await apiCall<any>(
        `/api/dm/contacts/${userAddress}`,
        {
          params: { page, limit },
          requiresAuth: true,
        }
      );
      console.log('[DM API] getConversations raw response:', response);
      
      let items: DeHubConversation[] = [];
      
      if (Array.isArray(response)) {
        items = response;
      }
      else if (response?.result && Array.isArray(response.result)) {
        items = response.result;
      }
      else if (response?.result?.items && Array.isArray(response.result.items)) {
        items = response.result.items;
        const hasMore = response.result.hasMore ?? items.length >= limit;
        console.log('[DM API] Returning conversations (format 3):', { count: items.length, hasMore });
        return { items, totalCount: items.length, hasMore };
      }
      else if (response?.items && Array.isArray(response.items)) {
        items = response.items;
        const hasMore = response.hasMore ?? items.length >= limit;
        console.log('[DM API] Returning conversations (format 4):', { count: items.length, hasMore });
        return { items, totalCount: items.length, hasMore };
      }
      
      console.log('[DM API] Returning conversations:', { count: items.length, hasMore: items.length >= limit });
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
    const response = await apiCall<any>(`/api/dm/messages/${conversationId}`, {
      params: { page, limit },
      requiresAuth: true,
    });
    console.log('[DM API] getMessages raw response:', response);
    
    let items: DeHubDMMessage[] = [];
    
    if (response?.result?.items && Array.isArray(response.result.items)) {
      items = response.result.items;
      const hasMore = response.result.hasMore ?? items.length >= limit;
      return { items, totalCount: response.result.totalCount || items.length, hasMore };
    }
    if (response?.result && Array.isArray(response.result)) {
      items = response.result;
      return { items, totalCount: items.length, hasMore: items.length >= limit };
    }
    if (Array.isArray(response)) {
      items = response;
      return { items, totalCount: items.length, hasMore: items.length >= limit };
    }
    if (response?.items && Array.isArray(response.items)) {
      items = response.items;
      return { items, totalCount: response.totalCount || items.length, hasMore: response.hasMore ?? items.length >= limit };
    }
    
    console.warn('[DM API] Unknown response format for getMessages:', response);
    return { items: [], totalCount: 0, hasMore: false };
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
    const hasMedia = !!mediaUrl || (type !== 'text' && type !== 'tip');

    let data: any;

    if (!hasMedia) {
      // Use Supabase Edge Function to proxy DM send (avoids CORS / auth issues)
      const edgeBody: Record<string, unknown> = {
        sender,
        content,
        type,
      };

      if (isNewConversation && recipientAddress) {
        edgeBody.receiver = recipientAddress.toLowerCase();
        console.log('[DM API] Sending text to new conversation with recipient:', recipientAddress);
      } else {
        edgeBody.conversationId = conversationId;
      }

      if (type === 'tip' && tipAmount !== undefined) {
        edgeBody.tipAmount = tipAmount;
        edgeBody.tipCurrency = tipCurrency || 'DHB';
      }

      console.log('[DM API] Sending text message via dm-send edge function');
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

      console.log('[DM API] dm-send edge response:', edgeData);

      // Edge function always returns 200 with { ok, result, error, dehubResponse }
      if (!edgeData?.ok) {
        console.error('[DM API] DeHub API rejected DM:', edgeData?.error, edgeData?.dehubResponse);
        throw new Error(edgeData?.error || 'Failed to send message');
      }

      data = edgeData?.result;
    } else {
      const formData = new FormData();
      formData.append('content', content);
      formData.append('type', type);
      formData.append('sender', sender);

      if (isNewConversation && recipientAddress) {
        formData.append('receiver', recipientAddress.toLowerCase());
        console.log('[DM API] Sending media to new conversation with recipient:', recipientAddress);
      } else {
        formData.append('conversationId', conversationId);
      }

      if (mediaUrl) {
        formData.append('mediaUrl', mediaUrl);
      }

      console.log('[DM API] Sending media message via /api/dm/upload');
      const response = await fetch(`${DEHUB_API_BASE}/api/dm/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[DM API] sendMessage upload error response:', errorData);
        throw new Error(errorData.message || 'Failed to send message');
      }

      data = await response.json();
    }

    console.log('[DM API] sendMessage response:', data);

    if (data?.result) {
      // Handle nested {result: {success, data: {…}}} from edge function
      const result = data.result?.data || data.result;
      return {
        id: result._id || result.id || `temp-${Date.now()}`,
        conversationId: result.conversationId || conversationId,
        sender: result.sender || { address: result.senderAddress },
        content: result.content || content,
        type: result.type || type,
        mediaUrl: result.mediaUrl,
        createdAt: result.createdAt || new Date().toISOString(),
      };
    }
    if (data?._id || data?.id) {
      return {
        id: data._id || data.id,
        conversationId: data.conversationId || conversationId,
        sender: data.sender,
        content: data.content || content,
        type: data.type || type,
        mediaUrl: data.mediaUrl,
        createdAt: data.createdAt || new Date().toISOString(),
      };
    }
    if (data?.message && typeof data.message === 'object') {
      return data.message;
    }

    console.warn('[DM API] Unknown response format for sendMessage:', data);
    throw new Error('Invalid response from sendMessage');
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
    const response = await apiCall<any>("/api/search", {
      params: { q: trimmedQuery, type: 'accounts', page, unit: limit },
      requiresAuth: true,
    });
    
    console.log('[DM API] searchUsersForDM response:', response);
    
    let accounts: DeHubUser[] = [];
    
    if (response?.result?.accounts && Array.isArray(response.result.accounts)) {
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
      dmSettings: acc.dmSettings,
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
        members: JSON.stringify(memberAddresses),
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
  
  try {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch(`${DEHUB_API_BASE}/api/chat-image`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Failed to upload image');
    }
    
    const data = await response.json();
    console.log('[DM API] uploadChatImage response:', data);
    
    const url = data?.result?.url || data?.url || data?.imageUrl || data?.result?.imageUrl;
    
    if (!url) {
      throw new Error('No URL returned from image upload');
    }
    
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
