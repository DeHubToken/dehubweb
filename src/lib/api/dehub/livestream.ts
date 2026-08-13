import { apiCall } from './core';
import type { DeHubUser } from './types';

export interface LiveStream {
  streamId: string;
  address: string;
  title: string;
  description?: string;
  category?: string;
  thumbnailUrl?: string;
  viewerCount: number;
  likeCount: number;
  status: 'scheduled' | 'live' | 'ended';
  scheduledAt?: string;
  startedAt?: string;
  endedAt?: string;
  createdAt: string;
  updatedAt: string;
  streamer?: DeHubUser;
  playbackUrl?: string;
}

export interface StreamKeyInfo {
  streamKey: string;
  ingestUrl: string;
}

export interface StreamActivity {
  id: string;
  type: 'join' | 'leave' | 'like' | 'gift' | 'comment' | 'start' | 'end' | 'paused' | 'resumed' | 'reaction' | 'message';
  address: string;
  username?: string;
  avatarUrl?: string;
  message?: string;
  giftAmount?: number;
  giftCurrency?: string;
  timestamp: string;
}

/**
 * Raw activity document as the backend actually emits it: an UPPERCASE
 * `status` enum (TIP/LIKE/JOINED/LEFT/…), the payload inside `meta`, the
 * sender enriched onto `account` by the aggregation, and `createdAt` — none
 * of which match the StreamActivity shape the UI renders. Mapped below.
 */
interface RawStreamActivity {
  _id: string;
  status: string;
  address?: string;
  meta?: {
    amount?: number;
    message?: string;
    username?: string;
    displayName?: string;
    [key: string]: unknown;
  };
  account?: {
    username?: string;
    displayName?: string;
    avatarImageUrl?: string;
    avatarUrl?: string;
  };
  createdAt?: string;
}

const ACTIVITY_TYPE_MAP: Record<string, StreamActivity['type']> = {
  TIP: 'gift',
  LIKE: 'like',
  JOINED: 'join',
  LEFT: 'leave',
  COMMENT: 'comment',
  MESSAGE: 'message',
  START: 'start',
  END: 'end',
  PAUSED: 'paused',
  RESUMED: 'resumed',
  REACTION: 'reaction',
};

function mapRawActivity(raw: RawStreamActivity): StreamActivity {
  const account = raw.account;
  return {
    id: raw._id,
    type: ACTIVITY_TYPE_MAP[raw.status] || 'message',
    address: raw.address || '',
    username: account?.displayName || account?.username || raw.meta?.displayName || raw.meta?.username,
    avatarUrl: account?.avatarImageUrl || account?.avatarUrl,
    message: raw.meta?.message,
    giftAmount: raw.meta?.amount,
    // The gift path only moves DHB (StreamController.sendTip); the recorded
    // tokenAddress is not surfaced, so the label is static.
    giftCurrency: raw.status === 'TIP' ? 'DHB' : undefined,
    timestamp: raw.createdAt || '',
  };
}

export interface CreateLiveStreamData {
  title: string;
  description?: string;
  category?: string;
  thumbnailUrl?: string;
  scheduledAt?: string;
}

export interface GetLiveStreamsParams {
  page?: number;
  unit?: number;
  category?: string;
  sortMode?: 'viewers' | 'recent' | 'popular';
}

export interface StartLiveStreamData {
  streamId?: string;
  title?: string;
  description?: string;
  category?: string;
  thumbnailUrl?: string;
}

export interface StartLiveStreamResponse {
  result: {
    streamId: string;
    streamKey: string;
    ingestUrl: string;
    playbackUrl: string;
  };
}

/**
 * Matches the backend's giftData contract (POST /api/live/{id}/gift): the
 * endpoint RECORDS a tip that already happened on-chain — it does not move
 * money. transactionHash/recipient/tokenAddress come from the sendTip call
 * that preceded it.
 */
export interface SendGiftData {
  transactionHash: string;
  tokenId: string;
  amount: number;
  recipient: string;
  tokenAddress: string;
  message?: string;
  selectedTier?: string;
  timestamp: number;
}

export async function createLiveStream(data: CreateLiveStreamData): Promise<{ result: LiveStream }> {
  return apiCall<{ result: LiveStream }>("/api/live", {
    method: "POST",
    body: { ...data },
    requiresAuth: true,
  });
}

export async function getLiveStreams(params: GetLiveStreamsParams = {}): Promise<{ result: LiveStream[] }> {
  return apiCall<{ result: LiveStream[] }>("/api/live", {
    params: {
      page: params.page,
      unit: params.unit,
      category: params.category,
      sortMode: params.sortMode,
    },
  });
}

