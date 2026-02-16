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
  imageUrl?: string;
  sender: {
    address: string;
    username?: string;
    displayName?: string;
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
  try {
    const response = await apiCall<Record<string, unknown>>("/api/livechat/rooms", {
      requiresAuth: false,
    });
    console.log('[LiveChat API] getLiveChatRooms raw response:', JSON.stringify(response, null, 2));

    if (Array.isArray(response)) return normalizeRooms(response);

    if (response && typeof response === 'object') {
      if ('rooms' in response && Array.isArray(response.rooms)) return normalizeRooms(response.rooms);
      if ('result' in response && Array.isArray(response.result)) return normalizeRooms(response.result);
      if ('data' in response && Array.isArray(response.data)) return normalizeRooms(response.data);
      if ('items' in response && Array.isArray(response.items)) return normalizeRooms(response.items);
      if ('topicRooms' in response && Array.isArray(response.topicRooms)) return normalizeRooms(response.topicRooms);

      if ('roomId' in response || 'id' in response) return [normalizeRoom(response)];

      const keys = Object.keys(response);
      console.log('[LiveChat API] getLiveChatRooms response keys:', keys);
      for (const key of keys) {
        const val = response[key];
        if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object' && val[0] !== null) {
          console.log('[LiveChat API] getLiveChatRooms: using array from key:', key);
          return normalizeRooms(val);
        }
      }
    }

    console.warn('[LiveChat API] getLiveChatRooms: unexpected response format, returning []');
    return [];
  } catch (error) {
    console.error('[LiveChat API] getLiveChatRooms failed:', error);
    throw error;
  }
}

export async function getLiveChatRoom(roomId: string): Promise<LiveChatRoom> {
  const response = await apiCall<{ result: LiveChatRoom } | LiveChatRoom>(`/api/livechat/rooms/${roomId}`, {
    requiresAuth: false,
  });
  if (response && typeof response === 'object' && 'result' in response && !Array.isArray(response.result)) {
    return normalizeRoom(response.result);
  }
  return normalizeRoom(response);
}

export async function getLiveChatMessages(
  roomId: string,
  params?: { page?: number; limit?: number; before?: string }
): Promise<LiveChatMessage[]> {
  try {
    const response = await apiCall<Record<string, unknown>>(
      `/api/livechat/rooms/${roomId}/messages`,
      {
        params: {
          page: params?.page,
          limit: params?.limit,
          before: params?.before,
        },
        requiresAuth: false,
      }
    );
    console.log('[LiveChat API] getLiveChatMessages raw response:', response);
    if (response && typeof response === 'object') {
      if ('messages' in response && Array.isArray(response.messages)) return response.messages as LiveChatMessage[];
      if ('result' in response && Array.isArray(response.result)) return response.result as LiveChatMessage[];
      if ('data' in response && Array.isArray(response.data)) return response.data as LiveChatMessage[];
    }
    if (Array.isArray(response)) return response as unknown as LiveChatMessage[];
    console.warn('[LiveChat API] getLiveChatMessages: unexpected response format, returning []');
    return [];
  } catch (error) {
    console.error('[LiveChat API] getLiveChatMessages failed:', error);
    throw error;
  }
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
