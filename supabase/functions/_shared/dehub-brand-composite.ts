// Deterministic DeHub brand overlay.
// Takes a generated scene (PNG data URL) and composites the REAL DeHub
// wordmark PNG + optional headline text on top using SVG + resvg-wasm.
// Mirrors the pattern used by affiliate-share-image / blog-share-image so
// the logo is always pixel-perfect (never redrawn by a diffusion model).

import { Resvg, initWasm } from "https://esm.sh/@resvg/resvg-wasm@2.6.2";
import { encode as encodeB64 } from "https://deno.land/std@0.190.0/encoding/base64.ts";

let resvgReady: Promise<void> | null = null;
function ensureResvg(): Promise<void> {
  if (!resvgReady) {
    resvgReady = initWasm(fetch("https://esm.sh/@resvg/resvg-wasm@2.6.2/index_bg.wasm"));
  }
  return resvgReady;
}

// Fonts: resvg-wasm ships no system fonts. Load Inter (headline / body).
// Exo would be closer to brand but isn't reliably reachable as TTF; Inter
// with wide letter-spacing reads clean on cinematic black posters.
let fontBuffers: Uint8Array[] | null = null;
async function loadFonts(): Promise<Uint8Array[]> {
  if (fontBuffers) return fontBuffers;
  const ttfs = [
    "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-800-normal.ttf",
    "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-700-normal.ttf",
    "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-500-normal.ttf",
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

// Canonical DeHub white wordmark on CDN. Cached in-memory per worker.
const DEHUB_LOGO_URL =
  "https://dehub.io/__l5e/assets-v1/4cf0b92e-3cfd-4459-9c72-cdec81055a23/dehub-logo-white.png";
let cachedLogoDataUri: string | null = null;
async function fetchLogoDataUri(): Promise<string | null> {
  if (cachedLogoDataUri) return cachedLogoDataUri;
  try {
    const r = await fetch(DEHUB_LOGO_URL);
    if (!r.ok) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    cachedLogoDataUri = `data:image/png;base64,${encodeB64(buf)}`;
    return cachedLogoDataUri;
  } catch {
    return null;
  }
}

// Native pixel size of the DeHub wordmark (width / height ratio).
const LOGO_ASPECT = 1752 / 417;

function escapeXml(v: string): string {
  return v.replace(/[<>&"']/g, (c) => (
    { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c] as string
  ));
}

// Word-wrap a headline to <= maxChars per line, up to maxLines lines.
function wrapHeadline(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = w;
      if (lines.length === maxLines - 1) {
        // dump the rest into the last line, truncated
        const rest = words.slice(words.indexOf(w)).join(" ");
        lines.push(rest.length > maxChars ? rest.slice(0, maxChars - 1) + "…" : rest);
        return lines;
      }
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, maxLines);
}

export type BrandLayout = "bottom-center" | "upper-left" | "upper-right" | "bottom-left";

export interface BrandCompositeOptions {
  sceneDataUrl: string;     // data:image/png;base64,...
  width: number;
  height: number;
  headline?: string;        // optional short campaign line
  layout?: BrandLayout;     // where to place logo lockup
  logoDataUrl?: string;     // override; else fetched from CDN
}

/**
 * Overlay the real DeHub wordmark (and optional crisp headline) onto a
 * generated scene using SVG + resvg-wasm. Returns a PNG data URL on
 * success, or `null` on any failure — callers should fall back to the
 * original scene rather than throwing.
 */
export async function compositeDeHubBranding(
  opts: BrandCompositeOptions,
): Promise<string | null> {
  const { sceneDataUrl, width: W, height: H } = opts;
  const layout: BrandLayout = opts.layout ?? "bottom-center";

  const logoDataUri = opts.logoDataUrl ?? (await fetchLogoDataUri());
  if (!logoDataUri) return null;

  // Logo lockup sizing — width ~22% of canvas, generous safe margin.
  const logoW = Math.round(W * 0.22);
  const logoH = Math.round(logoW / LOGO_ASPECT);
  const margin = Math.round(Math.min(W, H) * 0.06);

  let logoX = 0;
  let logoY = 0;
  switch (layout) {
    case "upper-left":
      logoX = margin;
      logoY = margin;
      break;
    case "upper-right":
      logoX = W - logoW - margin;
      logoY = margin;
      break;
    case "bottom-left":
      logoX = margin;
      logoY = H - logoH - margin;
      break;
    case "bottom-center":
    default:
      logoX = Math.round((W - logoW) / 2);
      logoY = H - logoH - margin;
      break;
  }

  // Optional headline: rendered in Inter 800 uppercase, white, wide
  // letter-spacing (Exo-like feel), with a soft bottom scrim behind it
  // so it stays readable regardless of scene brightness.
  let headlineSvg = "";
  let scrimSvg = "";
  const hl = (opts.headline || "").trim();
  if (hl) {
    const lines = wrapHeadline(hl.toUpperCase(), 22, 2);
    const fontSize = Math.round(H * 0.055);
    const lineH = Math.round(fontSize * 1.1);
    const blockH = lineH * lines.length;
    const startY = logoY - Math.round(H * 0.03) - blockH + lineH * 0.85;
    const textX = W / 2;
    const scrimH = blockH + logoH + margin * 2 + Math.round(H * 0.04);
    scrimSvg = `<rect x="0" y="${H - scrimH}" width="${W}" height="${scrimH}" fill="url(#dehubScrim)"/>`;
    headlineSvg = lines.map((l, i) =>
      `<text x="${textX}" y="${startY + i * lineH}" text-anchor="middle" fill="#ffffff" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-weight="800" font-size="${fontSize}" letter-spacing="${Math.max(2, fontSize * 0.05)}">${escapeXml(l)}</text>`
    ).join("");
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="dehubScrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.78"/>
    </linearGradient>
    <filter id="dehubLogoShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="6"/>
      <feOffset dx="0" dy="2" result="off"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.55"/></feComponentTransfer>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <image href="${sceneDataUrl}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>
  ${scrimSvg}
  ${headlineSvg}
  <image href="${logoDataUri}" x="${logoX}" y="${logoY}" width="${logoW}" height="${logoH}" preserveAspectRatio="xMidYMid meet" filter="url(#dehubLogoShadow)"/>
</svg>`;

  try {
    await ensureResvg();
    const fonts = await loadFonts();
    const resvg = new Resvg(svg, {
      fitTo: { mode: "width", value: W },
      font: { fontBuffers: fonts, loadSystemFonts: false, defaultFontFamily: "Inter" },
    });
    const png = resvg.render().asPng();
    return `data:image/png;base64,${encodeB64(png)}`;
  } catch (e) {
    console.warn("[dehub-brand-composite] raster failed:", (e as Error).message);
    return null;
  }
}

/**
 * Extract a short headline the user explicitly quoted in their brief,
 * e.g. `poster saying "Own Your Feed"` -> `Own Your Feed`. Returns null
 * when no quoted phrase is found. Kept intentionally conservative — we
 * never invent copy the user didn't write.
 */
export function extractQuotedHeadline(prompt: string): string | null {
  const m = prompt.match(/["“”'']([^"“”'']{2,60})["“”'']/);
  if (!m) return null;
  const t = m[1].trim();
  if (!t) return null;
  return t;
}

/**
 * Pick a layout based on the user's wording (banner vs poster vs square)
 * so the logo lockup ends up in a sensible corner instead of always
 * bottom-center.
 */
export function pickLayoutForFormat(size: string): BrandLayout {
  if (size === "1536x1024") return "upper-left";     // landscape banner
  if (size === "1024x1024") return "bottom-center";  // square social
  return "bottom-center";                             // portrait poster
}
