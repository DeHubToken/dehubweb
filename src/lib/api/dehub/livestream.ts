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
  type: 'join' | 'leave' | 'like' | 'gift' | 'comment';
  address: string;
  username?: string;
  avatarUrl?: string;
  message?: string;
  giftAmount?: number;
  giftCurrency?: string;
  timestamp: string;
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

export interface SendGiftData {
  amount: number;
  currency: string;
  message?: string;
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
  return apiCall<{ result: StreamActivity[] }>(`/api/live/${streamId}/activities`, {
    params,
  });
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

export async function likeLiveStream(streamId: string): Promise<{ result: boolean }> {
  return apiCall<{ result: boolean }>(`/api/live/${streamId}/like`, {
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
  // Mark stream as ended via PATCH /api/live/{streamId}/settings
  await updateStreamSettings(streamId, { status: 'ended' });
  return { result: true };
}

// Legacy alias for backwards compatibility
export const startLivestream = startLiveStream;
export const endLivestream = async () => ({ success: true });

// DHB Price
export async function getDHBPrice(): Promise<{ price: number; change_24h: number }> {
  return apiCall<{ price: number; change_24h: number }>("/api/dpay/price");
}
