/**
 * How long a post's text may be. The cap scales with the staking badge: 500
 * characters with no badge, rising in even steps to 3,000 for Megalodon. The
 * API is the authority (`textCharsPerPost` on the post-quota status) and
 * enforces it on publish and edit; an API that predates it means 500.
 *
 * Article summaries stay at 500 whatever the tier.
 */
import type { PostQuotaStatus } from '@/lib/api/dehub';

export const BASE_POST_TEXT_CHARS = 500;

export function postTextLimit(quota: Pick<PostQuotaStatus, 'textCharsPerPost'> | null | undefined): number {
  const n = quota?.textCharsPerPost;
  return typeof n === 'number' && n >= BASE_POST_TEXT_CHARS ? n : BASE_POST_TEXT_CHARS;
}
