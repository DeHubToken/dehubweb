import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEHUB_API_BASE = 'https://api.dehub.io';

interface AuthRequest {
  wallet_address: string;
  signature: string;
  message: string;
  chain_id?: number;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body: AuthRequest = await req.json();
    
    const { wallet_address, signature, message, chain_id = 1 } = body;

    if (!wallet_address || !signature || !message) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: wallet_address, signature, message' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[DeHub Auth] Authenticating wallet: ${wallet_address}`);

    // Forward auth request to DeHub API
    const response = await fetch(`${DEHUB_API_BASE}/api/web/auth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        wallet_address,
        signature,
        message,
        chain_id,
      }),
    });

    const responseData = await response.json();
    
    console.log(`[DeHub Auth] Response status: ${response.status}`);

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: responseData.message || 'Authentication failed' }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Return the auth token and user data
    return new Response(
      JSON.stringify({
        success: true,
        token: responseData.token,
        user: responseData.user,
        expires_at: responseData.expires_at,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('[DeHub Auth] Error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
