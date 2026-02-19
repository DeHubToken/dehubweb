import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-wallet-address, x-dehub-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-request-id, prefer',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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

/**
 * Validate a DeHub JWT by calling the account_info endpoint.
 * Returns true if the token is valid for the given address.
 */
async function validateDeHubToken(token: string, address: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.dehub.io/api/account_info/${address}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const walletAddress = req.headers.get('x-wallet-address')?.toLowerCase() || '';
  const dehubToken = req.headers.get('x-dehub-token') || '';

  if (!walletAddress) {
    return errorResponse('x-wallet-address header is required', 401);
  }

  if (!dehubToken) {
    return errorResponse('x-dehub-token header is required', 401);
  }

  try {
    // Validate DeHub JWT
    const isValid = await validateDeHubToken(dehubToken, walletAddress);
    if (!isValid) {
      return errorResponse('Invalid or expired DeHub token', 401);
    }

    const body = await req.json();
    const {
      room_id,
      content,
      message_type = 'text',
      image_url,
      sender_username,
      sender_display_name,
      sender_avatar_url,
    } = body;

    if (!room_id) {
      return errorResponse('room_id is required');
    }

    if (!content && message_type === 'text') {
      return errorResponse('content is required for text messages');
    }

    console.log(`[livechat-send] Inserting message in room ${room_id} from ${walletAddress}`);

    const { data, error } = await supabase
      .from('livechat_messages')
      .insert({
        room_id,
        sender_address: walletAddress,
        sender_username: sender_username || null,
        sender_display_name: sender_display_name || null,
        sender_avatar_url: sender_avatar_url || null,
        content: content || '',
        message_type,
        image_url: image_url || null,
      })
      .select()
      .single();

    if (error) {
      console.error('[livechat-send] Insert error:', error);
      return errorResponse('Failed to send message', 500);
    }

    console.log(`[livechat-send] Message sent: ${data.id}`);
    return successResponse(data, 'Message sent');
  } catch (err) {
    console.error('[livechat-send] Unexpected error:', err);
    return errorResponse('Internal server error', 500);
  }
});
