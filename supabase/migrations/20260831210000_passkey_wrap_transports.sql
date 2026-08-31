-- Which transports each wallet passkey supports and whether the credential
-- lives in a syncing provider (WebAuthn backup-state flag: Google Password
-- Manager, iCloud Keychain) or is bound to the device that made it (Windows
-- Hello). Lets the unlock UI say "usable from another device via QR" versus
-- "only works on the device it was set up on" instead of guessing.
-- Nullable: rows enrolled before this migration stay unknown until their next
-- successful unlock backfills backed_up.
ALTER TABLE public.user_wallet_passkeys
  ADD COLUMN IF NOT EXISTS transports text[],
  ADD COLUMN IF NOT EXISTS backed_up boolean;
