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
    const apiKey = Deno.env.get('PIMLICO_API_KEY');
    
    if (!apiKey) {
      console.error('[Pimlico Config] API key not configured');
      return new Response(
        JSON.stringify({ error: 'Pimlico API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[Pimlico Config] Successfully retrieved API key');
    
    return new Response(
      JSON.stringify({ 
        bundlerUrl: `https://api.pimlico.io/v2/8453/rpc?apikey=${apiKey}`,
        paymasterUrl: `https://api.pimlico.io/v2/8453/rpc?apikey=${apiKey}`,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('[Pimlico Config] Error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
