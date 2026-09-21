-- Guided onboarding ("Getting started") and its friction map
-- ==========================================================
-- Two tables behind one feature: an opt-in, multi-day checklist that walks a
-- new member through the seven things that make DeHub usable, and the event
-- log that says where people actually stop.
--
-- Why a row and not sessionStorage: `dehub_is_new_account` is set once per
-- login session, and the checklist is deliberately not a single sitting —
-- somebody who sets a username on Monday and makes their first post on
-- Thursday is the normal case, not the edge one. A session flag forgets them
-- overnight, and a localStorage flag forgets them on the next device.
--
-- Why a separate event table rather than reading progress: `steps` is the
-- current state and is overwritten, so it can never answer "how many people
-- saw step four and never came back". Drop-off is a question about history.

-- ── Progress ────────────────────────────────────────────────────────────────
-- One row per member. `steps` maps step id -> {done, at, rating, skipped};
-- jsonb rather than a child table because nothing ever queries one step across
-- members from the client — the admin side reads the event log instead.
CREATE TABLE IF NOT EXISTS public.onboarding_progress (
  wallet_address TEXT PRIMARY KEY,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at   TIMESTAMPTZ,
  dismissed_at   TIMESTAMPTZ,
  steps          JSONB NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.onboarding_progress ENABLE ROW LEVEL SECURITY;

-- Owner-only, on every verb. Same wallet-header scheme as the rest of the
-- Supabase side. There is no public read: what somebody has and has not
-- managed to do yet is not a thing to publish next to their handle.
CREATE POLICY "Users can read their own onboarding progress"
  ON public.onboarding_progress FOR SELECT
  USING (lower(wallet_address) = get_request_wallet_address());

CREATE POLICY "Users can start their own onboarding"
  ON public.onboarding_progress FOR INSERT
  WITH CHECK (lower(wallet_address) = get_request_wallet_address());

CREATE POLICY "Users can update their own onboarding progress"
  ON public.onboarding_progress FOR UPDATE
  USING (lower(wallet_address) = get_request_wallet_address())
  WITH CHECK (lower(wallet_address) = get_request_wallet_address());

-- ── Events ──────────────────────────────────────────────────────────────────
-- Append-only. One row per thing that happened to a step.
CREATE TABLE IF NOT EXISTS public.onboarding_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  step_id        TEXT NOT NULL,
  action         TEXT NOT NULL
                   CHECK (action IN ('view', 'complete', 'skip', 'rating', 'dismiss', 'finish')),
  rating         TEXT CHECK (rating IS NULL OR rating IN ('easy', 'hard')),
  at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS onboarding_events_step_action_idx
  ON public.onboarding_events (step_id, action);
CREATE INDEX IF NOT EXISTS onboarding_events_at_idx
  ON public.onboarding_events (at DESC);
-- Drop-off is "each member's last event", which is a per-wallet ordering.
CREATE INDEX IF NOT EXISTS onboarding_events_wallet_at_idx
  ON public.onboarding_events (wallet_address, at DESC);

ALTER TABLE public.onboarding_events ENABLE ROW LEVEL SECURITY;

-- Insert only, own wallet only. No SELECT policy of any kind: the friction map
-- is a whole-platform read and belongs to the service role, not to anyone
-- holding the publishable key. A client that could read this table could
-- enumerate who is struggling with what.
CREATE POLICY "Users can record their own onboarding events"
  ON public.onboarding_events FOR INSERT
  WITH CHECK (lower(wallet_address) = get_request_wallet_address());

-- Table privileges, spelled out rather than left to the project's defaults.
-- RLS decides which rows; these decide whether PostgREST will talk about the
-- table at all. Note what is absent: no SELECT on `onboarding_events` for
-- anyone but the service role, and no DELETE anywhere — an append-only log
-- that its subject can erase is not a log.
GRANT SELECT, INSERT, UPDATE ON public.onboarding_progress TO anon, authenticated;
GRANT INSERT ON public.onboarding_events TO anon, authenticated;

-- ── Admin reads ─────────────────────────────────────────────────────────────
-- Mirrors 20260914190000_page_view_admin_reads.sql: SECURITY DEFINER, pinned
-- search_path, revoked from everyone and granted to service_role only. The
-- caller is the `admin-onboarding-friction` edge function, which verifies a
-- SUPER_ADMIN token against api.dehub.io before it touches the key.

-- Per step: who saw it, who finished it, who skipped it, and how it felt.
-- Counted over distinct wallets rather than rows, because a step viewed on
-- four visits is one person who has not done it yet, not four.
CREATE OR REPLACE FUNCTION public.admin_onboarding_funnel(p_since TIMESTAMPTZ)
RETURNS TABLE (
  step_id             TEXT,
  viewers             BIGINT,
  completions         BIGINT,
  skips               BIGINT,
  easy_count          BIGINT,
  hard_count          BIGINT,
  median_seconds      DOUBLE PRECISION
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH scoped AS (
    SELECT * FROM public.onboarding_events WHERE at >= p_since
  ),
  -- Time to complete is measured from the first view of that step by that
  -- wallet, so a member who opened the checklist on Monday and finished the
  -- step on Thursday reads as three days, which is the honest number.
  spans AS (
    SELECT
      c.step_id,
      EXTRACT(EPOCH FROM (c.at - v.first_view)) AS seconds
    FROM (
      SELECT step_id, wallet_address, min(at) AS at
      FROM scoped WHERE action = 'complete'
      GROUP BY 1, 2
    ) c
    JOIN (
      SELECT step_id, wallet_address, min(at) AS first_view
      FROM scoped WHERE action = 'view'
      GROUP BY 1, 2
    ) v ON v.step_id = c.step_id AND v.wallet_address = c.wallet_address
    WHERE c.at >= v.first_view
  )
  SELECT
    s.step_id,
    count(DISTINCT s.wallet_address) FILTER (WHERE s.action = 'view')::BIGINT,
    count(DISTINCT s.wallet_address) FILTER (WHERE s.action = 'complete')::BIGINT,
    count(DISTINCT s.wallet_address) FILTER (WHERE s.action = 'skip')::BIGINT,
    count(*) FILTER (WHERE s.action = 'rating' AND s.rating = 'easy')::BIGINT,
    count(*) FILTER (WHERE s.action = 'rating' AND s.rating = 'hard')::BIGINT,
    (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY sp.seconds)
       FROM spans sp WHERE sp.step_id = s.step_id)
  FROM scoped s
  GROUP BY s.step_id;
$$;

-- Per step: how many members' most recent onboarding event was on that step.
-- That is the friction map's headline — the place people stop and do not come
-- back — and it is why the event log exists at all.
CREATE OR REPLACE FUNCTION public.admin_onboarding_dropoff(p_since TIMESTAMPTZ)
RETURNS TABLE (step_id TEXT, last_action TEXT, users BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH last_event AS (
    SELECT DISTINCT ON (wallet_address)
      wallet_address, step_id, action
    FROM public.onboarding_events
    WHERE at >= p_since
    ORDER BY wallet_address, at DESC
  )
  SELECT step_id, action, count(*)::BIGINT
  FROM last_event
  -- 'finish' is the end of the walkthrough, not somewhere anyone is stuck.
  WHERE action <> 'finish'
  GROUP BY 1, 2
  ORDER BY 3 DESC;
$$;

-- Headline counts, so the panel does not have to sum a funnel to say how many
-- people have taken the tour at all.
CREATE OR REPLACE FUNCTION public.admin_onboarding_totals(p_since TIMESTAMPTZ)
RETURNS TABLE (started BIGINT, completed BIGINT, dismissed BIGINT, active BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    count(*) FILTER (WHERE started_at >= p_since)::BIGINT,
    count(*) FILTER (WHERE completed_at IS NOT NULL AND completed_at >= p_since)::BIGINT,
    count(*) FILTER (WHERE dismissed_at IS NOT NULL AND dismissed_at >= p_since)::BIGINT,
    count(*) FILTER (
      WHERE completed_at IS NULL AND dismissed_at IS NULL AND started_at >= p_since
    )::BIGINT
  FROM public.onboarding_progress;
$$;

REVOKE ALL ON FUNCTION public.admin_onboarding_funnel(timestamptz) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_onboarding_dropoff(timestamptz) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_onboarding_totals(timestamptz) FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_onboarding_funnel(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_onboarding_dropoff(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_onboarding_totals(timestamptz) TO service_role;
