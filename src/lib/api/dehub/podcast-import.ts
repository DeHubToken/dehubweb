import { apiCall } from './core';

export interface PodcastEpisode {
  guid: string;
  title: string;
  description: string;
  publishedAt: string | null;
  durationSec: number | null;
  audioUrl: string;
  mimeType: string | null;
  sizeBytes: number | null;
  image: string | null;
  alreadyImported: boolean;
}

export interface PodcastPreview {
  show: {
    title: string;
    description: string;
    author: string;
    image: string | null;
    episodeCount: number;
  };
  episodes: PodcastEpisode[];
}

export async function previewPodcastFeed(feedUrl: string): Promise<PodcastPreview> {
  return apiCall<PodcastPreview>('/api/podcast_import/preview', {
    method: 'POST',
    requiresAuth: true,
    body: { feedUrl } as unknown as Record<string, unknown>,
  });
}

export interface PodcastImportParams {
  feedUrl: string;
  guids: string[];
  ownershipConfirmed: boolean;
  category?: string;
  contentRating?: string;
  forKids?: boolean;
  chainId?: number;
  plans?: string;
  streamInfo?: string;
}

export interface PodcastImportQueuedResponse {
  queued: true;
  jobs: { guid: string; jobId: string | number | null }[];
}

export async function importFromPodcast(
  params: PodcastImportParams,
): Promise<PodcastImportQueuedResponse> {
  return apiCall<PodcastImportQueuedResponse>('/api/podcast_import', {
    method: 'POST',
    requiresAuth: true,
    body: params as unknown as Record<string, unknown>,
  });
}

export interface PodcastImportStatusResponse {
  jobId: string | number;
  state: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | 'paused';
  guid?: string;
  title?: string;
  queuedAt?: number;
  result?: { createdTokenId?: string; duplicate?: boolean; [key: string]: unknown };
  failedReason?: string;
}

export async function getPodcastImportStatus(
  jobId: string | number,
): Promise<PodcastImportStatusResponse> {
  return apiCall<PodcastImportStatusResponse>(`/api/podcast_import/${jobId}`, {
    method: 'GET',
    requiresAuth: true,
  });
}

export async function listPodcastImports(): Promise<PodcastImportStatusResponse[]> {
  const res = await apiCall<{ imports: PodcastImportStatusResponse[] }>('/api/podcast_import', {
    method: 'GET',
    requiresAuth: true,
  });
  return res?.imports ?? [];
}
