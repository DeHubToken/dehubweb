import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function extractMetaContent(html: string, property: string): string | null {
  // Try og: meta tags first
  const ogRegex = new RegExp(`<meta[^>]*property=["']og:${property}["'][^>]*content=["']([^"']+)["']`, 'i');
  const ogMatch = html.match(ogRegex);
  if (ogMatch) return ogMatch[1];

  // Try alternate format (content before property)
  const ogRegexAlt = new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:${property}["']`, 'i');
  const ogMatchAlt = html.match(ogRegexAlt);
  if (ogMatchAlt) return ogMatchAlt[1];

  return null;
}

function extractTwitterMeta(html: string, property: string): string | null {
  const regex = new RegExp(`<meta[^>]*name=["']twitter:${property}["'][^>]*content=["']([^"']+)["']`, 'i');
  const match = html.match(regex);
  if (match) return match[1];

  const regexAlt = new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:${property}["']`, 'i');
  const matchAlt = html.match(regexAlt);
  if (matchAlt) return matchAlt[1];

  return null;
}

function extractStandardMeta(html: string, name: string): string | null {
  const regex = new RegExp(`<meta[^>]*name=["']${name}["'][^>]*content=["']([^"']+)["']`, 'i');
  const match = html.match(regex);
  if (match) return match[1];

  const regexAlt = new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*name=["']${name}["']`, 'i');
  const matchAlt = html.match(regexAlt);
  if (matchAlt) return matchAlt[1];

  return null;
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? match[1].trim() : null;
}

function resolveUrl(url: string, baseUrl: string): string {
  if (!url) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('//')) return 'https:' + url;
  
  try {
    const base = new URL(baseUrl);
    if (url.startsWith('/')) {
      return `${base.protocol}//${base.host}${url}`;
    }
    return new URL(url, baseUrl).href;
  } catch {
    return url;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url: rawUrl } = await req.json();

    if (!rawUrl) {
      return new Response(
        JSON.stringify({ error: "URL is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Clean and validate URL - remove any non-ASCII characters
    const url = rawUrl.replace(/[^\x00-\x7F]/g, '').trim();
    
    // Validate URL format
    try {
      new URL(url);
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid URL format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Fetching preview for:", url);

    // Fetch the page with a timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; LinkPreviewBot/1.0)",
        "Accept": "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch URL" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const html = await response.text();

    // Extract OG metadata with fallbacks
    const title = extractMetaContent(html, 'title') 
      || extractTwitterMeta(html, 'title')
      || extractTitle(html) 
      || new URL(url).hostname;

    const description = extractMetaContent(html, 'description') 
      || extractTwitterMeta(html, 'description')
      || extractStandardMeta(html, 'description') 
      || '';

    const imageRaw = extractMetaContent(html, 'image') 
      || extractTwitterMeta(html, 'image')
      || null;
    
    const image = imageRaw ? resolveUrl(imageRaw, url) : null;

    const siteName = extractMetaContent(html, 'site_name') 
      || new URL(url).hostname.replace('www.', '');

    return new Response(
      JSON.stringify({
        url,
        title,
        description: description.substring(0, 200),
        image,
        siteName,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error fetching link preview:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch link preview" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
