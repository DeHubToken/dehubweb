-- Mark three delivered board items as shipped (Shipped tab = status IN ('completed','shipped')).
--   94aefcb4  "Community chats should jump to the latest" — CommunityChat.tsx now shows the
--             DM-style jump-to-latest button with an unread counter (commit 7f236adb0, live).
--   11d71332  "Audio song" — standalone audio posts upload from the web post modal
--             (audio/* picker, postType 'audio', no client-side size cap).
--   1bbc7657  "Solana integration with SOL and USDT" — chain 101 in the post chain selector,
--             SOL/USDT/USDC lock tokens, Phantom mint + /solana/confirm-mint, and
--             Solana-mint-address validation on gated/locked uploads.
-- Applied directly to prod via SQL (git-pushed migrations don't reliably auto-apply);
-- this file keeps the repo in sync.
UPDATE feature_requests SET status = 'shipped', updated_at = now()
WHERE id IN (
  '94aefcb4-ce2f-4665-bfd1-385575257d4e',
  '11d71332-6273-4a6a-aae2-b2f245a61bc8',
  '1bbc7657-30cb-44b1-b282-d14064007f5c'
);
