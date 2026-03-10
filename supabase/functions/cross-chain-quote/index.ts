import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const ONE_CLICK_API = 'https://1click.chaindefuser.com/v0';

serve(async (req) => {
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

      const quotePayload: Record<string, unknown> = {
        defuse_asset_identifier_in: originAsset,
        defuse_asset_identifier_out: destinationAsset,
        exact_amount_in: amountType === 'in' ? amount : undefined,
        exact_amount_out: amountType === 'out' ? amount : undefined,
        min_deadline_ms: 600000, // 10 minutes
        destination: recipient,
      };

      // Default to exact_amount_in if no type specified
      if (!amountType || amountType === 'in') {
        quotePayload.exact_amount_in = amount;
        delete quotePayload.exact_amount_out;
      }

      const quoteRes = await fetch(`${ONE_CLICK_API}/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(quotePayload),
      });

      const quoteData = await quoteRes.json();

      if (!quoteRes.ok) {
        return new Response(JSON.stringify({ error: quoteData?.error || 'Quote failed', details: quoteData }), {
          status: quoteRes.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify(quoteData), {
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

      const statusRes = await fetch(`${ONE_CLICK_API}/status/${depositAddress}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      const statusData = await statusRes.json();

      return new Response(JSON.stringify(statusData), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action. Use ?action=quote or ?action=status' }), {
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
