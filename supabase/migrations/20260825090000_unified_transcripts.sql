-- One transcript store for every kind of speech DeHub holds.
--
-- Until now a video transcript and a stage transcript were two tables, two
-- edge functions, two translation mechanisms and two status vocabularies, for
-- one job. `translate-transcript` already had to branch on which of the two it
-- was talking to. This merges them.
--
-- The old names survive as security_invoker views so the shipped mobile build
-- keeps reading and writing exactly what it reads and writes today. The one
-- thing a view cannot carry is realtime: postgres_changes fires on a table, so
-- an old build watching `stage_transcripts` stops getting live pushes and
-- falls back to fetching when the sheet opens. Five stage transcripts exist in
-- total, and the mobile client moves to the new tables in the same wave.

-- ─────────────────────────────────────────────────────────────────────────
-- The store
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.transcripts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What was transcribed. `source_ref` is a token id for a video, the stage
  -- uuid for a stage — text so one column addresses both.
  source_kind       text NOT NULL CHECK (source_kind IN ('video', 'stage', 'live', 'audio')),
  source_ref        text NOT NULL,

  -- 'empty' is its own state on purpose. A run that produced no speech used to
  -- be stored as 'ready', which passed every "already done" check and could
  -- never be retried — two videos are stuck like that in production today.
  status            text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'processing', 'ready', 'empty', 'failed')),

  provider          text,
  model             text,

  -- Always two letters. Scribe emits 'eng'/'tur' and Deepgram emits 'en-US';
  -- both are normalised on write so the translator never has to guess whether
  -- source and target are the same language.
  source_lang       text,
  duration_seconds  integer,

  segments          jsonb NOT NULL DEFAULT '[]'::jsonb,
  full_text         text,
  vtt               text,

  summary           text,
  summary_status    text NOT NULL DEFAULT 'pending',
  chapters          jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Stage-shaped columns. Videos are diarized now too, so speaker_overrides
  -- applies to both; the timeline and map stay stage-only.
  speaker_map       jsonb NOT NULL DEFAULT '{}'::jsonb,
  speaker_timeline  jsonb NOT NULL DEFAULT '[]'::jsonb,
  speaker_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Copied from whatever was transcribed. A paid or mature video's words were
  -- world-readable before this column existed.
  visibility        text NOT NULL DEFAULT 'public'
                      CHECK (visibility IN ('public', 'members', 'private')),

  -- Retry bookkeeping. A transcode race returns 403 from the CDN and used to
  -- fail the row for good.
  attempts          integer NOT NULL DEFAULT 0,
  last_attempt_at   timestamptz,
  error             text,

  search_tsv        tsvector GENERATED ALWAYS AS
                      (to_tsvector('simple', coalesce(full_text, ''))) STORED,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  UNIQUE (source_kind, source_ref)
);

-- Translations stop living in a JSONB blob on the parent row, where every
-- three-second status poll dragged all of them down the wire.
CREATE TABLE IF NOT EXISTS public.transcript_translations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transcript_id uuid NOT NULL REFERENCES public.transcripts(id) ON DELETE CASCADE,
  language      text NOT NULL,
  segments      jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary       text,
  chapters      jsonb NOT NULL DEFAULT '[]'::jsonb,
  status        text NOT NULL DEFAULT 'processing'
                  CHECK (status IN ('processing', 'ready', 'failed')),
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (transcript_id, language)
);

CREATE INDEX IF NOT EXISTS transcripts_search_idx
  ON public.transcripts USING gin (search_tsv);

-- The sweeper's query: anything unfinished, oldest attempt first.
CREATE INDEX IF NOT EXISTS transcripts_unfinished_idx
  ON public.transcripts (status, last_attempt_at)
  WHERE status IN ('pending', 'processing', 'failed');

-- The compat view addresses stage rows by uuid, so the qual is a cast.
CREATE INDEX IF NOT EXISTS transcripts_stage_ref_idx
  ON public.transcripts (((source_ref)::uuid))
  WHERE source_kind = 'stage';

CREATE INDEX IF NOT EXISTS transcript_translations_transcript_idx
  ON public.transcript_translations (transcript_id);

DROP TRIGGER IF EXISTS transcripts_updated_at ON public.transcripts;
CREATE TRIGGER transcripts_updated_at
BEFORE UPDATE ON public.transcripts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS transcript_translations_updated_at ON public.transcript_translations;
CREATE TRIGGER transcript_translations_updated_at
BEFORE UPDATE ON public.transcript_translations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────────
-- Move the thirteen rows that exist
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO public.transcripts (
  source_kind, source_ref, status, provider, model, source_lang,
  duration_seconds, segments, full_text, vtt, summary, summary_status,
  visibility, created_at, updated_at, error
)
SELECT
  'video',
  v.token_id::text,
  CASE
    WHEN v.status = 'ready'
     AND coalesce(jsonb_array_length(v.transcript -> 'segments'), 0) = 0
      THEN 'empty'
    WHEN v.status NOT IN ('pending', 'processing', 'ready', 'failed') THEN 'pending'
    ELSE v.status
  END,
  CASE WHEN v.vtt_original IS NOT NULL THEN 'deepgram' ELSE 'legacy' END,
  CASE WHEN v.vtt_original IS NOT NULL THEN 'nova-3' ELSE v.model END,
  lower(split_part(coalesce(v.source_lang, ''), '-', 1)),
  v.duration_seconds,
  coalesce(v.transcript -> 'segments', '[]'::jsonb),
  v.transcript ->> 'full_text',
  v.vtt_original,
  v.overview,
  CASE WHEN v.overview IS NOT NULL THEN 'ready' ELSE 'pending' END,
  'public',
  v.created_at,
  v.updated_at,
  v.error
