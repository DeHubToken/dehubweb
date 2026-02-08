-- Add wallet_private_key column to ai_agents for storing generated Ethereum private keys
ALTER TABLE public.ai_agents
ADD COLUMN wallet_private_key text;

-- Add a comment for clarity
COMMENT ON COLUMN public.ai_agents.wallet_private_key IS 'Generated Ethereum private key for agent wallet authentication with DeHub API';