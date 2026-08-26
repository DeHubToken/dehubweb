-- Public bounty numbers.
--
-- Bounties were shared as /work/<uuid>. Nothing about a uuid is memorable,
-- quotable or countable, and the edge worker could not build a per-bounty
-- share card for a URL space it had no way to enumerate. Give every row the
-- same kind of short public handle community_events already has
-- (event_number, migration 20260406073632) so the share form becomes
-- dehub.io/bounty/7.
--
-- The uuid stays the primary key and every foreign key still points at it —
-- this column is for URLs only. Old /work/<uuid> links keep resolving: the
-- worker 301s them and the SPA redirects them, both by looking the row up and
-- reading job_number back out.
CREATE SEQUENCE IF NOT EXISTS public.work_jobs_job_number_seq;

ALTER TABLE public.work_jobs
  ADD COLUMN IF NOT EXISTS job_number INTEGER NOT NULL
  DEFAULT nextval('public.work_jobs_job_number_seq');

-- Existing rows number in posting order, so the oldest bounty is /bounty/1 and
-- the numbers read as a chronology rather than as insertion noise.
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) AS rn
  FROM public.work_jobs
)
UPDATE public.work_jobs j
SET job_number = n.rn
FROM numbered n
WHERE j.id = n.id;

-- ADD COLUMN already burned one sequence value per existing row, and the
-- backfill above overwrote them, so the sequence has to be re-pointed at the
-- real maximum. `is_called` is false only when the table is empty — setval
-- rejects a value below the sequence minimum, so an empty table parks at 1
-- un-called and the first insert still gets 1.
SELECT setval(
  'public.work_jobs_job_number_seq',
  GREATEST(COALESCE((SELECT MAX(job_number) FROM public.work_jobs), 0), 1),
  EXISTS (SELECT 1 FROM public.work_jobs)
);

ALTER TABLE public.work_jobs
  ADD CONSTRAINT work_jobs_job_number_unique UNIQUE (job_number);
