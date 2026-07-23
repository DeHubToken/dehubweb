// DeHub "SM Template 2.0" deterministic banner renderer.
//
// Instead of asking a diffusion model to imitate the brand, this renders the
// official template system directly: silk background + chrome 3D icon hero +
// silver Exo headline (motion-blurred tail) + HUD chrome (pill logo, //dehub.io,
// type tag, QR) — as pure SVG rasterized with resvg-wasm. The LLM only fills a
// small validated spec (headline / subtitle / icon choice); the template itself
// enforces the brand, so output cannot drift off-style.
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

function headlineBlock(lines: BannerSpec["headline"], x: number, topY: number, size: number, anchor: "start" | "middle"): string {
  const lh = size * 0.94;
  let out = "";
  lines.forEach((l, i) => {
    const y = topY + size * 0.82 + i * lh;
    const common = `font-family="Exo" font-weight="700" font-size="${size}" letter-spacing="${(-0.015 * size).toFixed(1)}" text-anchor="${anchor}"`;
    out += `<text x="${x}" y="${y}" ${common} fill="url(#silver)">${esc(l.text)}</text>`;
    if (l.blurTail > 0) {
      out += `<text x="${x}" y="${y}" ${common} fill="url(#silver)" filter="url(#hblur)" mask="url(#tailfade)" opacity="0.95">${esc(l.text)}</text>`;
    }
  });
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

function hudChrome(spec: BannerSpec, W: number, H: number, uris: Record<string, string>, showPill = true): string {
  const mono = (t: string) => esc(t);
  const parts: string[] = [];
  // pill logo — top-left. Suppressed on wordmark layouts (the big wordmark IS the
  // logo, so the pill would just repeat it).
  if (showPill) {
    const pw = 172, ph = 52;
    parts.push(
      `<rect x="40" y="36" width="${pw}" height="${ph}" rx="14" fill="#ffffff" opacity="0.5" filter="url(#pillglow)"/>`,
      `<rect x="40" y="36" width="${pw}" height="${ph}" rx="14" fill="#f4f4f2"/>`,
      `<image x="${40 + 26}" y="${36 + 13}" width="${pw - 52}" height="${ph - 26}" preserveAspectRatio="xMidYMid meet" href="${uris.wordmarkBlack}"/>`,
    );
  }
  // type tag — top-right
  const tag = `// type = "${spec.typeTag}"`;
  const tw = tag.length * 10.6 + 30;
  parts.push(
    `<rect x="${W - 40 - tw}" y="40" width="${tw}" height="40" fill="rgba(10,10,12,0.35)" stroke="rgba(255,255,255,0.22)"/>`,
    `<text x="${W - 40 - tw + 15}" y="66" font-family="Consolas" font-size="18" fill="rgba(255,255,255,0.66)">${mono(tag)}</text>`,
  );
  // //dehub.io — bottom-left
  parts.push(
    `<rect x="40" y="${H - 84}" width="150" height="40" fill="rgba(10,10,12,0.35)" stroke="rgba(255,255,255,0.22)"/>`,
    `<text x="55" y="${H - 58}" font-family="Consolas" font-size="18" fill="rgba(255,255,255,0.66)">${mono("//dehub.io")}</text>`,
  );
  // QR — bottom-right
  parts.push(
    `<rect x="${W - 40 - 86}" y="${H - 40 - 86}" width="86" height="86" fill="rgba(10,10,12,0.35)" stroke="rgba(255,255,255,0.22)"/>`,
    `<image x="${W - 40 - 78}" y="${H - 40 - 78}" width="70" height="70" href="${uris.qr}" opacity="0.85"/>`,
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
    <linearGradient id="silver" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0.04" stop-color="#ffffff"/><stop offset="0.38" stop-color="#dcdcdf"/>
      <stop offset="0.78" stop-color="#8b8b92"/><stop offset="1" stop-color="#6f6f76"/>
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
      // Hero right, headline in a reserved left column with a clean gutter.
      const heroBox = 460;
      const heroLeft = W - 84 - heroBox;
      const heroCy = H / 2;
      body.push(`<ellipse cx="${heroLeft + heroBox / 2}" cy="${heroCy}" rx="${heroBox * 0.6}" ry="${heroBox * 0.52}" fill="url(#glow)"/>`);
      if (uris.icon) body.push(heroImg(heroLeft, heroCy - heroBox / 2, heroBox, uris.icon, iconEntry));
      if (uris.icon2) body.push(heroImg(heroLeft + heroBox - 150, H - 150 - 180, 180, uris.icon2, icon2Entry));
      const colW = heroLeft - 64 - 44; // gutter before hero
      const { lines, size } = fitHeadline(spec.headline, colW, H * 0.5, 150);
      const blockH = lines.length * size * 0.94;
      const topY = (H - blockH) / 2 - 22;
      body.push(headlineBlock(lines, 64, topY, size, "start"));
      body.push(subRow(spec, 66, topY + blockH + 48, 30, "start", colW));
    }
  } else {
    // square / portrait: headline + sub in a clean TOP band, hero fills the bottom.
    const heroBox = Math.min(Math.round(H * 0.5), W - 120);
    const heroY = H - heroBox - 96;
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
  body.push(`<rect x="${inset}" y="${inset}" width="${CW}" height="${CH}" rx="${rx}" fill="none" stroke="rgba(255,255,255,0.06)"/>`);

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