FROM public.video_transcripts v
ON CONFLICT (source_kind, source_ref) DO NOTHING;

-- Blank source_lang rather than an empty string, so "same as source" checks
-- do not match everything.
UPDATE public.transcripts SET source_lang = NULL WHERE source_lang = '';

INSERT INTO public.transcripts (
  source_kind, source_ref, status, provider, model, source_lang,
  segments, full_text, summary, summary_status, chapters,
  speaker_map, speaker_timeline, speaker_overrides,
  visibility, created_at, updated_at, error
)
SELECT
  'stage',
  s.stage_id::text,
  CASE
    WHEN s.status = 'ready' AND coalesce(jsonb_array_length(s.segments), 0) = 0
      THEN 'empty'
    ELSE s.status
  END,
  'elevenlabs',
  'scribe_v1',
  -- Scribe writes three-letter codes; the picker speaks two.
  CASE lower(coalesce(s.source_language, ''))
    WHEN 'eng' THEN 'en' WHEN 'spa' THEN 'es' WHEN 'fra' THEN 'fr'
    WHEN 'fre' THEN 'fr' WHEN 'deu' THEN 'de' WHEN 'ger' THEN 'de'
    WHEN 'ita' THEN 'it' WHEN 'por' THEN 'pt' WHEN 'rus' THEN 'ru'
    WHEN 'tur' THEN 'tr' WHEN 'jpn' THEN 'ja' WHEN 'kor' THEN 'ko'
    WHEN 'zho' THEN 'zh' WHEN 'chi' THEN 'zh' WHEN 'ara' THEN 'ar'
    WHEN 'hin' THEN 'hi' WHEN 'ind' THEN 'id' WHEN '' THEN NULL
    ELSE lower(split_part(s.source_language, '-', 1))
  END,
  s.segments,
  s.full_text,
  s.summary,
  s.summary_status,
  s.chapters,
  s.speaker_map,
  s.speaker_timeline,
  s.speaker_overrides,
  s.privacy,
  s.created_at,
  s.updated_at,
  s.error
FROM public.stage_transcripts s
ON CONFLICT (source_kind, source_ref) DO NOTHING;

-- Video translations came out of a JSONB map keyed by language.
INSERT INTO public.transcript_translations (transcript_id, language, segments, status)
SELECT t.id, kv.key, kv.value, 'ready'
FROM public.video_transcripts v
JOIN public.transcripts t
  ON t.source_kind = 'video' AND t.source_ref = v.token_id::text
CROSS JOIN LATERAL jsonb_each(coalesce(v.translations, '{}'::jsonb)) AS kv(key, value)
WHERE jsonb_typeof(kv.value) = 'array'
ON CONFLICT (transcript_id, language) DO NOTHING;

INSERT INTO public.transcript_translations
  (transcript_id, language, segments, summary, chapters, status, error, created_at, updated_at)
SELECT t.id, st.language, st.segments, st.summary, st.chapters,
       CASE WHEN st.status IN ('processing', 'ready', 'failed') THEN st.status ELSE 'ready' END,
       st.error, st.created_at, st.updated_at
FROM public.stage_transcript_translations st
JOIN public.transcripts t
  ON t.source_kind = 'stage' AND t.source_ref = st.stage_id::text
ON CONFLICT (transcript_id, language) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- Row level security
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transcript_translations ENABLE ROW LEVEL SECURITY;

-- A private transcript is service-role only. For a stage the host is still a
-- reader, which is the rule the stage table already had; a video has no wallet
-- to check against here, so a private video transcript is reachable only
-- through a function that has already decided the caller may see it.
DROP POLICY IF EXISTS "Read transcripts by visibility" ON public.transcripts;
CREATE POLICY "Read transcripts by visibility"
ON public.transcripts FOR SELECT
USING (
  visibility IN ('public', 'members')
  OR (
    source_kind = 'stage'
    AND EXISTS (
      SELECT 1 FROM public.audio_spaces s
      WHERE s.id = (transcripts.source_ref)::uuid
        AND lower(s.host_wallet_address) = get_request_wallet_address()
    )
  )
);

