-- Mark "Disabling comments on posts" as shipped.
--
-- Built across all three repos, all merged:
--   dehub-stream-backend#68 — commentsDisabled on the Token model, the toggle
--     riding the existing creator-only PATCH /api/nft/:tokenId, one enforcement
--     guard in requestCommentFunc (all five comment entry points funnel through
--     it), and the flag added to the shared tokenTemplate projection so every
--     feed response carries it.
--   dehubweb#50 — the switch in EditPostModal, composer replaced with a notice
--     when replies are off.
--   dehub-mobile#10 — the same switch and notice, matching copy and placement.
--
-- Disabling never deletes: existing comments stay in the database and stay
-- readable, only new ones are refused, so re-enabling restores the thread
-- intact. Both clients say so in the toggle's own copy.
--
-- Worth recording: this is the one board item with real pushback — the vote was
-- +4/-2 and all four comments opposed it, arguing private profiles already
-- cover the need. A governance poll was suggested. That was surfaced before
-- implementation and the decision was to build it anyway.
--
-- ⚠ The backend change reaches users only once the droplet is deployed, and the
--   mobile half only in a new Android build. Flip this when those are actually
--   out if you want the board to track reality rather than merges.
--
-- NOTE: git-pushed migrations don't reliably auto-apply — run via the SQL
-- Editor, same as 20260719110500_ship_shipped_popup_request.sql.

UPDATE feature_requests SET status = 'shipped', updated_at = now()
WHERE id = 'd55f31f1-7eae-4799-b1e4-77882dfa50c4';
