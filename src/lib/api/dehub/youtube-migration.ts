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

/** One worked example off the price curve — what a batch of exactly this many
 * videos comes to. Not a bracket: pricing is marginal, so a batch one video
 * larger costs one more video, not the next row up. */
export interface MigrationPricingTier {
  videos: number;
  /** Same number as `videos`, kept while older builds may still be reading it. */
  maxVideos: number;
  priceUsd: number;
  priceDhb: number;
  /** Effective rate at this size — falls as the batch grows. */
  usdPerVideo?: number;
  /** What each additional video costs once the batch is past the previous row. */
  marginalUsdPerVideo?: number;
}

export interface MigrationPricing {
  tiers: MigrationPricingTier[];
  maxVideosPerBatch: number;
  /** Videos a creator can migrate free in total, ever — not per batch. Comes
   * off the top of a batch's count once, and the brackets price whatever is
   * left. */
  freeAllowance: number;
}

/** The price ladder, read from the same constant the quote is charged off —
 * the explainer on the page can't drift from the bill that way. */
export async function getMigrationPricing(): Promise<MigrationPricing> {
  return apiCall<MigrationPricing>('/api/youtube_migration/pricing');
}

export interface MigrationQuote {
  chargeId: string;
  videoCount: number;
  perVideoCreditDhb: number;
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

/** The creator's most recently paid batch, or null if they've never run one
 * — lets the page resume showing progress/results after a reload or a
 * closed tab instead of restarting the whole connect/list flow. */
export async function getActiveMigrationCharge(): Promise<MigrationChargeStatus | null> {
  return apiCall<MigrationChargeStatus | null>('/api/youtube_migration/charge/active', {
    requiresAuth: true,
  });
}
