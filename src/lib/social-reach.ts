/**
 * Total reach: DeHub followers plus the follower counts of the social accounts
 * a creator has connected.
 *
 * Every social count comes from the platform through the account connection
 * (Zernio, the same one multi-posting uses), read by the `social-reach` edge
 * function. Nothing here is typed by the creator: an unconnected platform, or
 * a connected one whose count the platform has not reported yet, adds nothing.
 */

import { supabase } from '@/integrations/supabase/client';
import { dehubAuthHeaders } from '@/lib/ai-invoke';
import { ensureFreshToken } from '@/lib/api/dehub/core';

export type SocialPlatform =
  | 'twitter'
  | 'instagram'
  | 'tiktok'
  | 'youtube'
  | 'discord'
  | 'facebook';

export interface SocialReachPlatform {
  platform: SocialPlatform;
  /** Top-level account field that holds the profile link. */
  linkKey: `${SocialPlatform}Link`;
  /** Platform name as people know it — never translated. */
  label: string;
}

/** Platforms that can be connected for a verified count, in display order. */
export const SOCIAL_REACH_PLATFORMS: readonly SocialReachPlatform[] = [
  { platform: 'twitter', linkKey: 'twitterLink', label: 'X (Twitter)' },
  { platform: 'instagram', linkKey: 'instagramLink', label: 'Instagram' },
  { platform: 'tiktok', linkKey: 'tiktokLink', label: 'TikTok' },
  { platform: 'youtube', linkKey: 'youtubeLink', label: 'YouTube' },
  { platform: 'discord', linkKey: 'discordLink', label: 'Discord' },
  { platform: 'facebook', linkKey: 'facebookLink', label: 'Facebook' },
];

export const isReachPlatform = (value: string): value is SocialPlatform =>
  SOCIAL_REACH_PLATFORMS.some((p) => p.platform === value);

/** One connected account, as the edge function reports it. */
export interface VerifiedSocialAccount {
  platform: string;
  username: string;
  profileUrl: string | null;
  /** Null until the platform has reported a count for this account. */
  followers: number | null;
  followersUpdatedAt: string | null;
}

export interface SocialReachEntry {
  platform: SocialPlatform;
  label: string;
  count: number;
}

export interface SocialReach {
  /** DeHub followers, as counted by DeHub. */
  dehub: number;
  /** Connected platforms with a positive verified count, in display order. */
  socials: SocialReachEntry[];
  /** `dehub` plus every social count. */
  total: number;
}

const toCount = (raw: unknown): number | null => {
  const value = typeof raw === 'number' ? raw : Number.NaN;
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
};

/** Work out a profile's reach from its connected accounts. */
export function computeSocialReach(
  accounts: readonly VerifiedSocialAccount[] | null | undefined,
  dehubFollowers: number | null | undefined,
): SocialReach {
  const dehub = toCount(dehubFollowers) ?? 0;
  const socials: SocialReachEntry[] = [];
  for (const { platform, label } of SOCIAL_REACH_PLATFORMS) {
    const account = accounts?.find((a) => a.platform === platform);
    const count = toCount(account?.followers);
    if (count === null || count <= 0) continue;
    socials.push({ platform, label, count });
  }
  return {
    dehub,
    socials,
    total: socials.reduce((sum, entry) => sum + entry.count, dehub),
  };
}

/** True when there is a social count to show on top of DeHub followers. */
export function hasSocialReach(reach: SocialReach): boolean {
  return reach.socials.length > 0;
}

const asAccounts = (data: unknown): VerifiedSocialAccount[] => {
  const list = (data as { accounts?: unknown })?.accounts;
  return Array.isArray(list) ? (list as VerifiedSocialAccount[]) : [];
};

/** Anyone's connected accounts — public, cached server-side. */
export async function fetchSocialReach(wallet: string): Promise<VerifiedSocialAccount[]> {
  const { data, error } = await supabase.functions.invoke('social-reach', { body: { action: 'get', wallet } });
  if (error) throw error;
  return asAccounts(data);
}

/** Re-read the signed-in creator's own accounts now, skipping the cache. */
export async function syncSocialReach(): Promise<VerifiedSocialAccount[]> {
  await ensureFreshToken();
  const { data, error } = await supabase.functions.invoke('social-reach', {
    body: { action: 'sync' },
    headers: dehubAuthHeaders(),
  });
  if (error) throw error;
  return asAccounts(data);
}
