-- Create AI agents table (human-linked model)
CREATE TABLE public.ai_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  api_key TEXT NOT NULL UNIQUE,
  owner_wallet_address TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}',
  last_active_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Rate limiting table for AI agents
CREATE TABLE public.ai_agent_rate_limits (
  agent_id UUID REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  count INTEGER DEFAULT 0,
  window_start TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (agent_id, action_type)
);

-- Indexes for performance
CREATE INDEX idx_ai_agents_api_key ON public.ai_agents(api_key);
CREATE INDEX idx_ai_agents_owner_wallet ON public.ai_agents(owner_wallet_address);
CREATE INDEX idx_ai_agents_active ON public.ai_agents(is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_rate_limits ENABLE ROW LEVEL SECURITY;

-- RLS policies - owners can manage their own agents
CREATE POLICY "Users can view their own agents" ON public.ai_agents
  FOR SELECT USING (LOWER(owner_wallet_address) = public.get_request_wallet_address());

CREATE POLICY "Users can create agents" ON public.ai_agents
  FOR INSERT WITH CHECK (LOWER(owner_wallet_address) = public.get_request_wallet_address());

CREATE POLICY "Users can update their own agents" ON public.ai_agents
  FOR UPDATE USING (LOWER(owner_wallet_address) = public.get_request_wallet_address());

CREATE POLICY "Users can delete their own agents" ON public.ai_agents
  FOR DELETE USING (LOWER(owner_wallet_address) = public.get_request_wallet_address());

-- Service role policies for edge functions
CREATE POLICY "Service role full access agents" ON public.ai_agents
  FOR ALL USING (true);

CREATE POLICY "Service role full access rate limits" ON public.ai_agent_rate_limits
  FOR ALL USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_ai_agents_updated_at
  BEFORE UPDATE ON public.ai_agents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();