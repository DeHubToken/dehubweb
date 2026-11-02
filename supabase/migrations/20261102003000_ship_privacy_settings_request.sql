-- Mark moggel's "I can't save the privacy settings" request as shipped.
--
-- The AI training toggle now saves, and the reporter confirmed it works, so the
-- row no longer belongs in the open Requests tab.
--
-- NOTE: git-pushed migrations don't reliably auto-apply — run this against prod
-- via SQL, same as 20260922160000_ship_rr_nindo_image_request.sql.
UPDATE feature_requests SET status = 'shipped', updated_at = now()
WHERE id = '08b0590e-9b07-4779-868e-37b3f17d30e3';
