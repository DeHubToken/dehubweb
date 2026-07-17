-- Drop existing overly permissive policies on ai_conversations
DROP POLICY IF EXISTS "Anyone can view conversations by wallet" ON public.ai_conversations;
DROP POLICY IF EXISTS "Anyone can create conversations" ON public.ai_conversations;
DROP POLICY IF EXISTS "Anyone can update conversations" ON public.ai_conversations;
DROP POLICY IF EXISTS "Anyone can delete conversations" ON public.ai_conversations;

-- Drop existing overly permissive policies on ai_messages
DROP POLICY IF EXISTS "Anyone can view messages" ON public.ai_messages;
DROP POLICY IF EXISTS "Anyone can create messages" ON public.ai_messages;
DROP POLICY IF EXISTS "Anyone can delete messages" ON public.ai_messages;

-- Create a function to get the current wallet address from request headers
-- This allows us to use wallet-based auth in RLS policies
CREATE OR REPLACE FUNCTION public.get_request_wallet_address()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT LOWER(COALESCE(
    current_setting('request.headers', true)::json->>'x-wallet-address',
    ''
  ));
$$;

-- Create secure policies for ai_conversations
-- Users can only see their own conversations
CREATE POLICY "Users can view own conversations"
ON public.ai_conversations
FOR SELECT
USING (
  LOWER(wallet_address) = public.get_request_wallet_address()
);

-- Users can only create conversations for their own wallet
CREATE POLICY "Users can create own conversations"
ON public.ai_conversations
FOR INSERT
WITH CHECK (
  LOWER(wallet_address) = public.get_request_wallet_address()
);

-- Users can only update their own conversations
CREATE POLICY "Users can update own conversations"
ON public.ai_conversations
FOR UPDATE
USING (
  LOWER(wallet_address) = public.get_request_wallet_address()
);

-- Users can only delete their own conversations
CREATE POLICY "Users can delete own conversations"
ON public.ai_conversations
FOR DELETE
USING (
  LOWER(wallet_address) = public.get_request_wallet_address()
);

-- Create secure policies for ai_messages
-- Users can view messages from their own conversations
CREATE POLICY "Users can view own messages"
ON public.ai_messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.ai_conversations
    WHERE ai_conversations.id = ai_messages.conversation_id
    AND LOWER(ai_conversations.wallet_address) = public.get_request_wallet_address()
  )
);

-- Users can create messages in their own conversations
CREATE POLICY "Users can create own messages"
ON public.ai_messages
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.ai_conversations
    WHERE ai_conversations.id = ai_messages.conversation_id
    AND LOWER(ai_conversations.wallet_address) = public.get_request_wallet_address()
  )
);

-- Users can delete messages from their own conversations
CREATE POLICY "Users can delete own messages"
ON public.ai_messages
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.ai_conversations
    WHERE ai_conversations.id = ai_messages.conversation_id
    AND LOWER(ai_conversations.wallet_address) = public.get_request_wallet_address()
  )
);