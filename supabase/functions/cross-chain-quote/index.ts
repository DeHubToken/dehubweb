const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const ONE_CLICK_API = 'https://1click.chaindefuser.com/v0';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    if (action === 'quote') {
      const body = await req.json();
      const { originAsset, destinationAsset, amount, recipient, amountType } = body;

      if (!originAsset || !destinationAsset || !amount || !recipient) {
        return new Response(JSON.stringify({ error: 'Missing required fields' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Build deadline 10 minutes from now
      const deadline = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      const quotePayload = {
        dry: false,
        swapType: amountType === 'out' ? 'EXACT_OUTPUT' : 'EXACT_INPUT',
        slippageTolerance: 100, // 1% (basis points)
        originAsset,
        depositType: 'ORIGIN_CHAIN',
        destinationAsset,
        amount,
        refundTo: recipient,
        refundType: 'ORIGIN_CHAIN',
        recipient,
        recipientType: 'DESTINATION_CHAIN',
        deadline,
      };

      const quoteRes = await fetch(`${ONE_CLICK_API}/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(quotePayload),
      });

      const quoteData = await quoteRes.json();

      return new Response(JSON.stringify(quoteData), {
        status: quoteRes.ok ? 200 : quoteRes.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'status') {
      const depositAddress = url.searchParams.get('depositAddress');
      if (!depositAddress) {
        return new Response(JSON.stringify({ error: 'Missing depositAddress' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const statusRes = await fetch(`${ONE_CLICK_API}/status/${depositAddress}`);
      const statusData = await statusRes.json();

      return new Response(JSON.stringify(statusData), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Use ?action=quote or ?action=status' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
