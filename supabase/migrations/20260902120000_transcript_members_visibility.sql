-- 'members' should not mean 'public'.
--
-- Applied 2026-09-02.
--
-- The read policy added in 20260825090000 allows `visibility IN ('public',
-- 'members')` and the grant covers anon and authenticated alike, so the two
-- values behave identically: a signed-out visitor with the publishable key
-- reads every members-only transcript through PostgREST. The column has three
-- values and only two behaviours.
--
-- What this is NOT: a strong gate. It asks for a caller who presents a wallet,
-- and `get_request_wallet_address()` reads an unsigned request header, so
-- anyone can present one. That is the trust level the whole wallet-keyed half
-- of this schema currently runs at, and fixing it properly means building an
-- identity map first — every login path, backfilled, verified — because
-- `user_wallets` covers only a small fraction of the addresses actually acting
-- on these tables. Measured 2026-09-02: 123 of 127 acting wallets have no row
-- there, so a switch to auth.uid() would lock out almost everyone.
--
-- So this restores the distinction the column was written to express, at the
-- trust level of its neighbours, and is strictly better than the two values
-- being the same. It is not the end of the work.

DROP POLICY IF EXISTS "Read transcripts by visibility" ON public.transcripts;
CREATE POLICY "Read transcripts by visibility"
ON public.transcripts FOR SELECT
USING (
  visibility = 'public'
  -- Signed in, by the same measure everything else here uses.
  OR (visibility = 'members' AND get_request_wallet_address() <> '')
  -- A stage's host reads their own transcript at any visibility, including
  -- 'private'. Unchanged from the policy this replaces.
  OR (
    source_kind = 'stage'
    AND EXISTS (
      SELECT 1 FROM public.audio_spaces s
      WHERE s.id = (transcripts.source_ref)::uuid
        AND lower(s.host_wallet_address) = get_request_wallet_address()
    )
  )
);
