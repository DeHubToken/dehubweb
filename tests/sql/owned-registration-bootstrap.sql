CREATE TABLE public.ai_agents(
 id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),name text NOT NULL UNIQUE,description text,
 api_key text NOT NULL UNIQUE,owner_wallet_address text NOT NULL,human_owner_wallet text,wallet_private_key text,
 is_active boolean DEFAULT true,metadata jsonb DEFAULT '{}',created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),last_active_at timestamptz
);
ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.ai_agents TO service_role;
GRANT SELECT(id,name,description,owner_wallet_address,human_owner_wallet,is_active) ON public.ai_agents TO anon,authenticated;
GRANT UPDATE(name,description,is_active),DELETE ON public.ai_agents TO anon,authenticated;
CREATE POLICY "Agents are publicly listable" ON public.ai_agents FOR SELECT TO anon,authenticated USING(true);
CREATE POLICY "Owners can delete their own agents" ON public.ai_agents FOR DELETE TO anon,authenticated USING(false);
CREATE POLICY "Owners can update their own agents" ON public.ai_agents FOR UPDATE TO anon,authenticated USING(false) WITH CHECK(false);
CREATE POLICY "Service role full access agents" ON public.ai_agents FOR ALL TO service_role USING(true) WITH CHECK(true);
