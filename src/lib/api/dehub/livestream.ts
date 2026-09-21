import { apiCall, authedUpload } from './core';
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

/*
 * The owner-only credential routes answer with the bare object — `{ streamKey }`
 * and `{ ingestUrl }` — not the `{ result }` envelope most of the API wears.
 * Reading them through the envelope yields undefined, which the encoder
 * screen rendered as an empty Server field for every self-hosted stream (a
 * Livepeer one was rescued by a hardcoded fallback). Both shapes are accepted
 * so a backend that later adopts the envelope changes nothing here.
 */
function unwrap<T extends object>(res: T | { result?: T } | null | undefined): Partial<T> {
  if (!res || typeof res !== 'object') return {};
  const enveloped = (res as { result?: T }).result;
  return enveloped && typeof enveloped === 'object' ? enveloped : (res as T);
}

export async function getStreamKey(streamId: string): Promise<{ result: StreamKeyInfo }> {
  const res = await apiCall<StreamKeyInfo | { result: StreamKeyInfo }>(`/api/live/${streamId}/key`, {
    requiresAuth: true,
  });
  const body = unwrap(res);
  return { result: { streamKey: body.streamKey || '', ingestUrl: body.ingestUrl || '' } };
}

export async function getStreamActivities(
  streamId: string,
  params: { page?: number; unit?: number } = {}
): Promise<{ result: StreamActivity[] }> {
  // The Nest controller returns the aggregation array directly — there is no
  // { result } envelope — and the documents carry the raw backend shape.
  // Normalize both here so callers keep the typed contract.
  //
  // Translate the client pagination into the controller's limit/skip contract.
  const res = await apiCall<RawStreamActivity[] | { result: RawStreamActivity[] }>(
    `/api/live/${streamId}/activities`,
    { params: { limit: params.unit || 100, skip: ((params.page || 1) - 1) * (params.unit || 100), order: 'desc' } }
  );
  const raw = Array.isArray(res) ? res : res?.result || [];
  return { result: raw.map(mapRawActivity) };
}

export async function getStreamIngestUrl(streamId: string): Promise<{ result: { ingestUrl: string } }> {
  const res = await apiCall<{ ingestUrl: string } | { result: { ingestUrl: string } }>(
    `/api/live/${streamId}/ingesturl`,
    { requiresAuth: true }
  );
  return { result: { ingestUrl: unwrap(res).ingestUrl || '' } };
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

/**
 * Set or refresh a stream's poster frame.
 *
 * Two callers. The creator picks a cover before going live (that one rides
 * along with the mint, not this call), and the broadcaster posts a frame off
 * its own outgoing video every couple of minutes while the stream runs — so a
 * broadcast nobody gave a cover to still shows what is on it instead of an
 * empty box.
 *
 * `streamId` is the Mongo ObjectId, like every other /api/live/:id route; a
 * tokenId 500s with a CastError. Owner-gated server-side.
 */
export async function updateStreamThumbnail(
  streamId: string,
  frame: Blob,
): Promise<{ thumbnail: string }> {
  const formData = new FormData();
  formData.append('thumbnail', frame, 'thumbnail.jpg');
  return authedUpload<{ thumbnail: string }>(
    `/api/live/${streamId}/thumbnail`,
    formData,
    // A poster frame is tens of kilobytes. The mint path's eight-minute budget
    // exists for video uploads and would leave a dead refresh hanging for the
    // whole broadcast.
    { timeoutMs: 30_000 },
  );
}

/**
 * A creator's PERMANENT encoder credentials.
 *
 * Every other stream key on the self-hosted ingest is minted per broadcast and
 * handed over in the mint response, which is right for the browser and
 * unusable for OBS, a capture app or a console: those are configured once, by
 * hand, and re-typing a fresh server and key before every session is the whole
 * reason people stop streaming from them. This pair never changes, so the
 * encoder is set up once and the post is created when the broadcast arrives.
 */
export interface EncoderCredentials {
  /** The encoder's "Server" field. */
  server: string;
  /** Its "Stream Key" field. Secret — this is the publish credential. */
  streamKey: string;
  /** The two joined, for one-line copy. */
  ingestUrl: string;
  /** Title a broadcast started from the encoder is posted under. */
  defaultTitle: string;
}

const emptyEncoderCredentials: EncoderCredentials = {
  server: '',
  streamKey: '',
  ingestUrl: '',
  defaultTitle: '',
};

function toEncoderCredentials(res: unknown): EncoderCredentials {
  const body = unwrap(res as EncoderCredentials);
  return {
    server: body.server || '',
    streamKey: body.streamKey || '',
    ingestUrl: body.ingestUrl || '',
    defaultTitle: body.defaultTitle || '',
  };
}

export async function getEncoderCredentials(): Promise<EncoderCredentials> {
  try {
    return toEncoderCredentials(await apiCall('/api/live/ingest-key', { requiresAuth: true }));
  } catch {
    // An account with no livestreaming feature, or a backend that predates the
    // route, gets an empty pair and the section renders as unavailable rather
    // than as an error the creator can do nothing about.
    return emptyEncoderCredentials;
  }
}

/** Issue a new key. The server address is unchanged — only the secret moves. */
export async function rotateEncoderKey(): Promise<EncoderCredentials> {
  return toEncoderCredentials(
    await apiCall('/api/live/ingest-key/rotate', { method: 'POST', requiresAuth: true }),
  );
}

export async function setEncoderDefaultTitle(defaultTitle: string): Promise<EncoderCredentials> {
  return toEncoderCredentials(
    await apiCall('/api/live/ingest-key', {
      method: 'PATCH',
      body: { defaultTitle },
      requiresAuth: true,
    }),
  );
}

// ─── Streamer progress ────────────────────────────────────────────────────────

export type StreamerCardId =
  | 'first-light'
  | 'marathon'
  | 'night-owl'
  | 'regular'
  | 'iron-streak'
  | 'crowd'
  | 'century'
  | 'legend';

export interface StreamerProgressCard {
  id: StreamerCardId;
  earnedAt: string | null;
}

export interface StreamerRecentStream {
  streamId: string;
  title: string;
  minutes: number;
  peakViewers: number;
  endedAt: string | null;
  qualified: boolean;
}

/**
 * The streamer ladder, derived server-side from ended streams. XP is one per
 * qualifying minute; a stream only qualifies when it ran ten minutes or longer
 * with at least one viewer. Level k needs 30·k·(k+1) XP.
 */
export interface StreamerProgress {
  xp: number;
  level: number;
  nextLevelXp: number;
  levelStartXp: number;
  /** 0..1 across the current level. */
  progressToNext: number;
  qualifyingMinutes: number;
  qualifyingStreams: number;
  totalStreams: number;
  longestStreamMinutes: number;
  currentStreakWeeks: number;
  bestStreakWeeks: number;
  cards: StreamerProgressCard[];
  recent: StreamerRecentStream[];
}

export async function getStreamerProgress(address: string): Promise<StreamerProgress> {
  const res = await apiCall<StreamerProgress | { result: StreamerProgress }>(
    `/api/live/creator/${address.toLowerCase()}/progress`,
  );
  return 'result' in res && res.result && typeof res.result === 'object' && 'level' in res.result
    ? res.result
    : (res as StreamerProgress);
}
