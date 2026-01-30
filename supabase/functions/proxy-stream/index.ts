/**
 * Stream Proxy Edge Function
 * ==========================
 * Proxies HLS manifest files to bypass CORS restrictions.
 * Only proxies .m3u8 manifests, not video segments.
 * 
 * @module functions/proxy-stream
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const streamUrl = url.searchParams.get('url');

    if (!streamUrl) {
      return new Response(
        JSON.stringify({ error: 'Missing url parameter' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Validate URL format
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(streamUrl);
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid URL format' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Only allow HTTPS streams
    if (parsedUrl.protocol !== 'https:') {
      return new Response(
        JSON.stringify({ error: 'Only HTTPS streams are supported' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Only proxy HLS manifests
    if (!streamUrl.toLowerCase().includes('.m3u8')) {
      return new Response(
        JSON.stringify({ error: 'Only HLS manifests (.m3u8) can be proxied' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`Proxying stream: ${streamUrl}`);

    // Fetch the stream manifest with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(streamUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.error(`Stream fetch failed: ${response.status} ${response.statusText}`);
      return new Response(
        JSON.stringify({ error: 'Stream unavailable', status: response.status }),
        { 
          status: 502, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const body = await response.text();
    const contentType = response.headers.get('Content-Type') || 'application/vnd.apple.mpegurl';

    // For master playlists, we need to rewrite relative URLs to absolute
    let processedBody = body;
    if (body.includes('#EXT')) {
      const baseUrl = streamUrl.substring(0, streamUrl.lastIndexOf('/') + 1);
      processedBody = body.split('\n').map(line => {
        const trimmedLine = line.trim();
        // Skip empty lines and comments
        if (!trimmedLine || trimmedLine.startsWith('#')) {
          return line;
        }
        // If it's a relative URL, make it absolute
        if (!trimmedLine.startsWith('http')) {
          return baseUrl + trimmedLine;
        }
        return line;
      }).join('\n');
    }

    return new Response(processedBody, {
      headers: {
        ...corsHeaders,
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });

  } catch (error) {
    console.error('Proxy error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isTimeout = errorMessage.includes('aborted');
    
    return new Response(
      JSON.stringify({ 
        error: isTimeout ? 'Stream timeout' : 'Stream unavailable',
        details: errorMessage 
      }),
      { 
        status: isTimeout ? 504 : 502, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
