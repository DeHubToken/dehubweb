// Dynamic per-affiliate DeHub share image (SVG).
// Public endpoint used by /affiliate previews and /r/:code OG tags.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import QRCode from "https://esm.sh/qrcode@1.5.4";
import { encode as encodeB64 } from "https://deno.land/std@0.190.0/encoding/base64.ts";
import { DEHUB_LOGO_DATA_URI } from "./logo.ts";

const LOGO_ASPECT = 1752 / 417; // width / height of the wordmark PNG

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SITE = "https://dehub.io";
const CDN = "https://dehubcdn.ams3.cdn.digitaloceanspaces.com/";
const API = "https://api.dehub.io";
const VALID_CODE = /^[A-Z0-9_-]{3,40}$/;

const DEFAULT_BANNERS = [
  "https://dehub.io/__l5e/assets-v1/cd209550-77ef-4c95-b16a-d83ad3adc7ea/default-banner-1.png",
  "https://dehub.io/__l5e/assets-v1/4be06f0a-849c-44c4-bdc2-7c5f0a261b6c/default-banner-2.png",
  "https://dehub.io/__l5e/assets-v1/fa63c89b-9a94-4f94-98f3-8eb5e8289350/default-banner-3.png",
  "https://dehub.io/__l5e/assets-v1/2362a631-0fc5-4a89-8e6b-bf6be734f67b/default-banner-4.png",
  "https://dehub.io/__l5e/assets-v1/bd3416e0-f49a-4bc6-a758-7443d9dbcd87/default-banner-5.png",
  "https://dehub.io/__l5e/assets-v1/d3b70189-d07f-43f5-b901-ef4f9aeb24c6/default-banner-6.png",
  "https://dehub.io/__l5e/assets-v1/fcfba189-8e23-45a0-a96f-bd865f11eb88/default-banner-7.png",
  "https://dehub.io/__l5e/assets-v1/11cfc96b-88ac-4745-adc1-4ba16c47c0a9/default-banner-8.png",
  "https://dehub.io/__l5e/assets-v1/fb0303c4-fe1a-4742-93a7-5c612166d7b2/default-banner-9.png",
];

function pickDefaultBanner(address: string | null): string {
  if (!address) return DEFAULT_BANNERS[0];
  let h = 0;
  for (let i = 0; i < address.length; i++) h = (h * 31 + address.charCodeAt(i)) >>> 0;
  return DEFAULT_BANNERS[h % DEFAULT_BANNERS.length];
}

async function fetchAsDataUri(url: string): Promise<string | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const ct = r.headers.get("content-type") || "image/png";
    if (!ct.startsWith("image/")) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.byteLength < 200) return null;
    return `data:${ct};base64,${encodeB64(buf)}`;
  } catch {
    return null;
  }
}

async function fetchCoverDataUri(address: string | null, apiCoverPath: string | null): Promise<string | null> {
  const candidates: string[] = [];
  if (apiCoverPath) {
    if (apiCoverPath.startsWith("http")) candidates.push(apiCoverPath);
    else candidates.push(`${CDN}${apiCoverPath.replace(/^\/+/, "").replace(/^statics\//, "")}`);
  }
  if (address) {
    for (const ext of ["jpg", "png", "jpeg", "webp"]) {
      candidates.push(`${CDN}covers/${address.toLowerCase()}.${ext}`);
    }
  }
  for (const url of candidates) {
    const data = await fetchAsDataUri(url);
    if (data) return data;
  }
  return null;
}

function escapeXml(value: string) {
  return value.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c] as string));
}

function cleanName(raw: string | null | undefined): string {
  const cleaned = (raw || "").trim().replace(/^@+/, "");
  if (!cleaned) return "a creator";
  return cleaned.slice(0, 28);
}

async function fetchAvatarDataUri(address: string | null, apiAvatarPath: string | null): Promise<string | null> {
  const candidates: string[] = [];
  if (apiAvatarPath) {
    if (apiAvatarPath.startsWith("http")) candidates.push(apiAvatarPath);
    else candidates.push(`${CDN}${apiAvatarPath.replace(/^\/+/, "").replace(/^statics\//, "")}`);
  }
  if (address) {
    for (const ext of ["jpg", "png", "jpeg", "webp", "gif"]) {
      candidates.push(`${CDN}avatars/${address.toLowerCase()}.${ext}`);
    }
  }
  for (const url of candidates) {
    try {
      const r = await fetch(url);
      if (!r.ok) continue;
      const ct = r.headers.get("content-type") || "image/jpeg";
      if (!ct.startsWith("image/")) continue;
      const buf = new Uint8Array(await r.arrayBuffer());
      if (buf.byteLength < 200) continue;
      return `data:${ct};base64,${encodeB64(buf)}`;
    } catch { /* try next */ }
  }
  return null;
}

