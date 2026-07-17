
CREATE TABLE public.ai_user_memories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  memory_type TEXT NOT NULL DEFAULT 'fact',
  content TEXT NOT NULL,
  importance INTEGER NOT NULL DEFAULT 5,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT unique_memory_content UNIQUE (wallet_address, content)
);

-- Index for fast lookups by wallet
CREATE INDEX idx_ai_user_memories_wallet ON public.ai_user_memories (wallet_address);

-- Enable RLS
ALTER TABLE public.ai_user_memories ENABLE ROW LEVEL SECURITY;

-- Users can view their own memories
CREATE POLICY "Users can view own memories"
  ON public.ai_user_memories FOR SELECT
  USING (lower(wallet_address) = public.get_request_wallet_address());

-- Users can create own memories
CREATE POLICY "Users can create own memories"
  ON public.ai_user_memories FOR INSERT
  WITH CHECK (lower(wallet_address) = public.get_request_wallet_address());

-- Users can update own memories
CREATE POLICY "Users can update own memories"
  ON public.ai_user_memories FOR UPDATE
  USING (lower(wallet_address) = public.get_request_wallet_address());

-- Users can delete own memories
CREATE POLICY "Users can delete own memories"
  ON public.ai_user_memories FOR DELETE
  USING (lower(wallet_address) = public.get_request_wallet_address());
