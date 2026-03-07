import { supabase } from '@/integrations/supabase/client';
import { apiCall, getAuthToken, DEHUB_API_BASE } from './core';
import { getAccountInfo } from './users';
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
  mediaUrls: Array<{ url: string; type: string; mimeType?: string }>;
  uploadStatus?: 'pending' | 'success' | 'failed' | 'simple';
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
    uploadStatus: raw.uploadStatus ?? undefined,
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
 * Fetch conversations from Supabase direct_messages (wallet-based DMs).
 * Returns DeHubConversation[] for peers the user has chatted with via dm-send.
 */
async function getContactsFromSupabase(myAddress: string): Promise<DeHubConversation[]> {
  const my = myAddress.toLowerCase();
  const { data: rows, error } = await supabase
    .from('direct_messages')
    .select('id, sender_address, receiver_address, content, message_type, created_at, sender_username, sender_display_name, sender_avatar_url')
    .or(`sender_address.eq.${my},receiver_address.eq.${my}`)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    console.warn('[DM API] getContactsFromSupabase failed:', error);
    return [];
  }

  // Group by peer address, keep latest message per peer
  const byPeer = new Map<string, { row: Record<string, unknown>; isFromOther: boolean }>();
  for (const row of rows || []) {
    const sender = (row.sender_address || '').toLowerCase();
    const receiver = (row.receiver_address || '').toLowerCase();
    const peer = sender === my ? receiver : sender;
    if (!peer || peer === my) continue;
    if (byPeer.has(peer)) continue; // already have latest (we ordered desc)
    byPeer.set(peer, { row, isFromOther: sender !== my });
  }

  const conversations: DeHubConversation[] = Array.from(byPeer.entries()).map(([peerAddress, { row, isFromOther }]) => {
    const r = row as Record<string, unknown>;
    const lastMsgType = (r.message_type as string) || 'text';
    const lastMsgContent = (r.content as string) || '';
    return {
      id: `new_${peerAddress}`,
      participants: [{ address: peerAddress, _id: peerAddress } as DeHubUser],
      otherUser: {
        address: peerAddress,
        _id: peerAddress,
        username: isFromOther ? ((r.sender_username as string) || '') : '',
        displayName: isFromOther ? ((r.sender_display_name as string) || '') : '',
        avatarImageUrl: isFromOther ? ((r.sender_avatar_url as string) || '') : '',
      } as DeHubUser,
      lastMessage: {
        id: (r.id as string) || '',
        conversationId: `new_${peerAddress}`,
        sender: { address: r.sender_address as string } as DeHubUser,
        content: lastMsgContent,
        type: (lastMsgType === 'image' || lastMsgType === 'media' ? 'image' : lastMsgType === 'gif' ? 'gif' : 'text') as DMMessageType,
        createdAt: (r.created_at as string) || new Date().toISOString(),
      } as DeHubDMMessage,
      unreadCount: 0,
      createdAt: (r.created_at as string) || new Date().toISOString(),
      updatedAt: (r.created_at as string) || new Date().toISOString(),
    };
  });

  return conversations;
}

/**
 * Fetch DM contacts list for the given wallet address.
 * Merges DeHub API contacts with Supabase direct_messages conversations.
 */
