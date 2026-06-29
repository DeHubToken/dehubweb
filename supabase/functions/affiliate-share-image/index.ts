// Dynamic per-affiliate DeHub share image (SVG).
// Public endpoint used by /affiliate previews and /r/:code OG tags.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import QRCode from "https://esm.sh/qrcode@1.5.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SITE = "https://dehub.io";
const VALID_CODE = /^[A-Z0-9_-]{3,40}$/;

function escapeXml(value: string) {
  return value.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c] as string));
}

function normaliseName(raw: string | null | undefined) {
  const cleaned = (raw || "").trim().replace(/^@+/, "").replace(/[._-]+/g, " ");
  if (!cleaned) return "USERNAME";
  return cleaned.slice(0, 24).toUpperCase();
}

async function buildQrSvgPath(text: string, size: number): Promise<string> {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const modules = qr.modules;
  const count = modules.size;
  const cell = size / count;
  let path = "";
  for (let y = 0; y < count; y++) {
    for (let x = 0; x < count; x++) {
      if (modules.get(x, y)) {
        path += `M${(x * cell).toFixed(2)},${(y * cell).toFixed(2)}h${cell.toFixed(2)}v${cell.toFixed(2)}h-${cell.toFixed(2)}z`;
      }
    }
  }
  return path;
}

function dotGrid(width: number, height: number) {
  const dots: string[] = [];
  for (let y = 86; y < height - 76; y += 31) {
    for (let x = 126; x < width - 96; x += 31) {
      const op = 0.16 + ((x + y) % 5) * 0.025;
      dots.push(`<circle cx="${x}" cy="${y}" r="1.25" fill="#F4F4F4" opacity="${op.toFixed(2)}"/>`);
    }
  }
  return dots.join("");
}

