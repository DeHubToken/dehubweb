-- New members roster — "who just joined, so we can welcome them".
--
-- Why a table at all, when the DeHub API already stamps `createdAt` on every
-- account: because there is no way to ask that API "who joined recently".
-- `/api/users_search` ignores `page`, ignores `limit`, ignores every sort
-- parameter tried, and returns the same ten oldest accounts every time
-- (probed against prod 2026-08-21). `/api/admin/users?joinedWithin=` can do it
-- but needs an admin session, and holding admin credentials in a Supabase
-- secret to power a welcome rail is a bad trade. So the roster is built the
-- only way left: each client registers itself the first time it signs in after
-- this ships, and the roster is everyone who did that recently.
--
-- The consequence, stated plainly: someone who signed up last week and has not
-- come back does not appear until they do. That is the right bias for this
-- feature — the list exists so people can say hello, and there is nobody to
-- say hello to at an account nobody is sitting behind.
--
-- Clients CANNOT insert. `joined_at` is the only field with any value to lie
-- about (claim today, wear the NEW badge forever, sit at the top of a rail
-- everyone is looking at), so it is never taken from the caller: the
-- `register-new-member` edge function re-reads it from
-- api.dehub.io/api/account_info and writes with the service role. The only
-- client write on this table is a member flipping their own `opted_out`.

CREATE TABLE IF NOT EXISTS public.new_members (
  -- Lowercased. One row per account, so a second sign-in updates rather than
  -- duplicates, and `opted_out` survives every later login.
  wallet_address TEXT NOT NULL PRIMARY KEY,
  username TEXT,
  display_name TEXT,
  avatar_url TEXT,
  -- Denormalised so the rail can draw staking badges without one lookup per
  -- row. A missing balance and "below the 10k floor" are indistinguishable to
  -- getBadgeUrl — both draw nothing, silently — so the rail would have looked
  -- correct while quietly stripping the badge off every whale who just joined.
  badge_balance NUMERIC,
  -- The account's real creation time, copied from the DeHub API. NOT the time
  -- the row was written: an account created three weeks ago that signs in
  -- today has three weeks of "new" left, not thirty.
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL,
  -- Default false = the feature is opt-OUT, as asked for. See the SELECT
  -- policy: opting out does not hide the badge in the client, it removes the
  -- row from what any client can read at all.
  opted_out BOOLEAN NOT NULL DEFAULT false,
  first_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- The only read pattern: newest joiners first, capped at a page.
CREATE INDEX IF NOT EXISTS new_members_joined_at_idx
  ON public.new_members (joined_at DESC);

ALTER TABLE public.new_members ENABLE ROW LEVEL SECURITY;

-- The REVOKE is not decoration. Supabase's default privileges hand anon and
-- authenticated the full set on every new table in `public`, so a bare GRANT
-- adds nothing and the table arrives INSERT-able and DELETE-able by anyone
-- holding the publishable key. RLS still denies both — no policy means no rows
-- — but the grant is the layer that should not have been open in the first
-- place. Verified against prod: anon INSERT → 42501, anon DELETE → 204 with the
-- row untouched.
REVOKE INSERT, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.new_members FROM anon, authenticated;
GRANT SELECT, UPDATE ON public.new_members TO anon, authenticated;

-- ── Policies ─────────────────────────────────────────────────────────────────

-- Opting out is enforced here rather than in the clients. Three surfaces read
-- this table (rail, profile chip, mobile), and a filter each is three chances
-- to forget one; a row that cannot be selected cannot be rendered by a surface
-- that has not been written yet either.
--
-- The second branch is why the settings toggle can still read its own state
-- after being switched off.
DROP POLICY IF EXISTS "Anyone can view visible new members" ON public.new_members;
CREATE POLICY "Anyone can view visible new members"
  ON public.new_members FOR SELECT
  USING (
    opted_out = false
    OR lower(wallet_address) = get_request_wallet_address()
  );

-- Broad by necessity — RLS cannot restrict which columns an UPDATE touches, so
-- the policy says "your own row" and the trigger below says "only opted_out".
DROP POLICY IF EXISTS "Members can update their own new member row" ON public.new_members;
CREATE POLICY "Members can update their own new member row"
  ON public.new_members FOR UPDATE
  USING (lower(wallet_address) = get_request_wallet_address())
  WITH CHECK (lower(wallet_address) = get_request_wallet_address());

CREATE OR REPLACE FUNCTION public.new_members_guard_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  -- The service role owns the profile fields and joined_at. It bypasses RLS,
  -- but triggers still fire for it, so it needs a way through.
  --
  -- The test is the wallet header rather than the role name: a client UPDATE
  -- can only have reached this trigger by satisfying the policy above, which
  -- is impossible without a header naming this exact row. No header therefore
  -- means no client — the edge function or the SQL editor. That holds without
  -- depending on how PostgREST happens to expose the role.
  IF get_request_wallet_address() = '' OR current_user = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF ROW(NEW.wallet_address, NEW.username, NEW.display_name, NEW.avatar_url,
         NEW.badge_balance, NEW.joined_at, NEW.first_seen_at)
     IS DISTINCT FROM
     ROW(OLD.wallet_address, OLD.username, OLD.display_name, OLD.avatar_url,
         OLD.badge_balance, OLD.joined_at, OLD.first_seen_at) THEN
    RAISE EXCEPTION 'Only opted_out may be changed on a new member row';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS new_members_guard_update_trg ON public.new_members;
CREATE TRIGGER new_members_guard_update_trg
  BEFORE UPDATE ON public.new_members
  FOR EACH ROW EXECUTE FUNCTION public.new_members_guard_update();
