-- Viewer-submitted fixes to a line of an auto-generated transcript.
--
-- Auto-captions mangle accents, cross-talk, names and jargon, and the person
-- who can hear the difference is usually watching rather than the one who
-- uploaded it. This is the way that person can fix the line — the thing
-- YouTube removed in 2020 and never replaced.
--
-- Corrections are keyed on (transcript, segment index) rather than on the text
-- they replace: a transcript can be re-run, and matching on text would silently
-- lose every correction the moment a re-run shifted a word. The original text
-- is stored alongside so a correction against a line that has since changed can
-- be spotted rather than applied blindly.

CREATE TABLE IF NOT EXISTS public.transcript_corrections (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  transcript_id  uuid        NOT NULL REFERENCES public.transcripts(id) ON DELETE CASCADE,
  -- Index into the transcript's `segments` array.
  segment_index  integer     NOT NULL CHECK (segment_index >= 0),

  -- What the line said when the correction was written. Kept for the
  -- re-transcription case above; never displayed.
  original_text  text        NOT NULL,
  text           text        NOT NULL CHECK (char_length(text) BETWEEN 1 AND 500),

  -- Lowercase wallet, from the verified DeHub token in the edge function.
  address        text        NOT NULL,

  votes_up       integer     NOT NULL DEFAULT 1,
  votes_down     integer     NOT NULL DEFAULT 0,

  -- 'suggested' is offered under the line; 'accepted' replaces it; 'rejected'
  -- is kept but hidden, so a brigaded fix can still be looked at.
  status         text        NOT NULL DEFAULT 'suggested'
                             CHECK (status IN ('suggested', 'accepted', 'rejected')),

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  -- One correction per person per line: editing yours replaces it.
  CONSTRAINT transcript_corrections_one_per_person UNIQUE (transcript_id, segment_index, address)
);

CREATE INDEX IF NOT EXISTS transcript_corrections_transcript_idx
  ON public.transcript_corrections (transcript_id, segment_index)
  WHERE status <> 'rejected';

CREATE TABLE IF NOT EXISTS public.transcript_correction_votes (
  correction_id uuid        NOT NULL REFERENCES public.transcript_corrections(id) ON DELETE CASCADE,
  address       text        NOT NULL,
  vote          smallint    NOT NULL CHECK (vote IN (-1, 1)),
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (correction_id, address)
);

-- Counts on the correction are a cache of the vote table, and the status
-- follows them: one independent agreement accepts a fix, two net disagreements
-- bury it. Both reversible, because both are just arithmetic on live votes.
CREATE OR REPLACE FUNCTION public.sync_transcript_correction_votes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target uuid := COALESCE(NEW.correction_id, OLD.correction_id);
  ups    integer;
  downs  integer;
BEGIN
  SELECT
    count(*) FILTER (WHERE v.vote = 1),
    count(*) FILTER (WHERE v.vote = -1)
  INTO ups, downs
  FROM public.transcript_correction_votes v
  WHERE v.correction_id = target;

  UPDATE public.transcript_corrections c
  SET votes_up = ups,
      votes_down = downs,
      status = CASE
        WHEN downs - ups >= 2 THEN 'rejected'
        WHEN ups - downs >= 2 THEN 'accepted'
        ELSE 'suggested'
      END,
      updated_at = now()
  WHERE c.id = target;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS transcript_correction_votes_sync ON public.transcript_correction_votes;
CREATE TRIGGER transcript_correction_votes_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.transcript_correction_votes
  FOR EACH ROW EXECUTE FUNCTION public.sync_transcript_correction_votes();

ALTER TABLE public.transcript_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transcript_correction_votes ENABLE ROW LEVEL SECURITY;

-- Public read of everything not buried: captions are read by signed-out
-- viewers, and a suggestion under a line is part of the reading experience.
DROP POLICY IF EXISTS transcript_corrections_public_read ON public.transcript_corrections;
CREATE POLICY transcript_corrections_public_read
  ON public.transcript_corrections FOR SELECT
  USING (status <> 'rejected');

-- No write policy on either table. Writes go through the
-- transcript-corrections edge function, which authenticates with
-- requireDeHubAuth and writes as the service role — Postgres has no way to
-- check a DeHub token, so a wallet-header policy would be worth exactly as
-- much as the header the client sets.
DROP POLICY IF EXISTS transcript_correction_votes_no_read ON public.transcript_correction_votes;
CREATE POLICY transcript_correction_votes_no_read
  ON public.transcript_correction_votes FOR SELECT
  USING (false);

COMMENT ON TABLE public.transcript_corrections IS
  'Viewer-submitted fixes to auto-caption lines, keyed on (transcript, segment index). Public read of non-rejected rows; writes only via the transcript-corrections edge function.';
