CREATE TABLE IF NOT EXISTS public.client_error_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now(),
    level TEXT NOT NULL,
    component TEXT,
    message TEXT NOT NULL,
    stack_trace TEXT,
    metadata JSONB,
    user_address TEXT
);

ALTER TABLE public.client_error_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous log insertion" 
ON public.client_error_logs 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow authenticated read access" 
ON public.client_error_logs 
FOR SELECT 
USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');