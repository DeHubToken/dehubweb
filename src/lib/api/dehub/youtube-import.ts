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
  /** The link that was pasted. */
  url?: string;
  /** Which of the supported sources it came from — `youtube`, `tiktok`, … */
  sourceId?: string;
  /** How that source names itself, for a sentence. The server is the one
   * place this list lives, so the tile renders what it is told rather than
   * looking the id up in a client-side table. */
  sourceLabel?: string;
  /** YouTube only, and null everywhere else — enough on its own to draw the
   * thumbnail, since `i.ytimg.com/vi/<id>/mqdefault.jpg` needs no API call. */
  youtubeVideoId?: string | null;
  /** The source's own still, for the twenty sources with no thumbnail
   * derivable from the URL. Arrives with the metadata, part-way through, so a
   * tile is blank until the download starts. */
  thumbnailUrl?: string;
  /** Arrives once yt-dlp has read the metadata, part-way through. */
  title?: string;
  phase?: 'queued' | 'downloading' | 'processing' | 'publishing';
  /** 0–100 across the whole import, not just the download. */
  percent?: number;
  /** Waiting on YouTube rather than waiting its turn. */
  rateLimited?: boolean;
  attemptsMade?: number;
  attempts?: number;
  /** The backend's own answer to "is this over?" — a rate-limited job sits in
   * `delayed` and runs again, a discarded one sits in `failed` and never
   * will, and no client should have to know Bull's rules to tell them apart. */
  willRetry?: boolean;
  queuedAt?: number;
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

/**
 * Everything this creator has imported lately, newest first.
 *
 * One call for the whole queue rather than a poll per job: an import that is
 * waiting out a rate limit can sit there for the best part of an hour, and a
 * creator is invited to queue more while it does.
 */
export async function listYoutubeImports(): Promise<YoutubeImportStatusResponse[]> {
  const res = await apiCall<{ imports: YoutubeImportStatusResponse[] }>('/api/youtube_import', {
    method: 'GET',
    requiresAuth: true,
  });
  return res?.imports ?? [];
}
