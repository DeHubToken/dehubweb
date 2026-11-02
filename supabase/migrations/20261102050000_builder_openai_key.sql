-- Builder reads its OpenAI key from Supabase Vault (secret name: openai_api_key)
-- when OPENAI_API_KEY is not set on the edge function. Only the service role
-- can call this.
create or replace function public.builder_openai_key()
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'openai_api_key' limit 1;
$$;

revoke all on function public.builder_openai_key() from public, anon, authenticated;
grant execute on function public.builder_openai_key() to service_role;

notify pgrst, 'reload schema';
