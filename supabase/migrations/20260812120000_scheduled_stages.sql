-- Scheduled stages
-- =================
-- Lets a host announce a stage ahead of time: the row exists (and is shareable,
-- and cards up in the feed) before anyone is in the room.
--
-- `status` gains a third value rather than a separate table, because every
-- surface that already reads audio_spaces — the deep link, the transcript
-- pipeline, the recording upload — should keep working unchanged once the
-- stage goes live. A scheduled row simply transitions 'scheduled' → 'live'.
--
-- Both existing auto-end paths (the tr_audio_space_participant_left trigger
-- and its one-time cleanup) are scoped to `status = 'live'`, so a scheduled
-- row with no participants is not at risk of being ended out from under its
-- host before it starts.

ALTER TABLE public.audio_spaces
  DROP CONSTRAINT IF EXISTS audio_spaces_status_check;

ALTER TABLE public.audio_spaces
  ADD CONSTRAINT audio_spaces_status_check
  CHECK (status IN ('scheduled', 'live', 'ended'));

ALTER TABLE public.audio_spaces
  -- When the host intends to go live. NULL for stages started on the spot,
  -- which is every row that existed before this migration.
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP WITH TIME ZONE,
  -- Optional artwork: backs the announcement card in the feed and sits behind
  -- the live room itself. Public URL in the `community-media` bucket.
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT;

-- The upcoming list is "scheduled, soonest first, not long past due" — a
-- narrow, frequently polled query that should never table-scan.
CREATE INDEX IF NOT EXISTS audio_spaces_scheduled_idx
  ON public.audio_spaces (scheduled_at)
  WHERE status = 'scheduled';

COMMENT ON COLUMN public.audio_spaces.scheduled_at IS
  'Intended start time for a status=scheduled stage. Set once at schedule time; started_at is stamped when it actually goes live.';
COMMENT ON COLUMN public.audio_spaces.cover_image_url IS
  'Optional public cover graphic (community-media bucket) shown behind the announcement card and the live room.';
