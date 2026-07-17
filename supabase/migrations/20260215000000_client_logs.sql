-- Create a table for logging client-side errors and playback issues
CREATE TABLE IF NOT EXISTS public.client_error_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now(),
    level TEXT NOT NULL, -- 'error', 'warn', 'info'
    component TEXT, -- e.g., 'LiveStreamCard', 'Web3Auth'
    message TEXT NOT NULL,
    stack_trace TEXT,
    metadata JSONB, -- store extra info like stream_id, user_address, browser
    user_address TEXT
);

-- Access control: allow anyone to insert (so we can log even for non-auth users)
ALTER TABLE public.client_error_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous log insertion" 
ON public.client_error_logs 
FOR INSERT 
WITH CHECK (true);

-- Allow authenticated users or service role to read for debugging
CREATE POLICY "Allow authenticated read access" 
ON public.client_error_logs 
FOR SELECT 
USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');