-- Hosts rename speakers and change privacy straight from the client. The
-- WITH CHECK is new: without it the same update could re-point a row at
-- somebody else's stage.
DROP POLICY IF EXISTS "Host updates own stage transcript" ON public.transcripts;
CREATE POLICY "Host updates own stage transcript"
ON public.transcripts FOR UPDATE
USING (
  source_kind = 'stage'
  AND EXISTS (
    SELECT 1 FROM public.audio_spaces s
    WHERE s.id = (transcripts.source_ref)::uuid
      AND lower(s.host_wallet_address) = get_request_wallet_address()
  )
)
WITH CHECK (
  source_kind = 'stage'
  AND EXISTS (
    SELECT 1 FROM public.audio_spaces s
    WHERE s.id = (transcripts.source_ref)::uuid
      AND lower(s.host_wallet_address) = get_request_wallet_address()
  )
);

DROP POLICY IF EXISTS "Service role manages transcripts" ON public.transcripts;
CREATE POLICY "Service role manages transcripts"
ON public.transcripts FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- A translation is exactly as readable as what it translates.
DROP POLICY IF EXISTS "Read translations of readable transcripts" ON public.transcript_translations;
CREATE POLICY "Read translations of readable transcripts"
ON public.transcript_translations FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.transcripts t
    WHERE t.id = transcript_translations.transcript_id
      AND t.visibility IN ('public', 'members')
  )
);

DROP POLICY IF EXISTS "Service role manages translations" ON public.transcript_translations;
CREATE POLICY "Service role manages translations"
ON public.transcript_translations FOR ALL TO service_role
USING (true) WITH CHECK (true);

GRANT SELECT ON public.transcripts TO anon, authenticated;
-- Column-scoped on purpose. The old table granted UPDATE on everything and
-- leaned entirely on the row policy, so a host could rewrite the text of their
-- own transcript. These two are all the client has ever needed to write.
GRANT UPDATE (visibility, speaker_overrides) ON public.transcripts TO anon, authenticated;
GRANT SELECT ON public.transcript_translations TO anon, authenticated;
GRANT ALL ON public.transcripts TO service_role;
GRANT ALL ON public.transcript_translations TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- Retire the old tables, keep the old names
-- ─────────────────────────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime DROP TABLE public.stage_transcripts;
ALTER PUBLICATION supabase_realtime DROP TABLE public.stage_transcript_translations;

DROP TABLE public.stage_transcript_translations;
DROP TABLE public.stage_transcripts;
DROP TABLE public.video_transcripts;

-- security_invoker so the reader's own RLS decides, exactly as before.
CREATE VIEW public.stage_transcripts WITH (security_invoker = true) AS
SELECT
  t.id,
  (t.source_ref)::uuid       AS stage_id,
  t.status,
  t.source_lang              AS source_language,
  t.full_text,
  t.segments,
  t.error,
  t.created_at,
  t.updated_at,
  t.speaker_map,
  t.speaker_timeline,
  t.summary,
  t.chapters,
  t.speaker_overrides,
  t.visibility               AS privacy,
  t.summary_status
FROM public.transcripts t
WHERE t.source_kind = 'stage';

CREATE VIEW public.stage_transcript_translations WITH (security_invoker = true) AS
SELECT
  tt.id,
  (t.source_ref)::uuid AS stage_id,
  tt.language,
  tt.segments,
  tt.summary,
  tt.chapters,
  tt.status,
  tt.error,
  tt.created_at,
  tt.updated_at
FROM public.transcript_translations tt
JOIN public.transcripts t ON t.id = tt.transcript_id
WHERE t.source_kind = 'stage';

CREATE VIEW public.video_transcripts WITH (security_invoker = true) AS
SELECT
  (t.source_ref)::integer AS token_id,
  t.status,
  jsonb_build_object('segments', t.segments, 'full_text', coalesce(t.full_text, '')) AS transcript,
  t.duration_seconds,
  1 AS chunks_total,
  CASE WHEN t.status IN ('ready', 'empty') THEN 1 ELSE 0 END AS chunks_done,
  t.error,
  t.model,
  t.created_at,
  t.updated_at,
  t.summary AS overview,
  coalesce(
    (SELECT jsonb_object_agg(tt.language, tt.segments)
     FROM public.transcript_translations tt
     WHERE tt.transcript_id = t.id AND tt.status = 'ready'),
    '{}'::jsonb
  ) AS translations,
  t.vtt AS vtt_original,
  t.source_lang
FROM public.transcripts t
WHERE t.source_kind = 'video';

GRANT SELECT ON public.stage_transcripts TO anon, authenticated, service_role;
GRANT UPDATE (privacy, speaker_overrides) ON public.stage_transcripts TO anon, authenticated;
GRANT SELECT ON public.stage_transcript_translations TO anon, authenticated, service_role;
GRANT SELECT ON public.video_transcripts TO anon, authenticated, service_role;

ALTER PUBLICATION supabase_realtime ADD TABLE public.transcripts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.transcript_translations;