export async function getContacts(
  address: string,
  page: number = 0,
  limit: number = 50
): Promise<DeHubConversation[]> {
  if (!address) return [];
  const myAddress = address.toLowerCase();

  let dehubItems: DeHubConversation[] = [];
  try {
    const response = await apiCall<unknown>(`/api/dm/contacts/${address}`, {
      params: { page, limit },
      requiresAuth: true,
    });
    console.log('[DM API] getContacts raw response:', response);

    let items: unknown[] = [];
    const r = response as Record<string, unknown>;
    if (Array.isArray(response)) items = response;
    else if (Array.isArray(r?.result)) items = r.result as unknown[];
    else if (r?.result && Array.isArray((r.result as Record<string, unknown>)?.items)) items = ((r.result as Record<string, unknown>).items as unknown[]) || [];
    else if (Array.isArray(r?.items)) items = r.items as unknown[];

    dehubItems = items.map((item: unknown) => mapApiConversationToDeHub(item as Record<string, unknown>, myAddress));
  } catch (err) {
    console.warn('[DM API] getContacts DeHub failed (will use Supabase):', err);
  }

  // Merge Supabase conversations (wallet-based DMs)
  const supabaseConvs = await getContactsFromSupabase(myAddress);
  const existingIds = new Set(dehubItems.map(c => (c.otherUser?.address || c.id || '').toLowerCase()));

  // Enrich with DeHub profile (displayName, username) when missing — fetch in parallel
  const enriched = await Promise.all(
    supabaseConvs.map(async (conv) => {
      const peer = (conv.otherUser?.address || conv.id?.replace('new_', '') || '').toLowerCase();
      if (!peer || existingIds.has(peer)) return null;
      const hasProfile = !!(conv.otherUser?.displayName || conv.otherUser?.username);
      if (!hasProfile) {
        try {
          const profile = await getAccountInfo(peer);
          if (profile) {
            conv.otherUser = {
              ...conv.otherUser,
              address: peer,
              _id: peer,
              username: profile.username || conv.otherUser?.username || '',
              displayName: profile.displayName || profile.display_name || conv.otherUser?.displayName || '',
              avatarImageUrl: profile.avatarImageUrl || profile.avatarUrl || conv.otherUser?.avatarImageUrl || '',
            } as DeHubUser;
          }
        } catch {
          // Keep address fallback if API fails
        }
      }
      return conv;
    })
  );

  for (const conv of enriched) {
    if (conv) {
      const peer = (conv.otherUser?.address || conv.id?.replace('new_', '') || '').toLowerCase();
      if (peer) {
        dehubItems.push(conv);
        existingIds.add(peer);
      }
    }
  }

  // Sort by last activity (newest first)
  dehubItems.sort((a, b) => {
    const ta = new Date(a.updatedAt || a.lastMessage?.createdAt || 0).getTime();
    const tb = new Date(b.updatedAt || b.lastMessage?.createdAt || 0).getTime();
    return tb - ta;
  });

  console.log('[DM API] getContacts mapped:', dehubItems.length, 'conversations (DeHub + Supabase)');
  return dehubItems.slice(0, limit);
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
  const myAddress = address?.toLowerCase() || '';

  // For virtual/wallet-based conversations, delete from Supabase
  if (dmId.startsWith('new_') || /^0x[0-9a-fA-F]{40}$/i.test(dmId)) {
    const peerAddress = dmId.replace('new_', '').toLowerCase();
    if (myAddress && peerAddress) {
      const { error } = await supabase
        .from('direct_messages')
        .delete()
        .or(
          `and(sender_address.eq.${myAddress},receiver_address.eq.${peerAddress}),and(sender_address.eq.${peerAddress},receiver_address.eq.${myAddress})`
        );
      if (error) {
        console.error('[DM API] deleteConversation Supabase error:', error);
        throw new Error(`Failed to delete conversation: ${error.message}`);
      }
    }
    return { success: true };
  }

  // For real DeHub conversations, call the API AND clean up Supabase
  try {
    await apiCall<any>(`/api/dm/delete-messages/${dmId}`, {
      method: 'POST',
      requiresAuth: true,
    });
  } catch (err) {
    console.error('[DM API] deleteConversation DeHub API failed:', err);
    throw err;
  }

  return { success: true };
}

// ─── Messages ─────────────────────────────────────────────────────────────────

/**
 * Check if conversationId is a virtual/wallet-based conversation (new_0x... or raw 0x...).
 */
function isVirtualConversation(conversationId: string): boolean {
  return conversationId.startsWith('new_') || /^0x[0-9a-fA-F]{40}$/i.test(conversationId);
}

/**
 * Fetch messages from Supabase direct_messages for wallet-based conversations.
 * Used when createAndStart fails or for new conversations before DeHub has a real dmId.
 */
