import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEHUB_API_BASE = "https://api.dehub.io";
const APP_URL = "https://dehub.io";

const STATIC_ROUTES = [
  { loc: "/", changefreq: "daily", priority: "1.0" },
  { loc: "/app", changefreq: "hourly", priority: "0.9" },
  { loc: "/app/explore", changefreq: "hourly", priority: "0.8" },
  { loc: "/app/tv", changefreq: "daily", priority: "0.7" },
  { loc: "/creators", changefreq: "weekly", priority: "0.6" },
  { loc: "/jobs", changefreq: "weekly", priority: "0.6" },
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Fetch suggested/top profiles for dynamic URLs
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";

    let profileUrls: string[] = [];
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/suggested_profiles_cache?select=username&order=followers.desc.nullslast&limit=200`,
        { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
      );
      if (res.ok) {
        const profiles = await res.json();
        profileUrls = profiles
          .filter((p: any) => p.username)
          .map((p: any) => p.username);
      }
    } catch {
      // Silently continue with static-only sitemap
    }

    const today = new Date().toISOString().split("T")[0];

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`;

    // Static routes
    for (const route of STATIC_ROUTES) {
      xml += `  <url>
    <loc>${APP_URL}${route.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${route.changefreq}</changefreq>
    <priority>${route.priority}</priority>
  </url>
`;
    }

    // Dynamic profile routes
    for (const username of profileUrls) {
      xml += `  <url>
    <loc>${APP_URL}/${username}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.6</priority>
  </url>
`;
    }

    xml += `</urlset>`;

    return new Response(xml, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, s-maxage=3600, max-age=600",
      },
    });
  } catch (e) {
    console.error("Sitemap Error:", e);
    return new Response("Error generating sitemap", { status: 500 });
  }
});
