import { apiCall } from './core';

export interface LiveChatRoom {
  id: string;
  roomId?: string;
  name?: string;
  topic?: string;
  description?: string;
  roomType?: string;
  participantCount?: number;
  activeUsers?: number;
  messageCount?: number;
  createdAt?: string;
  settings?: Record<string, unknown>;
  moderators?: string[];
  slowMode?: boolean;
  slowModeSeconds?: number;
  subscribersOnly?: boolean;
  minStakeRequired?: number;
  pinnedMessages?: string[];
}

export interface LiveChatMessage {
  id: string;
  roomId: string;
  content: string;
  type?: 'text' | 'image' | 'gif';
  messageType?: string;
  imageUrl?: string;
  sender: {
    address: string;
    username?: string;
    displayName?: string;
    avatarUrl?: string;
    avatarImageUrl?: string;
    isModerator?: boolean;
    isBanned?: boolean;
    followers?: number;
    followings?: number;
    badgeBalance?: number;
  };
  reactions?: Record<string, unknown>;
  isPinned?: boolean;
  createdAt: string;
}

export interface LiveChatUserProfile {
  address: string;
  username?: string;
  displayName?: string;
  avatarImageUrl?: string;
  isBanned?: boolean;
  isModerator?: boolean;
}

/**
 * GET /api/livechat/room — single global chat room info
 */
export async function getLiveChatRooms(): Promise<LiveChatRoom[]> {
  try {
    const response = await apiCall<Record<string, unknown>>('/api/livechat/room', {
      requiresAuth: true,
    });

    // Normalize into a room object
    const raw = (response && typeof response === 'object' && 'result' in response)
      ? response.result as Record<string, unknown>
      : response;

    if (raw && typeof raw === 'object') {
      const room: LiveChatRoom = {
        id: (raw as any).id || (raw as any).roomId || (raw as any)._id || 'general',
        name: (raw as any).name || 'General',
        topic: (raw as any).topic || (raw as any).description || 'DeHub Community Chat',
        ...raw as any,
      };
      return [room];
    }
  } catch (error: any) {
    console.warn('[LiveChat API] /api/livechat/room failed:', error?.message);
  }

  // Fallback default room
  return [{ id: 'general', name: 'General', topic: 'DeHub Community Chat' }];
}

/**
 * GET /api/livechat/room — single global room
 */
export async function getLiveChatRoom(roomId: string): Promise<LiveChatRoom> {
  try {
    const response = await apiCall<Record<string, unknown>>('/api/livechat/room', {
      requiresAuth: true,
    });
    const raw = (response && typeof response === 'object' && 'result' in response)
      ? response.result
      : response;
    if (raw && typeof raw === 'object') {
      return {
        id: (raw as any).id || (raw as any).roomId || roomId,
        name: (raw as any).name || 'General',
        ...raw as any,
      };
    }
  } catch (error: any) {
    console.warn('[LiveChat API] getLiveChatRoom failed:', error?.message);
  }
  return { id: roomId, name: 'Chat Room' };
}

/**
 * GET /api/livechat/messages — cursor-based pagination
 * Params: limit (max 100, default 50), before (message ID), after (message ID)
 */
export async function getLiveChatMessages(
  _roomId: string,
  params?: { page?: number; limit?: number; before?: string; after?: string }
): Promise<LiveChatMessage[]> {
  try {
    const queryParams: Record<string, string | number | undefined> = {
      limit: Math.min(params?.limit ?? 100, 100),
    };
    if (params?.before) queryParams.before = params.before;
    if (params?.after) queryParams.after = params.after;

    const response = await apiCall<Record<string, unknown>>('/api/livechat/messages', {
      params: queryParams,
      requiresAuth: true,
    });

    // Response shape: { messages: [...], hasMore: boolean }
    if (response && typeof response === 'object') {
      if ('messages' in response && Array.isArray(response.messages)) {
        return response.messages as LiveChatMessage[];
      }
      if ('result' in response && typeof response.result === 'object' && response.result !== null) {
        const inner = response.result as Record<string, unknown>;
        if ('messages' in inner && Array.isArray(inner.messages)) {
          return inner.messages as LiveChatMessage[];
        }
      }
      if ('data' in response && Array.isArray(response.data)) {
        return response.data as LiveChatMessage[];
      }
    }
    if (Array.isArray(response)) return response as unknown as LiveChatMessage[];

    console.warn('[LiveChat API] /api/livechat/messages: unexpected response format', response);
  } catch (error: any) {
    console.error('[LiveChat API] getLiveChatMessages failed:', error?.message);
  }

  return [];
}

