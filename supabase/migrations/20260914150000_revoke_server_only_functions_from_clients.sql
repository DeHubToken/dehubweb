-- ============================================================================
-- Take server-only SECURITY DEFINER functions back off the anon key
-- ============================================================================
-- `REVOKE ALL ON FUNCTION ... FROM PUBLIC` does not do what the migrations that
-- used it assumed. Supabase ships this project with
--
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public
--     GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
--
-- so every function created in `public` gets *explicit* EXECUTE grants to anon
-- and authenticated at CREATE time. Revoking from PUBLIC clears the implicit
-- grant every role has and leaves those two explicit ones untouched — and
-- CREATE OR REPLACE never re-evaluates the ACL, so a later redefinition does
-- not clean it up either. The result: functions written to be reachable only
-- from an edge function under the service role have been callable over
-- PostgREST by anyone holding the publishable anon key, which ships in every
-- browser bundle.
--
-- Confirmed against production before this migration, with the anon key only:
--
--   POST /rest/v1/rpc/get_user_id_by_phone   -> 200  (phone → user id)
--   POST /rest/v1/rpc/consume_phone_otp      -> 200
--   POST /rest/v1/rpc/upsert_phone_otp       -> 400 not-null violation from
--                                               inside the function body, i.e.
--                                               executed, not rejected
--   POST /rest/v1/rpc/stage_dub_unsettled    -> 200
--
-- The worst of those is upsert_phone_otp: it lets an unauthenticated caller
-- plant a code hash of their choosing for any phone number, then redeem it
-- through the public verify-phone-otp endpoint and receive a real session for
-- that account. Everything in this list is server-only by design — every caller
-- in dehubweb and dehub-mobile goes through an edge function holding
-- SUPABASE_SERVICE_ROLE_KEY, and none of them appear in an RLS policy — so the
-- grants buy nothing and are removed.
--
-- The correct shape to copy is get_user_id_by_email
-- (20260914120000_get_user_id_by_email.sql): revoke from PUBLIC *and* from
-- anon, authenticated, then grant to service_role.
--
-- Naming the functions rather than their signatures covers every overload and
-- keeps a signature typo from silently revoking nothing; the guard at the end
-- fails the migration if a listed name matches no function at all.

DO $$
DECLARE
  -- Server-only. Reached exclusively from edge functions under the service role.
  targets text[] := ARRAY[
    -- Phone login (request-phone-otp / verify-phone-otp)
    'upsert_phone_otp',                  -- plant an OTP for any number
    'consume_phone_otp',                 -- redeem/burn attempts for any number
    'get_user_id_by_phone',              -- phone → account enumeration
    -- Billing (payments-webhook)
    'claim_xl_cashback_slot',            -- flips xl_cashback_eligible on a subscription
    -- AI agent quotas (dehub-mcp)
    'consume_agent_rate_limit',          -- drain another agent's budget
    -- Paid dubbing meter (dub-session)
    'stage_dub_tick',                    -- bill dub minutes against any wallet
    'stage_dub_unsettled',               -- read any wallet's outstanding balance
    -- View ledger (anon-views)
    'record_anonymous_views',            -- write view rows with a chosen viewer hash
    -- Retention jobs
    'cleanup_old_client_error_logs',
    'cleanup_old_story_views',
    'cleanup_old_leaderboard_snapshots',
    'cleanup_old_anonymous_post_views',
    -- Internal helpers with no caller outside the database
    'bulk_insert_category_log',          -- arbitrary rows into category_post_log
    'community_log'                      -- forge community_admin_log entries
  ];
  missing text[] := '{}';
  name text;
  r record;
BEGIN
  FOREACH name IN ARRAY targets LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = name
    ) THEN
      missing := missing || name;
    END IF;
  END LOOP;

  IF array_length(missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'no public function named: %', array_to_string(missing, ', ');
  END IF;

  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY (targets)
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;
