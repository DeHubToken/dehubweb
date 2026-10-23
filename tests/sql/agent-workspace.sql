\ir ../../supabase/migrations/20261023120000_agent_workspace.sql
DO $$
DECLARE target text;
BEGIN
  FOREACH target IN ARRAY ARRAY['ai_agent_controls','ai_agent_receipts','ai_agent_templates','ai_agent_news_cache'] LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid=('public.' || target)::regclass) THEN RAISE EXCEPTION 'RLS missing for %', target; END IF;
    IF has_table_privilege('anon', 'public.' || target, 'SELECT') OR has_table_privilege('authenticated', 'public.' || target, 'INSERT') THEN RAISE EXCEPTION 'Public access to %', target; END IF;
    IF NOT has_table_privilege('service_role', 'public.' || target, 'SELECT,INSERT,UPDATE') THEN RAISE EXCEPTION 'Service access missing for %', target; END IF;
  END LOOP;
END $$;
