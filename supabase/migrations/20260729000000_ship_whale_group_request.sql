-- Mark the "Whale group" feature request as shipped.
--
-- The request asked for a private whale-tier community inside DeHub as an
-- alternative to Discord (which the author can't access from their country).
-- Communities already support this: CommunitiesPage / CommunityPage plus the
-- `is_private` flag on the community record. Confirmed by the user that the
-- group itself was created a while ago, so the row was simply never updated.
--
-- NOTE: git-pushed migrations don't reliably auto-apply — run this against prod
-- via SQL, same as 20260719110500_ship_shipped_popup_request.sql.

UPDATE feature_requests SET status = 'shipped', updated_at = now()
WHERE id = 'd001b2c0-03c5-490a-846e-2004c9e069fc';
