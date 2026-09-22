-- Mark the RR Nindo image-post request as shipped.
--
-- "submitting for RR Nindo - see copy / paste below" — multi-photo ordering,
-- the 1 MB upload ceiling and audio on image posts. The image side of that has
-- since landed, so the row no longer belongs in the open Requests tab.
--
-- NOTE: git-pushed migrations don't reliably auto-apply — run this against prod
-- via SQL, same as 20260728001000_ship_already_built_requests.sql.
UPDATE feature_requests SET status = 'shipped', updated_at = now()
WHERE id = 'd994ef25-7f4a-4095-8274-dbf83693bb31';
