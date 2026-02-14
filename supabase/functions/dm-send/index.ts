const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-wallet-address, x-dehub-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const DEHUB_API_BASE = 'https://api.dehub.io';

interface ApiResponse<T> {
  status: boolean;
  result: T | null;
  message: string;
}

function jsonResponse<T>(data: ApiResponse<T>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ status: false, result: null, message }, status);
}

function successResponse<T>(result: T, message = 'Success'): Response {
  return jsonResponse({ status: true, result, message });
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  const walletAddress = req.headers.get('x-wallet-address')?.toLowerCase() || '';
  const dehubToken = req.headers.get('x-dehub-token') || '';

  if (!walletAddress) {
    return errorResponse('x-wallet-address header is required', 401);
  }

  if (!dehubToken) {
    return errorResponse('x-dehub-token header is required', 401);
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
      return errorResponse('content is required for text messages');
    }

    if (!conversationId && !receiver) {
      return errorResponse('conversationId or receiver is required');
    }

    // Build the request body for DeHub API
    const dmBody: Record<string, unknown> = {
      sender: sender || walletAddress,
      content,
      type,
    };

    if (receiver) {
      dmBody.receiver = receiver.toLowerCase();
    } else {
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
        status: response.status,
        data,
      });
      return errorResponse(
        data.message || data.error || `DeHub API error: ${response.status}`,
        response.status
      );
    }

    console.log('[dm-send] Message sent successfully:', data);
    return successResponse(data);
  } catch (err) {
    console.error('[dm-send] Unexpected error:', err);
    return errorResponse('Internal server error', 500);
  }
});
