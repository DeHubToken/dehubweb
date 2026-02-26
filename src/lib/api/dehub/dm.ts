import { supabase } from '@/integrations/supabase/client';
import { apiCall, getAuthToken, DEHUB_API_BASE } from './core';
import type { DeHubUser, DeHubNFT } from './types';

// ─── Legacy types (kept for backward compat with GroupSettingsDrawer etc.) ────

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
  dmFee?: DmFee;
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

// ─── New types (DeHub DM API v2) ──────────────────────────────────────────────

export type DmMsgType = 'msg' | 'media' | 'gif' | 'voice' | 'tip';

export interface DmSender {
  _id: string;
  username: string;
  address: string;
  displayName: string;
  avatarImageUrl: string;
}

export interface ReplyPreview {
  _id: string;
  content: string;
  msgType: DmMsgType;
  mediaUrls: Array<{ url: string; type: string; mimeType: string }>;
  voiceDuration: number | null;
  sender: DmSender;
}

export interface DmMessage {
  _id: string;
  conversation: string;
  sender: DmSender;
  content: string;
  msgType: DmMsgType;
  mediaUrls: Array<{ url: string; type: string; mimeType: string }>;
  voiceDuration: number | null;
  isRead: boolean;
  isEdited: boolean;
  editedAt: string | null;
  isForwarded: boolean;
  replyTo: ReplyPreview | null;
  paymentStatus: null | 'pending' | 'confirmed';
  paymentTxHash: string | null;
  tipAmount: number | null;
  tipSymbol: string | null;
  isDeleted: boolean;
  author: 'me' | 'other';
  createdAt: string;
  updatedAt: string;
}

export interface DmFee {
  required: boolean;
  fee: number;
  hasFreeAccess: boolean;
}

export interface DmConversation {
  _id: string;
  participants: Array<{ participant: DmSender; role: string }>;
  lastMessageAt: string;
  unreadCount: number;
  messages: DmMessage[];
  tips: unknown[];
  dmFee?: DmFee;
  otherUser?: DmSender;
}

