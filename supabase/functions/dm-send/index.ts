import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-wallet-address, x-dehub-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-request-id, prefer',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonOk(data: Record<string, unknown>): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
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

    // Resolve receiver address:
    // - For new conversations: `receiver` is sent directly
    // - For wallet-address-keyed conversations: conversationId IS the other user's address
    let targetReceiver = receiver?.toLowerCase();
    if (!targetReceiver && conversationId && /^0x[0-9a-fA-F]{40}$/i.test(conversationId)) {
      targetReceiver = conversationId.toLowerCase();
    }

    // conversation_id stored in Supabase = receiver's wallet address.
    // This lets us query bidirectionally using sender_address + receiver_address.
    const resolvedConversationId = targetReceiver || conversationId;

    console.log(`[dm-send] Saving message from ${walletAddress}`, {
      targetReceiver,
      conversationId: resolvedConversationId,
      type,
    });

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
        ...(type === 'tip' && tipAmount !== undefined
          ? { tip_amount: tipAmount, tip_currency: tipCurrency || 'DHB' }
          : {}),
      })
      .select()
      .single();

    if (supabaseError) {
      console.error('[dm-send] Supabase insert error:', supabaseError);
      return jsonOk({ ok: false, error: `Failed to save message: ${supabaseError.message}` });
    }

    console.log('[dm-send] Message saved successfully, id:', supabaseData?.id);

    return jsonOk({
      ok: true,
      result: { success: true, data: supabaseData },
      source: 'supabase',
    });

  } catch (err) {
    console.error('[dm-send] Unexpected error:', err);
    return jsonOk({ ok: false, error: String(err) });
  }
});
