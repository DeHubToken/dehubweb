import { apiCall } from './core';

export interface ChannelVideo {
  youtubeVideoId: string;
  title: string;
  url: string;
  publishedAt: string;
  alreadyImported: boolean;
}

export async function getYoutubeConnectUrl(): Promise<{ url: string }> {
  return apiCall<{ url: string }>('/api/youtube_migration/connect-url', { requiresAuth: true });
}

export async function listChannelVideos(): Promise<{ videos: ChannelVideo[]; truncated: boolean }> {
  return apiCall<{ videos: ChannelVideo[]; truncated: boolean }>('/api/youtube_migration/videos', {
    requiresAuth: true,
  });
}

export interface MigrationQuote {
  chargeId: string;
  videoCount: number;
  unitPriceDhb: number;
  creditAppliedDhb: number;
  amountDhb: number;
  recipient: string | null;
  dhbTokens: { chainId: number; tokenAddress: string }[];
}

export async function quoteMigration(youtubeVideoIds: string[]): Promise<MigrationQuote> {
  return apiCall<MigrationQuote>('/api/youtube_migration/quote', {
    method: 'POST',
    requiresAuth: true,
    body: { youtubeVideoIds } as unknown as Record<string, unknown>,
  });
}

export async function settleMigration(
  chargeId: string,
  txHash: string,
  chainId: number,
): Promise<{ settled: boolean; pending?: boolean }> {
  return apiCall<{ settled: boolean; pending?: boolean }>('/api/youtube_migration/settle', {
    method: 'POST',
    requiresAuth: true,
    body: { chargeId, txHash, chainId } as unknown as Record<string, unknown>,
  });
}

export interface MigrationChargeStatus {
  _id: string;
  status: 'open' | 'settled' | 'void';
  amountDhb: number;
  youtubeVideoIds: string[];
  results: {
    youtubeVideoId: string;
    status: 'pending' | 'imported' | 'failed';
    tokenId?: number;
    failedReason?: string;
  }[];
}

export async function getMigrationChargeStatus(chargeId: string): Promise<MigrationChargeStatus> {
  return apiCall<MigrationChargeStatus>(`/api/youtube_migration/charge/${chargeId}`, {
    requiresAuth: true,
  });
}
