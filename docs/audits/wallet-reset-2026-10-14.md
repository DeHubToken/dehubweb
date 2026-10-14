# Wallet reset login audit

Production evidence on 14 October 2026 identified an unfinished replacement for
the `akcil` profile. Supabase saved the replacement at 14:33 UTC and archived the
previous encrypted wallet. The archive still had no profile rotation completion
timestamp. The existing profile retained 88 uploads and 25 followers.

Subsequent Android email attempts established a valid Supabase identity, then
received HTTP 409 from `/web/auth/supabase`. The replacement wallet hint no longer
matched the existing profile. The common mobile login flow treated that refusal
as a terminal failure before reaching wallet unlock and rotation. Web had the
same ordering. Re-entering the already consumed email code then produced the
secondary expired-or-invalid-code message.

Web and mobile now resume the existing unlock/rotation flow only when the active
wallet matches an unfinished archive owned by the signed-in identity. A device
with the replacement key rotates the profile before authenticating, then marks
the replacement complete. Locked wallets use their existing unlock screen.
Ordinary profile exchange failures do not authorize a signature fallback.

The shared database migration is recorded in the production ledger. Archive RLS
restricts reads to `auth.uid()`, and replacement RPC execution is restricted to
authenticated/service roles. Replacement locks the active row, checks the
expected outgoing address, archives encrypted recovery material, and writes the
new wallet in one transaction. Backend rotation separately requires a verified
identity and destination signature. On-chain funds remain at the original wallet.

Cloud regression coverage includes pending archive matching, ordinary failures,
missing wallets, failed archive lookups, locked reset recovery, rotation ordering,
and retention of the retry marker after rotation failure. Publication and the
affected user's successful login must be verified separately from merge.
