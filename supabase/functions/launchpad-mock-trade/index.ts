// Mock launchpad trade endpoint. No real chain interaction in Phase 1.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const CURVE = {
  virtualDHB: 30_000,
  virtualSupply: 1_073_000_000,
  totalSupply: 1_000_000_000,
};

function buyQuote(supplySold: number, dhbCollected: number, dhbIn: number) {
  const k = CURVE.virtualDHB * CURVE.virtualSupply;
  const newDHB = CURVE.virtualDHB + dhbCollected + dhbIn;
  const newRemaining = k / newDHB;
  const remaining = CURVE.virtualSupply - supplySold;
  const tokensOut = Math.max(0, remaining - newRemaining);
  const avgPrice = tokensOut > 0 ? dhbIn / tokensOut : 0;
  return { tokensOut, avgPrice };
}
function sellQuote(supplySold: number, dhbCollected: number, tokensIn: number) {
  const k = CURVE.virtualDHB * CURVE.virtualSupply;
  const remaining = CURVE.virtualSupply - supplySold;
  const newRemaining = remaining + tokensIn;
  const newDHB = k / newRemaining;
  const dhbOut = Math.max(0, (CURVE.virtualDHB + dhbCollected) - newDHB);
  const avgPrice = tokensIn > 0 ? dhbOut / tokensIn : 0;
  return { dhbOut, avgPrice };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const { token_id, side, amount, trader_address } = body ?? {};
    if (!token_id || !trader_address || (side !== 'buy' && side !== 'sell') || !(Number(amount) > 0)) {
      return new Response(JSON.stringify({ error: 'invalid input' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: token, error: tErr } = await admin
      .from('launchpad_tokens').select('id, supply_sold, status').eq('id', token_id).single();
    if (tErr || !token) {
      return new Response(JSON.stringify({ error: 'token not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (token.status !== 'bonding') {
      return new Response(JSON.stringify({ error: 'trading closed (graduated)' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Sum dhbCollected from prior trades
    const { data: trades } = await admin
      .from('launchpad_trades').select('side, dhb_in').eq('token_id', token_id);
    const dhbCollected = (trades ?? []).reduce(
      (s: number, t: { side: string; dhb_in: number }) => s + (t.side === 'buy' ? Number(t.dhb_in) : -Number(t.dhb_in)),
      0,
    );

    let dhb_in: number, tokens_out: number, price_per_token: number;
    if (side === 'buy') {
      const q = buyQuote(Number(token.supply_sold), dhbCollected, Number(amount));
      dhb_in = Number(amount);
      tokens_out = q.tokensOut;
      price_per_token = q.avgPrice;
    } else {
      const q = sellQuote(Number(token.supply_sold), dhbCollected, Number(amount));
      dhb_in = q.dhbOut;
      tokens_out = Number(amount);
      price_per_token = q.avgPrice;
    }

    const { data: trade, error: insErr } = await admin.from('launchpad_trades').insert({
      token_id, trader_address: String(trader_address).toLowerCase(),
      side, dhb_in, tokens_out, price_per_token,
    }).select().single();
    if (insErr) {
      return new Response(JSON.stringify({ error: insErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ trade }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
