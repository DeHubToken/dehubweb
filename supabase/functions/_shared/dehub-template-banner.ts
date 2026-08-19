// DeHub "SM Template 2.0" deterministic banner renderer — v2 design language.
//
// Instead of asking a diffusion model to imitate the brand, this renders the
// official template system directly: silk background (with an optional starfield +
// technical-grid overlay) + a chrome 3D icon hero that bleeds off the frame + an Exo
// headline with a horizontal alpha-carrying light sweep and a leading-edge focus ramp
// + HUD chrome in corner brackets (pill logo, //dehub.io, type tag, QR) inside a
// bevelled card — as pure SVG rasterized with resvg-wasm. The LLM only fills a small
// validated spec (headline / subtitle / icon choice); the template itself enforces the
// brand, so output cannot drift off-style.
//
// This is the server-side twin of the local kit at C:\Users\pirac\dehub-banner-kit
// (style-v2.mjs is the source of truth). Keep the two in sync when the look changes.
//
// NOTE: BannerSpec.headline[].blurTail is now vestigial. v2 blurs the LEADING glyphs
// via a mask pair, not a trailing tail, so the value is validated but unused. It is
// kept so existing LLM output and callers stay valid.
//
// Assets live in the repo under public/brand-kit/ and are fetched from the
// deployed site at runtime (same origin as /lovable-uploads, which serves real
// static files — NOT the __l5e asset.json paths that fall back to SPA HTML).

import { Resvg, initWasm } from "https://esm.sh/@resvg/resvg-wasm@2.6.2";

// Overridable for local testing (globalThis.DEHUB_KIT_BASE).
const KIT_BASE: string = (globalThis as Record<string, unknown>)["DEHUB_KIT_BASE"] as string ?? "https://dehub.io/brand-kit";

let resvgReady: Promise<void> | null = null;
function ensureResvg(): Promise<void> {
  if (!resvgReady) {
    resvgReady = initWasm(fetch("https://esm.sh/@resvg/resvg-wasm@2.6.2/index_bg.wasm"));
  }
  return resvgReady;
}

// ---------------------------------------------------------------- assets ----
const assetCache = new Map<string, string>(); // path -> data URI
const bufCache = new Map<string, Uint8Array>();

async function fetchKitBytes(rel: string): Promise<Uint8Array> {
  const hit = bufCache.get(rel);
  if (hit) return hit;
  const res = await fetch(`${KIT_BASE}/${rel}`, { redirect: "follow" });
  if (!res.ok) throw new Error(`brand-kit fetch ${rel}: ${res.status}`);
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("text/html")) throw new Error(`brand-kit fetch ${rel}: got HTML (SPA fallback)`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength < 200) throw new Error(`brand-kit fetch ${rel}: too small`);
  bufCache.set(rel, buf);
  return buf;
}

function b64(buf: Uint8Array): string {
  let s = "";
  const chunk = 8192;
  for (let i = 0; i < buf.length; i += chunk) {
    s += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return btoa(s);
}

async function kitDataUri(rel: string): Promise<string> {
  const hit = assetCache.get(rel);
  if (hit) return hit;
  const buf = await fetchKitBytes(rel);
  const mime = rel.endsWith(".jpg") ? "image/jpeg" : "image/png";
  const uri = `data:${mime};base64,${b64(buf)}`;
  assetCache.set(rel, uri);
  return uri;
}

interface KitManifest {
  icons: { key: string; file: string; tags: string[]; dark?: boolean }[];
  backgrounds: { key: string; file: string }[];
}
let manifestCache: KitManifest | null = null;
async function kitManifest(): Promise<KitManifest> {
  if (manifestCache) return manifestCache;
  const res = await fetch(`${KIT_BASE}/manifest.json`, { redirect: "follow" });
  if (!res.ok) throw new Error(`manifest fetch: ${res.status}`);
  const j = await res.json();
  if (!Array.isArray(j.icons) || !j.icons.length) throw new Error("manifest: bad shape (SPA fallback?)");
  manifestCache = j;
  return j;
}

let fontsCache: Uint8Array[] | null = null;
async function kitFonts(): Promise<Uint8Array[]> {
  if (fontsCache) return fontsCache;
  const out: Uint8Array[] = [];
  for (const f of ["font/exo-700.ttf", "font/exo-500.ttf", "font/mono.ttf"]) {
    out.push(await fetchKitBytes(f));
  }
  fontsCache = out;
  return out;
}

// ------------------------------------------------------------------ spec ----
export type BannerFormat = "landscape" | "square" | "portrait";

export interface BannerSpec {
  format: BannerFormat;
  layout: "hero" | "wordmark";
  headline: { text: string; blurTail: number }[]; // 1-2 lines
  subtitle: string; // snake_case
  extra?: string; // small mono extra next to subtitle
  typeTag: string; // // type = "…"
  icon?: string; // manifest key
  icon2?: string;
  bg?: string; // manifest bg key; random when absent
}

function esc(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

const snake = (v: string) =>
  v.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9£$?+]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 30);

