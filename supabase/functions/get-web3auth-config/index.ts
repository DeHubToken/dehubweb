import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const clientId = Deno.env.get('WEB3AUTH_CLIENT_ID');

    if (!clientId) {
      return new Response(
        JSON.stringify({ error: 'Web3Auth client ID not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Aggregate verifier config (optional — only returned if env vars are set)
    const aggregateVerifier = Deno.env.get('WEB3AUTH_AGGREGATE_VERIFIER') || null;
    const googleSubVerifier = Deno.env.get('WEB3AUTH_GOOGLE_SUB_VERIFIER') || null;
    const emailSubVerifier = Deno.env.get('WEB3AUTH_EMAIL_SUB_VERIFIER') || null;
    const googleClientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID') || null;

    const response: Record<string, unknown> = { clientId };

    // Only include aggregate config if all required vars are set
    if (aggregateVerifier && googleSubVerifier && emailSubVerifier && googleClientId) {
      response.aggregateVerifier = aggregateVerifier;
      response.googleSubVerifier = googleSubVerifier;
      response.emailSubVerifier = emailSubVerifier;
      response.googleClientId = googleClientId;
    }

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('[Web3Auth Config] Error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
