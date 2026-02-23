import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-wallet-address, x-dehub-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-request-id, prefer',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const walletAddress = req.headers.get('x-wallet-address')?.toLowerCase();
    if (!walletAddress) {
      return new Response(JSON.stringify({ error: 'Missing wallet address' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { featureRequestId, voteType } = await req.json();

    if (!featureRequestId || (voteType !== 1 && voteType !== -1 && voteType !== 0)) {
      return new Response(JSON.stringify({ error: 'Invalid parameters' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    if (voteType === 0) {
      // Remove vote
      const { error } = await supabase
        .from('feature_request_votes')
        .delete()
        .eq('feature_request_id', featureRequestId)
        .eq('wallet_address', walletAddress);

      if (error) throw error;
    } else {
      // Upsert vote
      const { error } = await supabase
        .from('feature_request_votes')
        .upsert(
          {
            feature_request_id: featureRequestId,
            wallet_address: walletAddress,
            vote_type: voteType,
          },
          { onConflict: 'feature_request_id,wallet_address' }
        );

      if (error) throw error;
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Feature request vote error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
