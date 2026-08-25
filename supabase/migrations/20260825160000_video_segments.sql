-- Crowdsourced skippable sections of a video — sponsor reads, intros, outros,
-- self-promo, "like and subscribe" interruptions, filler.
--
-- Keyed on the DeHub token id rather than a foreign key, for the same reason
-- film_reviews keys on the JustWatch id: posts live in Mongo behind the NestJS
-- API, so there is no posts table in this database to reference.
--
-- Two tables rather than a votes column on one, because a vote has to be
-- attributable: without a row per person, one account can hold a segment up or
-- bury it by clicking twice. The counts on the segment are a cache of the vote
-- table, maintained by the trigger below.

CREATE TABLE IF NOT EXISTS public.video_segments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- DeHub post token id. bigint: token ids are numeric and already past 2^31
  -- is not true today, but the column costs nothing to size correctly.
  token_id       bigint      NOT NULL,

  category       text        NOT NULL CHECK (category IN (
                               'sponsor', 'intro', 'outro', 'selfpromo', 'interaction', 'filler'
                             )),

  -- Seconds from the start of the video. Millisecond precision: a skip that
  -- lands half a second late clips the first word of the content.
  start_seconds  numeric(10,3) NOT NULL CHECK (start_seconds >= 0),
  end_seconds    numeric(10,3) NOT NULL,

  -- Lowercase wallet of whoever submitted it. Set from the verified DeHub
  -- token in the edge function, never from a client-supplied header.
  address        text        NOT NULL,

  votes_up       integer     NOT NULL DEFAULT 1,
  votes_down     integer     NOT NULL DEFAULT 0,

  -- 'hidden' is what a buried segment becomes; nothing is deleted, so a
  -- brigaded segment can be looked at rather than silently vanishing.
  status         text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'hidden')),

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT video_segments_ordered CHECK (end_seconds > start_seconds),
  -- A 30-minute "sponsor" is not a sponsor read, it is someone skipping the
  -- video. Long enough for the longest genuine one, short enough to be useless
  -- as a griefing tool.
  CONSTRAINT video_segments_bounded CHECK (end_seconds - start_seconds <= 900),
  -- One submission per person per start point: correcting yours edits it.
  CONSTRAINT video_segments_one_per_person UNIQUE (token_id, address, start_seconds)
);

-- The only read the player does: every live segment for one video, in order.
CREATE INDEX IF NOT EXISTS video_segments_token_idx
  ON public.video_segments (token_id, start_seconds)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS video_segments_address_idx
  ON public.video_segments (address, created_at DESC);

CREATE TABLE IF NOT EXISTS public.video_segment_votes (
  segment_id  uuid        NOT NULL REFERENCES public.video_segments(id) ON DELETE CASCADE,
  address     text        NOT NULL,
  vote        smallint    NOT NULL CHECK (vote IN (-1, 1)),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (segment_id, address)
);

-- Keep the cached counts on the segment in step with the vote rows. Doing this
-- in the edge function would need two round trips and would drift the moment
-- one of them failed.
CREATE OR REPLACE FUNCTION public.sync_video_segment_votes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target uuid := COALESCE(NEW.segment_id, OLD.segment_id);
  ups    integer;
  downs  integer;
BEGIN
  SELECT
    count(*) FILTER (WHERE v.vote = 1),
    count(*) FILTER (WHERE v.vote = -1)
  INTO ups, downs
  FROM public.video_segment_votes v
  WHERE v.segment_id = target;

  -- Buried: more against than for, by enough that it is not one person with an
  -- opinion. Reversible in the same statement — a later upvote lifts it back.
  UPDATE public.video_segments s
  SET votes_up = ups,
      votes_down = downs,
      status = CASE WHEN downs - ups >= 2 THEN 'hidden' ELSE 'active' END,
      updated_at = now()
  WHERE s.id = target;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS video_segment_votes_sync ON public.video_segment_votes;
CREATE TRIGGER video_segment_votes_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.video_segment_votes
  FOR EACH ROW EXECUTE FUNCTION public.sync_video_segment_votes();

ALTER TABLE public.video_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_segment_votes ENABLE ROW LEVEL SECURITY;

-- Segments are public: the player reads them for signed-out viewers too.
DROP POLICY IF EXISTS video_segments_public_read ON public.video_segments;
CREATE POLICY video_segments_public_read
  ON public.video_segments FOR SELECT
  USING (status = 'active');

-- No INSERT/UPDATE/DELETE policy on either table, deliberately. Writes go
-- through the video-segments edge function, which authenticates with
-- requireDeHubAuth and writes as the service role. A wallet-header policy
-- would be worth exactly as much as the header, which the client controls.
DROP POLICY IF EXISTS video_segment_votes_no_read ON public.video_segment_votes;
CREATE POLICY video_segment_votes_no_read
  ON public.video_segment_votes FOR SELECT
  USING (false);

COMMENT ON TABLE public.video_segments IS
  'Crowdsourced skippable sections of a post video (sponsor, intro, outro, ...). Public read of active rows; writes only via the video-segments edge function.';
COMMENT ON TABLE public.video_segment_votes IS
  'One vote per person per segment. Not readable by clients; the counts are cached on video_segments by trigger.';
