// Zernio (https://docs.zernio.com), the cross-posting provider behind multipost
// and the brand accounts' autopost. Platform rules live here so both callers
// treat a post the same way.

import { clip } from './social-text.ts';

export const ZERNIO = 'https://zernio.com/api/v1';

export const ZERNIO_PLATFORMS = [
  'twitter', 'instagram', 'facebook', 'youtube', 'tiktok', 'linkedin',
  'threads', 'pinterest', 'reddit', 'googlebusiness', 'snapchat', 'discord',
] as const;
export type ZernioPlatform = typeof ZERNIO_PLATFORMS[number];

export interface ZAccount { _id: string; platform: string; username?: string; displayName?: string; isActive?: boolean }
export interface MediaItem { url: string; type: 'image' | 'video' | 'gif' | 'document' }

export async function zernio(path: string, init: RequestInit = {}): Promise<{ status: number; data: any }> {
  const key = Deno.env.get('ZERNIO_API_KEY');
  if (!key) throw new Error('Multi-posting is not configured yet.');
  const res = await fetch(`${ZERNIO}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(30000),
  });
  let data: any = null;
  try { data = await res.json(); } catch { /* empty body */ }
  return { status: res.status, data };
}

export async function listZernioAccounts(profileId: string | null): Promise<ZAccount[]> {
  if (!profileId) return [];
  const res = await zernio(`/accounts?profileId=${encodeURIComponent(profileId)}`);
  const accounts: ZAccount[] = res.data?.accounts ?? [];
  return accounts.filter((a) => a.isActive !== false);
}

/** Why an account cannot take this post, or null if it can. */
export function incompatibility(platform: string, media: MediaItem[], content: string): string | null {
  const videos = media.filter((m) => m.type === 'video').length;
  const images = media.filter((m) => m.type === 'image' || m.type === 'gif').length;
  switch (platform) {
    case 'youtube': return videos === 1 ? null : 'needs_video';
    case 'tiktok': return videos === 1 || (videos === 0 && images > 0) ? null : 'needs_media';
    case 'instagram': return media.length > 0 ? null : 'needs_media';
    case 'snapchat': return media.length > 0 ? null : 'needs_media';
    case 'pinterest': return media.length > 0 ? null : 'needs_media';
    default: return content.trim() || media.length ? null : 'empty';
  }
}

export async function platformExtras(platform: string, accountId: string, content: string): Promise<{ data?: Record<string, unknown>; tiktok?: Record<string, unknown>; skip?: string }> {
  if (platform === 'youtube') {
    const title = clip((content.split('\n')[0] || 'New video').trim(), 100);
    return { data: { title, visibility: 'public' } };
  }
  if (platform === 'pinterest') {
    const res = await zernio(`/accounts/${accountId}/pinterest-boards`);
    const boards = res.data?.boards ?? res.data ?? [];
    const boardId = Array.isArray(boards) ? (boards[0]?.id ?? boards[0]?._id) : null;
    return boardId ? { data: { boardId, title: clip(content.split('\n')[0] || '', 100) } } : { skip: 'no_board' };
  }
  if (platform === 'tiktok') {
    const res = await zernio(`/accounts/${accountId}/tiktok/creator-info`);
    const info = res.data?.creatorInfo ?? res.data?.data ?? res.data ?? {};
    const options: string[] = info.privacy_level_options ?? info.privacyLevelOptions ?? [];
    const privacy = options.includes('PUBLIC_TO_EVERYONE') ? 'PUBLIC_TO_EVERYONE' : (options[0] ?? 'PUBLIC_TO_EVERYONE');
    return {
      tiktok: {
        privacy_level: privacy,
        allow_comment: true,
        allow_duet: true,
        allow_stitch: true,
        content_preview_confirmed: true,
        express_consent_given: true,
      },
    };
  }
  return {};
}
