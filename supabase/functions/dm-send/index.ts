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

    // Always pass receiverAddress when we know the other user's wallet.
    if (targetReceiver) {
      dmBody.receiverAddress = targetReceiver;
    }
    // Only pass conversationId if it's a real DeHub ID — NOT a wallet address.
    // Wallet addresses are invalid conversation IDs on DeHub's side.
    if (conversationId && !conversationId.startsWith('new_') && !/^0x[0-9a-fA-F]{40}$/i.test(conversationId)) {
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
      dmBodyKeys: Object.keys(dmBody),
    });

    // 1. Always attempt DeHub API as long as we have a valid target.
    //    Previously this was skipped for wallet-address conversationIds, meaning only the
    //    first message ever reached DeHub. Fixed: try for every message.
    let dehubData: any = {};
    let dehubOk = false;

    const canCallDeHub = !!(
      targetReceiver ||
      (conversationId && !conversationId.startsWith('new_') && !/^0x[0-9a-fA-F]{40}$/i.test(conversationId))
    );

    if (canCallDeHub) {
      try {
        const dehubResponse = await fetchWithTimeout(`${DEHUB_API_BASE}/api/dm/tnx`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': `Bearer ${dehubToken}`,
          },
          body: JSON.stringify(dmBody),
        });

        dehubData = await dehubResponse.json().catch(() => ({}));
        dehubOk = dehubResponse.ok;

        if (dehubOk) {
          console.log('[dm-send] DeHub API success, status:', dehubResponse.status, '| response:', JSON.stringify(dehubData).substring(0, 300));
        } else {
          // Log full details so we can diagnose exactly what DeHub rejects
          console.warn(
            `[dm-send] DeHub API rejected — status: ${dehubResponse.status} | body sent:`,
            JSON.stringify(dmBody),
            '| response:',
            JSON.stringify(dehubData)
          );
        }
      } catch (err) {
        const isTimeout = err instanceof DOMException && err.name === 'AbortError';
        console.error(
          `[dm-send] DeHub API ${isTimeout ? 'timed out' : 'fetch failed'} (Supabase fallback active):`,
          err
        );
      }
    } else {
      console.warn('[dm-send] Cannot determine a valid target for DeHub API', { conversationId, receiver, targetReceiver });
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

    // Return a combined response. If DeHub failed but Supabase succeeded, we still return ok: true.
    // Also expose dehubStatus so the frontend can see what happened on DeHub's side.
    return jsonOk({
      ok: true,
      result: dehubOk ? dehubData : { success: true, data: supabaseData },
      source: dehubOk ? 'dehub' : 'supabase',
      dehubStatus: dehubOk ? 'ok' : (canCallDeHub ? 'rejected' : 'skipped'),
    });

  } catch (err) {
    console.error('[dm-send] Unexpected error:', err);
    return jsonOk({ ok: false, error: String(err) });
  }
});