// LLM outputs are shapes-of-many-kinds: strings, {text: "..."} objects, numbers,
// nested arrays. Coerce defensively — String({}) === "[object Object]" burned us.
function coerceStr(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    for (const k of ["text", "value", "label", "content"]) {
      if (typeof o[k] === "string") return o[k] as string;
    }
  }
  return "";
}

function clampSpec(raw: Partial<BannerSpec>, manifest: KitManifest, format: BannerFormat): BannerSpec {
  const iconKeys = new Set(manifest.icons.map((i) => i.key));
  const rawLines = Array.isArray(raw.headline)
    ? raw.headline
    : coerceStr(raw.headline) ? [{ text: coerceStr(raw.headline), blurTail: 2 }] : [];
  const lines = rawLines
    .map((l) => ({
      text: (typeof l === "string" ? l : coerceStr(l?.text ?? l)).toUpperCase().replace(/[^\x20-\x7E£]/g, "").trim().slice(0, 14),
      blurTail: Math.max(0, Math.min(4, Number((l as Record<string, unknown>)?.blurTail) || 0)),
    }))
    .filter((l) => l.text)
    .slice(0, 2);
  if (!lines.length) lines.push({ text: "DEHUB", blurTail: 0 });
  const iconRaw = coerceStr(raw.icon), icon2Raw = coerceStr(raw.icon2);
  const icon = iconKeys.has(iconRaw) ? iconRaw : undefined;
  const icon2 = iconKeys.has(icon2Raw) && icon2Raw !== icon ? icon2Raw : undefined;
  const bgRaw = coerceStr(raw.bg);
  const bg = manifest.backgrounds.some((b) => b.key === bgRaw) ? bgRaw : undefined;
  return {
    format,
    layout: raw.layout === "wordmark" ? "wordmark" : "hero",
    headline: lines,
    subtitle: snake(coerceStr(raw.subtitle)) || "the_decentralised_hub",
    extra: coerceStr(raw.extra) ? snake(coerceStr(raw.extra)).slice(0, 22) : undefined,
    typeTag: snake(coerceStr(raw.typeTag) || "graphic").slice(0, 16) || "graphic",
    icon,
    icon2,
    bg,
  };
}

function heuristicSpec(prompt: string, manifest: KitManifest, format: BannerFormat): BannerSpec {
  const p = prompt.toLowerCase();
  let icon: string | undefined;
  let best = 0;
  for (const i of manifest.icons) {
    const score = i.tags.reduce((a, t) => a + (p.includes(t) ? 1 : 0), 0) + (p.includes(i.key) ? 2 : 0);
    if (score > best) { best = score; icon = i.key; }
  }
  if (!icon) icon = "coin";
  const quoted = prompt.match(/["“”']([^"“”']{2,28})["“”']/)?.[1];
  const base = (quoted || prompt.replace(/\b(dehub|make|create|generate|a|an|the|for|please|banner|poster|graphic|image)\b/gi, " "))
    .trim().split(/\s+/).filter(Boolean);
  const l1 = (base[0] || "DEHUB").toUpperCase().slice(0, 12);
  const l2 = base.slice(1, 3).join(" ").toUpperCase().slice(0, 13);
  const headline = l2 ? [{ text: l1, blurTail: 0 }, { text: l2, blurTail: 2 }] : [{ text: l1, blurTail: 2 }];
  return clampSpec({ layout: "hero", headline, subtitle: snake(prompt.slice(0, 40)), typeTag: "graphic", icon }, manifest, format);
}