function buildSvg(opts: { code: string; name: string; qrPath: string; width: number; height: number }) {
  const W = opts.width;
  const H = opts.height;
  const s = W / 1200;
  const name = escapeXml(opts.name);
  const code = escapeXml(opts.code || "INVITE");
  const plateX = 128 * s;
  const plateY = 52 * s;
  const plateW = 944 * s;
  const plateH = Math.min(522 * s, H - 104 * s);
  const mediaX = 584 * s;
  const mediaY = 98 * s;
  const mediaW = 464 * s;
  const mediaH = 318 * s;
  const qrSize = 42 * s;
  const qrX = 742 * s;
  const qrY = 506 * s;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Exo, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif">
  <defs>
    <filter id="blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="20"/></filter>
    <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.82" numOctaves="4" seed="9"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 0.18"/></feComponentTransfer></filter>
    <linearGradient id="plate" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#111319" stop-opacity="0.94"/><stop offset="0.48" stop-color="#4D5058" stop-opacity="0.50"/><stop offset="1" stop-color="#A8AAB1" stop-opacity="0.36"/></linearGradient>
    <linearGradient id="edge" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#FFFFFF" stop-opacity="0.34"/><stop offset="0.42" stop-color="#FFFFFF" stop-opacity="0.08"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0.26"/></linearGradient>
    <linearGradient id="media" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#1B1C20"/><stop offset="0.55" stop-color="#070708"/><stop offset="1" stop-color="#2D2E33"/></linearGradient>
    <linearGradient id="shine" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#FFFFFF" stop-opacity="0"/><stop offset="0.5" stop-color="#FFFFFF" stop-opacity="0.62"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient>
    <radialGradient id="pink" cx="86%" cy="47%" r="10%"><stop stop-color="#FF26F4" stop-opacity="0.9"/><stop offset="0.5" stop-color="#9D00FF" stop-opacity="0.45"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#000"/>
  <rect x="0" y="${H * 0.52}" width="${W}" height="1" fill="#D8D8D8" opacity="0.10"/>
  <ellipse cx="${W * 0.52}" cy="${H * 1.08}" rx="${W * 0.42}" ry="${H * 0.62}" fill="#F7F7F7" opacity="0.10" filter="url(#blur)"/>
  <ellipse cx="${W * 0.78}" cy="${H * 0.08}" rx="${W * 0.18}" ry="${H * 0.38}" fill="#FFFFFF" opacity="0.12" filter="url(#blur)"/>

  <g>
    <rect x="${plateX}" y="${plateY}" width="${plateW}" height="${plateH}" rx="24" fill="url(#plate)"/>
    <rect x="${plateX}" y="${plateY}" width="${plateW}" height="${plateH}" rx="24" fill="#030305" opacity="0.24"/>
    <rect x="${plateX}" y="${plateY}" width="${plateW}" height="${plateH}" rx="24" fill="url(#edge)" opacity="0.28"/>
    <rect x="${plateX + 0.75}" y="${plateY + 0.75}" width="${plateW - 1.5}" height="${plateH - 1.5}" rx="23" fill="none" stroke="#FFFFFF" stroke-opacity="0.18" stroke-width="1"/>
    <path d="M${plateX + 52 * s},${plateY + plateH * 0.2} C${plateX + 300 * s},${plateY + 40 * s} ${plateX + 280 * s},${plateY + plateH * 0.8} ${plateX + 540 * s},${plateY + plateH * 0.52} S${plateX + 824 * s},${plateY + plateH * 0.38} ${plateX + plateW - 52 * s},${plateY + plateH * 0.2}" fill="none" stroke="#FFFFFF" stroke-opacity="0.10" stroke-width="38" filter="url(#blur)"/>
    ${dotGrid(W, H)}
  </g>

  <text x="${160 * s}" y="${270 * s}" fill="#F2F2F2" fill-opacity="0.64" font-size="45" font-weight="800" letter-spacing="0">(${name})</text>
  <rect x="${160 * s}" y="${302 * s}" width="${296 * s}" height="1" fill="url(#shine)" opacity="0.20"/>
  <text x="${160 * s}" y="${354 * s}" fill="#E8E8E8" fill-opacity="0.62" font-size="30" font-weight="700">INVITES YOU TO</text>
  <text x="${160 * s}" y="${392 * s}" fill="#E8E8E8" fill-opacity="0.62" font-size="30" font-weight="700">JOIN DEHUB</text>

  <g>
    <rect x="${mediaX}" y="${mediaY}" width="${mediaW}" height="${mediaH}" rx="8" fill="url(#media)"/>
    <rect x="${mediaX}" y="${mediaY}" width="${mediaW}" height="${mediaH}" rx="8" fill="url(#pink)"/>
    <rect x="${mediaX}" y="${mediaY}" width="${mediaW}" height="${mediaH}" rx="8" fill="none" stroke="#FFFFFF" stroke-opacity="0.10"/>
    <rect x="${mediaX + 34 * s}" y="${mediaY + 38 * s}" width="${132 * s}" height="${220 * s}" rx="4" fill="#0B0C0F" stroke="#FFFFFF" stroke-opacity="0.10"/>
    <rect x="${mediaX + 186 * s}" y="${mediaY + 44 * s}" width="${202 * s}" height="${92 * s}" rx="3" fill="#17191E" stroke="#FFFFFF" stroke-opacity="0.12"/>
    <rect x="${mediaX + 186 * s}" y="${mediaY + 156 * s}" width="${230 * s}" height="${86 * s}" rx="3" fill="#101116" stroke="#FFFFFF" stroke-opacity="0.12"/>
    <path d="M${mediaX + 198 * s},${mediaY + 218 * s}h${170 * s}" stroke="#FFFFFF" stroke-opacity="0.32" stroke-width="4"/>
    <path d="M${mediaX + 198 * s},${mediaY + 198 * s}h${76 * s}M${mediaX + 286 * s},${mediaY + 198 * s}h${108 * s}" stroke="#9BFF8C" stroke-opacity="0.55" stroke-width="5"/>
    <circle cx="${mediaX + mediaW - 73 * s}" cy="${mediaY + 182 * s}" r="34" fill="#FB2EFF" opacity="0.82"/>
    <circle cx="${mediaX + mediaW - 73 * s}" cy="${mediaY + 182 * s}" r="18" fill="#140014"/>
    <circle cx="${mediaX + mediaW - 73 * s}" cy="${mediaY + 182 * s}" r="8" fill="#FFFFFF" opacity="0.70"/>
    <g transform="translate(${mediaX + mediaW - 112 * s},${mediaY})">
      <rect width="${112 * s}" height="${31 * s}" rx="7" fill="#C9C9C9" opacity="0.46" stroke="#FFFFFF" stroke-opacity="0.20"/>
      <circle cx="${18 * s}" cy="${15.5 * s}" r="3.5" fill="#FFFFFF" opacity="0.86"/>
      <text x="${30 * s}" y="${20 * s}" fill="#FFFFFF" fill-opacity="0.72" font-size="11" font-weight="600">file_type_image</text>
    </g>
  </g>

  <g transform="translate(${160 * s},${500 * s})">
    <rect width="${108 * s}" height="${37 * s}" rx="7" fill="#F0F0F0" opacity="0.88"/>
    <text x="${54 * s}" y="${24 * s}" fill="#111" font-size="18" font-weight="800" text-anchor="middle" letter-spacing="2">DEHUB</text>
  </g>
  <g transform="translate(${458 * s},${508 * s})">
    <rect width="${88 * s}" height="${24 * s}" fill="#050506" opacity="0.22" stroke="#FFFFFF" stroke-opacity="0.22"/>
    <text x="${44 * s}" y="${16 * s}" fill="#F4F4F4" fill-opacity="0.56" font-size="12" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" text-anchor="middle">//dehub.io</text>
  </g>
  <g transform="translate(${qrX},${qrY})">
    <rect width="${qrSize}" height="${qrSize}" fill="#E7E7E7" opacity="0.72"/>
    <g transform="translate(${4 * s},${4 * s}) scale(${(qrSize - 8 * s) / 140})" fill="#202020"><path d="${opts.qrPath}"/></g>
  </g>
  <g transform="translate(${974 * s},${500 * s})">
    <rect width="${78 * s}" height="${39 * s}" fill="#070708" opacity="0.18" stroke="#FFFFFF" stroke-opacity="0.25"/>
    <text x="${39 * s}" y="${16 * s}" fill="#F4F4F4" fill-opacity="0.63" font-size="11" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" text-anchor="middle">// type =</text>
    <text x="${39 * s}" y="${31 * s}" fill="#F4F4F4" fill-opacity="0.76" font-size="12" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" text-anchor="middle">affiliate</text>
  </g>
  <text x="${plateX + plateW - 42 * s}" y="${plateY + plateH - 36 * s}" fill="#FFFFFF" fill-opacity="0.22" font-size="10" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" text-anchor="end">${code}</text>
  <rect width="${W}" height="${H}" filter="url(#grain)" opacity="0.34"/>
</svg>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const rawCode = (url.searchParams.get("code") || "").trim().toUpperCase();
    const width = Math.min(1920, Math.max(600, Number(url.searchParams.get("width")) || 1200));
    const height = Math.min(1080, Math.max(315, Number(url.searchParams.get("height")) || 630));
    if (rawCode && !VALID_CODE.test(rawCode)) return new Response("invalid code", { status: 400, headers: corsHeaders });

    let displayName = "USERNAME";
    if (rawCode) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (supabaseUrl && serviceKey) {
        const admin = createClient(supabaseUrl, serviceKey);
        const { data } = await admin
          .from("affiliate_codes")
          .select("share_name,owner_address,active")
          .eq("code", rawCode)
          .maybeSingle();
        if (data?.active !== false) displayName = normaliseName(data?.share_name || undefined);
      }
    }

    const shareUrl = rawCode ? `${SITE}/r/${rawCode}` : SITE;
    const qrPath = await buildQrSvgPath(shareUrl, 140);
    const svg = buildSvg({ code: rawCode, name: displayName, qrPath, width, height });
    return new Response(svg, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "public, max-age=180, s-maxage=3600",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(`error: ${message}`, { status: 500, headers: corsHeaders });
  }
});