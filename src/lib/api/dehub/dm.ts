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

      // 1. Fetch from Supabase (Local/Reliable conversations)
      console.log('[DM API] Fetching conversations from Supabase for:', userAddress);
      let supabaseConversations: DeHubConversation[] = [];
      try {
        const { data: sData, error: sError } = await (supabase as any)
          .from('direct_messages')
          .select('sender_address, receiver_address, conversation_id, content, message_type, media_url, created_at')
          .or(`sender_address.eq.${userAddress},receiver_address.eq.${userAddress}`)
          .order('created_at', { ascending: false });

        if (!sError && sData) {
          // Group by unique other user
          const conversationsMap = new Map<string, DeHubConversation>();

          sData.forEach((m: any) => {
            const otherAddress = m.sender_address === userAddress ? m.receiver_address : m.sender_address;
            if (otherAddress === 'unknown' || otherAddress === userAddress) return; // Skip self-conversations

            if (!conversationsMap.has(otherAddress)) {
              conversationsMap.set(otherAddress, {
                id: otherAddress, // Always use address as conversation ID
                participants: [{ address: otherAddress } as any],
                otherUser: {
                  address: otherAddress,
                  // Will be enriched with profile data below
                } as any,
                lastMessage: {
                  id: m.id || `msg-${m.created_at}`,
                  conversationId: otherAddress,
                  sender: {
                    address: m.sender_address,
                    username: m.sender_username,
                    displayName: m.sender_display_name,
                    avatarImageUrl: m.sender_avatar_url,
                  } as any,
                  content: m.content,
                  type: m.message_type as DMMessageType,
                  createdAt: m.created_at,
                },
                unreadCount: 0,
                createdAt: m.created_at,
                updatedAt: m.created_at,
              });
            }

            // Try to enrich otherUser profile from messages sent BY the other user
            if (m.sender_address !== userAddress) {
              const conv = conversationsMap.get(otherAddress)!;
              const ou = conv.otherUser as any;
              if (!ou.username && m.sender_username) ou.username = m.sender_username;
              if (!ou.displayName && m.sender_display_name) ou.displayName = m.sender_display_name;
              if (!ou.avatarImageUrl && m.sender_avatar_url) ou.avatarImageUrl = m.sender_avatar_url;
            }
          });

          supabaseConversations = Array.from(conversationsMap.values());

          // Fetch profiles from DeHub for any conversations missing user info
          const addressesNeedingProfile = supabaseConversations
            .filter(c => !(c.otherUser as any)?.username && !(c.otherUser as any)?.displayName)
            .map(c => (c.otherUser as any)?.address)
            .filter(Boolean);

          if (addressesNeedingProfile.length > 0) {
            const profilePromises = addressesNeedingProfile.map(async (addr: string) => {
              try {
                const res = await apiCall<any>(`/api/account_info/${addr}`, {});
                return { address: addr, profile: res?.result || res };
              } catch {
                return { address: addr, profile: null };
              }
            });
            const profiles = await Promise.all(profilePromises);

            profiles.forEach(({ address: addr, profile }) => {
              if (!profile) return;
              const conv = supabaseConversations.find(c => (c.otherUser as any)?.address === addr);
              if (conv) {
                const ou = conv.otherUser as any;
                ou.username = profile.username || ou.username;
                ou.displayName = profile.displayName || profile.display_name || ou.displayName;
                ou.avatarImageUrl = profile.avatarImageUrl || profile.avatarUrl || ou.avatarImageUrl;
                ou.isVerified = profile.isVerified || profile.is_verified;
              }
            });
          }

          console.log(`[DM API] Found ${supabaseConversations.length} conversations in Supabase`);
        }
      } catch (err) {
        console.warn('[DM API] Supabase fetch failed:', err);
      }

      // 2. Fetch from DeHub API
      let dehubItems: DeHubConversation[] = [];
      try {
        console.log('[DM API] Fetching from /api/dm/contacts/' + userAddress);
        const response = await apiCall<any>(
          `/api/dm/contacts/${userAddress}`,
          {
            params: { page, limit },
            requiresAuth: true,
          }
        );
        console.log('[DM API] getConversations raw response:', response);

        if (Array.isArray(response)) {
          dehubItems = response;
        }
        else if (response?.result && Array.isArray(response.result)) {
          dehubItems = response.result;
        }
        else if (response?.result?.items && Array.isArray(response.result.items)) {
          dehubItems = response.result.items;
        }
        else if (response?.items && Array.isArray(response.items)) {
          dehubItems = response.items;
        }
      } catch (err) {
        console.warn('[DM API] DeHub getConversations failed:', err);
      }

      // Merge conversations
      const allConversationsMap = new Map<string, DeHubConversation>();

      // Add DeHub items first (will have full user profiles)
      dehubItems.forEach(c => {
        const address = c.otherUser?.address || c.participants?.find(p => p.address?.toLowerCase() !== userAddress)?.address;
        if (address) allConversationsMap.set(address.toLowerCase(), c);
      });

      // Add Supabase items (fill gaps or update last message)
      supabaseConversations.forEach(c => {
        const address = c.otherUser?.address?.toLowerCase();
        if (address) {
          if (!allConversationsMap.has(address)) {
            allConversationsMap.set(address, c);
          } else {
            // Update last message if Supabase one is newer, but preserve profiles
            const existing = allConversationsMap.get(address)!;
            const existingTime = new Date(existing.updatedAt).getTime();
            const newTime = new Date(c.updatedAt).getTime();

            if (newTime > existingTime) {
              // Only update last message and time, keep DeHub's richer profile
              existing.lastMessage = c.lastMessage || existing.lastMessage;
              existing.updatedAt = c.updatedAt;
            }
          }
        }
      });

      const items = Array.from(allConversationsMap.values())
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
    // 1. Fetch from Supabase (Realtime / Reliable source)
    console.log('[DM API] Fetching messages from Supabase for:', conversationId);
    let supabaseMessages: DeHubDMMessage[] = [];

    const { data: sData, error: sError } = await (supabase as any)
      .from('direct_messages')
      .select('*')
      .or(`conversation_id.eq.${conversationId},sender_address.eq.${conversationId},receiver_address.eq.${conversationId}`)
      .order('created_at', { ascending: false })
      .range(page * limit, (page + 1) * limit - 1);

    if (!sError && sData) {
      supabaseMessages = sData.map((m: any) => ({
        id: m.id,
        conversationId: m.conversation_id || conversationId,
        sender: {
          address: m.sender_address,
          username: m.sender_username,
          displayName: m.sender_display_name,
          avatarImageUrl: m.sender_avatar_url,
        },
        content: m.content,
        type: m.message_type as DMMessageType,
        mediaUrl: m.media_url,
        createdAt: m.created_at,
      }));
      console.log(`[DM API] Found ${supabaseMessages.length} messages in Supabase`);
    }

    // 2. Fetch from DeHub API
    let dehubItems: DeHubDMMessage[] = [];
    let dehubHasMore = false;
    let dehubTotal = 0;

    // Only call DeHub messages API if conversationId looks like a MongoDB ID (not a wallet address)
    const isWalletAddress = conversationId.startsWith('0x');
    try {
      if (isWalletAddress) {
        console.log('[DM API] Skipping DeHub messages API for wallet address conversationId, using Supabase only');
        throw new Error('Wallet address used as conversationId - skip DeHub API');
      }
      const response = await apiCall<any>(`/api/dm/messages/${conversationId}`, {
        params: { page, limit },
        requiresAuth: true,
      });
      console.log('[DM API] getMessages raw response:', response);

      if (response?.result?.items && Array.isArray(response.result.items)) {
        dehubItems = response.result.items;
        dehubHasMore = response.result.hasMore ?? dehubItems.length >= limit;
        dehubTotal = response.result.totalCount || dehubItems.length;
      }
      else if (response?.result && Array.isArray(response.result)) {
        dehubItems = response.result;
        dehubHasMore = dehubItems.length >= limit;
        dehubTotal = dehubItems.length;
      }
      else if (Array.isArray(response)) {
        dehubItems = response;
        dehubHasMore = dehubItems.length >= limit;
        dehubTotal = dehubItems.length;
      }
      else if (response?.items && Array.isArray(response.items)) {
        dehubItems = response.items;
        dehubHasMore = response.hasMore ?? dehubItems.length >= limit;
        dehubTotal = response.totalCount || dehubItems.length;
      }
      else if (response?.messages && Array.isArray(response.messages)) {
        dehubItems = response.messages;
        dehubHasMore = response.hasMore ?? dehubItems.length >= limit;
        dehubTotal = response.totalCount || dehubItems.length;
      }
    } catch (err) {
      console.warn('[DM API] DeHub getMessages failed, using Supabase only:', err);
    }

    // Merge messages, removing duplicates by ID or content/timestamp proximity
    // For now, simple merge and sort
    const allMessagesMap = new Map<string, DeHubDMMessage>();

    // Add DeHub messages first
    dehubItems.forEach(m => {
      const id = m.id || `${m.content}-${m.createdAt}`;
      allMessagesMap.set(id, m);
    });

    // Add Supabase messages (overwrite if ID matches, or add if new)
    supabaseMessages.forEach(m => {
      allMessagesMap.set(m.id, m);
    });

    const items = Array.from(allMessagesMap.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return {
      items,
      totalCount: Math.max(dehubTotal, items.length),
      hasMore: dehubHasMore || (supabaseMessages.length >= limit)
    };
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
  tipCurrency?: string,
  mediaFile?: File
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
      // Get current user metadata to save with the message in Supabase
      const currentUser = JSON.parse(localStorage.getItem('dehub_user') || '{}');

      const edgeBody: Record<string, unknown> = {
        sender,
        content,
        type,
        sender_username: currentUser?.username,
        sender_display_name: currentUser?.displayName,
        sender_avatar_url: currentUser?.avatarImageUrl,
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
        formData.append('receiverAddress', recipientAddress.toLowerCase());
        console.log('[DM API] Sending media to new conversation with recipient:', recipientAddress);
      } else {
        // If conversationId is a wallet address, send it as receiverAddress
        if (conversationId.startsWith('0x')) {
          formData.append('receiverAddress', conversationId.toLowerCase());
        } else {
          formData.append('conversationId', conversationId);
        }
      }

      if (mediaFile) {
        formData.append('media', mediaFile, mediaFile.name);
        console.log('[DM API] Attaching file to FormData:', mediaFile.name, mediaFile.size);
      } else if (mediaUrl && !mediaUrl.startsWith('data:')) {
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
    // First try Supabase storage
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
    const filePath = `${fileName}`;

    console.log('[DM API] Uploading to Supabase bucket chat-media:', filePath);

    const { data, error } = await supabase.storage
      .from('chat-media')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      console.warn('[DM API] Supabase storage upload failed (RLS), skipping:', error.message);
      // Don't throw - return empty to let caller handle via DeHub API
      throw new Error(`Supabase upload failed: ${error.message}`);
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('chat-media')
      .getPublicUrl(filePath);

    if (!publicUrl) {
      throw new Error('Failed to get public URL for uploaded image');
    }

    console.log('[DM API] Image uploaded successfully:', publicUrl);
    return { url: publicUrl };
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
