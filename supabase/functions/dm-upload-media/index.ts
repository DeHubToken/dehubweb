import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-wallet-address, x-dehub-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-request-id, prefer',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Validate a DeHub JWT by calling the account_info endpoint.
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
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const walletAddress = req.headers.get('x-wallet-address')?.toLowerCase() || '';
  const dehubToken = req.headers.get('x-dehub-token') || '';

  if (!walletAddress) {
    return jsonResponse({ ok: false, error: 'x-wallet-address header is required' }, 401);
  }

  if (!dehubToken) {
    return jsonResponse({ ok: false, error: 'x-dehub-token header is required' }, 401);
  }

  try {
    // Validate DeHub JWT
    const isValid = await validateDeHubToken(dehubToken, walletAddress);
    if (!isValid) {
      return jsonResponse({ ok: false, error: 'Invalid or expired DeHub token' }, 401);
    }

    // Parse multipart form data
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return jsonResponse({ ok: false, error: 'No file provided. Send a file with field name "file".' }, 400);
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg'];
    if (!allowedTypes.includes(file.type)) {
      return jsonResponse({ ok: false, error: `Invalid file type: ${file.type}. Allowed: ${allowedTypes.join(', ')}` }, 400);
    }

    // Max 10MB
    if (file.size > 10 * 1024 * 1024) {
      return jsonResponse({ ok: false, error: 'File too large. Max 10MB.' }, 400);
    }

    // Generate unique filename
    const ext = file.name.split('.').pop() || 'jpg';
    const fileName = `${walletAddress}/${Date.now()}-${Math.random().toString(36).substring(2, 10)}.${ext}`;

    console.log(`[dm-upload-media] Uploading ${file.name} (${file.size} bytes) as ${fileName}`);

    const { data, error } = await supabase.storage
      .from('chat-media')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type,
      });

    if (error) {
      console.error('[dm-upload-media] Upload error:', error);
      return jsonResponse({ ok: false, error: `Upload failed: ${error.message}` }, 500);
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('chat-media')
      .getPublicUrl(fileName);

    console.log(`[dm-upload-media] Upload success: ${publicUrl}`);

    return jsonResponse({ ok: true, url: publicUrl });
  } catch (err) {
    console.error('[dm-upload-media] Unexpected error:', err);
    return jsonResponse({ ok: false, error: String(err) }, 500);
  }
});
