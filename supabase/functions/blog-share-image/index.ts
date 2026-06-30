// Dynamic per-blog DeHub share image.
// Renders a 1200x630 social card with the post banner, title, author, date,
// and DeHub branding. Default format = PNG (required by most platforms).
// Use ?format=svg for lightweight previews.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { encode as encodeB64 } from "https://deno.land/std@0.190.0/encoding/base64.ts";
import { Resvg, initWasm } from "https://esm.sh/@resvg/resvg-wasm@2.6.2";
import { DEHUB_LOGO_DATA_URI } from "./logo.ts";

let resvgReady: Promise<void> | null = null;
function ensureResvg(): Promise<void> {
  if (!resvgReady) {
    resvgReady = initWasm(fetch("https://esm.sh/@resvg/resvg-wasm@2.6.2/index_bg.wasm"));
  }
  return resvgReady;
}

let fontBuffers: Uint8Array[] | null = null;
async function loadFonts(): Promise<Uint8Array[]> {
  if (fontBuffers) return fontBuffers;
  const ttfs = [
    "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-800-normal.ttf",
    "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-700-normal.ttf",
    "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.ttf",
  ];
  const out: Uint8Array[] = [];
  for (const u of ttfs) {
    try {
      const r = await fetch(u, { redirect: "follow" });
      if (r.ok) {
        const buf = new Uint8Array(await r.arrayBuffer());
        if (buf.byteLength > 1000) out.push(buf);
      }
    } catch { /* ignore */ }
  }
  fontBuffers = out;
  return out;
}

const LOGO_ASPECT = 1752 / 417;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SITE = "https://dehub.io";
const VALID_SLUG = /^[a-z0-9][a-z0-9-]{0,200}$/i;

async function fetchWithTimeout(url: string, ms = 3500): Promise<Response | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    const r = await fetch(url, { signal: ctrl.signal, redirect: "follow" });
    clearTimeout(t);
    return r;
  } catch {
    return null;
  }
}

async function fetchAsDataUri(url: string): Promise<string | null> {
  const r = await fetchWithTimeout(url);
  if (!r || !r.ok) return null;
  const ct = r.headers.get("content-type") || "image/png";
  if (!ct.startsWith("image/")) return null;
  try {
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.byteLength < 200) return null;
    return `data:${ct};base64,${encodeB64(buf)}`;
  } catch {
    return null;
  }
}

function escapeXml(value: string) {
  return value.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c] as string));
}

// Naive word-wrap for SVG <text> rendering (resvg has no auto-wrap).
function wrapText(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const candidate = cur ? `${cur} ${w}` : w;
    if (candidate.length > maxCharsPerLine) {
      if (cur) lines.push(cur);
      cur = w;
      if (lines.length === maxLines - 1) break;
    } else {
      cur = candidate;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length === maxLines) {
    // Append remaining unused words as ellipsis if truncated
    const used = lines.join(" ").split(/\s+/).length;
    if (used < words.length) {
      const last = lines[lines.length - 1];
      lines[lines.length - 1] = (last.length > maxCharsPerLine - 1 ? last.slice(0, maxCharsPerLine - 1) : last) + "…";
    }
  }
  return lines;
}

