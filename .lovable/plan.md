

## Create Client Error Logs Table and Deploy Edge Function

### Step 1: Database Migration
Run a SQL migration to create the `client_error_logs` table with RLS policies:

```sql
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
```

### Step 2: Deploy Edge Function
Deploy the existing `client-logs` edge function (already coded at `supabase/functions/client-logs/index.ts`). It is already configured in `supabase/config.toml` with `verify_jwt = false` to allow logging from unauthenticated users.

### Step 3: Add config.toml entry (if missing)
Add the following to `supabase/config.toml`:
```toml
[functions.client-logs]
verify_jwt = false
```

No code changes are needed -- the edge function and client-side logger (`src/lib/logger.ts`) are already implemented and wired up.

