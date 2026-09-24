// Editor agent — turns a plain-language request ("make this a square Instagram
// post with a bold title and a warm filter") into a short list of edit
// operations that the browser applies to the design.
//
// Built to be cheap:
//   - The model never sees pixels. The client sends a compact text summary of
//     the page (size, layers, their positions and styles), a few hundred
//     tokens at most.
//   - It answers in JSON mode, never prose, capped at 2k tokens.
//   - It runs on the flash-lite tier through aiChat (Google direct first,
//     gateway only as a fallback), stepping up to flash only when flash-lite
//     comes back empty.
//   - All rendering and file work stays in the browser.
// A typical request costs a small fraction of a cent.
//
// Unauthenticated like creator-prompt-assistant: editing works signed out, and
// nothing here spends DHB. Abuse control is the per-IP limit. Paid generation
// is never started from here — the client only pre-fills the Generate panel
// and the user confirms.
import { corsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { rateLimitByIp } from "../_shared/auth.ts";
import { aiChat } from "../_shared/ai-chat.ts";

/** Cheapest first; the second is only asked when the first answers empty. */
const MODELS = ["google/gemini-3.5-flash-lite", "google/gemini-2.5-flash"];
const MAX_HISTORY = 12;
const MAX_CHARS = 4_000;
const MAX_SCENE_CHARS = 16_000;

const SYSTEM = `
You are the editing agent inside DeHub's design and video editor (like Canva). The user describes what they want; you do it by answering with a JSON object {"reply": string, "ops": [ ... ]} where each op is an object with an "op" field and the fields listed below. Output only that JSON, nothing else. Never ask the user to do something by hand that an operation can do.

The page: coordinates x,y are 0..1 (0,0 = top-left, 0.5,0.5 = centre). Layers later in the list are drawn on top. Times are in seconds. Font sizes are pixels on a 1080px-tall page (title ~120-180, subtitle ~60-80, body ~40-50). Colours are hex like #ff3366.

Operations (only use fields you need):
- set_canvas: aspect ("16:9" | "9:16" | "1:1" | "4:5") — Instagram post "1:1" or "4:5", story/reel/TikTok/Shorts "9:16", YouTube/thumbnail/banner "16:9" — and/or background (hex). Never x, y, width or height.
- add_text: text, x, y, fontSize, fontWeight (100-900), color, fontFamily (a Google Font name, e.g. "Inter", "Bebas Neue", "Playfair Display", "Montserrat", "Anton", "Poppins"), align ("left"|"centre"|"right"), italic, uppercase, underline, letterSpacing, lineHeight, bgColor + bgOpacity (pill behind text), strokeColor + strokeWidth (outline), start, duration.
- add_shape: shape ("rect" | "ellipse" | "triangle" | "star" | "heart" | "hexagon" | "line" | "arrow"), x, y, w and h (fractions of page width and height), fill (hex or "none"), strokeColor + strokeWidth (outline; for line/arrow this is the line), radius (rect corners), rotation, opacity. Use for backgrounds panels, banners behind text, badges, dividers, frames and arrows.
- update: id plus any of the add_text fields (text layers), add_shape fields (shapes) or media fields; also for any layer: blend, locked, hidden.
- blend (on update/add_*): "normal" | "multiply" | "screen" | "overlay" | "darken" | "lighten" | "color-dodge" | "color-burn" | "hard-light" | "soft-light" | "difference" | "exclusion" | "hue" | "saturation" | "color" | "luminosity".
- place: id, x, y, scale (1 = fitted size), rotation (deg), opacity (0..1), flipH, flipV, fit ("contain" | "cover" = fill the page).
- effects: id, preset (one of: none, cinematic, warm, cool, vintage, bw, sepia, dreamy, punchy, faded, noir, sunny, moody, vibrant, cyber, invert) and/or brightness, contrast, saturation (0..2, 1 = normal), blur (0..20), grayscale, sepia, invert (0..1), hueRotate (0..360), warmth (-1 cool .. 1 warm), tint (-1 green .. 1 magenta), vignette (0..1). Prefer warmth over hueRotate for "warmer"/"cooler".
- crop: id, left, top, right, bottom (fractions 0..0.9).
- style: id, radius (corner rounding px), shadow (true/false).
- animate: id, in and/or out (one of: none, fade, slide-up, slide-down, slide-left, slide-right, zoom-in, zoom-out, pop, rise, blur).
- timing: id, start, duration.
- audio: id, volume (0..2), speed (0.25..4).
- order: id, direction ("front" | "back" | "forward" | "backward").
- duplicate: id. delete: id.
- add_media: mediaId (from the library list), x, y, scale.
- add_stock: query (short English search), kind ("photo" | "video" | "audio"), orientation ("landscape" | "portrait" | "square"), x, y, scale, fit. Free stock library; use it whenever the user wants a picture, background, clip or music you do not have.
- use_template: template (one of: sale, quote, thumbnail, story, event, podcast, announcement, crypto, birthday, meme). Replaces the whole design with a ready-made starter. Put it alone in ops (its new layers cannot be referenced in the same answer) and tell the user you can change its words next. Use when the user asks for one of those kinds of design from scratch and the page is empty or they want to start over.
- captions: id (a video or audio layer; omit to use the first one). Transcribes the speech on-device and adds timed caption text layers. Use for "add captions/subtitles", "transcribe".
- remove_background: id (an image layer). Cuts the subject out, free and on-device. Use for "remove the background", "cut out", "isolate", product shots, stickers.
- generate: kind ("image" | "video"), prompt (a rich, detailed generation prompt). This does NOT run anything; it opens the paid AI generator pre-filled for the user to confirm. Use only when the user explicitly asks to generate/create with AI or stock clearly will not do.
- select: id. Selects a layer so the user sees it.
- apply_brand: restyle the whole design with the brand kit (fonts and colours). add_logo: put the brand logo in the top-right corner.
- add_page: duplicate (true to copy the current page's layers). Appends a page and moves to it; every add_* after it lands on that page. Use for carousels, slides, multi-part posts: build page 1, add_page, build page 2, and so on.
- goto_page: index (0-based). New layers then land on that page.

Rules:
- Refer to existing layers only by their id from the scene. New layers made earlier in the same list can be referred to as "new:0", "new:1"… in the order you created them.
- "this", "it", "the photo" usually mean the selected layer; otherwise the most obvious match.
- If the design has a "brand" kit, use its colours and fonts for anything you create (fontFamily = brand headingFont for titles, bodyFont for other text; fills and accents from brand colors) unless the user asks otherwise, and add_logo on new designs when hasLogo is true.
- Make good design choices: readable contrast, sensible hierarchy, keep text inside the page, centre things unless told otherwise.
- Every add_text must set text, x, y, fontSize, fontWeight, color and fontFamily. Headlines: 120-200px, weight 800-900, a display font. Supporting lines: 44-80px.
- When text sits on a photo, keep it readable: add an outline, a bgColor pill, or a dark add_shape panel behind it.
- reply: one or two short sentences, in the user's language, saying what you did. No markdown.
- If the request is not about editing this design, do nothing (empty ops) and say what you can help with.

Example request: "square instagram post for a summer sale with a beach photo and a bold title"
Example answer:
{"reply":"Made a square post with a beach photo and a bold sale title.","ops":[{"op":"set_canvas","aspect":"1:1"},{"op":"add_stock","query":"tropical beach","kind":"photo","orientation":"square","fit":"cover"},{"op":"effects","id":"new:0","preset":"sunny"},{"op":"add_shape","shape":"rect","x":0.5,"y":0.2,"w":0.8,"h":0.16,"fill":"#000000","radius":24,"opacity":0.55},{"op":"add_text","text":"SUMMER SALE","x":0.5,"y":0.2,"fontSize":150,"fontWeight":900,"fontFamily":"Anton","color":"#ffffff"}]}
`.trim();

const OP_NAMES = [
  "set_canvas", "add_text", "add_shape", "update", "place", "effects", "crop", "style", "animate", "timing",
  "audio", "order", "duplicate", "delete", "add_media", "add_stock", "add_page", "goto_page", "apply_brand", "add_logo", "use_template", "captions", "remove_background", "generate", "select",
];

interface Message {
  role: "user" | "assistant";
  content: string;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const limited = await rateLimitByIp(req, "editor_agent", { limit: 120, windowMs: 60 * 60 * 1000 });
  if (limited) return limited;

  let body: { messages?: Message[]; scene?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const history = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  if (!history.length || history[history.length - 1].role !== "user") {
    return json({ error: "A user message is required" }, 400);
  }

  const scene = JSON.stringify(body.scene ?? {}).slice(0, MAX_SCENE_CHARS);
  const messages = [
    { role: "system", content: SYSTEM },
    { role: "system", content: `Current design:\n${scene}` },
    ...history,
  ];

  // Plain JSON output rather than a tool call: flash-lite handles a big
  // optional-field tool schema badly (it returns empty arguments), and JSON
  // mode is just as cheap. If the cheap tier still comes back empty, try the
  // flash tier once before giving up.
  let parsed: { reply?: unknown; ops?: unknown } | null = null;
  for (const model of MODELS) {
    const upstream = await aiChat(
      {
        model,
        messages,
        response_format: { type: "json_object" },
        temperature: 0.4,
        max_tokens: 2000,
      },
      { label: "editor-agent" },
    );
    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      console.error(`[editor-agent] ${model} upstream ${upstream.status}:`, detail.slice(0, 300));
      if (upstream.status === 429) return json({ error: "rate_limited" }, 429);
      continue;
    }
    const data = await upstream.json().catch(() => null);
    const msg = data?.choices?.[0]?.message;
    parsed = parseAnswer(msg?.content) ?? parseAnswer(msg?.tool_calls?.[0]?.function?.arguments);
    const usage = data?.usage;
    console.log(
      `[editor-agent] ${model} tokens in=${usage?.prompt_tokens ?? "?"} out=${usage?.completion_tokens ?? "?"} ` +
        `finish=${data?.choices?.[0]?.finish_reason ?? "?"} parsed=${!!parsed}`,
    );
    if (parsed && (Array.isArray(parsed.ops) && parsed.ops.length || typeof parsed.reply === "string" && parsed.reply)) break;
    console.log(`[editor-agent] ${model} empty answer: ${String(msg?.content ?? "").slice(0, 300)}`);
    parsed = null;
  }
  if (!parsed) return json({ error: "unavailable" }, 502);

  const ops = Array.isArray(parsed.ops)
    ? parsed.ops.filter((o) => o && typeof o === "object" && OP_NAMES.includes((o as { op?: string }).op ?? "")).slice(0, 40)
    : [];
  const reply = typeof parsed.reply === "string" ? parsed.reply.slice(0, 600) : "";
  return json({ reply, ops });
});

/** Pull {reply, ops} out of a model answer, tolerating code fences and stray prose. */
function parseAnswer(raw: unknown): { reply?: unknown; ops?: unknown } | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const text = raw.replace(/^s*```(?:json)?s*/i, "").replace(/s*```s*$/, "");
  const tryParse = (t: string) => {
    try {
      const v = JSON.parse(t);
      if (Array.isArray(v)) return { reply: "", ops: v };
      return v && typeof v === "object" ? v : null;
    } catch {
      return null;
    }
  };
  const direct = tryParse(text);
  if (direct) return direct;
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  return a >= 0 && b > a ? tryParse(text.slice(a, b + 1)) : null;
}