function buildSvg(opts: {
  title: string;
  author: string;
  date: string;
  slug: string;
  bannerDataUri: string | null;
  width: number;
  height: number;
}) {
  const W = opts.width;
  const H = opts.height;
  const bannerHref = opts.bannerDataUri ?? "";
  const hasBanner = Boolean(opts.bannerDataUri);

  const titleLines = wrapText(opts.title, 32, 3);
  const titleFontSize = titleLines.length >= 3 ? H * 0.078 : H * 0.092;
  const lineHeight = titleFontSize * 1.08;
  const titleBlockHeight = lineHeight * titleLines.length;
  const titleStartY = H * 0.62 - titleBlockHeight + lineHeight * 0.85;

  const author = escapeXml(opts.author || "DeHub");
  const date = escapeXml(opts.date || "");
  const meta = [date, author].filter(Boolean).join(" · ");
  const slugUrl = escapeXml(`dehub.io/docs/blog/${opts.slug}`);

  const tlW = W * 0.18;
  const tlH = tlW / LOGO_ASPECT;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif">
  <defs>
    <clipPath id="bgClip"><rect width="${W}" height="${H}"/></clipPath>
    <filter id="bgBlur" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="14"/></filter>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000" stop-opacity="0.05"/>
      <stop offset="0.55" stop-color="#000" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.92"/>
    </linearGradient>
    <radialGradient id="vignette" cx="50%" cy="50%" r="80%">
      <stop offset="60%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.7"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="#0a0a0b"/>
  <g clip-path="url(#bgClip)">
    ${hasBanner ? `<image href="${bannerHref}" x="-20" y="-20" width="${W + 40}" height="${H + 40}" preserveAspectRatio="xMidYMid slice" filter="url(#bgBlur)" opacity="0.55"/>
       <image href="${bannerHref}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice" opacity="0.95"/>` : ""}
  </g>
  <rect width="${W}" height="${H}" fill="url(#scrim)"/>
  <rect width="${W}" height="${H}" fill="url(#vignette)"/>

  <!-- Top-right wordmark -->
  <image href="${DEHUB_LOGO_DATA_URI}" x="${W - tlW - W * 0.05}" y="${H * 0.07}" width="${tlW}" height="${tlH}" preserveAspectRatio="xMidYMid meet"/>

  <!-- BLOG eyebrow -->
  <g transform="translate(${W * 0.05}, ${H * 0.085})">
    <rect width="${H * 0.13}" height="${H * 0.058}" rx="${H * 0.012}" fill="#ffffff"/>
    <text x="${H * 0.065}" y="${H * 0.04}" fill="#0a0a0b" font-size="${H * 0.028}" font-weight="800" text-anchor="middle" letter-spacing="3">BLOG</text>
  </g>

  <!-- Title -->
  <g>
    ${titleLines.map((line, i) => `<text x="${W * 0.05}" y="${titleStartY + i * lineHeight}" fill="#ffffff" font-size="${titleFontSize}" font-weight="800" letter-spacing="-1.5">${escapeXml(line)}</text>`).join("")}
  </g>

  <!-- Meta -->
  ${meta ? `<text x="${W * 0.05}" y="${H * 0.78}" fill="#ffffff" fill-opacity="0.78" font-size="${H * 0.032}" font-weight="500">${escapeXml(meta)}</text>` : ""}

  <!-- URL footer -->
  <g transform="translate(${W * 0.05}, ${H * 0.86})">
    <rect width="${H * 0.65}" height="${H * 0.078}" rx="${H * 0.014}" fill="#ffffff" fill-opacity="0.1" stroke="#ffffff" stroke-opacity="0.25" stroke-width="1"/>
    <text x="${H * 0.04}" y="${H * 0.053}" fill="#ffffff" font-size="${H * 0.032}" font-weight="600" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">${slugUrl}</text>
  </g>
</svg>`;
}

const PNG_CACHE = new Map<string, Uint8Array>();
const PNG_INFLIGHT = new Map<string, Promise<Uint8Array>>();
const SVG_CACHE = new Map<string, string>();
const PNG_CACHE_MAX = 200;
const SVG_CACHE_MAX = 400;

function cachePng(key: string, png: Uint8Array) {
  if (PNG_CACHE.size >= PNG_CACHE_MAX) {
    const firstKey = PNG_CACHE.keys().next().value;
    if (firstKey) PNG_CACHE.delete(firstKey);
  }
  PNG_CACHE.set(key, png);
}

function cacheSvg(key: string, svg: string) {
  if (SVG_CACHE.size >= SVG_CACHE_MAX) {
    const firstKey = SVG_CACHE.keys().next().value;
    if (firstKey) SVG_CACHE.delete(firstKey);
  }
  SVG_CACHE.set(key, svg);
}

async function buildSvgFor(params: {
  slug: string; title: string; author: string; date: string; banner: string | null;
  width: number; height: number;
}): Promise<string> {
  const bannerDataUri = params.banner ? await fetchAsDataUri(params.banner) : null;
  return buildSvg({
    title: params.title,
    author: params.author,
    date: params.date,
    slug: params.slug,
    bannerDataUri,
    width: params.width,
    height: params.height,
  });
}

async function buildPngFor(params: {
  slug: string; title: string; author: string; date: string; banner: string | null;
  width: number; height: number;
}): Promise<{ png: Uint8Array | null; svg: string }> {
  const svg = await buildSvgFor(params);
  try {
    await ensureResvg();
    const fonts = await loadFonts();
    const resvg = new Resvg(svg, {
      fitTo: { mode: "width", value: params.width },
      font: { fontBuffers: fonts, loadSystemFonts: false, defaultFontFamily: "Inter" },
    });
    const png = resvg.render().asPng();
    return { png, svg };
  } catch (e) {
    console.error("[blog-share-image] rasterize failed", e);
    return { png: null, svg };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const slug = (url.searchParams.get("slug") || "").trim();
    const title = (url.searchParams.get("title") || "").trim().slice(0, 240) || "DeHub Blog";
    const author = (url.searchParams.get("author") || "DeHub").trim().slice(0, 60);
    const date = (url.searchParams.get("date") || "").trim().slice(0, 40);
    const banner = (url.searchParams.get("banner") || "").trim() || null;
    const width = Math.min(1920, Math.max(600, Number(url.searchParams.get("width")) || 1200));
    const height = Math.min(1080, Math.max(315, Number(url.searchParams.get("height")) || 630));
    const format = (url.searchParams.get("format") || "png").toLowerCase() === "svg" ? "svg" : "png";
    const noCache = url.searchParams.has("v") || url.searchParams.has("nocache");

    if (!slug || !VALID_SLUG.test(slug)) {
      return new Response("invalid slug", { status: 400, headers: corsHeaders });
    }
    if (banner && !/^https?:\/\//i.test(banner)) {
      return new Response("invalid banner", { status: 400, headers: corsHeaders });
    }

    const cacheKey = `${format}:${slug}:${width}x${height}:${title}:${banner ?? ""}`;

    if (format === "png" && !noCache) {
      const cached = PNG_CACHE.get(cacheKey);
      if (cached) {
        return new Response(cached, {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "image/png",
            "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
            "X-Cache": "HIT",
          },
        });
      }
    }

    if (format === "png") {
      let inflight = PNG_INFLIGHT.get(cacheKey);
      if (!inflight) {
        inflight = (async () => {
          const { png } = await buildPngFor({ slug, title, author, date, banner, width, height });
          if (!png) throw new Error("raster_failed");
          cachePng(cacheKey, png);
          return png;
        })();
        PNG_INFLIGHT.set(cacheKey, inflight);
        inflight.finally(() => PNG_INFLIGHT.delete(cacheKey));
      }
      try {
        const png = await inflight;
        return new Response(png, {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "image/png",
            "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
            "X-Cache": "MISS",
          },
        });
      } catch {
        // Fallback to SVG
        const svg = await buildSvgFor({ slug, title, author, date, banner, width, height });
        return new Response(svg, {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "image/svg+xml; charset=utf-8",
            "Cache-Control": "public, s-maxage=3600",
            "X-Fallback": "svg",
          },
        });
      }
    }

    if (!noCache) {
      const cachedSvg = SVG_CACHE.get(cacheKey);
      if (cachedSvg) {
        return new Response(cachedSvg, {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "image/svg+xml; charset=utf-8",
            "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
            "X-Cache": "HIT",
          },
        });
      }
    }
    const svg = await buildSvgFor({ slug, title, author, date, banner, width, height });
    cacheSvg(cacheKey, svg);
    return new Response(svg, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
        "X-Cache": "MISS",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(`error: ${message}`, { status: 500, headers: corsHeaders });
  }
});