async function fetchProfile(code: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  let address: string | null = null;
  let shareName: string | null = null;
  if (supabaseUrl && serviceKey) {
    const admin = createClient(supabaseUrl, serviceKey);
    const { data } = await admin
      .from("affiliate_codes")
      .select("share_name,owner_address,active")
      .eq("code", code)
      .maybeSingle();
    if (data?.active !== false) {
      address = (data?.owner_address as string | null) ?? null;
      shareName = (data?.share_name as string | null) ?? null;
    }
  }
  let avatarPath: string | null = null;
  let displayName: string | null = shareName;
  let username: string | null = null;
  if (address) {
    try {
      const r = await fetch(`${API}/api/account_info/${address}`);
      if (r.ok) {
        const j = await r.json();
        const u = j?.result || j;
        avatarPath = u?.avatarImageUrl || u?.avatarUrl || null;
        displayName = displayName || u?.displayName || u?.username || null;
        username = u?.username || null;
      }
    } catch { /* ignore */ }
  }
  return { address, displayName, username, avatarPath };
}

async function buildQrSvgInner(text: string): Promise<{ path: string; count: number }> {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const modules = qr.modules;
  const count = modules.size;
  let path = "";
  for (let y = 0; y < count; y++) {
    for (let x = 0; x < count; x++) {
      if (modules.get(x, y)) path += `M${x},${y}h1v1h-1z`;
    }
  }
  return { path, count };
}

