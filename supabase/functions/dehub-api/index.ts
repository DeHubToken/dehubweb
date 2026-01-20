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
    // Parse the body to get our parameters
    const body = await req.json();
    const { _method, _endpoint, _params, ...requestBody } = body;
    
    const method = _method || 'GET';
    const endpoint = _endpoint;
    
    if (!endpoint) {
      return new Response(
        JSON.stringify({ error: 'Missing endpoint parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build the DeHub API URL with query params
    const dehubUrl = new URL(endpoint, DEHUB_API_BASE);
    
    // Add query params from _params
    if (_params && typeof _params === 'object') {
      Object.entries(_params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          dehubUrl.searchParams.set(key, String(value));
        }
      });
    }

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

    // Only include body for POST/PUT/PATCH with actual data
    let forwardBody: string | undefined;
    if (['POST', 'PUT', 'PATCH'].includes(method) && Object.keys(requestBody).length > 0) {
      forwardBody = JSON.stringify(requestBody);
    }

    console.log(`[DeHub API] ${method} ${dehubUrl.toString()}`);

    // Forward the request to DeHub API
    const response = await fetch(dehubUrl.toString(), {
      method,
      headers,
      body: forwardBody,
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