// LLM fills the spec. Cheap text call; falls back to heuristics on any failure.
export async function buildSpecFromPrompt(opts: {
  prompt: string;
  headlineOverride?: string;
  history?: { role: string; content: string }[];
  apiKey: string;
  format: BannerFormat;
}): Promise<BannerSpec> {
  const manifest = await kitManifest();
  const inventory = manifest.icons.map((i) => `${i.key} (${i.tags.join(", ")})`).join("; ");
  const sys = `You fill a JSON spec for DeHub's official monochrome banner template. Rules:
- headline: 1-2 lines, UPPERCASE, punchy marketing copy, max 12 chars per line (hard limit 14). blurTail = 1-3 trailing letters to motion-blur on the LAST line, 0 on the first.
- subtitle: short snake_case descriptor (e.g. get_paid_to_watch). extra: optional tiny snake_case fact (e.g. 2026, no_investment).
- typeTag: one snake word categorizing it (guide, game, ranking, announcement, product, reward, brand, explainer...).
- icon: the ONE key whose meaning best matches the CONTENT (never a money icon for non-money topics). The "coin" icon carries the DeHub logo mark — use it ONLY for token / price / buy / staking topics, otherwise it duplicates the brand logo. icon2: usually leave EMPTY; set it only when a second object genuinely adds meaning (it clutters otherwise).
- layout: "wordmark" ONLY for a pure brand/logo card with no other subject; otherwise "hero".
Icon inventory: ${inventory}.
Shape (exact — subtitle/extra/typeTag/icon are PLAIN STRINGS, never objects): {"layout":"hero","headline":[{"text":"GO","blurTail":0},{"text":"LIVE","blurTail":1}],"subtitle":"web3_streaming","extra":"2026","typeTag":"product","icon":"mic","icon2":""}
Reply with ONLY the JSON object, no markdown.`;
  const user = `Request: ${opts.prompt}${opts.headlineOverride ? `\nRequired headline text: "${opts.headlineOverride}"` : ""}`;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 12000);
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${opts.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: sys },
          ...(opts.history || []).slice(-4).map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content.slice(0, 400) })),
          { role: "user", content: user },
        ],
      }),
      signal: ctl.signal,
    });
    clearTimeout(t);
    if (!res.ok) throw new Error(`gateway ${res.status}`);
    const data = await res.json();
    const txt: string = data.choices?.[0]?.message?.content ?? "";
    const jsonStr = txt.match(/\{[\s\S]*\}/)?.[0];
    if (!jsonStr) throw new Error("no JSON in reply");
    const raw = JSON.parse(jsonStr);
    if (opts.headlineOverride) {
      const words = opts.headlineOverride.toUpperCase().trim();
      raw.headline = words.length > 12
        ? [{ text: words.slice(0, Math.ceil(words.length / 2)).trim(), blurTail: 0 }, { text: words.slice(Math.ceil(words.length / 2)).trim(), blurTail: 2 }]
        : [{ text: words, blurTail: Math.min(2, words.length - 1) }];
    }
    const spec = clampSpec(raw, manifest, opts.format);
    console.log("[dehub-template] LLM spec:", JSON.stringify(spec));
    return spec;
  } catch (e) {
    console.warn("[dehub-template] spec LLM failed, heuristic fallback:", (e as Error).message);
    return heuristicSpec(opts.prompt, manifest, opts.format);
  }
}

// ------------------------------------------------------------------ svg -----
const DIMS: Record<BannerFormat, { W: number; H: number }> = {
  landscape: { W: 1200, H: 630 },
  square: { W: 960, H: 960 },
  portrait: { W: 864, H: 1080 },
};

// v2 focus ramp: two full copies of each line, cross-faded by a mask — a blurred copy
// revealed at the leading edge and a sharp copy revealed after it — so the headline
// resolves as it moves right into the light. This replaces v1's trailing motion blur.
// (Two stacked copies, not a partial blur, because the fill is a gradient: masking the
// composited result is the only way to blur part of gradient-filled text.)
function headlineBlock(lines: BannerSpec["headline"], x: number, topY: number, size: number, anchor: "start" | "middle"): string {
  const lh = size * 0.92;
  let out = "";
  lines.forEach((l, i) => {
    const y = topY + size * 0.82 + i * lh;
    const common = `font-family="Exo" font-weight="700" font-size="${size}" letter-spacing="${(-0.022 * size).toFixed(1)}" text-anchor="${anchor}" fill="url(#silver)"`;
    out += `<text x="${x}" y="${y}" ${common} filter="url(#hblur)" mask="url(#leadmask)">${esc(l.text)}</text>`;
    out += `<text x="${x}" y="${y}" ${common} mask="url(#sharpmask)">${esc(l.text)}</text>`;
  });
  return out;
}

