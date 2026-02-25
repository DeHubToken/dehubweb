import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-wallet-address, x-dehub-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-request-id, prefer',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const DEHUB_API_BASE = 'https://api.dehub.io';

function jsonOk(data: Record<string, unknown>): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonOk({ ok: false, error: 'Method not allowed' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

    if (!content && type === 'text' && !body.mediaUrl) {
      return jsonOk({ ok: false, error: 'content is required for text messages' });
    }

    if (!conversationId && !receiver) {
      return jsonOk({ ok: false, error: 'conversationId or receiver is required' });
    }

    // Determine receiver address - needed for Supabase and potentially DeHub
    let targetReceiver = receiver?.toLowerCase();

    // If we only have a conversationId that is a wallet address (new_0x...), extract it
    if (!targetReceiver && conversationId?.startsWith('0x')) {
      targetReceiver = conversationId.toLowerCase();
    }

    // Build the request body for DeHub API
    const dmBody: Record<string, unknown> = {
      senderAddress: sender || walletAddress,
      content,
      type,
      transactionHash: body.transactionHash || `0x${Date.now().toString(16)}`,
    };

    if (targetReceiver) {
      dmBody.receiverAddress = targetReceiver;
    }
    if (conversationId && !conversationId.startsWith('new_')) {
      dmBody.conversationId = conversationId;
    }

    if (type === 'tip' && tipAmount !== undefined) {
      dmBody.tipAmount = tipAmount;
      dmBody.tipCurrency = tipCurrency || 'DHB';
    }

    console.log(`[dm-send] Sending DM from ${walletAddress}`, {
      targetReceiver,
      conversationId,
      type,
    });

    // 1. Attempt to send via DeHub API (bounded timeout so Supabase fallback always runs)
    let dehubData: any = {};
    let dehubOk = false;

    const shouldCallDeHub = !(conversationId?.startsWith('new_') || conversationId?.startsWith('0x'));

    if (shouldCallDeHub) {
      try {
        const response = await fetchWithTimeout(`${DEHUB_API_BASE}/api/dm/tnx`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': `Bearer ${dehubToken}`,
          },
          body: JSON.stringify(dmBody),
        });

        dehubData = await response.json().catch(() => ({}));
        dehubOk = response.ok;

        if (!dehubOk) {
          console.warn('[dm-send] DeHub API error (continuing with Supabase fallback):', dehubData);
        }
      } catch (err) {
        const isTimeout = err instanceof DOMException && err.name === 'AbortError';
        console.error(
          `[dm-send] DeHub API ${isTimeout ? 'timeout' : 'fetch failure'} (continuing with Supabase fallback):`,
          err
        );
      }
    } else {
      console.log('[dm-send] Skipping DeHub API for wallet-based conversation');
    }

    // 2. Always save to Supabase for reliability and Realtime
    // Use the receiver address as conversation_id for consistent querying
    // (getMessages queries by sender_address/receiver_address, not DeHub _id)
    const resolvedConversationId = targetReceiver || conversationId;

    const { data: supabaseData, error: supabaseError } = await supabase
      .from('direct_messages')
      .insert({
        conversation_id: resolvedConversationId,
        sender_address: (sender || walletAddress).toLowerCase(),
        receiver_address: targetReceiver || 'unknown',
        sender_username: body.sender_username || null,
        sender_display_name: body.sender_display_name || null,
        sender_avatar_url: body.sender_avatar_url || null,
        content: content || '',
        message_type: type,
        media_url: body.mediaUrl || null,
      })
      .select()
      .single();

    if (supabaseError) {
      console.error('[dm-send] Supabase insert error:', supabaseError);
      // If DeHub also failed, then we return error
      if (!dehubOk) {
        return jsonOk({ ok: false, error: 'Failed to send message to both DeHub and Supabase' });
      }
    }

    console.log('[dm-send] Message saved successfully');

    // Return a combined response. If DeHub failed but Supabase succeeded, we still return ok: true
    // but include the info so the frontend knows how to handle it.
    return jsonOk({
      ok: true,
      result: dehubOk ? dehubData : { success: true, data: supabaseData },
      source: dehubOk ? 'dehub' : 'supabase'
    });

  } catch (err) {
    console.error('[dm-send] Unexpected error:', err);
    return jsonOk({ ok: false, error: String(err) });
  }
});

