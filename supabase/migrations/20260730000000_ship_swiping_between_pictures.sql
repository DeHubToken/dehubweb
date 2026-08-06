-- Mark "Swiping between pictures" (Android) as shipped.
--
-- Root cause was not gesture arbitration. The image counter pill and the dot
-- row were siblings drawn above the guarded scroller, both painting a
-- background, so RNGH's orchestrator stopped its reverse-drawing-order child
-- walk on them and never recorded the ScrollView's native handler for that
-- pointer — while the pager's pan, an ancestor, still was. The guard therefore
-- had nothing to block and the feed tab turned. The dot row spans the full
-- width at the bottom of the image, exactly where a thumb swipes.
--
-- Fixed across two merged PRs in DeHubToken/dehub-mobile:
--   #8 — carousel paging arithmetic (items were 8px wider than their own
--        viewport while pagingEnabled snapped to viewport width, so every page
--        compounded the error), plus the images tab now scrolling like web
--        instead of as a TikTok-style pager.
--   #9 — pointerEvents="none" on both overlays, the root-cause fix. Also
--        repairs the dedicated post page, where the same theft made a drag on
--        the dots do nothing at all.
--
-- ⚠ BEFORE RUNNING: a merge is not a release. This reaches the reporter only in
--   a new Android build, and the #9 fix is traced through RNGH 2.28.0 source
--   rather than confirmed on a device. Run this once an APK carrying both PRs
--   is out AND someone has swiped a multi-image post on Android.
--
-- NOTE: git-pushed migrations don't reliably auto-apply — run via the SQL
-- Editor, same as 20260719110500_ship_shipped_popup_request.sql.

UPDATE feature_requests SET status = 'shipped', updated_at = now()
WHERE id = '1e5ef5ef-345c-49b2-9e0a-bcc7a1d9880d';