// Four corner brackets — the DeHub HUD box treatment. NOT a dashed rectangle and NOT a
// solid stroke: one short arm at each end of every edge, nothing across the middle.
function brackets(x: number, y: number, w: number, h: number, arm = 15, armV = 12): string {
  const c = "rgba(255,255,255,0.46)";
  const L = (x1: number, y1: number, x2: number, y2: number) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="1"/>`;
  const a = Math.min(arm, w / 2 - 1), v = Math.min(armV, h / 2 - 1);
  return [
    L(x, y + 0.5, x + a, y + 0.5), L(x + w - a, y + 0.5, x + w, y + 0.5),
    L(x, y + h - 0.5, x + a, y + h - 0.5), L(x + w - a, y + h - 0.5, x + w, y + h - 0.5),
    L(x + 0.5, y, x + 0.5, y + v), L(x + 0.5, y + h - v, x + 0.5, y + h),
    L(x + w - 0.5, y, x + w - 0.5, y + v), L(x + w - 0.5, y + h - v, x + w - 0.5, y + h),
  ].join("");
}

// Deterministic starfield, drawn OVER the silk so the silk still reads as the base.
function starField(W: number, H: number, seed: number): string {
  let s = (seed * 16807) % 2147483647;
  if (s <= 0) s += 2147483646;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const n = Math.round(300 * (W * H) / (1920 * 1080));
  let out = "";
  for (let i = 0; i < n; i++) {
    out += `<circle cx="${(rnd() * W).toFixed(1)}" cy="${(rnd() * H).toFixed(1)}" r="${(0.35 + rnd() * 1.45).toFixed(2)}" fill="#ffffff" opacity="${(0.1 + rnd() * 0.5).toFixed(2)}"/>`;
  }
  return out;
}

// Width of one Exo-700 uppercase glyph as a fraction of font-size (measured empirically).
const CHARW = 0.62;

function splitHeadline(line: { text: string; blurTail: number }): { text: string; blurTail: number }[] {
  const t = line.text.trim();
  if (!t.includes(" ")) return [line];
  const mid = t.length / 2;
  let best = -1;
  for (let i = 0; i < t.length; i++) {
    if (t[i] === " " && (best === -1 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  }
  if (best <= 0) return [line];
  return [
    { text: t.slice(0, best).trim(), blurTail: 0 },
    { text: t.slice(best + 1).trim(), blurTail: line.blurTail || 2 },
  ];
}

// Choose line breaks + a font size so the headline fits BOTH the width column and
// the height budget — the single source of truth that keeps headlines off the hero.
function fitHeadline(
  raw: { text: string; blurTail: number }[],
  colW: number,
  colH: number,
  maxSize: number,
): { lines: { text: string; blurTail: number }[]; size: number } {
  let lines = raw;
  // Wrap an over-long single line so it uses vertical space instead of overrunning.
  if (lines.length === 1 && lines[0].text.length > 7 && lines[0].text.includes(" ")) {
    lines = splitHeadline(lines[0]);
  }
  const maxLen = Math.max(...lines.map((l) => l.text.length), 1);
  const widthFit = colW / (maxLen * CHARW);
  const heightFit = colH / (lines.length * 0.98);
  const size = Math.max(42, Math.min(maxSize, Math.floor(Math.min(widthFit, heightFit))));
  return { lines, size };
}

// Fit a plain string's size to a width budget.
function fitSize(text: string, colW: number, maxSize: number, k = 0.58): number {
  return Math.max(16, Math.min(maxSize, Math.floor(colW / Math.max(1, text.length * k))));
}

function subRow(spec: BannerSpec, x: number, y: number, size: number, anchor: "start" | "middle", maxW?: number): string {
  const subTxt = `//${spec.subtitle}`;
  // Shrink to fit the reserved column (leave ~20% for the extra + × glyph).
  if (maxW) size = Math.min(size, fitSize(subTxt, maxW * 0.82, size, 0.58));
  let out = `<text x="${x}" y="${y}" font-family="Exo" font-weight="500" font-size="${size}" text-anchor="${anchor}" fill="url(#silverdim)">${esc(subTxt.toUpperCase())}</text>`;
  const approxW = subTxt.length * size * 0.58;
  const ex = anchor === "middle" ? x + approxW / 2 + 40 : x + approxW + 44;
  if (spec.extra) {
    out += `<text x="${ex}" y="${y - 2}" font-family="Consolas" font-size="${Math.round(size * 0.55)}" fill="rgba(255,255,255,0.6)">${esc(spec.extra)}</text>`;
  }
  out += `<text x="${ex + (spec.extra ? spec.extra.length * size * 0.36 + 40 : 0)}" y="${y - 1}" font-family="Exo" font-weight="500" font-size="${Math.round(size * 0.78)}" fill="rgba(255,255,255,0.55)">×</text>`;
  return out;
}

