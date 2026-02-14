const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-wallet-address, x-dehub-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const DEHUB_API_BASE = 'https://api.dehub.io';

function jsonOk(data: Record<string, unknown>): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonOk({ ok: false, error: 'Method not allowed' });
  }

  const walletAddress = req.headers.get('x-wallet-address')?.toLowerCase() || '';
  const dehubToken = req.headers.get('x-dehub-token') || '';

  if (!walletAddress) {
    return jsonOk({ ok: false, error: 'x-wallet-address header is required' });
  }

  if (!dehubToken) {
    return jsonOk({ ok: false, error: 'x-dehub-token header is required' });
  }

  try {
    const body = await req.json();
    const {
      sender,
      receiver,
      conversationId,
      content,
      type = 'text',
      tipAmount,
      tipCurrency,
    } = body;

    if (!content && type === 'text') {
      return jsonOk({ ok: false, error: 'content is required for text messages' });
    }

    if (!conversationId && !receiver) {
      return jsonOk({ ok: false, error: 'conversationId or receiver is required' });
    }

    // Build the request body for DeHub API
    // API expects: senderAddress, receiverAddress, content, type
    const dmBody: Record<string, unknown> = {
      senderAddress: sender || walletAddress,
      content,
      type,
    };

    if (receiver) {
      dmBody.receiverAddress = receiver.toLowerCase();
    }
    if (conversationId) {
      dmBody.conversationId = conversationId;
    }

    if (type === 'tip' && tipAmount !== undefined) {
      dmBody.tipAmount = tipAmount;
      dmBody.tipCurrency = tipCurrency || 'DHB';
    }

    console.log(`[dm-send] Sending DM from ${walletAddress}`, {
      hasReceiver: !!receiver,
      hasConversationId: !!conversationId,
      type,
      dmBody,
    });

    // Proxy request to DeHub API
    const response = await fetch(`${DEHUB_API_BASE}/api/dm/tnx`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${dehubToken}`,
      },
      body: JSON.stringify(dmBody),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error('[dm-send] DeHub API error:', {
        httpStatus: response.status,
        data,
      });
      // Always return 200 so client can read the error details
      return jsonOk({
        ok: false,
        httpStatus: response.status,
        error: data.message || data.error || `DeHub API error: ${response.status}`,
        dehubResponse: data,
      });
    }

    console.log('[dm-send] Message sent successfully:', data);
    return jsonOk({ ok: true, result: data });
  } catch (err) {
    console.error('[dm-send] Unexpected error:', err);
    return jsonOk({ ok: false, error: String(err) });
  }
});
