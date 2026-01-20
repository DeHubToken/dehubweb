import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-dehub-token',
};

const DEHUB_API_BASE = 'https://api.dehub.io';

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const endpoint = url.searchParams.get('endpoint');
    
    if (!endpoint) {
      return new Response(
        JSON.stringify({ error: 'Missing endpoint parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build the DeHub API URL
    const dehubUrl = new URL(endpoint, DEHUB_API_BASE);
    
    // Forward query params (except our internal 'endpoint' param)
    url.searchParams.forEach((value, key) => {
      if (key !== 'endpoint') {
        dehubUrl.searchParams.set(key, value);
      }
    });

    // Get the DeHub auth token from header
    const dehubToken = req.headers.get('x-dehub-token');
    
    // Prepare headers for DeHub API
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    
    if (dehubToken) {
      headers['Authorization'] = `Bearer ${dehubToken}`;
    }

    // Get request body for POST/PUT/PATCH
    let body: string | undefined;
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      body = await req.text();
    }

    console.log(`[DeHub API] ${req.method} ${dehubUrl.toString()}`);

    // Forward the request to DeHub API
    const response = await fetch(dehubUrl.toString(), {
      method: req.method,
      headers,
      body,
    });

    const responseData = await response.text();
    
    console.log(`[DeHub API] Response status: ${response.status}`);

    // Try to parse as JSON, otherwise return as text
    let parsedData;
    try {
      parsedData = JSON.parse(responseData);
    } catch {
      parsedData = { data: responseData };
    }

    return new Response(
      JSON.stringify(parsedData),
      { 
        status: response.status, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (error: unknown) {
    console.error('[DeHub API] Error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