async function getMessagesFromSupabase(
  myAddress: string,
  otherAddress: string,
  page: number,
  limit: number
): Promise<{ items: DmMessage[]; totalCount: number; hasMore: boolean }> {
  const my = myAddress.toLowerCase();
  const other = otherAddress.toLowerCase();

  const { data: rows, error } = await supabase
    .from('direct_messages')
    .select('*')
    .or(`and(sender_address.eq.${my},receiver_address.eq.${other}),and(sender_address.eq.${other},receiver_address.eq.${my})`)
    .order('created_at', { ascending: false })
    .range(page * limit, (page + 1) * limit - 1);

  if (error) {
    console.warn('[DM API] getMessagesFromSupabase failed:', error);
    return { items: [], totalCount: 0, hasMore: false };
  }

  const items: DmMessage[] = (rows || []).map((row: any) => {
    const senderAddr = (row.sender_address || '').toLowerCase();
    const author: 'me' | 'other' = senderAddr === my ? 'me' : 'other';
    const msgType: DmMsgType =
      row.message_type === 'image' || row.message_type === 'media' ? 'media' :
      row.message_type === 'gif' ? 'gif' :
      row.message_type === 'audio' || row.message_type === 'voice' ? 'voice' :
      'msg';
    return {
      _id: row.id,
      conversation: other,
      sender: {
        _id: senderAddr,
        username: row.sender_username || '',
        address: senderAddr,
        displayName: row.sender_display_name || '',
        avatarImageUrl: row.sender_avatar_url || '',
      },
      content: row.content || '',
      msgType,
      mediaUrls: row.media_url ? [{ url: row.media_url, type: 'image', mimeType: 'image/*' }] : [],
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
      author,
      createdAt: row.created_at || new Date().toISOString(),
      updatedAt: row.created_at || new Date().toISOString(),
    };
  });

  return {
    items,
    totalCount: items.length,
    hasMore: items.length >= limit,
  };
}

/**
 * Send a message via REST (dm-send edge function).
 * Used for virtual conversations when socket/createAndStart fails.
 */
export async function sendMessageViaRest(
  conversationId: string,
  content: string,
  msgType: DmMsgType = 'msg',
  opts?: { gifUrl?: string; mediaUrl?: string; replyTo?: string }
): Promise<DmMessage> {
  const token = getAuthToken();
  if (!token) throw new Error('Authentication required');

  const sender = (localStorage.getItem('dehub_wallet') || '').toLowerCase();
  if (!sender) throw new Error('Wallet address not found');

  const isNew = conversationId.startsWith('new_');
  const receiver = isNew ? conversationId.replace('new_', '').toLowerCase() : null;
  const realConvId = /^0x[0-9a-fA-F]{40}$/i.test(conversationId) ? conversationId.toLowerCase() : null;

  if (!receiver && !realConvId) {
    throw new Error('Invalid conversation: need receiver address or real conversation ID');
  }

  const currentUser = JSON.parse(localStorage.getItem('dehub_user') || '{}');
  const body: Record<string, unknown> = {
    sender,
    content,
    type: msgType === 'msg' ? 'text' : msgType === 'media' ? 'image' : msgType === 'voice' ? 'audio' : msgType,
    sender_username: currentUser?.username,
    sender_display_name: currentUser?.displayName,
    sender_avatar_url: currentUser?.avatarImageUrl,
  };
  if (receiver) body.receiver = receiver;
  else body.conversationId = conversationId;
  if (opts?.gifUrl || opts?.mediaUrl) body.mediaUrl = opts.gifUrl || opts.mediaUrl;
  if (opts?.replyTo) body.replyTo = opts.replyTo;

  const { data, error } = await supabase.functions.invoke('dm-send', {
    body,
    headers: {
      'x-wallet-address': sender,
      'x-dehub-token': token,
    },
  });

  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error || 'Failed to send message');

  const row = data?.result?.data || data?.result;
  if (!row) {
    return parseDmMessage({ _id: `temp-${Date.now()}`, content, sender: { address: sender }, conversation: receiver || conversationId, msgType, createdAt: new Date().toISOString() }, sender);
  }
  // Map Supabase row to DmMessage
  const mappedMsgType: DmMsgType = row.message_type === 'image' || row.message_type === 'media' ? 'media' : row.message_type === 'gif' ? 'gif' : row.message_type === 'voice' ? 'voice' : 'msg';
  return {
    _id: row.id,
    conversation: row.conversation_id || receiver || conversationId,
    sender: {
      _id: sender,
      username: currentUser?.username || '',
      address: sender,
      displayName: currentUser?.displayName || '',
      avatarImageUrl: currentUser?.avatarImageUrl || '',
    },
    content: row.content || content,
    msgType: mappedMsgType,
    mediaUrls: row.media_url ? [{ url: row.media_url, type: 'image', mimeType: 'image/*' }] : [],
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
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.created_at || new Date().toISOString(),
  };
}

