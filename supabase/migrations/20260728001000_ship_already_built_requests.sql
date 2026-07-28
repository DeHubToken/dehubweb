-- Flip feature requests that were already built to `shipped`.
--
-- Audit of the open requests found three that the codebase already satisfies;
-- they were sitting in the Requests tab because nobody updated their status.
--
-- NOTE: git-pushed migrations don't reliably auto-apply — run this against prod
-- via SQL, same as 20260719110500_ship_shipped_popup_request.sql.

-- "Endpoint for downvotes on comments and replies"
-- → POST /api/dislike_comment exists (src/lib/api/dehub/social.ts:248) and is
--   fully wired into the comments UI (handleDislike in CommentsSection.tsx).
UPDATE feature_requests SET status = 'shipped', updated_at = now()
WHERE id = '0e8aa144-b670-4f55-a84f-09b1d531c4c6';

-- "Endpoint to clear view history"
-- → DELETE /api/my_watched_nfts exists (src/lib/api/dehub/feed.ts:260), exposed
--   through useClearWatchHistory in BookmarksPage.
UPDATE feature_requests SET status = 'shipped', updated_at = now()
WHERE id = 'd6128617-6483-4388-ae23-5c514811c8d9';

-- "Unable to View Users Who Liked the Post"
-- → The likers list existed but was only reachable by manually switching tabs
--   inside the comments sheet. Tapping the like count now opens it directly.
--
-- ⚠ ONLY run this statement once the branch carrying the ActionBar
--   `onShowLikers` change is actually deployed — otherwise it marks a request
--   shipped that users can't yet see.
-- UPDATE feature_requests SET status = 'shipped', updated_at = now()
-- WHERE id = '95c4da60-4e3a-4ce6-94cb-d629d064178b';
