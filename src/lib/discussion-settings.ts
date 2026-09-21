/**
 * Per-post discussion settings — the ownership check.
 *
 * `post_discussion_settings` is a Supabase table written straight from the
 * client, and Postgres cannot see who minted a token (posts live in Mongo).
 * Its RLS only proves that a row's `creator_address` wrote it — not that the
 * address owns the post. So a row means nothing until it is matched against
 * the post's minter here, and a row written against somebody else's token is
 * dropped as if it did not exist. Both clients apply this same rule.
 */

export interface DiscussionSettingsRow {
  token_id: number | string;
  creator_address: string;
  common_ground: boolean;
}

export interface DiscussionSettings {
  commonGround: boolean;
}

export const DEFAULT_DISCUSSION_SETTINGS: DiscussionSettings = { commonGround: false };

/** Session flag that the reader has been through the Common Ground steps for this thread. */
export const COMMON_GROUND_DONE_PREFIX = 'dehub.commonGround.done:';

/**
 * Pick the row that belongs to the post's actual creator, ignoring the rest.
 *
 * `minter` unknown means nothing can be trusted yet, so the defaults win —
 * a banner that flashes on before the post info loads and then vanishes is
 * worse than one that arrives a beat late.
 */
export function resolveDiscussionSettings(
  rows: readonly DiscussionSettingsRow[] | null | undefined,
  minter: string | null | undefined,
): DiscussionSettings {
  if (!rows?.length || !minter) return DEFAULT_DISCUSSION_SETTINGS;
  const owner = minter.trim().toLowerCase();
  if (!owner) return DEFAULT_DISCUSSION_SETTINGS;
  const own = rows.find((r) => typeof r?.creator_address === 'string' && r.creator_address.trim().toLowerCase() === owner);
  if (!own) return DEFAULT_DISCUSSION_SETTINGS;
  return { commonGround: own.common_ground === true };
}