// v2 HUD. ONE left gutter shared by the pill and the headline; ONE bottom centre line
// shared by the pill, the //dehub.io box and the QR (centre, not bottom — heights differ).
// Boxes use corner brackets, never a stroked rectangle.
function hudChrome(spec: BannerSpec, W: number, H: number, uris: Record<string, string>, showPill = true): string {
  const mono = (t: string) => esc(t);
  const parts: string[] = [];
  const GUT = Math.round(W * 0.052);
  const RGUT = Math.round(W * 0.042);
  const TOP = Math.round(H * 0.072);
  const BASE = Math.round(H - H * 0.104);   // bottom HUD centre line
  const FS = Math.max(11, Math.round(W * 0.0125));
  const box = (x: number, y: number, w: number, h: number) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="rgba(8,8,11,0.80)"/>` + brackets(x, y, w, h);

  // pill — bottom-left, centred on the baseline. Suppressed on wordmark layouts (the
  // big wordmark IS the logo, so the pill would just repeat it).
  if (showPill) {
    const pw = Math.round(W * 0.143), ph = Math.round(H * 0.083);
    const py = BASE - ph / 2;
    parts.push(
      `<rect x="${GUT}" y="${py}" width="${pw}" height="${ph}" rx="${Math.round(ph * 0.3)}" fill="#ffffff" opacity="0.5" filter="url(#pillglow)"/>`,
      `<rect x="${GUT}" y="${py}" width="${pw}" height="${ph}" rx="${Math.round(ph * 0.3)}" fill="#f4f4f2"/>`,
      `<image x="${GUT + Math.round(pw * 0.15)}" y="${py + Math.round(ph * 0.25)}" width="${Math.round(pw * 0.7)}" height="${Math.round(ph * 0.5)}" preserveAspectRatio="xMidYMid meet" href="${uris.wordmarkBlack}"/>`,
    );
  }

  // type tag — top-right, on TWO lines: dim "// type =" then the value
  const val = spec.typeTag;
  const tw = Math.round(Math.max(9, val.length) * FS * 0.62) + 24;
  const th = Math.round(FS * 2.7) + 16;
  const tx = W - RGUT - tw, ty = TOP - th / 2;
  parts.push(
    box(tx, ty, tw, th),
    `<text x="${tx + 12}" y="${ty + FS + 8}" font-family="Consolas" font-size="${FS}" fill="rgba(255,255,255,0.42)">${mono("// type =")}</text>`,
    `<text x="${tx + 12}" y="${ty + FS * 2.3 + 8}" font-family="Consolas" font-size="${FS}" fill="rgba(255,255,255,0.72)">${mono(val)}</text>`,
  );

  // //dehub.io — on the baseline, centre-left
  const dw = Math.round(10 * FS * 0.62) + 24, dh = Math.round(FS * 1.5) + 14;
  const dx = Math.round(W * 0.475), dy = BASE - dh / 2;
  parts.push(
    box(dx, dy, dw, dh),
    `<text x="${dx + 12}" y="${dy + dh / 2 + FS * 0.36}" font-family="Consolas" font-size="${FS}" fill="rgba(255,255,255,0.72)">${mono("//dehub.io")}</text>`,
  );

  // QR — on the baseline, right. Dark backing plate, no border: the hero bleeds under it
  // and white modules on polished chrome do not scan.
  const qs = Math.round(W * 0.047), pad = Math.round(qs * 0.06);
  const qx = W - RGUT - qs, qy = BASE - qs / 2;
  parts.push(
    `<rect x="${qx}" y="${qy}" width="${qs}" height="${qs}" fill="rgba(3,3,5,0.86)"/>`,
    `<image x="${qx + pad}" y="${qy + pad}" width="${qs - pad * 2}" height="${qs - pad * 2}" href="${uris.qr}"/>`,
  );
  return parts.join("");
}

function marks(W: number, H: number, seed: number): string {
  // Edge-biased only — nothing in the central band (28–74% x, 26–66% y) where the
  // headline + hero live, so the marks never sit on top of type or the icon.
  const pos: [number, number][] = [[6, 16], [22, 8], [80, 9], [92, 20], [8, 44], [93, 52], [12, 86], [40, 92], [66, 90], [88, 82]];
  return pos.map(([px, py], i) => {
    const g = (i + seed) % 3 === 0 ? "×" : (i + seed) % 3 === 1 ? "+" : "·";
    const o = (0.12 + ((i * 7 + seed * 13) % 10) / 50).toFixed(2);
    return `<text x="${Math.round((px / 100) * W)}" y="${Math.round((py / 100) * H)}" font-family="Consolas" font-size="14" fill="rgba(255,255,255,${o})">${g}</text>`;
  }).join("");
}

export async function buildSvg(spec: BannerSpec): Promise<string> {
  const manifest = await kitManifest();
  const { W, H } = DIMS[spec.format];
  const bgEntry = spec.bg
    ? manifest.backgrounds.find((b) => b.key === spec.bg)!
    : manifest.backgrounds[Math.floor(Math.random() * manifest.backgrounds.length)];
  const iconEntry = manifest.icons.find((i) => i.key === spec.icon);
  const icon2Entry = manifest.icons.find((i) => i.key === spec.icon2);

  const uris: Record<string, string> = {
    bg: await kitDataUri(bgEntry.file),
    grain: await kitDataUri("brand/grain.png"),
    qr: await kitDataUri("brand/qr-dehub-io.png"),
    wordmarkBlack: await kitDataUri("brand/wordmark-black.png"),
  };
  if (spec.layout === "wordmark") uris.wordmarkWhite = await kitDataUri("brand/wordmark-white.png");
  if (iconEntry) uris.icon = await kitDataUri(iconEntry.file);
  if (icon2Entry) uris.icon2 = await kitDataUri(icon2Entry.file);

  const seed = (spec.subtitle.length * 7 + spec.headline[0].text.length * 13) % 17;
  const inset = 14, rx = 26;
  const CW = W - inset * 2, CH = H - inset * 2;

  const defs = `
  <defs>
    <!-- v2: the sweep is HORIZONTAL and carries ALPHA as well as tone, so the leading
         glyphs are semi-transparent and the silk reads through them before the type
         goes opaque as it moves into the hero's light. -->
    <linearGradient id="silver" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#b2b2be" stop-opacity="0.34"/>
      <stop offset="0.17" stop-color="#c4c4cf" stop-opacity="0.52"/>
      <stop offset="0.38" stop-color="#dedee6" stop-opacity="0.78"/>
      <stop offset="0.62" stop-color="#ffffff" stop-opacity="0.97"/>
      <stop offset="0.82" stop-color="#fafafd" stop-opacity="0.93"/>
      <stop offset="1" stop-color="#c6c6d0" stop-opacity="0.64"/>
    </linearGradient>
    <!-- bevelled card edge: brightness sweeps the perimeter so the card reads as a
         raised slab rather than a flat outlined rectangle -->
    <linearGradient id="bevel" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.46"/>
      <stop offset="0.18" stop-color="#ffffff" stop-opacity="0.20"/>
      <stop offset="0.42" stop-color="#ffffff" stop-opacity="0.055"/>
      <stop offset="0.58" stop-color="#ffffff" stop-opacity="0.045"/>
      <stop offset="0.82" stop-color="#ffffff" stop-opacity="0.17"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0.38"/>
    </linearGradient>
    <!-- focus ramp: leading glyphs soft, sharpening right -->
    <linearGradient id="fadeLead" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ffffff"/><stop offset="0.12" stop-color="#999999"/><stop offset="0.28" stop-color="#000000"/>
    </linearGradient>
    <linearGradient id="fadeSharp" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0.03" stop-color="#000000"/><stop offset="0.26" stop-color="#ffffff"/>
    </linearGradient>
    <linearGradient id="silverdim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#e8e8ea"/><stop offset="1" stop-color="#9a9aa1"/>
    </linearGradient>
    <linearGradient id="fadelr" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0.55" stop-color="#000000"/><stop offset="1" stop-color="#ffffff"/>
    </linearGradient>
    <radialGradient id="vig" cx="0.5" cy="0.45" r="0.75">
      <stop offset="0.55" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="0.55"/>
    </radialGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.17"/><stop offset="0.7" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <mask id="tailfade" maskUnits="objectBoundingBox" maskContentUnits="objectBoundingBox">
      <rect x="0" y="0" width="1" height="1" fill="url(#fadelr)"/>
    </mask>
    <mask id="leadmask" maskUnits="objectBoundingBox" maskContentUnits="objectBoundingBox">
      <rect x="0" y="0" width="1" height="1" fill="url(#fadeLead)"/>
    </mask>
    <mask id="sharpmask" maskUnits="objectBoundingBox" maskContentUnits="objectBoundingBox">
      <rect x="0" y="0" width="1" height="1" fill="url(#fadeSharp)"/>
    </mask>
    <pattern id="gridp" width="120" height="120" patternUnits="userSpaceOnUse">
      <path d="M120 0 L0 0 0 120" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
    </pattern>
    <pattern id="gridfine" width="24" height="24" patternUnits="userSpaceOnUse">
      <path d="M24 0 L0 0 0 24" fill="none" stroke="rgba(255,255,255,0.022)" stroke-width="1"/>
    </pattern>
    <mask id="cardmask"><rect x="${inset}" y="${inset}" width="${CW}" height="${CH}" rx="${rx}" fill="#ffffff"/></mask>
    <pattern id="dots" width="30" height="30" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="1.1" fill="rgba(255,255,255,0.5)"/>
    </pattern>
    <pattern id="grainp" width="240" height="240" patternUnits="userSpaceOnUse">
      <image href="${uris.grain}" width="240" height="240"/>
    </pattern>
    <filter id="hblur" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="5"/></filter>
    <filter id="sblur" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="13"/></filter>
    <filter id="pillglow" x="-60%" y="-120%" width="220%" height="340%"><feGaussianBlur stdDeviation="12"/></filter>
    <filter id="iconfxBright" x="-25%" y="-25%" width="150%" height="160%">
      <feComponentTransfer><feFuncR type="linear" slope="1.55"/><feFuncG type="linear" slope="1.55"/><feFuncB type="linear" slope="1.55"/></feComponentTransfer>
    </filter>
    <radialGradient id="heroShadow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#000000" stop-opacity="0.65"/><stop offset="1" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
  </defs>`;

  const body: string[] = [];
  body.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#020203"/>`);
  body.push(`<g mask="url(#cardmask)">`);
  body.push(`<image x="${inset}" y="${inset}" width="${CW}" height="${CH}" preserveAspectRatio="xMidYMid slice" href="${uris.bg}" opacity="0.92"/>`);
  // v2 overlay: technical grid + starfield ON TOP of the silk (the silk stays the base).
  // Opt-in per graphic so a batch does not look uniform — derived from the seed so the
  // same spec always renders the same way.
  const overlay = seed % 2 === 0;
  if (overlay) {
    body.push(`<rect x="${inset}" y="${inset}" width="${CW}" height="${CH}" fill="url(#gridp)"/>`);
    body.push(`<rect x="${inset}" y="${inset}" width="${CW}" height="${CH}" fill="url(#gridfine)"/>`);
    body.push(starField(W, H, seed));
  }
  body.push(`<rect x="${inset}" y="${inset}" width="${CW}" height="${CH}" fill="url(#vig)"/>`);
  body.push(`<rect x="${inset}" y="${inset}" width="${CW}" height="${CH}" fill="url(#dots)" opacity="0.10"/>`);
  body.push(marks(W, H, seed));

  // Gaussian drop-shadows on 500px+ hero layers blow the edge worker CPU budget
  // on square/portrait canvases — a gradient ellipse under the icon reads the same.
  const heroImg = (x: number, y: number, box: number, uri: string, e?: { dark?: boolean }) =>
    `<ellipse cx="${x + box / 2}" cy="${y + box * 0.94}" rx="${Math.round(box * 0.4)}" ry="${Math.round(box * 0.08)}" fill="url(#heroShadow)"/>` +
    `<image x="${x}" y="${y}" width="${box}" height="${box}" preserveAspectRatio="xMidYMid meet" href="${uri}"${e?.dark ? ' filter="url(#iconfxBright)"' : ""}/>`;

  const isWordmark = spec.layout === "wordmark";
  if (spec.format === "landscape") {
    if (isWordmark) {
      // Brand card: the wordmark IS the logo — centered, glowing, no pill (see hud).
      body.push(`<ellipse cx="${W / 2}" cy="${H * 0.46}" rx="320" ry="190" fill="url(#glow)"/>`);
      body.push(`<image x="${W / 2 - 250}" y="${H * 0.46 - 64}" width="500" height="128" preserveAspectRatio="xMidYMid meet" href="${uris.wordmarkWhite}" filter="url(#sblur)" opacity="0.7"/>`);
      body.push(`<image x="${W / 2 - 250}" y="${H * 0.46 - 64}" width="500" height="128" preserveAspectRatio="xMidYMid meet" href="${uris.wordmarkWhite}"/>`);
      body.push(subRow(spec, W / 2, H * 0.68, 30, "middle"));
    } else {
      // v2: the hero is BIG and bleeds off the right and bottom edges — it is not
      // contained in the frame. The card mask clips it, which is what creates the bleed.
      const GUT = Math.round(W * 0.052);
      const heroBox = Math.round(W * 0.52);
      const heroLeft = Math.round(W + W * 0.045 - heroBox);   // right edge past the canvas
      const heroTop = Math.round(H + H * 0.13 - heroBox);     // bottom edge past the canvas
      body.push(`<ellipse cx="${Math.round(W * 0.68)}" cy="${Math.round(H * 0.44)}" rx="${Math.round(W * 0.26)}" ry="${Math.round(H * 0.36)}" fill="url(#glow)"/>`);
      if (uris.icon) body.push(heroImg(heroLeft, heroTop, heroBox, uris.icon, iconEntry));
      const colW = heroLeft - GUT - Math.round(W * 0.03); // gutter before the hero
      const { lines, size } = fitHeadline(spec.headline, colW, H * 0.52, Math.round(H * 0.215));
      const blockH = lines.length * size * 0.92;
      const topY = H * 0.455 - blockH / 2;
      body.push(headlineBlock(lines, GUT, topY, size, "start"));
      body.push(subRow(spec, GUT, topY + blockH + H * 0.045, 30, "start", colW));
    }
  } else {
    // square / portrait: headline + sub in a clean TOP band, hero fills the bottom and
    // bleeds off the bottom edge (v2 — the hero is never fully contained).
    const heroBox = Math.min(Math.round(H * 0.52), W - 90);
    const heroY = Math.round(H + H * 0.04 - heroBox);
    body.push(`<ellipse cx="${W - 70 - heroBox / 2}" cy="${heroY + heroBox / 2}" rx="${heroBox * 0.58}" ry="${heroBox * 0.52}" fill="url(#glow)"/>`);
    if (isWordmark && uris.wordmarkWhite) {
      body.push(`<image x="${W / 2 - 240}" y="${heroY + heroBox / 2 - 60}" width="480" height="120" preserveAspectRatio="xMidYMid meet" href="${uris.wordmarkWhite}"/>`);
    } else if (uris.icon) {
      body.push(heroImg(W - 56 - heroBox, heroY, heroBox, uris.icon, iconEntry));
      if (uris.icon2) body.push(heroImg(56, heroY + heroBox - 210, 210, uris.icon2, icon2Entry));
    }
    const topY = 150;
    const bandBottom = heroY - 24; // keep type clear of the hero
    const { lines, size } = fitHeadline(spec.headline, W - 128, bandBottom - topY - 58, 150);
    const blockH = lines.length * size * 0.94;
    body.push(headlineBlock(lines, 64, topY, size, "start"));
    body.push(subRow(spec, 66, topY + blockH + 46, 30, "start", W - 128));
  }

  if (spec.format === "landscape") {
    body.push(`<rect x="${inset}" y="${inset}" width="${CW}" height="${CH}" fill="url(#grainp)" opacity="0.5"/>`);
  }
  body.push(hudChrome(spec, W, H, uris, !isWordmark));
  body.push(`</g>`);
  // v2 bevelled edge — a gradient-stroked ring, not a flat single-value border, so the
  // card reads as a raised slab. Drawn last so a bleeding hero passes under it.
  body.push(`<rect x="${inset}" y="${inset}" width="${CW}" height="${CH}" rx="${rx}" fill="none" stroke="url(#bevel)" stroke-width="1.5"/>`);

  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${defs}${body.join("")}</svg>`;
}

// ---------------------------------------------------------------- render ----
export async function renderTemplateBanner(spec: BannerSpec): Promise<string> {
  const svg = await buildSvg(spec);
  await ensureResvg();
  const fonts = await kitFonts();
  const resvg = new Resvg(svg, {
    background: "#020203",
    font: { fontBuffers: fonts, defaultFontFamily: "Exo", loadSystemFonts: false },
    fitTo: { mode: "original" },
  });
  const png = resvg.render().asPng();
  return `data:image/png;base64,${b64(png)}`;
}

export function formatFromPosterSize(size: string): BannerFormat {
  if (size === "1536x1024") return "landscape";
  if (size === "1024x1024") return "square";
  return "portrait";
}
