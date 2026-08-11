-- Slow the ended-stage transcription poll from every 2 minutes to every 15
-- =========================================================================
-- `auto-transcribe-ended-stages` has been running on `*/2 * * * *` — 720 edge
-- function invocations a day, ~21,600 a month. Measured on 2026-08-11, every
-- single one of them was a no-op:
--
--   * `cron.job_run_details` recorded 2,160 runs over three days.
--   * Every response in `net._http_response` was, without exception,
--     `{"ok":true,"processed":0,"results":[]}`.
--   * `live_stream_sessions` holds 6 rows total. The most recent stage started
--     on 2026-07-10 — 33 days before this was written, and none in the 30 days
--     before it.
--   * `stage_transcripts` holds 6 rows, the newest from 2026-07-15.
--
-- So the poll has fired roughly 24,000 times since the last stage that ever
-- existed, to find nothing each time. A two-minute cadence is sized for a
-- continuously busy feature; stages currently happen about once a month.
--
-- 15 minutes cuts the invocations by 87% (720/day -> 96/day) and costs, in the
-- worst case, a 15-minute delay between a stage ending and its transcript
-- starting to process. Given that no stage has ended in a month, that latency
-- is theoretical today, and it is still well inside the window where a host
-- would come back to look for a transcript.
--
-- This is a cadence change, not the real fix. The poll exists because nothing
-- tells the system a stage ended; `end-stream-session` already runs at exactly
-- that moment and should trigger transcription directly, leaving this job as a
-- safety net that can drop to hourly. That change needs an edge function
-- deploy, so it is deliberately not bundled here — this migration is pure SQL
-- precisely so it can be applied through the SQL editor without one.
--
-- Reverting is a one-liner: pass '*/2 * * * *' instead.

do $$
declare
  v_jobid bigint;
begin
  select jobid
    into v_jobid
    from cron.job
   where jobname = 'auto-transcribe-ended-stages';

  if v_jobid is null then
    -- The job is created outside this repo (see the note below), so a fresh or
    -- already-cleaned database legitimately has nothing to alter.
    raise notice 'cron job auto-transcribe-ended-stages not found; nothing to do';
    return;
  end if;

  perform cron.alter_job(v_jobid, schedule => '*/15 * * * *');
end
$$;

-- Note for whoever migrates this project off Lovable: the edge function this
-- job calls, `auto-transcribe-ended-stages`, is deployed but exists nowhere in
-- this repository — it was created directly by the Lovable agent and never
-- committed. `git grep auto-transcribe-ended-stages` returns nothing but this
-- file. It will not survive a cutover unless it is exported first, and there
-- may be other functions in the same state.
