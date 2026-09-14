-- Feedback hub: a permanent place for existing users to leave a testimonial.
--
-- We already collect feedback from NEW accounts, through the login survey
-- (`user_feedback_surveys`, round 3 of which asks for a promo-use consent).
-- That catches people at the moment they know DeHub least. The strongest
-- quotes arrive weeks or months later, from someone who has actually used the
-- thing — and until now there was nowhere for them to put one.
--
-- So: an always-open form on the Stats page, and this table behind it.
--
-- Consent is the whole point of the table, which is why it is TWO booleans and
-- not one. `allow_promo` is permission to quote the words. `allow_name` is
-- permission to attach the person to them. Someone happy to be quoted
-- anonymously is a real and common case, and collapsing the two would either
-- lose that quote or misuse it. Neither defaults to true.
--
-- Nothing is public until a human approves it: `status` starts at 'pending'
-- and the public read policy needs 'approved' AND `allow_promo`. A consent
-- checkbox is not a licence to publish unreviewed text on a page that also
-- carries our traffic numbers.

CREATE TABLE IF NOT EXISTS public.user_testimonials (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  -- Captured at submit time rather than joined at read time: the wall is a
  -- quote from a moment, and a handle change two months later should not
  -- silently re-attribute it. Null when the account has no username yet.
  username       TEXT,
  body           TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 10 AND 1200),
  -- Free text rather than a select: "since the v2 migration" and "about a
  -- year" are both more useful than a bucket, and a bucket would need a
  -- migration to change.
  time_using     TEXT CHECK (time_using IS NULL OR char_length(time_using) <= 80),
  allow_promo    BOOLEAN NOT NULL DEFAULT false,
  allow_name     BOOLEAN NOT NULL DEFAULT false,
  status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'approved', 'hidden')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at    TIMESTAMPTZ
);

-- The two reads this table gets: "my submissions" (own wallet, newest first)
-- and "the approved wall" (status + consent, newest first).
CREATE INDEX IF NOT EXISTS user_testimonials_wallet_idx
  ON public.user_testimonials (wallet_address, created_at DESC);
CREATE INDEX IF NOT EXISTS user_testimonials_public_idx
  ON public.user_testimonials (created_at DESC)
  WHERE status = 'approved' AND allow_promo;

ALTER TABLE public.user_testimonials ENABLE ROW LEVEL SECURITY;

-- ── Write ───────────────────────────────────────────────────────────────────
-- Same wallet-header scheme the rest of the Supabase side uses. Writing a
-- testimonial under somebody else's wallet would put words in their mouth on a
-- page we then quote from, so the check is on insert and not only on read.
CREATE POLICY "Users can submit their own testimonial"
  ON public.user_testimonials FOR INSERT
  WITH CHECK (lower(wallet_address) = get_request_wallet_address());

-- ── Read ────────────────────────────────────────────────────────────────────
-- Your own rows, whatever their status, so the form can say "thanks, this is
-- with us" instead of forgetting you submitted.
CREATE POLICY "Users can view their own testimonials"
  ON public.user_testimonials FOR SELECT
  USING (lower(wallet_address) = get_request_wallet_address());

-- The wall is served by a VIEW, not by a public policy on the table.
--
-- The obvious version of this — a `USING (status = 'approved' AND allow_promo)`
-- policy — works and is wrong. It makes the whole ROW readable with the
-- publishable key, `wallet_address` included, so every quote published
-- "anonymously" ships the wallet that wrote it to anyone who asks. The client
-- hiding the column is not privacy; it is a UI convention over a public
-- endpoint.
--
-- So the table has no public read policy at all. This view is the only public
-- surface, it selects no wallet, and it nulls the username unless that person
-- separately ticked allow_name. Default (definer) semantics, so it can read
-- past RLS on its owner's behalf; that is the point.
CREATE OR REPLACE VIEW public.public_testimonials AS
  SELECT
    id,
    body,
    time_using,
    created_at,
    CASE WHEN allow_name THEN username END AS username
  FROM public.user_testimonials
  WHERE status = 'approved' AND allow_promo
  ORDER BY created_at DESC;

GRANT SELECT ON public.public_testimonials TO anon, authenticated;

-- No UPDATE or DELETE policy on the table. Moderation runs as service_role
-- through the SQL editor, which bypasses RLS; giving the publishable key a way
-- to flip `status` would make the approval gate decorative.