function buildSvg(opts: {
  code: string;
  name: string;
  username: string | null;
  avatarDataUri: string | null;
  qrPath: string;
  qrCount: number;
  width: number;
  height: number;
}) {
  const W = opts.width;
  const H = opts.height;
  const name = escapeXml(opts.name);
  const handle = opts.username ? escapeXml(`@${opts.username}`) : "";
  const code = escapeXml(opts.code || "INVITE");
  const portraitR = Math.min(W, H) * 0.22;
  const portraitCX = W * 0.30;
  const portraitCY = H * 0.50;
  const portraitSize = portraitR * 2;
  const portraitX = portraitCX - portraitR;
  const portraitY = portraitCY - portraitR;
  const qrSize = Math.min(W, H) * 0.20;
  const qrX = W - qrSize - W * 0.06;
  const qrY = H - qrSize - H * 0.10;
  const qrScale = qrSize / opts.qrCount;
  const textX = W * 0.50;

  const avatarHref = opts.avatarDataUri ?? "";
  const hasAvatar = Boolean(opts.avatarDataUri);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Inter, sans-serif">
  <defs>
    <clipPath id="circle"><circle cx="${portraitCX}" cy="${portraitCY}" r="${portraitR}"/></clipPath>
    <clipPath id="bgClip"><rect width="${W}" height="${H}"/></clipPath>
    <filter id="bgBlur" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="60"/></filter>
    <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="22"/></filter>
    <radialGradient id="vignette" cx="50%" cy="50%" r="75%"><stop offset="55%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.85"/></radialGradient>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.15"/><stop offset="1" stop-color="#000" stop-opacity="0.85"/></linearGradient>
    <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffffff" stop-opacity="0.9"/><stop offset="1" stop-color="#ffffff" stop-opacity="0.25"/></linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="#0a0a0b"/>
  ${hasAvatar ? `
  <g clip-path="url(#bgClip)">
    <image href="${avatarHref}" x="${-W * 0.1}" y="${-H * 0.1}" width="${W * 1.2}" height="${H * 1.2}" preserveAspectRatio="xMidYMid slice" filter="url(#bgBlur)" opacity="0.85"/>
  </g>
  <rect width="${W}" height="${H}" fill="url(#scrim)"/>
  <rect width="${W}" height="${H}" fill="url(#vignette)"/>
  ` : `
  <rect width="${W}" height="${H}" fill="#0a0a0b"/>
  <circle cx="${W * 0.2}" cy="${H * 0.2}" r="${W * 0.4}" fill="#1a1a22" opacity="0.7"/>
  <circle cx="${W * 0.85}" cy="${H * 0.85}" r="${W * 0.35}" fill="#15151c" opacity="0.7"/>
  `}

  <g>
    <circle cx="${portraitCX}" cy="${portraitCY}" r="${portraitR + 14}" fill="#fff" opacity="0.08" filter="url(#softGlow)"/>
    <circle cx="${portraitCX}" cy="${portraitCY}" r="${portraitR + 6}" fill="none" stroke="url(#ring)" stroke-width="3"/>
    ${hasAvatar ? `<image href="${avatarHref}" x="${portraitX}" y="${portraitY}" width="${portraitSize}" height="${portraitSize}" preserveAspectRatio="xMidYMid slice" clip-path="url(#circle)"/>` : `
      <circle cx="${portraitCX}" cy="${portraitCY}" r="${portraitR}" fill="#1f2026"/>
      <text x="${portraitCX}" y="${portraitCY + portraitR * 0.22}" fill="#fff" font-size="${portraitR}" font-weight="800" text-anchor="middle">${escapeXml((opts.name[0] || "D").toUpperCase())}</text>
    `}
  </g>

  <g text-anchor="start">
    <text x="${textX}" y="${H * 0.46}" fill="#fff" font-size="${H * 0.085}" font-weight="800" letter-spacing="-1">${name}</text>
    ${handle ? `<text x="${textX}" y="${H * 0.535}" fill="#ffffff" fill-opacity="0.55" font-size="${H * 0.034}" font-weight="500">${handle}</text>` : ""}
    <text x="${textX}" y="${H * 0.66}" fill="#ffffff" fill-opacity="0.92" font-size="${H * 0.042}" font-weight="500">invites you to join DeHub.</text>
    <g transform="translate(${W * 0.04}, ${H * 0.85})">
      <rect width="${H * 0.15}" height="${H * 0.072}" rx="${H * 0.014}" fill="#fff"/>
      <text x="${H * 0.075}" y="${H * 0.05}" fill="#0a0a0b" font-size="${H * 0.034}" font-weight="800" text-anchor="middle" letter-spacing="1">JOIN</text>
      <text x="${H * 0.17}" y="${H * 0.05}" fill="#ffffff" fill-opacity="0.85" font-size="${H * 0.030}" font-weight="600" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">dehub.io/r/${code}</text>
    </g>
  </g>

  <g transform="translate(${qrX - 18}, ${qrY - 18})">
    <rect width="${qrSize + 36}" height="${qrSize + 36}" rx="18" fill="#ffffff"/>
    <g transform="translate(18, 18) scale(${qrScale})" fill="#0a0a0b"><path d="${opts.qrPath}"/></g>
    <text x="${(qrSize + 36) / 2}" y="${qrSize + 32}" fill="#0a0a0b" font-size="14" font-weight="700" text-anchor="middle" letter-spacing="2">SCAN TO JOIN</text>
  </g>

  ${(() => {
    const tlW = W * 0.18;
    const tlH = tlW / LOGO_ASPECT;
    return `<image href="${DEHUB_LOGO_DATA_URI}" x="${W - tlW - W * 0.05}" y="${H * 0.06}" width="${tlW}" height="${tlH}" preserveAspectRatio="xMidYMid meet"/>`;
  })()}
</svg>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const rawCode = (url.searchParams.get("code") || "").trim().toUpperCase();
    const width = Math.min(1920, Math.max(600, Number(url.searchParams.get("width")) || 1200));
    const height = Math.min(1080, Math.max(315, Number(url.searchParams.get("height")) || 630));
    if (rawCode && !VALID_CODE.test(rawCode)) {
      return new Response("invalid code", { status: 400, headers: corsHeaders });
    }

    let address: string | null = null;
    let displayName: string | null = null;
    let username: string | null = null;
    let avatarPath: string | null = null;
    if (rawCode) {
      const p = await fetchProfile(rawCode);
      address = p.address;
      displayName = p.displayName;
      username = p.username;
      avatarPath = p.avatarPath;
    }

    const avatarDataUri = await fetchAvatarDataUri(address, avatarPath);
    const shareUrl = rawCode ? `${SITE}/r/${rawCode}` : SITE;
    const { path: qrPath, count: qrCount } = await buildQrSvgInner(shareUrl);

    const svg = buildSvg({
      code: rawCode,
      name: cleanName(displayName || username),
      username,
      avatarDataUri,
      qrPath,
      qrCount,
      width,
      height,
    });
    return new Response(svg, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "no-store, max-age=0, must-revalidate",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(`error: ${message}`, { status: 500, headers: corsHeaders });
  }
});