export interface UserOnlineStatus {
  address: string;
  online: boolean;
  lastSeen?: string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function normalizeDmSender(raw: any): DeHubUser {
  return {
    _id: raw?._id || raw?.id || '',
    address: raw?.address || '',
    username: raw?.username,
    displayName: raw?.displayName || raw?.display_name,
    display_name: raw?.display_name || raw?.displayName,
    avatarImageUrl: raw?.avatarImageUrl || raw?.avatarUrl,
    avatarUrl: raw?.avatarUrl || raw?.avatarImageUrl,
    isVerified: raw?.isVerified || raw?.is_verified,
    is_verified: raw?.is_verified || raw?.isVerified,
  };
}

function mapDmMessageToLegacy(msg: any): DeHubDMMessage {
  const msgType: DMMessageType =
    msg.msgType === 'msg' ? 'text' :
    msg.msgType === 'media' ? 'image' :
    msg.msgType === 'voice' ? 'audio' :
    (msg.msgType || msg.type || 'text') as DMMessageType;

  return {
    id: msg._id || msg.id || `msg-${Date.now()}`,
    conversationId: msg.conversation || msg.conversationId || '',
    sender: normalizeDmSender(msg.sender),
    content: msg.content || '',
    type: msgType,
    mediaUrl: msg.mediaUrls?.[0]?.url || msg.mediaUrl,
    createdAt: msg.createdAt || new Date().toISOString(),
    readAt: msg.isRead ? (msg.updatedAt || msg.createdAt) : undefined,
    tipAmount: msg.tipAmount || undefined,
    duration: msg.voiceDuration || undefined,
  };
}

/** Map a raw API conversation item to DeHubConversation for UI compatibility. */
function mapApiConversationToDeHub(item: any, myAddress: string): DeHubConversation {
  const id = item._id || item.id;

  // Participants: handle both {participant, role}[] and flat DeHubUser[]
  let participants: DeHubUser[] = [];
  if (Array.isArray(item.participants)) {
    if (item.participants[0]?.participant) {
      participants = item.participants.map((p: any) => normalizeDmSender(p.participant));
    } else {
      participants = item.participants.map((p: any) => normalizeDmSender(p));
    }
  }

  // otherUser: from field or derived from participants
  let otherUser: DeHubUser | undefined = item.otherUser
    ? normalizeDmSender(item.otherUser)
    : participants.find(p => p.address?.toLowerCase() !== myAddress.toLowerCase());

  // lastMessage: from field or derive from messages array
  let lastMessage: DeHubDMMessage | undefined;
  if (item.lastMessage) {
    lastMessage = mapDmMessageToLegacy(item.lastMessage);
  } else if (Array.isArray(item.messages) && item.messages.length > 0) {
    // messages array is newest-first or oldest-first; take the most recent
    const sorted = [...item.messages].sort(
      (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    lastMessage = mapDmMessageToLegacy(sorted[0]);
  }

  return {
    id,
    participants,
    otherUser,
    lastMessage,
    unreadCount: item.unreadCount || 0,
    createdAt: item.createdAt || item.lastMessageAt || new Date().toISOString(),
    updatedAt: item.updatedAt || item.lastMessageAt || new Date().toISOString(),
    isGroup: item.isGroup || false,
    isBlocked: item.isBlocked || false,
    groupInfo: item.groupInfo,
    dmFee: item.dmFee,
  };
}

function parseDmMessage(raw: any, myAddress: string): DmMessage {
  const msgType: DmMsgType =
    raw.msgType === 'text' ? 'msg' :
    raw.msgType === 'image' ? 'media' :
    raw.msgType === 'audio' ? 'voice' :
    (raw.msgType || 'msg') as DmMsgType;

  const senderAddr = raw.sender?.address?.toLowerCase() || '';
  const author: 'me' | 'other' = senderAddr === myAddress.toLowerCase() ? 'me' : 'other';

  return {
    _id: raw._id || raw.id || `msg-${Date.now()}`,
    conversation: raw.conversation || raw.conversationId || '',
    sender: {
      _id: raw.sender?._id || raw.sender?.id || '',
      username: raw.sender?.username || '',
      address: raw.sender?.address || '',
      displayName: raw.sender?.displayName || raw.sender?.display_name || '',
      avatarImageUrl: raw.sender?.avatarImageUrl || raw.sender?.avatarUrl || '',
    },
    content: raw.content || '',
    msgType,
    mediaUrls: Array.isArray(raw.mediaUrls) ? raw.mediaUrls : [],
    voiceDuration: raw.voiceDuration ?? null,
    isRead: raw.isRead ?? false,
    isEdited: raw.isEdited ?? false,
    editedAt: raw.editedAt ?? null,
    isForwarded: raw.isForwarded ?? false,
    replyTo: raw.replyTo ?? null,
    paymentStatus: raw.paymentStatus ?? null,
    paymentTxHash: raw.paymentTxHash ?? null,
    tipAmount: raw.tipAmount ?? null,
    tipSymbol: raw.tipSymbol ?? null,
    isDeleted: raw.isDeleted ?? false,
    author,
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || raw.createdAt || new Date().toISOString(),
  };
}

// ─── Contacts & Conversations ─────────────────────────────────────────────────

/**
 * Fetch DM contacts list for the given wallet address.
 * Returns DeHubConversation[] for backward compat with MessagesPage.
 */
export async function getContacts(
  address: string,
  page: number = 0,
  limit: number = 50
): Promise<DeHubConversation[]> {
  if (!address) return [];
  const myAddress = address.toLowerCase();

  try {
    const response = await apiCall<any>(`/api/dm/contacts/${address}`, {
      params: { page, limit },
      requiresAuth: true,
    });
    console.log('[DM API] getContacts raw response:', response);

    let items: any[] = [];
    if (Array.isArray(response)) items = response;
    else if (response?.result && Array.isArray(response.result)) items = response.result;
    else if (response?.result?.items && Array.isArray(response.result.items)) items = response.result.items;
    else if (response?.items && Array.isArray(response.items)) items = response.items;

    const mapped = items.map(item => mapApiConversationToDeHub(item, myAddress));
    console.log('[DM API] getContacts mapped:', mapped.length, 'conversations');
    return mapped;
  } catch (err) {
    console.error('[DM API] getContacts failed:', err);
    throw err;
  }
}

export async function getConversations(
  page: number = 0,
  limit: number = 20,
  searchQuery?: string
): Promise<{ items: DeHubConversation[]; totalCount: number; hasMore: boolean }> {
  console.log('[DM API] getConversations called', { page, limit, searchQuery });

  if (!searchQuery) {
    const token = getAuthToken();
    if (!token) return { items: [], totalCount: 0, hasMore: false };
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const userAddress = payload.address?.toLowerCase();
      if (!userAddress) return { items: [], totalCount: 0, hasMore: false };
      const items = await getContacts(userAddress, page, limit);
      return { items, totalCount: items.length, hasMore: items.length >= limit };
    } catch (error) {
      console.error('[DM API] getConversations failed:', error);
      throw error;
    }
  }

  // Search path — server-side search
  try {
    const response = await apiCall<any>('/api/dm/search', {
      params: { query: searchQuery, page, limit },
      requiresAuth: true,
    });
    console.log('[DM API] Search response:', response);

    if (response?.result?.items) return response.result;
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

  return {
    id: `new_${recipientAddress}`,
    participants: [otherUser],
    otherUser,
    unreadCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export async function deleteConversation(
  dmId: string,
  address?: string
): Promise<{ success: boolean }> {
  // Skip virtual conversations
  if (dmId.startsWith('new_') || /^0x[0-9a-fA-F]{40}$/i.test(dmId)) {
    return { success: true };
  }

  try {
    await apiCall<any>(`/dm/conversation/${dmId}`, {
      method: 'DELETE',
      body: address ? { address } : undefined,
      requiresAuth: true,
    });
    return { success: true };
  } catch (err) {
    console.error('[DM API] deleteConversation failed:', err);
    // Fallback to old endpoint
    try {
      await apiCall<any>('/api/dm/delete-messages', {
        method: 'POST',
        body: { conversationId: dmId },
        requiresAuth: true,
      });
      return { success: true };
    } catch (fallbackErr) {
      console.error('[DM API] deleteConversation fallback also failed:', fallbackErr);
      throw fallbackErr;
    }
  }
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export async function getMessages(
  conversationId: string,
  page: number = 0,
  limit: number = 30
): Promise<{ items: DmMessage[]; totalCount: number; hasMore: boolean }> {
  console.log('[DM API] getMessages called', { conversationId, page, limit });

  if (conversationId.startsWith('new_') || /^0x[0-9a-fA-F]{40}$/i.test(conversationId)) {
    return { items: [], totalCount: 0, hasMore: false };
  }

  const myAddress = localStorage.getItem('dehub_wallet')?.toLowerCase() || '';

  try {
    const response = await apiCall<any>(`/api/dm/messages/${conversationId}`, {
      params: { page, limit },
      requiresAuth: true,
    });
    console.log('[DM API] getMessages raw response:', response);

    let rawItems: any[] = [];
    let hasMore = false;
    let totalCount = 0;

    if (response?.result?.items && Array.isArray(response.result.items)) {
      rawItems = response.result.items;
      hasMore = response.result.hasMore ?? rawItems.length >= limit;
      totalCount = response.result.totalCount || rawItems.length;
    } else if (response?.result && Array.isArray(response.result)) {
      rawItems = response.result;
      hasMore = rawItems.length >= limit;
      totalCount = rawItems.length;
    } else if (response?.items && Array.isArray(response.items)) {
      rawItems = response.items;
      hasMore = response.hasMore ?? rawItems.length >= limit;
      totalCount = response.totalCount || rawItems.length;
    } else if (response?.messages && Array.isArray(response.messages)) {
      rawItems = response.messages;
      hasMore = response.hasMore ?? rawItems.length >= limit;
      totalCount = response.totalCount || rawItems.length;
    } else if (Array.isArray(response)) {
      rawItems = response;
      hasMore = rawItems.length >= limit;
      totalCount = rawItems.length;
    }

    const items = rawItems
      .map(raw => parseDmMessage(raw, myAddress))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return { items, totalCount, hasMore };
  } catch (error) {
    console.error('[DM API] getMessages failed:', error);
    throw error;
  }
}

/**
 * Upload a media/voice file and create a DM message in one call.
 * Uses POST /dm/upload (DeHub CDN).
 */
export async function uploadAndSendMedia(
  file: File,
  conversationId: string,
  senderId: string,
  opts?: {
    content?: string;
    msgType?: 'media' | 'voice';
    voiceDuration?: number;
    replyTo?: string;
    txHash?: string;
  }
): Promise<DmMessage> {
  console.log('[DM API] uploadAndSendMedia called', { fileName: file.name, size: file.size, conversationId });

  const token = getAuthToken();
  if (!token) throw new Error('Authentication required');

  const formData = new FormData();
  formData.append('file', file, file.name);
  formData.append('conversationId', conversationId);
  formData.append('senderId', senderId);
  if (opts?.content) formData.append('content', opts.content);
  if (opts?.msgType) formData.append('msgType', opts.msgType);
  if (opts?.voiceDuration != null) formData.append('voiceDuration', String(opts.voiceDuration));
  if (opts?.replyTo) formData.append('replyTo', opts.replyTo);
  if (opts?.txHash) formData.append('txHash', opts.txHash);

  const response = await fetch(`${DEHUB_API_BASE}/dm/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.message || errData.error || `Upload failed: ${response.status}`);
  }

  const data = await response.json();
  const raw = data?.result || data;
  const myAddress = localStorage.getItem('dehub_wallet')?.toLowerCase() || '';
  return parseDmMessage(raw, myAddress);
}

/**
 * Upload an image via the dm-upload-media Supabase edge function.
 * Used for comment images and other non-DM media uploads.
 * @deprecated For DM images, prefer uploadAndSendMedia instead.
 */
export async function uploadChatImage(file: File): Promise<{ url: string }> {
  const token = getAuthToken();
  if (!token) throw new Error('Authentication required');

  const walletAddress = localStorage.getItem('dehub_wallet');
  if (!walletAddress) throw new Error('Wallet address not found');

  const formData = new FormData();
  formData.append('file', file, file.name);

  const { data, error } = await supabase.functions.invoke('dm-upload-media', {
    body: formData,
    headers: {
      'x-wallet-address': walletAddress.toLowerCase(),
      'x-dehub-token': token,
    },
  });

  if (error) throw error;
  if (!data?.ok || !data?.url) throw new Error(data?.error || 'Upload failed — no URL returned');

  return { url: data.url };
}

export async function markConversationAsRead(conversationId: string): Promise<{ success: boolean }> {
  if (conversationId.startsWith('new_')) return { success: true };

  try {
    const response = await apiCall<any>('/api/dm/tnx', {
      method: 'PUT',
      body: { conversationId, read: true },
      requiresAuth: true,
    });
    return { success: response?.success !== false };
  } catch (error) {
    console.error('[DM API] markConversationAsRead failed:', error);
    return { success: false };
  }
}

// ─── User search ──────────────────────────────────────────────────────────────

export async function searchUsersForDM(
  query: string,
  page: number = 0,
  limit: number = 10
): Promise<{ items: DeHubUser[]; hasMore: boolean }> {
  const trimmedQuery = query?.trim();
  if (!trimmedQuery || trimmedQuery.length < 2) return { items: [], hasMore: false };

  console.log('[DM API] searchUsersForDM called', { query: trimmedQuery });

  try {
    const response = await apiCall<any>('/dm/search', {
      params: { searchQuery: trimmedQuery, page, limit },
      requiresAuth: true,
    });
    console.log('[DM API] searchUsersForDM response:', response);

    let accounts: any[] = [];
    if (response?.users && Array.isArray(response.users)) accounts = response.users;
    else if (response?.accounts?.items && Array.isArray(response.accounts.items)) accounts = response.accounts.items;
    else if (response?.result?.accounts && Array.isArray(response.result.accounts)) accounts = response.result.accounts;
    else if (response?.accounts && Array.isArray(response.accounts)) accounts = response.accounts;
    else if (response?.result && Array.isArray(response.result)) accounts = response.result;
    else if (Array.isArray(response)) accounts = response;

    // Fallback to old endpoint if new one returns nothing
    if (!accounts.length) {
      const fallback = await apiCall<any>('/api/dm/search', {
        params: { q: trimmedQuery, page, limit },
        requiresAuth: true,
      }).catch(() => null);
      if (fallback?.users) accounts = fallback.users;
      else if (fallback?.accounts?.items) accounts = fallback.accounts.items;
      else if (Array.isArray(fallback)) accounts = fallback;
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

    return { items, hasMore: items.length >= limit };
  } catch (error) {
    console.error('[DM API] searchUsersForDM failed:', error);
    return { items: [], hasMore: false };
  }
}

// ─── Block / Unblock ──────────────────────────────────────────────────────────

export async function blockConversation(conversationId: string): Promise<{ success: boolean }> {
  try {
    const response = await apiCall<any>('/api/dm/block', {
      method: 'POST',
      body: { conversationId },
      requiresAuth: true,
    });
    return { success: response?.success !== false };
  } catch (error) {
    console.error('[DM API] blockConversation failed:', error);
    throw error;
  }
}

export async function unblockConversation(conversationId: string): Promise<{ success: boolean }> {
  try {
    const response = await apiCall<any>(`/api/dm/un-block/${conversationId}`, {
      method: 'GET',
      requiresAuth: true,
    });
    return { success: response?.success !== false };
  } catch (error) {
    console.error('[DM API] unblockConversation failed:', error);
    throw error;
  }
}

// ─── Group Chat ───────────────────────────────────────────────────────────────

export async function createGroup(
  name: string,
  memberAddresses: string[],
  description?: string
): Promise<DeHubConversation> {
  const token = getAuthToken();
  if (!token) throw new Error('Authentication required');

  try {
    const response = await apiCall<any>('/api/dm/group', {
      method: 'POST',
      body: { name, memberAddresses, description },
      requiresAuth: true,
    });

    if (response?.result) return response.result;
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
  try {
    const response = await apiCall<any>('/api/dm/group/info', {
      method: 'POST',
      body: { groupId },
      requiresAuth: true,
    });
    return response?.result || response;
  } catch (error) {
    console.error('[DM API] getGroupInfo failed:', error);
    throw error;
  }
}

export async function joinGroup(groupId: string): Promise<{ success: boolean }> {
  try {
    const response = await apiCall<any>('/api/dm/group/join', {
      method: 'POST',
      body: { groupId },
      requiresAuth: true,
    });
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
  try {
    const response = await apiCall<any>('/api/dm/group', {
      method: 'PUT',
      body: { groupId, ...updates },
      requiresAuth: true,
    });
    return response?.result || response;
  } catch (error) {
    console.error('[DM API] updateGroup failed:', error);
    throw error;
  }
}

export async function leaveGroup(groupId: string): Promise<{ success: boolean }> {
  try {
    const response = await apiCall<any>('/api/dm/group-user-exit', {
      method: 'POST',
      body: { groupId },
      requiresAuth: true,
    });
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
  try {
    const response = await apiCall<any>('/api/dm/group-user-block', {
      method: 'POST',
      body: { groupId, userAddress },
      requiresAuth: true,
    });
    return { success: response?.success !== false };
  } catch (error) {
    console.error('[DM API] blockUserInGroup failed:', error);
    throw error;
  }
}

// ─── User Status ──────────────────────────────────────────────────────────────

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

export async function getUserOnlineStatus(address: string): Promise<UserOnlineStatus> {
  try {
    const response = await apiCall<any>(`/api/dm/user-status/${address}`, {
      method: 'GET',
      requiresAuth: true,
    });
    const result = response?.result || response;
    return { address, online: result?.online ?? false, lastSeen: result?.lastSeen };
  } catch (error) {
    console.error('[DM API] getUserOnlineStatus failed:', error);
    return { address, online: false };
  }
}

// ─── Subscription-gated DMs ───────────────────────────────────────────────────

export async function getDMPlanSettings(planId: string): Promise<{
  enabled: boolean;
  minTipDhb?: number;
  allowedMessageTypes?: DMMessageType[];
}> {
  try {
    const response = await apiCall<any>(`/api/dm/plan/${planId}`, {
      method: 'GET',
      requiresAuth: true,
    });
    return response?.result || response || { enabled: true };
  } catch (error) {
    console.error('[DM API] getDMPlanSettings failed:', error);
    return { enabled: true };
  }
}

// ─── DM Videos ────────────────────────────────────────────────────────────────

export async function getDMVideos(
  page: number = 0,
  limit: number = 20
): Promise<{ items: DeHubNFT[]; hasMore: boolean }> {
  try {
    const response = await apiCall<any>('/api/dm/dm-videos', {
      params: { page, limit },
      requiresAuth: true,
    });
    if (response?.result?.items) return response.result;
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
