import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { fetchPublicPage } from "./public-page.ts";
import { pinnedHttp } from "./pinned-http.ts";
import { rateLimitByIp } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-wallet-address, x-dehub-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-request-id, prefer",
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
  // OG attribute values are HTML-escaped. A query string containing &amp;
  // otherwise reaches image renderers as parameters named "amp;title" and
  // "amp;banner", leaving DeHub's blog share card blank.
  url = url.replace(/&amp;/gi, '&');
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
    const body = await req.json();
    // A refresh from a post menu asks the site's own cache for a fresh page,
    // so a share image the author just changed is the one read back.
    const fresh = body?.refresh === true;
    const { url, html } = fresh
      ? await fetchPublicPage(body?.url, undefined, (target, address, signal) => pinnedHttp(target, address.address, signal, true))
      : await fetchPublicPage(body?.url);

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
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
