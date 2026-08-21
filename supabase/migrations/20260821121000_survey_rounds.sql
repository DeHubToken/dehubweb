-- Make the login survey re-runnable.
--
-- `user_feedback_surveys` was built for exactly one set of five questions, one
-- column each, asked once ever. 89 people answered it between March and August
-- and then it went quiet — not because nobody had anything left to say, but
-- because there was no way to ask a second time without a migration, a schema
-- change on the insert, and a way to tell round-two answers from round-one.
--
-- So: rounds. `survey_version` says which round a row belongs to, `answers`
-- holds that round's questions by key. A future round is now a new array in
-- UserFeedbackSurvey.tsx and a version bump — no SQL, and no ambiguity about
-- which question "How was it?" was.
--
-- The five original columns stay exactly as they are. Round 1's 89 rows keep
-- answering the queries that have always read them, and get survey_version 1
-- from the default.

ALTER TABLE public.user_feedback_surveys
  ADD COLUMN IF NOT EXISTS survey_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS answers JSONB NOT NULL DEFAULT '{}'::jsonb;

-- The gate the client runs on every login: "has this wallet answered THIS
-- round?". Without the version in the index that is a full scan of every round
-- ever run.
CREATE INDEX IF NOT EXISTS user_feedback_surveys_wallet_version_idx
  ON public.user_feedback_surveys (wallet_address, survey_version);

-- ── Read policy ──────────────────────────────────────────────────────────────
--
-- Was `USING (true)`, under the name "Users can view own survey responses" —
-- which is what it was for, but not what it said. Anyone holding the
-- publishable key could read all 89 rows, and those rows are wallet address
-- next to gender next to age range. The client only ever needs the count of
-- its own rows, so give it that and nothing else.
--
-- Analytics are unaffected: the SQL editor runs as service_role and bypasses
-- RLS entirely.

DROP POLICY IF EXISTS "Users can view own survey responses" ON public.user_feedback_surveys;
CREATE POLICY "Users can view own survey responses"
  ON public.user_feedback_surveys FOR SELECT
  USING (lower(wallet_address) = get_request_wallet_address());
