import { apiCall, authedUpload } from './core';
import { voiceRecordingFilename } from '@/lib/voice-recording';

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
  audioUrl?: string;
  audioDuration?: number;
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
 * The chat panel and the public-chat unread tracker both open on boot and
 * both ask for the room and its latest window within the same second. One
 * answer serves both: in-flight calls share a promise, and the result is kept
 * for a few seconds so a caller arriving just after reuses it.
 */
const SHARED_READ_MS = 5_000;
const sharedReads = new Map<string, { at: number; promise: Promise<unknown> }>();
function sharedRead<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = sharedReads.get(key);
  if (hit && Date.now() - hit.at < SHARED_READ_MS) return hit.promise as Promise<T>;
  const promise = load();
  sharedReads.set(key, { at: Date.now(), promise });
  promise.catch(() => sharedReads.delete(key));
  return promise;
}

/**
 * GET /api/livechat/room — single global chat room info
 */
export function getLiveChatRooms(): Promise<LiveChatRoom[]> {
  return sharedRead('rooms', loadLiveChatRooms).then((rooms) => rooms.map((room) => ({ ...room })));
}

async function loadLiveChatRooms(): Promise<LiveChatRoom[]> {
  try {
    const response = await apiCall<Record<string, unknown>>('/api/livechat/room', {
      requiresAuth: false,
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
      requiresAuth: false,
      params: { roomId },
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
export function getLiveChatMessages(
  roomId: string,
  params?: { page?: number; limit?: number; before?: string; after?: string }
): Promise<LiveChatMessage[]> {
  // Only the latest window is shared; paging and catch-up reads always go out.
  if (params?.before || params?.after) return loadLiveChatMessages(roomId, params);
  return sharedRead(`messages:${roomId}:${Math.min(params?.limit ?? 100, 100)}`, () => loadLiveChatMessages(roomId, params))
    .then((messages) => messages.slice());
}

async function loadLiveChatMessages(
  roomId: string,
  params?: { page?: number; limit?: number; before?: string; after?: string }
): Promise<LiveChatMessage[]> {
  const queryParams: Record<string, string | number | undefined> = {
    limit: Math.min(params?.limit ?? 100, 100),
    // The room was named `_roomId` and thrown away, because the backend threw
    // it away too — history came from the platform room whatever was asked
    // for. Both ends honour it now; anything unrecognised still resolves to
    // `global` server-side, so old callers are unaffected.
    roomId,
  };
  if (params?.before) queryParams.before = params.before;
  if (params?.after) queryParams.after = params.after;

  const parse = (response: unknown): LiveChatMessage[] => {
    const r = response as any;
    if (r && typeof r === 'object') {
      if (Array.isArray(r.messages)) return r.messages as LiveChatMessage[];
      if (r.result && typeof r.result === 'object') {
        if (Array.isArray(r.result.messages)) return r.result.messages as LiveChatMessage[];
      }
      if (Array.isArray(r.data)) return r.data as LiveChatMessage[];
    }
    if (Array.isArray(response)) return response as LiveChatMessage[];
    return [];
  };

  // Prefer the currently deployed endpoint (many deployments still use this)
  try {
    const response = await apiCall<Record<string, unknown>>('/api/livechat/messages', {
      params: queryParams,
      requiresAuth: false,
    });
    const parsed = parse(response);
    if (parsed.length) return parsed;
  } catch (error: any) {
    // continue to fallback below
  }

  // Fallback: spec endpoint from `doc.md` (may be enabled in newer backends)
  try {
    const response = await apiCall<Record<string, unknown>>(
      `/api/livechat/rooms/${roomId}/messages`,
      { params: queryParams, requiresAuth: false }
    );
    return parse(response);
  } catch (error: any) {
    console.warn('[LiveChat API] getLiveChatMessages failed:', error?.message);
    return [];
  }
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
      requiresAuth: false,
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
  const socket = getSocket(roomId);
  if (!socket.connected) {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Socket not connected')), 5000);
      socket.once('connect', () => { clearTimeout(timeout); resolve(); });
      if (socket.connected) { clearTimeout(timeout); resolve(); }
    });
  }
  const apiType = type === 'image' || type === 'voice' ? 'media' as const : type;
  emitSendMessage({ roomId, content, messageType: apiType, imageUrl });
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

// Mod endpoints — the signed-in user must be on the room's moderator list.
export async function pinLiveChatMessage(_roomId: string, messageId: string): Promise<void> {
  await apiCall(`/api/livechat/mod/pin/${messageId}`, {
    method: 'POST',
    requiresAuth: true,
  });
}

export async function unpinLiveChatMessage(_roomId: string, messageId: string): Promise<void> {
  await apiCall(`/api/livechat/mod/pin/${messageId}`, {
    method: 'DELETE',
    requiresAuth: true,
  });
}

export async function banLiveChatUser(_roomId: string, userAddress: string): Promise<void> {
  await apiCall('/api/livechat/mod/ban', {
    method: 'POST',
    body: { address: userAddress.toLowerCase() },
    requiresAuth: true,
  });
}

export async function unbanLiveChatUser(_roomId: string, userAddress: string): Promise<void> {
  await apiCall(`/api/livechat/mod/ban/${userAddress.toLowerCase()}`, {
    method: 'DELETE',
    requiresAuth: true,
  });
}

export async function deleteLiveChatMessage(messageId: string): Promise<void> {
  await apiCall(`/api/livechat/mod/message/${messageId}`, {
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

/**
 * POST /api/livechat/upload-voice — upload a voice message to the CDN
 */
export async function uploadLiveChatVoice(audioBlob: Blob, filename = voiceRecordingFilename(audioBlob.type)): Promise<{ url: string; duration: number }> {
  const formData = new FormData();
  formData.append('audio', audioBlob, filename);

  return authedUpload<{ url: string; duration: number }>(
    '/api/livechat/upload-voice',
    formData,
  );
}


/**
 * The chat room belonging to a live post.
 *
 * Namespaced to match the backend's allow-list: it accepts `global` or
 * `stream:<tokenId>` and quietly resolves anything else to `global`. A bare
 * tokenId therefore lands everyone in the platform room, which is exactly the
 * bug this replaces — so the prefix is not decoration.
 */
export function streamChatRoomId(tokenId: string | number): string {
  return `stream:${tokenId}`;
}

// ─── A creator's moderation of their own stream chats ─────────────────────────

/** Time someone out of this creator's stream chats. The creator, their moderators and staff only. */
export async function timeOutInStream(tokenId: string | number, userAddress: string, seconds: number): Promise<void> {
  await apiCall(`/api/livechat/stream/${encodeURIComponent(String(tokenId))}/timeout`, {
    method: 'POST',
    body: { address: userAddress.toLowerCase(), seconds },
    requiresAuth: true,
  });
}

/** Ban someone from every stream chat of this creator. Never from the platform's chat. */
export async function banFromStreams(tokenId: string | number, userAddress: string): Promise<void> {
  await apiCall(`/api/livechat/stream/${encodeURIComponent(String(tokenId))}/ban`, {
    method: 'POST',
    body: { address: userAddress.toLowerCase() },
    requiresAuth: true,
  });
}

export interface StreamModerationSettings {
  slowModeSeconds: number;
  followersOnly: boolean;
  subscribersOnly: boolean;
  bannedWords: string[];
  wordAction: 'block' | 'timeout';
}

export interface StreamModerationPerson {
  address: string;
  username?: string;
  displayName?: string;
  avatarImageUrl?: string;
}

export interface StreamModerationLogEntry {
  actor: string;
  target: string;
  action: 'timeout' | 'ban' | 'unban' | 'moderator-added' | 'moderator-removed' | 'word-blocked' | 'word-timeout';
  seconds?: number;
  word?: string;
  at: string;
}

export interface MyStreamModeration {
  settings: StreamModerationSettings;
  moderators: StreamModerationPerson[];
  banned: StreamModerationPerson[];
  log: StreamModerationLogEntry[];
}

const unwrapModeration = (res: any): MyStreamModeration => {
  const body = res?.result ?? res;
  return {
    settings: {
      slowModeSeconds: Number(body?.settings?.slowModeSeconds) || 0,
      followersOnly: !!body?.settings?.followersOnly,
      subscribersOnly: !!body?.settings?.subscribersOnly,
      bannedWords: Array.isArray(body?.settings?.bannedWords) ? body.settings.bannedWords : [],
      wordAction: body?.settings?.wordAction === 'timeout' ? 'timeout' : 'block',
    },
    moderators: Array.isArray(body?.moderators) ? body.moderators : [],
    banned: Array.isArray(body?.banned) ? body.banned : [],
    log: Array.isArray(body?.log) ? body.log : [],
  };
};

export async function getMyStreamModeration(): Promise<MyStreamModeration> {
  return unwrapModeration(await apiCall('/api/livechat/moderation/mine', { requiresAuth: true }));
}

export async function saveMyStreamModeration(settings: StreamModerationSettings): Promise<MyStreamModeration> {
  return unwrapModeration(await apiCall('/api/livechat/moderation/mine', { method: 'PUT', body: { ...settings }, requiresAuth: true }));
}

export async function addStreamModerator(userAddress: string): Promise<MyStreamModeration> {
  return unwrapModeration(
    await apiCall('/api/livechat/moderation/mine/moderators', {
      method: 'POST',
      body: { address: userAddress.toLowerCase() },
      requiresAuth: true,
    }),
  );
}

export async function removeStreamModerator(userAddress: string): Promise<MyStreamModeration> {
  return unwrapModeration(
    await apiCall(`/api/livechat/moderation/mine/moderators/${userAddress.toLowerCase()}`, { method: 'DELETE', requiresAuth: true }),
  );
}

export async function unbanFromStreams(userAddress: string): Promise<MyStreamModeration> {
  return unwrapModeration(
    await apiCall(`/api/livechat/moderation/mine/bans/${userAddress.toLowerCase()}`, { method: 'DELETE', requiresAuth: true }),
  );
}