export async function getMessages(
  conversationId: string,
  page: number = 0,
  limit: number = 30
): Promise<{ items: DmMessage[]; totalCount: number; hasMore: boolean }> {
  console.log('[DM API] getMessages called', { conversationId, page, limit });

  const myAddress = (localStorage.getItem('dehub_wallet') || '').toLowerCase();

  // Virtual conversation: fetch from Supabase (dm-send saves there)
  if (isVirtualConversation(conversationId)) {
    const otherAddress = conversationId.startsWith('new_')
      ? conversationId.replace('new_', '')
      : conversationId;
    return getMessagesFromSupabase(myAddress, otherAddress, page, limit);
  }

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

  const response = await fetch(`${DEHUB_API_BASE}/api/dm/upload`, {
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

/**
 * Mark conversation as read.
 * Per chat-system.md, read receipts are via Socket: socket.emit('readReceipt', { dmId }).
 * No REST endpoint exists for this — emitReadReceipt in dm-socket handles it.
 */
export async function markConversationAsRead(conversationId: string): Promise<{ success: boolean }> {
  if (conversationId.startsWith('new_') || /^0x[0-9a-fA-F]{40}$/i.test(conversationId)) {
    return { success: true };
  }
  return { success: true };
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
    const response = await apiCall<any>('/api/dm/search', {
      params: { q: trimmedQuery, page, limit },
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
// Note: DeHub backend does not support group DMs (chat-system.md: "All DMs are 1:1 only").
// These functions fail gracefully with a clear error.

const GROUP_NOT_SUPPORTED = 'Group chat is not supported. DeHub DMs are 1:1 only.';

export async function createGroup(
  _name: string,
  _memberAddresses: string[],
  _description?: string
): Promise<DeHubConversation> {
  throw new Error(GROUP_NOT_SUPPORTED);
}

export async function getGroupInfo(_groupId: string): Promise<GroupInfo> {
  throw new Error(GROUP_NOT_SUPPORTED);
}

export async function joinGroup(_groupId: string): Promise<{ success: boolean }> {
  throw new Error(GROUP_NOT_SUPPORTED);
}

export async function updateGroup(
  _groupId: string,
  _updates: { name?: string; description?: string; avatarUrl?: string }
): Promise<GroupInfo> {
  throw new Error(GROUP_NOT_SUPPORTED);
}

export async function leaveGroup(_groupId: string): Promise<{ success: boolean }> {
  throw new Error(GROUP_NOT_SUPPORTED);
}

export async function blockUserInGroup(
  _groupId: string,
  _userAddress: string
): Promise<{ success: boolean }> {
  throw new Error(GROUP_NOT_SUPPORTED);
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

// ─── Free DM Access ───────────────────────────────────────────────────────────

export interface FreeAccessUser {
  address: string;
  username?: string;
  displayName?: string;
  avatarImageUrl?: string;
  grantedAt?: string;
}

/**
 * Grant free DM access to a specific user (they can message you without paying the fee).
 */
export async function grantFreeDmAccess(targetAddress: string): Promise<{ success: boolean }> {
  try {
    const response = await apiCall<any>('/api/dm/grant-free-access', {
      method: 'POST',
      body: { address: targetAddress },
      requiresAuth: true,
    });
    return { success: response?.success !== false };
  } catch (error) {
    console.error('[DM API] grantFreeDmAccess failed:', error);
    throw error;
  }
}

/**
 * Revoke free DM access from a specific user.
 */
export async function revokeFreeDmAccess(targetAddress: string): Promise<{ success: boolean }> {
  try {
    const response = await apiCall<any>('/api/dm/revoke-free-access', {
      method: 'POST',
      body: { address: targetAddress },
      requiresAuth: true,
    });
    return { success: response?.success !== false };
  } catch (error) {
    console.error('[DM API] revokeFreeDmAccess failed:', error);
    throw error;
  }
}

/**
 * Get list of users who have been granted free DM access.
 */
export async function getFreeDmAccessList(): Promise<FreeAccessUser[]> {
  try {
    const response = await apiCall<any>('/api/dm/free-access-list', {
      method: 'GET',
      requiresAuth: true,
    });
    const items = response?.result?.items || response?.result || response?.items || [];
    return Array.isArray(items) ? items : [];
  } catch (error) {
    console.error('[DM API] getFreeDmAccessList failed:', error);
    return [];
  }
}
