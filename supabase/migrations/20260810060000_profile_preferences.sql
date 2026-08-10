-- Public profile preferences
-- ==========================
-- Settings that change how a profile looks *to other people*, starting with the
-- temporary "New" badge on a recently joined account.
--
-- This cannot live in localStorage like quiet hours does: the badge is drawn on
-- everyone else's screen, so the opt-out has to be readable by the viewer, not
-- just by its owner. Hence a table with a public SELECT policy and writes
-- restricted to the wallet that owns the row.
--
-- Only opt-outs are stored. An account with no row here gets the default
-- experience, which is what the request asked for ("optional, enabled by
-- default"), and means no backfill for the existing user base.

CREATE TABLE IF NOT EXISTS public.profile_preferences (
  wallet_address          TEXT PRIMARY KEY,
  hide_new_member_badge   BOOLEAN NOT NULL DEFAULT false,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profile_preferences ENABLE ROW LEVEL SECURITY;

-- Readable by anyone: a viewer has to know whether to draw the badge, and these
-- are display choices rather than private data.
DROP POLICY IF EXISTS "Anyone can read profile preferences" ON public.profile_preferences;
CREATE POLICY "Anyone can read profile preferences"
  ON public.profile_preferences FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Owners can create their profile preferences" ON public.profile_preferences;
CREATE POLICY "Owners can create their profile preferences"
  ON public.profile_preferences FOR INSERT
  WITH CHECK (lower(wallet_address) = public.get_request_wallet_address());

DROP POLICY IF EXISTS "Owners can update their profile preferences" ON public.profile_preferences;
CREATE POLICY "Owners can update their profile preferences"
  ON public.profile_preferences FOR UPDATE
  USING (lower(wallet_address) = public.get_request_wallet_address())
  WITH CHECK (lower(wallet_address) = public.get_request_wallet_address());

-- Casing is the caller's to get wrong; the policies compare lowercased, so the
-- stored value has to be lowercase or a row becomes unreadable by its owner.
CREATE OR REPLACE FUNCTION public.profile_preferences_normalise()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.wallet_address := lower(NEW.wallet_address);
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profile_preferences_normalise_trigger ON public.profile_preferences;
CREATE TRIGGER profile_preferences_normalise_trigger
  BEFORE INSERT OR UPDATE ON public.profile_preferences
  FOR EACH ROW EXECUTE FUNCTION public.profile_preferences_normalise();

GRANT SELECT ON public.profile_preferences TO anon, authenticated;
GRANT INSERT, UPDATE ON public.profile_preferences TO anon, authenticated;
