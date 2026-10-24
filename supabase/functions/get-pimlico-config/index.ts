const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-wallet-address, x-dehub-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-request-id, prefer',
};

// The URLs point at pimlico-rpc, which holds the key and relays to Pimlico.
// They used to be Pimlico's own URLs with `?apikey=` on the end, which handed
// the key to every visitor. The `/v2/{chainId}/rpc` tail is kept because both
// apps rewrite the chain id in place to reach the other chains.
Deno.serve((req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (!Deno.env.get('PIMLICO_API_KEY')) {
    console.error('[Pimlico Config] API key not configured');
    return new Response(
      JSON.stringify({ error: 'Pimlico API key not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const relay = `${Deno.env.get('SUPABASE_URL')}/functions/v1/pimlico-rpc/v2/8453/rpc`;
  return new Response(
    JSON.stringify({ bundlerUrl: relay, paymasterUrl: relay }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
