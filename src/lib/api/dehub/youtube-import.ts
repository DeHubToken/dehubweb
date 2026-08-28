import { apiCall } from './core';

export interface YoutubeImportParams {
  url: string;
  ownershipConfirmed: boolean;
  name?: string;
  description?: string;
  chainId?: number;
}

export interface YoutubeImportQueuedResponse {
  queued: true;
  jobId: string | number;
}

export async function importFromYoutube(
  params: YoutubeImportParams,
): Promise<YoutubeImportQueuedResponse> {
  return apiCall<YoutubeImportQueuedResponse>('/api/youtube_import', {
    method: 'POST',
    requiresAuth: true,
    body: params as unknown as Record<string, unknown>,
  });
}

export interface YoutubeImportStatusResponse {
  jobId: string | number;
  state: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | 'paused';
  result?: { createdTokenId?: string; duplicate?: boolean; [key: string]: unknown };
  failedReason?: string;
}

export async function getYoutubeImportStatus(
  jobId: string | number,
): Promise<YoutubeImportStatusResponse> {
  return apiCall<YoutubeImportStatusResponse>(`/api/youtube_import/${jobId}`, {
    method: 'GET',
    requiresAuth: true,
  });
}
