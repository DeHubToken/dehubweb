-- Dedicated scheduler credential stays in Vault and never reaches the browser.
SELECT vault.create_secret(gen_random_uuid()::text||gen_random_uuid()::text,'trenchstar_scheduler_key')
WHERE NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name='trenchstar_scheduler_key');

CREATE OR REPLACE FUNCTION public.trench_scheduler_authorized(p_token text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public
AS $$ SELECT EXISTS(SELECT 1 FROM vault.decrypted_secrets WHERE name='trenchstar_scheduler_key' AND decrypted_secret=p_token) $$;
REVOKE ALL ON FUNCTION public.trench_scheduler_authorized(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.trench_scheduler_authorized(text) TO service_role;

SELECT cron.schedule('trenchstar-market-watch','* * * * *',$job$
  SELECT net.http_post(
    url := 'https://aigxuutjaqsywioxjefr.supabase.co/functions/v1/trenchstar',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='trenchstar_scheduler_key' LIMIT 1)),
    body := '{"action":"tick"}'::jsonb,
    timeout_milliseconds := 30000
  );
$job$);
