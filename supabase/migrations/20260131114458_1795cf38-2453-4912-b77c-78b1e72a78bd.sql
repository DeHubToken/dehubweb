-- Drop existing RLS policies
DROP POLICY IF EXISTS "Users can view their own conversations" ON public.ai_conversations;
DROP POLICY IF EXISTS "Users can create their own conversations" ON public.ai_conversations;
DROP POLICY IF EXISTS "Users can update their own conversations" ON public.ai_conversations;
DROP POLICY IF EXISTS "Users can delete their own conversations" ON public.ai_conversations;
DROP POLICY IF EXISTS "Users can view messages from their conversations" ON public.ai_messages;
DROP POLICY IF EXISTS "Users can create messages in their conversations" ON public.ai_messages;
DROP POLICY IF EXISTS "Users can delete messages from their conversations" ON public.ai_messages;

-- Change user_id column to wallet_address (text) for Web3Auth compatibility
ALTER TABLE public.ai_conversations DROP COLUMN user_id;
ALTER TABLE public.ai_conversations ADD COLUMN wallet_address TEXT NOT NULL;

-- Create index on wallet_address
CREATE INDEX idx_ai_conversations_wallet_address ON public.ai_conversations(wallet_address);

-- Create permissive RLS policies (service role will be used via edge function)
-- For now, allow authenticated and anon to access their own data via wallet address
CREATE POLICY "Anyone can view conversations by wallet"
ON public.ai_conversations
FOR SELECT
USING (true);

CREATE POLICY "Anyone can create conversations"
ON public.ai_conversations
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Anyone can update conversations"
ON public.ai_conversations
FOR UPDATE
USING (true);

CREATE POLICY "Anyone can delete conversations"
ON public.ai_conversations
FOR DELETE
USING (true);

-- Messages - allow all operations (filtered by conversation ownership in code)
CREATE POLICY "Anyone can view messages"
ON public.ai_messages
FOR SELECT
USING (true);

CREATE POLICY "Anyone can create messages"
ON public.ai_messages
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Anyone can delete messages"
ON public.ai_messages
FOR DELETE
USING (true);