export async function getUserLiveStreams(address: string): Promise<{ result: LiveStream[] }> {
  return apiCall<{ result: LiveStream[] }>(`/api/live/user/${address}`);
}

export async function getUserScheduledStreams(address: string): Promise<{ result: LiveStream[] }> {
  return apiCall<{ result: LiveStream[] }>(`/api/live/user/${address}/scheduled`);
}

export async function getLiveStream(streamId: string): Promise<{ result: LiveStream }> {
  return apiCall<{ result: LiveStream }>(`/api/live/${streamId}`);
}

export async function getStreamKey(streamId: string): Promise<{ result: StreamKeyInfo }> {
  return apiCall<{ result: StreamKeyInfo }>(`/api/live/${streamId}/key`, {
    requiresAuth: true,
  });
}

export async function getStreamActivities(
  streamId: string,
  params: { page?: number; unit?: number } = {}
): Promise<{ result: StreamActivity[] }> {
  // The Nest controller returns the aggregation array directly — there is no
  // { result } envelope — and the documents carry the raw backend shape.
  // Normalize both here so callers keep the typed contract.
  //
  // KNOWN LIMIT: the controller binds no query params, so page/unit are
  // ignored and the server always returns the OLDEST 100 activities in
  // ascending order. Newest-first is restored client-side below, but events
  // past the first 100 never reach the client until the backend adds
  // pagination — on a busy stream the log freezes at that point.
  const res = await apiCall<RawStreamActivity[] | { result: RawStreamActivity[] }>(
    `/api/live/${streamId}/activities`,
    { params }
  );
  const raw = Array.isArray(res) ? res : res?.result || [];
  return { result: raw.slice().reverse().map(mapRawActivity) };
}

export async function getStreamIngestUrl(streamId: string): Promise<{ result: { ingestUrl: string } }> {
  return apiCall<{ result: { ingestUrl: string } }>(`/api/live/${streamId}/ingesturl`, {
    requiresAuth: true,
  });
}

export async function updateStreamSettings(
  streamId: string,
  settings: Record<string, unknown>
): Promise<{ result: unknown }> {
  return apiCall<{ result: unknown }>(`/api/live/${streamId}/settings`, {
    method: "PATCH",
    body: settings,
    requiresAuth: true,
  });
}

export async function startLiveStream(data: StartLiveStreamData = {}): Promise<StartLiveStreamResponse> {
  if (!data.streamId) throw new Error('streamId is required');
  // Mark stream as live via settings endpoint
  await updateStreamSettings(data.streamId, { status: 'live' });
  // Return ingest URL
  const ingestRes = await getStreamIngestUrl(data.streamId);
  return {
    result: {
      streamId: data.streamId,
      streamKey: '',
      ingestUrl: ingestRes?.result?.ingestUrl || '',
      playbackUrl: '',
    },
  };
}

/** The like endpoint is a TOGGLE and returns its outcome bare (no envelope):
 *  an already-liked address gets un-liked and isLiked comes back false. */
export interface LikeStreamResponse {
  likes?: number;
  isLiked?: boolean;
}

export async function likeLiveStream(streamId: string): Promise<LikeStreamResponse> {
  return apiCall<LikeStreamResponse>(`/api/live/${streamId}/like`, {
    method: "POST",
    requiresAuth: true,
  });
}

export async function sendLiveStreamGift(streamId: string, data: SendGiftData): Promise<{ result: boolean }> {
  return apiCall<{ result: boolean }>(`/api/live/${streamId}/gift`, {
    method: "POST",
    body: { ...data },
    requiresAuth: true,
  });
}

export async function endLiveStream(streamId: string): Promise<{ result: boolean }> {
  // DeHub API requires a MongoDB ObjectId (24-char hex). Numeric tokenIds will fail with 500.
  const isObjectId = /^[a-f\d]{24}$/i.test(streamId);
  if (!isObjectId) {
    console.warn('[LiveStream] endLiveStream: streamId is not a MongoDB ObjectId, skipping API PATCH:', streamId);
    return { result: true };
  }
  // Mark stream as ended via PATCH /api/live/{streamId}/settings
  await updateStreamSettings(streamId, { status: 'ended' });
  return { result: true };
}

// Legacy alias for backwards compatibility
export const startLivestream = startLiveStream;
export const endLivestream = async () => ({ success: true });

// DHB Price — re-exported from payments for backward compatibility
export { getDHBPrice } from './payments';
