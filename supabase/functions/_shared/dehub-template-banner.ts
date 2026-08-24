// DeHub "SM Template 2.0" deterministic banner renderer — design language v2.
//
// Instead of asking a diffusion model to imitate the brand, this renders the
// official template system directly: silk background (with an opt-in dust/grid/
// starfield overlay) + a chrome 3D icon hero standing inside the frame's own
// safe box + an Exo headline carrying a horizontal tone+alpha sweep and a lead
// focus ramp + HUD chrome drawn as corner brackets (pill, //dehub.io, one-line
// type tag, QR) inside a bevelled card — as pure SVG rasterized with resvg-wasm.
// The LLM only fills a small validated spec (headline / subtitle / icon choice);
// the template itself enforces the brand, so output cannot drift off-style.
//
// This is the server-side twin of the kit's style-v2.mjs, which renders the same
// language through headless Chrome for social/blog art. The kit is the source of
// truth for the LOOK; when it moves, this has to be moved deliberately, because
// the mechanisms differ (CSS masks and background-clip:text there, SVG gradients,
// masks and filters here). Keep them in sync.
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
  /**
   * 1-2 lines. `blurTail` is a v1 leftover: the focus ramp is now a LEAD ramp
   * (first letters soft, sharpening rightward into the light), which is a
   * property of the block rather than of a letter count. It is still parsed so
   * an LLM reply that sets it stays valid, but it no longer moves any pixels.
   */
  headline: { text: string; blurTail: number }[];
  subtitle: string; // snake_case
  extra?: string; // small mono extra next to subtitle
  typeTag: string; // // type = "…"
  icon?: string; // manifest key
  icon2?: string;
  bg?: string; // manifest bg key; random when absent
  /**
   * Opt-in atmosphere over the silk (dust blobs + technical grid + starfield).
   * Per-graphic on purpose — it flatters some backgrounds and muddies others,
   * so it is varied rather than always-on. Derived from the seed when unset.
   */
  overlay?: boolean;
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
    overlay: typeof raw.overlay === "boolean" ? raw.overlay : undefined,
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
//
// Design language v2, ported from the kit's style-v2.mjs (the source of truth for
// the look). The kit renders through headless Chrome and can lean on CSS; this
// twin rasterises SVG with resvg, so each rule is reimplemented rather than
// copied — the notes below say where the mechanism had to differ.
const DIMS: Record<BannerFormat, { W: number; H: number }> = {
  landscape: { W: 1200, H: 630 },
  square: { W: 960, H: 960 },
  portrait: { W: 864, H: 1080 },
};

