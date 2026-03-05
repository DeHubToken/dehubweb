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

function normalizeRoom(raw: any): LiveChatRoom {
  if (!raw || typeof raw !== 'object') return raw;
  return {
    ...raw,
    id: raw.id || raw.roomId || raw._id || '',
  };
}

function normalizeRooms(raw: any[]): LiveChatRoom[] {
  return raw.map(normalizeRoom);
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
  };
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

export async function getLiveChatRooms(): Promise<LiveChatRoom[]> {
  // Try multiple known endpoint patterns the DeHub API may use
  const endpoints = [
    "/api/chat/rooms",
    "/api/livechat/rooms", 
    "/api/chatrooms",
  ];

  for (const endpoint of endpoints) {
    try {
      let response = await apiCall<Record<string, unknown>>(endpoint, {
        requiresAuth: false,
      });

      // Unwrap the common { result: ... } wrapper from the DeHub API
      if (response && typeof response === 'object' && 'result' in response && !Array.isArray(response) && typeof response.result === 'object' && response.result !== null && !Array.isArray(response.result)) {
        response = response.result as Record<string, unknown>;
      }

      if (Array.isArray(response)) return normalizeRooms(response);

      if (response && typeof response === 'object') {
        if ('rooms' in response && Array.isArray(response.rooms)) return normalizeRooms(response.rooms);
        if ('result' in response && Array.isArray(response.result)) return normalizeRooms(response.result);
        if ('data' in response && Array.isArray(response.data)) return normalizeRooms(response.data);
        if ('items' in response && Array.isArray(response.items)) return normalizeRooms(response.items);
        if ('topicRooms' in response && Array.isArray(response.topicRooms)) return normalizeRooms(response.topicRooms);

        if ('roomId' in response || 'id' in response) return [normalizeRoom(response)];

        const keys = Object.keys(response);
        for (const key of keys) {
          const val = response[key];
          if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object' && val[0] !== null) {
            return normalizeRooms(val);
          }
        }
      }

      console.warn(`[LiveChat API] ${endpoint}: unexpected response format`);
    } catch (error: any) {
      // 404 means wrong endpoint, try next
      if (error?.message?.includes('404') || error?.message?.includes('Cannot GET') || error?.message?.includes('Cannot POST')) {
        console.warn(`[LiveChat API] ${endpoint} not found, trying next...`);
        continue;
      }
      console.error(`[LiveChat API] ${endpoint} failed:`, error);
      throw error;
    }
  }

  // All endpoints failed — return a default "general" room so chat can still work via socket
  console.warn('[LiveChat API] All room endpoints returned 404, using default room');
  return [{ id: 'general', name: 'General', topic: 'DeHub Community Chat' }];
}

export async function getLiveChatRoom(roomId: string): Promise<LiveChatRoom> {
  const endpoints = [`/api/chat/rooms/${roomId}`, `/api/livechat/rooms/${roomId}`, `/api/chatrooms/${roomId}`];
  for (const endpoint of endpoints) {
    try {
      const response = await apiCall<{ result: LiveChatRoom } | LiveChatRoom>(endpoint, {
        requiresAuth: false,
      });
      if (response && typeof response === 'object' && 'result' in response && !Array.isArray(response.result)) {
        return normalizeRoom(response.result);
      }
      return normalizeRoom(response);
    } catch (error: any) {
      if (error?.message?.includes('404') || error?.message?.includes('Cannot GET')) continue;
      throw error;
    }
  }
  // Fallback
  return { id: roomId, name: 'Chat Room' };
}

export async function getLiveChatMessages(
  roomId: string,
  params?: { page?: number; limit?: number; before?: string }
): Promise<LiveChatMessage[]> {
  // Primary endpoint: flat /api/livechat/messages with roomId as query param
  const endpoints = [
    { url: `/api/livechat/messages`, queryRoomId: true },
    { url: `/api/chat/rooms/${roomId}/messages`, queryRoomId: false },
    { url: `/api/livechat/rooms/${roomId}/messages`, queryRoomId: false },
    { url: `/api/chatrooms/${roomId}/messages`, queryRoomId: false },
  ];
  
  for (const ep of endpoints) {
    try {
      const queryParams: Record<string, string | number | undefined> = {
        page: params?.page,
        limit: params?.limit ?? 200,
        before: params?.before,
      };
      if (ep.queryRoomId) {
        queryParams.roomId = roomId;
      }

      let response = await apiCall<Record<string, unknown>>(
        ep.url,
        {
          params: queryParams,
          requiresAuth: true,
        }
      );

      // Unwrap the common { result: ... } wrapper from the DeHub API
      if (response && typeof response === 'object' && 'result' in response && !Array.isArray(response) && typeof response.result === 'object' && response.result !== null && !Array.isArray(response.result)) {
        response = response.result as Record<string, unknown>;
      }

      if (response && typeof response === 'object') {
        if ('messages' in response && Array.isArray(response.messages)) return response.messages as LiveChatMessage[];
        if ('result' in response && Array.isArray(response.result)) return response.result as LiveChatMessage[];
        if ('data' in response && Array.isArray(response.data)) return response.data as LiveChatMessage[];
      }
      if (Array.isArray(response)) return response as unknown as LiveChatMessage[];
      console.warn(`[LiveChat API] ${ep.url}: unexpected response format`, response);
    } catch (error: any) {
      if (error?.message?.includes('404') || error?.message?.includes('Cannot GET')) {
        console.warn(`[LiveChat API] ${ep.url} not found, trying next...`);
        continue;
      }
      console.error('[LiveChat API] getLiveChatMessages failed:', error);
      throw error;
    }
  }

  // All endpoints 404'd — return empty (socket will handle real-time)
  console.warn('[LiveChat API] All message endpoints returned 404, returning []');
  return [];
}

