-- Ratings and reviews for /cinema titles.
--
-- Keyed on the JustWatch id rather than anything of ours, because we do not
-- own the catalogue: there is no films table to reference, and there will not
-- be one. (justwatch_id, object_type) is the identity of a title — the two id
-- spaces overlap, so a film and a series can share a number.
--
-- The display fields are denormalised on purpose. A review has to render
-- without a catalogue call: the partner API is rate-limited per account rather
-- than per visitor, a list of twenty reviews would otherwise be twenty
-- lookups, and while the token is unprovisioned it answers nothing at all —
-- so without these a review list would be twenty blank rows.

CREATE TABLE IF NOT EXISTS public.film_reviews (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  justwatch_id  text        NOT NULL,
  object_type   text        NOT NULL CHECK (object_type IN ('movie', 'show')),

  -- Snapshot of the title at review time, for rendering without a catalogue call.
  title         text        NOT NULL,
  poster        text,
  year          smallint,

  -- Lowercase wallet. Set from the verified DeHub token in the edge function,
  -- never from a client-supplied header.
  address       text        NOT NULL,

  rating        smallint    NOT NULL CHECK (rating BETWEEN 1 AND 5),
  -- Nullable: a star rating with no words is a complete review.
  body          text        CHECK (body IS NULL OR char_length(body) <= 4000),

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- One review per person per title. The write path upserts onto this, so
  -- rating a film twice edits the first review instead of stacking a second.
  CONSTRAINT film_reviews_one_per_person UNIQUE (justwatch_id, object_type, address)
);

-- The only read the UI does: every review for one title, newest first.
CREATE INDEX IF NOT EXISTS film_reviews_title_idx
  ON public.film_reviews (justwatch_id, object_type, created_at DESC);

-- "What has this person reviewed" — for a future profile tab.
CREATE INDEX IF NOT EXISTS film_reviews_address_idx
  ON public.film_reviews (address, created_at DESC);

ALTER TABLE public.film_reviews ENABLE ROW LEVEL SECURITY;

-- Reviews are public, like the posts they sit beside.
DROP POLICY IF EXISTS film_reviews_public_read ON public.film_reviews;
CREATE POLICY film_reviews_public_read
  ON public.film_reviews FOR SELECT
  USING (true);

-- No INSERT/UPDATE/DELETE policy, deliberately. Writes go through the
-- film-reviews edge function, which authenticates with requireDeHubAuth and
-- writes as the service role. A wallet-header policy would be worth exactly
-- as much as the header, which the client controls — the same mistake that
-- made ai_agents world-writable.

COMMENT ON TABLE public.film_reviews IS
  'User ratings and reviews of /cinema titles, keyed on the JustWatch id. Public read; writes only via the film-reviews edge function.';