// Same LCG as the kit, so one spec always renders the same banner — which also
// means a retry after a transient asset fetch produces an identical image.
function prng(seed: number): () => number {
  let s = (seed * 16807) % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

const n1 = (v: number) => Number(v.toFixed(1));

/**
 * Canvas metrics. `s` scales every fixed measurement off the kit's 1920×1080
 * reference by geometric mean, so one set of numbers serves all three formats.
 *
 * PAD is the part most often got wrong: ONE inset, all four sides, that every
 * badge is pinned to by its own outer edge — the type tag as far from the top as
 * from the right, the QR as far from the bottom as from the right. It is also
 * the left gutter for the pill, headline and sub row.
 *
 * It has to be an absolute (s-scaled) value. The previous cut used %-of-width on
 * the sides and %-of-height top and bottom, so the corners resolved to left 100 /
 * right 81 / top 39 / bottom 70 on 16:9 and left 81 / right 45 / top 99 /
 * bottom 158 on 9:16. No single number was wrong; measured against different
 * dimensions they simply cannot agree, and the badges read as scattered rather
 * than cornered. It also centred the bottom row on one baseline, which
 * guarantees a different bottom distance per badge because the pill, the site
 * box and the QR are three different heights.
 *
 * PAD counts from the CANVAS edge and so carries the card's own 20*s inset:
 * the kit's badges are children of the card, and without it the twin's chrome
 * sits a card-inset tighter than the kit's.
 */
interface Frame {
  W: number; H: number; s: number; land: boolean;
  PAD: number; GUT: number; HERO_R: number;
}
function frameOf(format: BannerFormat): Frame {
  const { W, H } = DIMS[format];
  const land = format === "landscape";
  const s = Math.sqrt(W * H) / Math.sqrt(1920 * 1080);
  const PAD = (20 + 76) * s;
  // The art's own inset: TWICE the chrome's margin, still measured from the canvas, so the
  // card's 20*s is counted once and only the 76*s margin doubles.
  const HERO_R = (20 + 76 * 2) * s;
  return { W, H, s, land, PAD, GUT: PAD, HERO_R };
}

/**
 * The hero's safe box.
 *
 * The hero is the graphic's SUBJECT, so it sits inside the frame. This renderer
 * used to pin it past the right and bottom edges — the silhouette went through
 * the card's rounded corner and what survived landed behind the QR badge, which
 * reads as a mistake rather than as a deliberate crop. The frame owns the box
 * instead: it stands on its OWN right inset (HERO_R, twice the chrome's margin),
 * its head clears the tag, and its feet stand on a ground line above the HUD row.
 * The art does not share the chrome's inset and must not: the icons' ink runs
 * edge to edge, so a 450px slab of bright chrome ends up flush with the frame
 * while the badges beside it are 40px chips — same distance, completely
 * different optical weight, and the big object reads as falling off the card.
 * The icon is drawn `meet` inside a square box, so containing the box
 * contains the ink whatever the icon's own aspect happens to be.
 *
 * `centre` is the fraction of H to hang the box off (null = stand it on the
 * ground line); `bandTop` holds it below a composition's own upper band.
 */
function heroBoxOf(F: Frame, maxW: number, centre: number | null, bandTop = 0): { box: number; x: number; y: number } {
  const { W, H, s, PAD, HERO_R } = F;
  const gap = H * 0.022;
  const tagH = 21 * s * 1.34 + 11 * s * 2;         // the one-line type tag
  const ceil = Math.max(PAD + tagH + gap, bandTop);
  const floor = H - PAD - 84 * s - gap;
  const box = Math.min(W * maxW, floor - ceil);
  const y = centre === null
    ? floor - box
    : Math.min(Math.max(H * centre - box / 2, ceil), floor - box);
  // The art stands on its OWN right inset, twice the chrome's — see the note on heroBoxOf.
  return { box, x: W - HERO_R - box, y };
}

/**
 * A HUD box: dark plate plus four L-shaped CORNER BRACKETS.
 *
 * Not a dashed rectangle and not a solid one — the middle of every edge is
 * empty, like crop marks. A repeating dash pattern is the classic wrong answer:
 * it reads as technical and survives a glance, but it is visibly not the brand.
 * Arm length is FIXED rather than a percentage so every box's brackets match
 * whatever the box measures.
 */
function bracketBox(x: number, y: number, w: number, h: number, s: number): string {
  const ah = 15 * s, av = 12 * s;
  const C = "rgba(255,255,255,0.46)";
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    `<line x1="${n1(x1)}" y1="${n1(y1)}" x2="${n1(x2)}" y2="${n1(y2)}" stroke="${C}" stroke-width="1"/>`;
  // Fill sits at .80 alpha deliberately: at .42 the brackets compute darker than
  // bright chrome bleeding behind them and the box vanishes into a tonal step.
  return `<rect x="${n1(x)}" y="${n1(y)}" width="${n1(w)}" height="${n1(h)}" fill="rgba(8,8,11,0.80)"/>` +
    line(x, y, x + ah, y) + line(x + w - ah, y, x + w, y) +
    line(x, y + h, x + ah, y + h) + line(x + w - ah, y + h, x + w, y + h) +
    line(x, y, x, y + av) + line(x, y + h - av, x, y + h) +
    line(x + w, y, x + w, y + av) + line(x + w, y + h - av, x + w, y + h);
}

/** Starfield over the silk — plain circles, no filter, so it costs almost nothing. */
function starField(seed: number, W: number, H: number): string {
  const r = prng(seed + 7);
  const n = Math.round(300 * (W * H) / (1920 * 1080));
  let out = "";
  for (let i = 0; i < n; i++) {
    out += `<circle cx="${n1(r() * W)}" cy="${n1(r() * H)}" r="${(0.35 + r() * 1.45).toFixed(2)}" fill="#ffffff" opacity="${(0.10 + r() * 0.5).toFixed(2)}"/>`;
  }
  for (let i = 0; i < 5; i++) {
    const x = r() * W, y = r() * H * 0.75, L = 14 + r() * 26;
    out += `<g opacity="${(0.30 + r() * 0.35).toFixed(2)}">` +
      `<circle cx="${n1(x)}" cy="${n1(y)}" r="1.6" fill="#ffffff"/>` +
      `<rect x="${n1(x - L)}" y="${n1(y)}" width="${n1(L * 2)}" height="0.9" fill="url(#flarex)"/>` +
      `<rect x="${n1(x)}" y="${n1(y - L * 0.6)}" width="0.9" height="${n1(L * 1.2)}" fill="url(#flarey)"/></g>`;
  }
  return out;
}

/**
 * Blurred "dust" blobs between the silk and the grid. Drawn as soft radial
 * gradients rather than blurred solids — a feGaussianBlur over blobs this size
 * is exactly the kind of full-canvas filter that has blown the edge CPU slice
 * before, and the gradient is visually indistinguishable here.
 */
function dustLayer(seed: number, W: number, H: number): string {
  const r = prng(seed + 3);
  let out = "";
  for (let i = 0; i < 3; i++) {
    const dw = (0.30 + r() * 0.34) * W;
    out += `<ellipse cx="${n1(r() * W)}" cy="${n1(r() * H)}" rx="${n1(dw / 2)}" ry="${n1(dw * 0.36)}" fill="url(#dust)"/>`;
  }
  return out;
}

/**
 * The v2 headline: a horizontal tone+alpha sweep with a LEAD focus ramp.
 *
 * Two things changed from v1. The gradient runs left-to-right instead of
 * top-to-bottom, and it carries ALPHA as well as tone — the leading glyphs are
 * semi-transparent (~.34) so the silk reads straight through them before they
 * go opaque around 62%. Solid stops look flat and pasted on; the transparency
 * is what seats the type inside the image.
 *
 * The ramp blurs the FIRST letters, sharpening as they move right into the
 * light (v1 blurred the trailing letters). It is built as two full stacked
 * copies cross-faded with masks rather than by blurring part of the text: the
 * kit hit a silent failure doing the per-letter version in CSS, and the
 * equivalent here — blurring a sub-range of a gradient-filled <text> — has the
 * same problem, because the filter and the fill do not compose per-glyph.
 *
 * Both gradient and masks use userSpaceOnUse across the whole block, so every
 * line shares ONE sweep. Per-element bounding boxes would restart the ramp on
 * each line and the second line would read as a different colour.
 */
function headlineBlock(lines: BannerSpec["headline"], x: number, topY: number, size: number, F: Frame, uid: string, defsOut: string[]): string {
  const { s, W, H } = F;
  const lh = size * 0.92;
  const maxLen = Math.max(...lines.map((l) => l.text.length), 1);
  const blockW = maxLen * size * CHARW;
  // Cancel Exo's left side bearing, or the headline looks indented against the
  // pill and the sub row and the shared gutter stops reading as shared.
  const tx = x - size * 0.085;
  const x0 = n1(tx), x1 = n1(tx + blockW);
  const common = `font-family="Exo" font-weight="700" font-size="${size}" letter-spacing="${(-0.022 * size).toFixed(1)}"`;
  const rows = lines
    .map((l, i) => `<text x="${n1(tx)}" y="${n1(topY + size * 0.82 + i * lh)}" ${common} fill="url(#hg_${uid})">${esc(l.text)}</text>`)
    .join("");

  // Emitted into the document-level <defs> rather than inline beside the text:
  // a mid-body <defs> is legal SVG but needless risk in a renderer whose parse
  // failure now returns a hard 503 instead of degrading.
  defsOut.push(`
    <linearGradient id="hg_${uid}" gradientUnits="userSpaceOnUse" x1="${x0}" y1="0" x2="${x1}" y2="0">
      <stop offset="0" stop-color="#b2b2be" stop-opacity="0.34"/>
      <stop offset="0.17" stop-color="#c4c4cf" stop-opacity="0.52"/>
      <stop offset="0.38" stop-color="#dedee6" stop-opacity="0.78"/>
      <stop offset="0.62" stop-color="#ffffff" stop-opacity="0.97"/>
      <stop offset="0.82" stop-color="#fafafd" stop-opacity="0.93"/>
      <stop offset="1" stop-color="#c6c6d0" stop-opacity="0.64"/>
    </linearGradient>
    <linearGradient id="hsoft_${uid}" gradientUnits="userSpaceOnUse" x1="${x0}" y1="0" x2="${x1}" y2="0">
      <stop offset="0" stop-color="#ffffff" stop-opacity="1"/>
      <stop offset="0.12" stop-color="#ffffff" stop-opacity="0.6"/>
      <stop offset="0.28" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="hsharp_${uid}" gradientUnits="userSpaceOnUse" x1="${x0}" y1="0" x2="${x1}" y2="0">
      <stop offset="0.03" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="0.26" stop-color="#ffffff" stop-opacity="1"/>
    </linearGradient>
    <mask id="msoft_${uid}" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}">
      <rect x="0" y="0" width="${W}" height="${H}" fill="url(#hsoft_${uid})"/>
    </mask>
    <mask id="msharp_${uid}" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}">
      <rect x="0" y="0" width="${W}" height="${H}" fill="url(#hsharp_${uid})"/>
    </mask>
    <filter id="hramp_${uid}" x="-20%" y="-40%" width="140%" height="180%">
      <feGaussianBlur stdDeviation="${(5.4 * s).toFixed(2)}"/>
    </filter>`);
  return `<g filter="url(#hramp_${uid})" mask="url(#msoft_${uid})">${rows}</g>
  <g mask="url(#msharp_${uid})">${rows}</g>`;
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
  const heightFit = colH / (lines.length * 0.92);
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
  // -.03em, same side-bearing correction as the headline so the row starts on
  // the shared gutter rather than a hair inside it.
  const tx = x - size * 0.03;
  const slashW = size * 0.58 * 2;
  // Only exo-700 and exo-500 are loaded as static faces (a variable Exo renders
  // thin under resvg), so the sub row stays on 500 — asking for 600 or 300 would
  // have resvg silently substitute the nearest face.
  const common = `font-family="Exo" font-weight="500" font-size="${size}" text-anchor="${anchor}"`;
  // The `//` is deliberately dimmer than the word — it reads as punctuation
  // rather than as part of the label.
  let out = `<text x="${n1(tx)}" y="${n1(y)}" ${common} fill="rgba(255,255,255,0.42)">//</text>`;
  out += `<text x="${n1(tx + slashW)}" y="${n1(y)}" ${common} fill="url(#subg)">${esc(spec.subtitle.toUpperCase())}</text>`;
  const approxW = subTxt.length * size * 0.58;
  const ex = anchor === "middle" ? x + approxW / 2 + 40 : tx + approxW + 44;
  if (spec.extra) {
    out += `<text x="${n1(ex)}" y="${n1(y - 2)}" font-family="Consolas" font-size="${Math.round(size * 0.55)}" letter-spacing="${(size * 0.04).toFixed(1)}" fill="rgba(255,255,255,0.72)">${esc(spec.extra)}</text>`;
  }
  out += `<text x="${n1(ex + (spec.extra ? spec.extra.length * size * 0.36 + 40 : 0))}" y="${n1(y - 1)}" font-family="Exo" font-weight="500" font-size="${Math.round(size * 0.74)}" fill="rgba(255,255,255,0.5)">×</text>`;
  return out;
}

/**
 * v2 HUD. The pill sits bottom-left, //dehub.io along the bottom and the QR
 * bottom-right; the type tag sits top-right and is two lines. Every box is
 * corner brackets rather than a bordered rectangle.
 *
 * Every badge is pinned by its own OUTER EDGE to PAD — never centred on a shared
 * line. Centring reads as tidier and is the trap: the pill, the site box and the
 * QR are three different heights, so one shared centre line puts each of them a
 * different distance from the canvas edge, which is the distance the eye
 * actually reads.
 *
 * (The kit also has a `pillPos:'top'` variant for blog banners, whose cards crop
 * bottom-anchored. Posters never crop, so this twin only needs the default.)
 */
function hudChrome(spec: BannerSpec, F: Frame, uris: Record<string, string>, showPill = true): string {
  const { W, H, s, PAD } = F;
  const parts: string[] = [];
  const mono = 'font-family="Consolas"';

  // Pill — bottom-left, flush to the inset. Suppressed on wordmark layouts
  // (the big wordmark IS the logo, so the pill would just repeat it).
  if (showPill) {
    const ph = 56 * s, pw = 190 * s;
    const py = H - PAD - ph;
    parts.push(
      `<rect x="${n1(PAD)}" y="${n1(py)}" width="${n1(pw)}" height="${n1(ph)}" rx="${n1(16 * s)}" fill="#ffffff" opacity="0.42" filter="url(#pillglow)"/>`,
      `<rect x="${n1(PAD)}" y="${n1(py)}" width="${n1(pw)}" height="${n1(ph)}" rx="${n1(16 * s)}" fill="#f4f4f2"/>`,
      `<image x="${n1(PAD + 26 * s)}" y="${n1(py + 13 * s)}" width="${n1(pw - 52 * s)}" height="${n1(ph - 26 * s)}" preserveAspectRatio="xMidYMid meet" href="${uris.wordmarkBlack}"/>`,
    );
  }

  // Type tag — top-right, ONE line: a dim `// type =` then the value. Two lines made it a
  // block where every other badge is a chip, and being the tallest thing in the corner it
  // also pushed the hero's ceiling down. The value is unquoted, as in the kit.
  const fs = 21 * s, padX = 18 * s, padY = 11 * s, lh = fs * 1.34;
  const label = "// type = ";
  const tagVal = spec.typeTag;
  const tagW = (label.length + tagVal.length) * fs * 0.55 + padX * 2;
  const tagH = lh + padY * 2;
  const tagX = W - PAD - tagW, tagY = PAD;
  parts.push(
    bracketBox(tagX, tagY, tagW, tagH, s),
    `<text x="${n1(tagX + padX)}" y="${n1(tagY + padY + fs * 0.85)}" ${mono} font-size="${n1(fs)}" fill="rgba(255,255,255,0.42)">// type =</text>`,
    `<text x="${n1(tagX + padX + label.length * fs * 0.55)}" y="${n1(tagY + padY + fs * 0.85)}" ${mono} font-size="${n1(fs)}" fill="rgba(255,255,255,0.72)">${esc(tagVal)}</text>`,
  );

  // //dehub.io — bottom, inset from the pill, standing on the same floor.
  const siteTxt = "dehub.io";
  const siteW = (siteTxt.length + 2) * fs * 0.55 + padX * 2;
  const siteH = lh + padY * 2;
  const siteX = W * (F.land ? 0.475 : 0.40), siteY = H - PAD - siteH;
  parts.push(
    bracketBox(siteX, siteY, siteW, siteH, s),
    `<text x="${n1(siteX + padX)}" y="${n1(siteY + padY + fs * 0.85)}" ${mono} font-size="${n1(fs)}" fill="rgba(255,255,255,0.42)">//</text>`,
    `<text x="${n1(siteX + padX + fs * 1.1)}" y="${n1(siteY + padY + fs * 0.85)}" ${mono} font-size="${n1(fs)}" fill="rgba(255,255,255,0.72)">${siteTxt}</text>`,
  );

  // QR — bottom-right. No border, but a dark backing plate is mandatory: the
  // hero bleeds under it and white modules on polished chrome will not scan.
  const qs = 84 * s, qp = 5 * s;
  const qx = W - PAD - qs, qy = H - PAD - qs;
  parts.push(
    `<rect x="${n1(qx)}" y="${n1(qy)}" width="${n1(qs)}" height="${n1(qs)}" fill="rgba(3,3,5,0.86)"/>`,
    `<image x="${n1(qx + qp)}" y="${n1(qy + qp)}" width="${n1(qs - qp * 2)}" height="${n1(qs - qp * 2)}" href="${uris.qr}"/>`,
  );
  return parts.join("");
}

function marks(W: number, H: number, seed: number, s: number): string {
  // v2 positions. resvg has no glyph for U+2715, so the ✕ of the kit is a
  // plain × here — it is the one substitution the twin makes on purpose.
  const pos: [number, number][] = [[6, 16], [22, 8], [47, 12], [70, 9], [88, 18], [9, 52], [90, 48], [14, 84], [38, 90], [63, 86], [84, 80], [52, 46]];
  return pos.map(([px, py], i) => {
    const g = (i + seed) % 3 === 0 ? "×" : (i + seed) % 3 === 1 ? "+" : "·";
    const o = (0.14 + ((i * 7 + seed * 13) % 10) / 45).toFixed(2);
    return `<text x="${Math.round((px / 100) * W)}" y="${Math.round((py / 100) * H)}" font-family="Consolas" font-size="${n1(15 * s)}" fill="rgba(255,255,255,${o})">${g}</text>`;
  }).join("");
}

export async function buildSvg(spec: BannerSpec): Promise<string> {
  const manifest = await kitManifest();
  const F = frameOf(spec.format);
  const { W, H, s, GUT } = F;
  const bgEntry = spec.bg
    ? manifest.backgrounds.find((b) => b.key === spec.bg)!
    : manifest.backgrounds[Math.floor(Math.random() * manifest.backgrounds.length)];
  const iconEntry = manifest.icons.find((i) => i.key === spec.icon);

  const uris: Record<string, string> = {
    bg: await kitDataUri(bgEntry.file),
    grain: await kitDataUri("brand/grain.png"),
    qr: await kitDataUri("brand/qr-dehub-io.png"),
    wordmarkBlack: await kitDataUri("brand/wordmark-black.png"),
  };
  if (spec.layout === "wordmark") uris.wordmarkWhite = await kitDataUri("brand/wordmark-white.png");
  if (iconEntry) uris.icon = await kitDataUri(iconEntry.file);
  // `spec.icon2` is still accepted so an LLM reply that sets it stays valid, but
  // v2 is ONE big content-matched hero that bleeds off the frame — a second
  // floating object is exactly the clutter the prompt already warns against, so
  // it is no longer drawn and no longer costs an asset fetch.

  const seed = (spec.subtitle.length * 7 + spec.headline[0].text.length * 13) % 17;
  // Atmosphere is per-graphic. With no explicit choice, derive it from the seed
  // so a batch varies instead of every banner wearing the same treatment.
  const overlay = spec.overlay ?? (seed % 2 === 0);
  const inset = 20 * s, rx = 30 * s;
  const CW = W - inset * 2, CH = H - inset * 2;
  const g120 = 120 * s, g24 = 24 * s, dotGap = 34 * s;

  const defs = `
  <defs>
    <linearGradient id="subg" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#8e8e96"/><stop offset="0.6" stop-color="#e8e8ea"/><stop offset="1" stop-color="#b4b4bc"/>
    </linearGradient>
    <!-- Bevel: brightness SWEEPS the perimeter (bright top-left catch, falling
         through the middle, picking up again bottom-right) so the card reads as
         a raised slab. A flat stroke has one value all the way round. -->
    <linearGradient id="bevel" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.46"/>
      <stop offset="0.18" stop-color="#ffffff" stop-opacity="0.20"/>
      <stop offset="0.42" stop-color="#ffffff" stop-opacity="0.055"/>
      <stop offset="0.58" stop-color="#ffffff" stop-opacity="0.045"/>
      <stop offset="0.82" stop-color="#ffffff" stop-opacity="0.17"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0.38"/>
    </linearGradient>
    <linearGradient id="flarex" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0"/><stop offset="0.5" stop-color="#ffffff" stop-opacity="0.9"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="flarey" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0"/><stop offset="0.5" stop-color="#ffffff" stop-opacity="0.9"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="dust" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.075"/><stop offset="0.72" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="vig" cx="0.5" cy="0.45" r="0.62">
      <stop offset="0.52" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="0.6"/>
    </radialGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.18"/><stop offset="0.7" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <mask id="cardmask"><rect x="${n1(inset)}" y="${n1(inset)}" width="${n1(CW)}" height="${n1(CH)}" rx="${n1(rx)}" fill="#ffffff"/></mask>
    <pattern id="dots" width="${n1(dotGap)}" height="${n1(dotGap)}" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="1.1" fill="rgba(255,255,255,0.5)"/>
    </pattern>
    <pattern id="gridCoarse" width="${n1(g120)}" height="${n1(g120)}" patternUnits="userSpaceOnUse">
      <path d="M0 0H${n1(g120)}M0 0V${n1(g120)}" stroke="rgba(255,255,255,0.05)" stroke-width="1" fill="none"/>
    </pattern>
    <pattern id="gridFine" width="${n1(g24)}" height="${n1(g24)}" patternUnits="userSpaceOnUse">
      <path d="M0 0H${n1(g24)}M0 0V${n1(g24)}" stroke="rgba(255,255,255,0.022)" stroke-width="1" fill="none"/>
    </pattern>
    <pattern id="grainp" width="240" height="240" patternUnits="userSpaceOnUse">
      <image href="${uris.grain}" width="240" height="240"/>
    </pattern>
    <filter id="sblur" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="13"/></filter>
    <filter id="pillglow" x="-60%" y="-120%" width="220%" height="340%"><feGaussianBlur stdDeviation="${n1(12 * s)}"/></filter>
    <filter id="iconfxBright" x="-25%" y="-25%" width="150%" height="160%">
      <feComponentTransfer><feFuncR type="linear" slope="1.55"/><feFuncG type="linear" slope="1.55"/><feFuncB type="linear" slope="1.55"/></feComponentTransfer>
    </filter>
    <radialGradient id="heroShadow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#000000" stop-opacity="0.65"/><stop offset="1" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
  </defs>`;

  // Geometry-dependent defs (the headline sweep + focus-ramp masks) are collected
  // here and folded into the document-level <defs> at the end.
  const headDefs: string[] = [];
  const body: string[] = [];
  body.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#020203"/>`);
  // Nothing outside the card. There used to be four dim × marks in the canvas margin at the
  // extreme corners; too small to read as a mark and too near the edge to read as deliberate,
  // they just looked like specks on the print. The HUD boxes' corner brackets carry that
  // crop-mark language where it belongs.
  body.push(`<g mask="url(#cardmask)">`);
  // Silk is the BASE; dust, grid and stars are an OVERLAY on top of it, in that
  // order, so the texture still reads through.
  body.push(`<rect x="${n1(inset)}" y="${n1(inset)}" width="${n1(CW)}" height="${n1(CH)}" fill="#050506"/>`);
  body.push(`<image x="${n1(inset)}" y="${n1(inset)}" width="${n1(CW)}" height="${n1(CH)}" preserveAspectRatio="xMidYMid slice" href="${uris.bg}" opacity="0.92"/>`);
  if (overlay) {
    body.push(dustLayer(seed, W, H));
    body.push(`<rect x="${n1(inset)}" y="${n1(inset)}" width="${n1(CW)}" height="${n1(CH)}" fill="url(#gridCoarse)"/>`);
    body.push(`<rect x="${n1(inset)}" y="${n1(inset)}" width="${n1(CW)}" height="${n1(CH)}" fill="url(#gridFine)"/>`);
    body.push(starField(seed, W, H));
  }
  body.push(`<rect x="${n1(inset)}" y="${n1(inset)}" width="${n1(CW)}" height="${n1(CH)}" fill="url(#vig)"/>`);
  body.push(`<rect x="${n1(inset)}" y="${n1(inset)}" width="${n1(CW)}" height="${n1(CH)}" fill="url(#dots)" opacity="0.09"/>`);
  body.push(marks(W, H, seed, s));

  // Gaussian drop-shadows on 500px+ hero layers blow the edge worker CPU budget
  // on square/portrait canvases — a gradient ellipse under the icon reads the same.
  const heroImg = (x: number, y: number, box: number, uri: string, e?: { dark?: boolean }) =>
    `<ellipse cx="${x + box / 2}" cy="${y + box * 0.94}" rx="${Math.round(box * 0.4)}" ry="${Math.round(box * 0.08)}" fill="url(#heroShadow)"/>` +
    `<image x="${x}" y="${y}" width="${box}" height="${box}" preserveAspectRatio="xMidYMid meet" href="${uri}"${e?.dark ? ' filter="url(#iconfxBright)"' : ""}/>`;

  const isWordmark = spec.layout === "wordmark";
  const uid = `${spec.format[0]}${seed}`;
  const subSize = 30 * s;
  if (spec.format === "landscape") {
    if (isWordmark) {
      // Brand card: the wordmark IS the logo — centered, glowing, no pill (see hud).
      body.push(`<ellipse cx="${W / 2}" cy="${H * 0.46}" rx="320" ry="190" fill="url(#glow)"/>`);
      body.push(`<image x="${W / 2 - 250}" y="${H * 0.46 - 64}" width="500" height="128" preserveAspectRatio="xMidYMid meet" href="${uris.wordmarkWhite}" filter="url(#sblur)" opacity="0.7"/>`);
      body.push(`<image x="${W / 2 - 250}" y="${H * 0.46 - 64}" width="500" height="128" preserveAspectRatio="xMidYMid meet" href="${uris.wordmarkWhite}"/>`);
      body.push(subRow(spec, W / 2, H * 0.68, subSize, "middle"));
    } else {
      // Hero on the headline's own centre line, inside the safe box.
      const { box: heroBox, x: heroLeft, y: heroTop } = heroBoxOf(F, 0.42, 0.455);
      body.push(`<ellipse cx="${n1(heroLeft + heroBox / 2)}" cy="${n1(heroTop + heroBox / 2)}" rx="${n1(heroBox * 0.6)}" ry="${n1(heroBox * 0.52)}" fill="url(#glow)"/>`);
      if (uris.icon) body.push(heroImg(heroLeft, heroTop, heroBox, uris.icon, iconEntry));
      const colW = heroLeft - GUT - W * 0.03;
      const { lines, size } = fitHeadline(spec.headline, colW, H * 0.46, H * 0.215);
      const blockH = lines.length * size * 0.92;
      const topY = H * 0.455 - blockH / 2;
      body.push(headlineBlock(lines, GUT, topY, size, F, uid, headDefs));
      body.push(subRow(spec, GUT, topY + blockH + H * 0.045, subSize, "start", colW));
    }
  } else {
    // square / portrait: headline high in a clean top band, hero standing in the
    // bottom one. Its own geometry, not the landscape numbers — those put the icon
    // straight through the headline. The band starts at 44% so the type above it
    // keeps a real height budget; the hero takes the rest, down to the ground line.
    const { box: heroBox, x: heroLeft, y: heroTop } = heroBoxOf(F, 0.78, null, H * 0.44);
    body.push(`<ellipse cx="${n1(heroLeft + heroBox / 2)}" cy="${n1(heroTop + heroBox / 2)}" rx="${n1(heroBox * 0.58)}" ry="${n1(heroBox * 0.52)}" fill="url(#glow)"/>`);
    if (isWordmark && uris.wordmarkWhite) {
      body.push(`<image x="${W / 2 - 240}" y="${n1(heroTop + heroBox * 0.3)}" width="480" height="120" preserveAspectRatio="xMidYMid meet" href="${uris.wordmarkWhite}"/>`);
    } else if (uris.icon) {
      body.push(heroImg(heroLeft, heroTop, heroBox, uris.icon, iconEntry));
    }
    const topY = H * 0.155;
    const colW = W - GUT * 2;
    // Keep the whole type block clear of the hero's top edge.
    const { lines, size } = fitHeadline(spec.headline, colW, heroTop - topY - H * 0.07, H * 0.20);
    const blockH = lines.length * size * 0.92;
    body.push(headlineBlock(lines, GUT, topY, size, F, uid, headDefs));
    body.push(subRow(spec, GUT, topY + blockH + H * 0.028, subSize, "start", colW));
  }

  if (spec.format === "landscape") {
    body.push(`<rect x="${n1(inset)}" y="${n1(inset)}" width="${n1(CW)}" height="${n1(CH)}" fill="url(#grainp)" opacity="0.5"/>`);
  }
  body.push(hudChrome(spec, F, uris, !isWordmark));
  // Lip and bevel stack LAST, above everything — a hero bleeding to the edge
  // would otherwise paint straight over them.
  body.push(`<rect x="${n1(inset + 1)}" y="${n1(inset + 1)}" width="${n1(CW - 2)}" height="${n1(CH - 2)}" rx="${n1(rx)}" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>`);
  body.push(`</g>`);
  body.push(`<rect x="${n1(inset)}" y="${n1(inset)}" width="${n1(CW)}" height="${n1(CH)}" rx="${n1(rx)}" fill="none" stroke="url(#bevel)" stroke-width="${n1(1.5 * s)}"/>`);

  const extraDefs = headDefs.length ? `<defs>${headDefs.join("")}</defs>` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${defs}${extraDefs}${body.join("")}</svg>`;
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
