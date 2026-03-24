
Root cause (why this is happening)
- You’re not tripping. The DM unread red badges are being masked locally, not fully guaranteed server-cleared.
- In `src/hooks/use-messages.ts`, read conversations are stored in localStorage with `READ_STATE_TTL = 1 hour`.
- After that TTL expires (or after a later session), if backend unread state still says unread, badges reappear.
- Read receipts are sent via socket (`emitReadReceipt`) and can be missed during disconnect/reconnect windows, so server unread can remain stale.

Implementation plan

1) Make local read override durable (remove 1-hour expiry)
- File: `src/hooks/use-messages.ts`
- Replace TTL-based pruning with persistent per-conversation read timestamps.
- Keep the existing safety check (`lastMessage.createdAt <= localReadTs`) so genuinely new messages still show unread.

2) Scope read override storage by wallet
- File: `src/hooks/use-messages.ts`
- Change key from global `dehub-read-conversations` to wallet-scoped key (e.g. `dehub-read-conversations:<wallet>`).
- Prevent cross-account contamination when users switch wallets in the same browser.

3) Harden read-receipt delivery
- File: `src/lib/api/dehub/dm-socket.ts`
- Add a small pending read-receipt queue (in-memory + optional localStorage backup).
- `emitReadReceipt` should enqueue first, then send immediately if connected.
- Flush queue on socket reconnect so missed emits are retried automatically.

4) Keep UI instant, but sync safer
- Files: `src/hooks/use-messages.ts`, `src/components/app/chat/DirectMessageChat.tsx`
- Preserve optimistic unread removal for instant UX.
- Continue re-emitting on visibility/focus, but route through queued sender so it’s resilient to temporary disconnects.

5) Regression checks
- Open unread DM → badge clears immediately.
- Logout/login same day and next day → old unread badge does not reappear.
- Send a genuinely new message from another account → unread badge returns correctly.
- Test with temporary socket disconnect (offline/online) to confirm queued read receipts flush after reconnect.

Technical details
- Current problematic logic:
  - `READ_STATE_TTL = 60 * 60 * 1000` in `use-messages.ts`
  - `getReadConversations()` prunes entries older than TTL
  - `markConversationAsRead()` is effectively a no-op; real sync depends on socket `readReceipt`
- Durable local read state + reconnect-safe emit queue is the correct fix for “badge comes back after a day”.
