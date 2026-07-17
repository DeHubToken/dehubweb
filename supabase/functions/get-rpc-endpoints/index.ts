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
    const alchemyKey = Deno.env.get('ALCHEMY_API_KEY');
    
    if (!alchemyKey) {
      console.error('[RPC Endpoints] ALCHEMY_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'RPC configuration not available' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[RPC Endpoints] Successfully retrieved Alchemy configuration');

    return new Response(
      JSON.stringify({
        base: `https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`,
        bsc: `https://bnb-mainnet.g.alchemy.com/v2/${alchemyKey}`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[RPC Endpoints] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
