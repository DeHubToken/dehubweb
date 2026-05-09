/**
 * Clear Engagement Caches
 * =======================
 * Wipes all per-user engagement state (likes, reposts, comment-count deltas,
 * unlocked tokens, vote cache) from localStorage / sessionStorage / in-memory.
 * Called on login and logout so cached state from a previous account never
 * leaks into a different account's UI.
 */

const LOCAL_KEYS = [
  'dehub-repost-cache',
  'comment_count_deltas',
];

const SESSION_KEYS = [
  'dehub_unlocked_tokens',
];

export function clearEngagementCaches(): void {
  try {
    for (const k of LOCAL_KEYS) localStorage.removeItem(k);
  } catch { /* ignore */ }
  try {
    for (const k of SESSION_KEYS) sessionStorage.removeItem(k);
  } catch { /* ignore */ }
}
