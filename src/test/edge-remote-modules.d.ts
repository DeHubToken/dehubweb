// Browser TypeScript uses the installed SDK types for the Edge handler fixture.
// Runtime tests replace these remote entry points before loading the handler.
declare module 'https://esm.sh/@supabase/supabase-js@2' {
  export { createClient, type SupabaseClient } from '@supabase/supabase-js';
}
declare module 'https://deno.land/std@0.168.0/http/server.ts' {
  export function serve(handler: (request: Request) => Response | Promise<Response>): void;
}
