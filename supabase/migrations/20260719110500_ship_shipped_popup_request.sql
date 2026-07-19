-- Mark the "feedback has shipped message keeps coming back" request as shipped.
-- The repeated shipped-notification popup was fixed, so this moves the item from
-- the "Requests" tab to the "Shipped" tab (Shipped tab = status IN ('completed','shipped')).
-- Applied directly to prod via SQL (git-pushed migrations don't reliably auto-apply);
-- this file keeps the repo in sync.
UPDATE feature_requests SET status = 'shipped', updated_at = now()
WHERE id = '14d27ef5-983a-4e79-9137-1a28320715d4';
