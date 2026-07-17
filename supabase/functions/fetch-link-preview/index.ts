import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { rateLimitByIp } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// SSRF guard: reject URLs that target loopback / private / link-local / metadata
// hosts. Best-effort (literal-host based); the endpoint should only ever preview
// public web pages, so anything internal is disallowed.
function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, ""); // strip IPv6 brackets
  if (!h || h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) {
    return true;
  }
  // IPv6 loopback / link-local (fe80::) / unique-local (fc00::/fd00::)
  if (h === "::1" || h === "::" || h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) {
    return true;
  }
  // IPv4 literal ranges
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]), b = Number(m[2]);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;            // link-local + cloud metadata (169.254.169.254)
    if (a === 172 && b >= 16 && b <= 31) return true;   // private
    if (a === 192 && b === 168) return true;            // private
    if (a === 100 && b >= 64 && b <= 127) return true;  // CGNAT
    if (a >= 224) return true;                           // multicast / reserved
  }
  return false;
}

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

  const limited = await rateLimitByIp(req, "fetch-link-preview", { limit: 60, windowMs: 60 * 60 * 1000 });
  if (limited) return limited;

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
    
    // Validate URL format, scheme, and host (SSRF guard)
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid URL format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return new Response(
        JSON.stringify({ error: "Only http(s) URLs are supported" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (isBlockedHost(parsed.hostname)) {
      return new Response(
        JSON.stringify({ error: "URL host is not allowed" }),
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