/**
 * GET /api/livechat/user/{address}
 */
export async function getLiveChatUserProfile(address: string): Promise<LiveChatUserProfile> {
  const response = await apiCall<Record<string, unknown>>(
    `/api/livechat/user/${address}`,
    { requiresAuth: true }
  );
  if (response && typeof response === 'object' && 'result' in response) {
    return response.result as LiveChatUserProfile;
  }
  return response as unknown as LiveChatUserProfile;
}

/**
 * GET /api/livechat/online — online user count
 */
export async function getLiveChatOnlineCount(): Promise<number> {
  try {
    const response = await apiCall<Record<string, unknown>>('/api/livechat/online', {
      requiresAuth: true,
    });
    if (response && typeof response === 'object') {
      return (response as any).count ?? (response as any).online ?? (response as any).result ?? 0;
    }
    return 0;
  } catch {
    return 0;
  }
}

/**
 * GET /api/livechat/status — your chat status
 */
export async function getLiveChatStatus(): Promise<Record<string, unknown>> {
  try {
    const response = await apiCall<Record<string, unknown>>('/api/livechat/status', {
      requiresAuth: true,
    });
    return (response && typeof response === 'object' && 'result' in response)
      ? response.result as Record<string, unknown>
      : response;
  } catch {
    return {};
  }
}

/**
 * Send a livechat message — socket-only (no REST POST endpoint exists).
 * This is a convenience wrapper; prefer using emitSendMessage from socket.ts directly.
 */
export async function sendLiveChatMessage(
  roomId: string,
  content: string,
  type: 'text' | 'image' | 'gif' | 'voice' = 'text',
  imageUrl?: string
): Promise<LiveChatMessage> {
  const { emitSendMessage, getSocket } = await import('./socket');
  const socket = getSocket();
  if (!socket.connected) {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Socket not connected')), 5000);
      socket.once('connect', () => { clearTimeout(timeout); resolve(); });
      if (socket.connected) { clearTimeout(timeout); resolve(); }
    });
  }
  emitSendMessage({ roomId, content, messageType: type, imageUrl });
  // Return optimistic message since socket is fire-and-forget
  return {
    id: `temp-${Date.now()}`,
    roomId,
    content,
    messageType: type,
    sender: { address: '' },
    createdAt: new Date().toISOString(),
  };
}

// Keep these for potential future use but they target global endpoints now
export async function pinLiveChatMessage(_roomId: string, messageId: string): Promise<void> {
  await apiCall(`/api/livechat/messages/${messageId}/pin`, {
    method: 'POST',
    requiresAuth: true,
  });
}

export async function unpinLiveChatMessage(_roomId: string, messageId: string): Promise<void> {
  await apiCall(`/api/livechat/messages/${messageId}/pin`, {
    method: 'DELETE',
    requiresAuth: true,
  });
}

export async function banLiveChatUser(_roomId: string, userAddress: string): Promise<void> {
  await apiCall('/api/livechat/ban', {
    method: 'POST',
    body: { address: userAddress.toLowerCase() },
    requiresAuth: true,
  });
}

export async function unbanLiveChatUser(_roomId: string, userAddress: string): Promise<void> {
  await apiCall(`/api/livechat/ban/${userAddress.toLowerCase()}`, {
    method: 'DELETE',
    requiresAuth: true,
  });
}

export async function addLiveChatModerator(_roomId: string, userAddress: string): Promise<void> {
  await apiCall('/api/livechat/moderators', {
    method: 'POST',
    body: { address: userAddress.toLowerCase() },
    requiresAuth: true,
  });
}

export async function createTopicRoom(params: {
  topic: string;
  description?: string;
}): Promise<LiveChatRoom> {
  const response = await apiCall<Record<string, unknown>>('/api/livechat/rooms/topic', {
    method: 'POST',
    body: params as Record<string, unknown>,
    requiresAuth: true,
  });
  if (response && typeof response === 'object' && 'result' in response) {
    return response.result as LiveChatRoom;
  }
  return response as unknown as LiveChatRoom;
}

export async function updateLiveChatRoomSettings(
  _roomId: string,
  settings: Record<string, unknown>
): Promise<LiveChatRoom> {
  const response = await apiCall<Record<string, unknown>>(
    '/api/livechat/settings',
    {
      method: 'PATCH',
      body: settings,
      requiresAuth: true,
    }
  );
  if (response && typeof response === 'object' && 'result' in response) {
    return response.result as LiveChatRoom;
  }
  return response as unknown as LiveChatRoom;
}