export async function getLiveChatUserProfile(address: string): Promise<LiveChatUserProfile> {
  const response = await apiCall<{ result: LiveChatUserProfile } | LiveChatUserProfile>(
    `/api/livechat/user/${address}`,
    { requiresAuth: false }
  );
  if (response && typeof response === 'object' && 'result' in response) {
    return response.result;
  }
  return response as LiveChatUserProfile;
}

export async function createTopicRoom(params: {
  topic: string;
  description?: string;
}): Promise<LiveChatRoom> {
  const response = await apiCall<{ result: LiveChatRoom } | LiveChatRoom>("/api/livechat/rooms/topic", {
    method: "POST",
    body: params as Record<string, unknown>,
    requiresAuth: true,
  });
  if (response && typeof response === 'object' && 'result' in response) {
    return normalizeRoom(response.result);
  }
  return normalizeRoom(response);
}

export async function pinLiveChatMessage(roomId: string, messageId: string): Promise<void> {
  await apiCall(`/api/livechat/rooms/${roomId}/messages/${messageId}/pin`, {
    method: "POST",
    requiresAuth: true,
  });
}

export async function unpinLiveChatMessage(roomId: string, messageId: string): Promise<void> {
  await apiCall(`/api/livechat/rooms/${roomId}/messages/${messageId}/pin`, {
    method: "DELETE",
    requiresAuth: true,
  });
}

export async function banLiveChatUser(roomId: string, userAddress: string): Promise<void> {
  await apiCall(`/api/livechat/rooms/${roomId}/ban`, {
    method: "POST",
    body: { address: userAddress.toLowerCase() },
    requiresAuth: true,
  });
}

export async function unbanLiveChatUser(roomId: string, userAddress: string): Promise<void> {
  await apiCall(`/api/livechat/rooms/${roomId}/ban/${userAddress.toLowerCase()}`, {
    method: "DELETE",
    requiresAuth: true,
  });
}

export async function addLiveChatModerator(roomId: string, userAddress: string): Promise<void> {
  await apiCall(`/api/livechat/rooms/${roomId}/moderators`, {
    method: "POST",
    body: { address: userAddress.toLowerCase() },
    requiresAuth: true,
  });
}

export async function updateLiveChatRoomSettings(
  roomId: string,
  settings: Record<string, unknown>
): Promise<LiveChatRoom> {
  const response = await apiCall<{ result: LiveChatRoom } | LiveChatRoom>(
    `/api/livechat/rooms/${roomId}/settings`,
    {
      method: "PATCH",
      body: settings,
      requiresAuth: true,
    }
  );
  if (response && typeof response === 'object' && 'result' in response) {
    return response.result;
  }
  return response as LiveChatRoom;
}

export async function sendLiveChatMessage(
  roomId: string,
  content: string,
  type: 'text' | 'image' | 'gif' | 'voice' = 'text',
  imageUrl?: string
): Promise<LiveChatMessage> {
  const body: Record<string, unknown> = { content, messageType: type };
  if (imageUrl) body.imageUrl = imageUrl;

  const endpoints = [`/api/chat/rooms/${roomId}/messages`, `/api/livechat/rooms/${roomId}/messages`, `/api/chatrooms/${roomId}/messages`];
  
  for (const endpoint of endpoints) {
    try {
      const response = await apiCall<{ result: LiveChatMessage } | LiveChatMessage>(
        endpoint,
        {
          method: 'POST',
          body,
          requiresAuth: true,
        }
      );
      if (response && typeof response === 'object' && 'result' in response && !Array.isArray((response as any).result)) {
        return (response as { result: LiveChatMessage }).result;
      }
      return response as LiveChatMessage;
    } catch (error: any) {
      if (error?.message?.includes('404') || error?.message?.includes('Cannot POST')) continue;
      throw error;
    }
  }

  throw new Error('All livechat message endpoints returned 404');
}
