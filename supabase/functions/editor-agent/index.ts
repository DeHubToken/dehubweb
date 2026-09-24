// Editor agent — turns a plain-language request ("make this a square Instagram
// post with a bold title and a warm filter") into a short list of edit
// operations that the browser applies to the design.
//
// Built to be cheap:
//   - The model never sees pixels. The client sends a compact text summary of
//     the page (size, layers, their positions and styles), a few hundred
//     tokens at most.
//   - It answers with one forced tool call, never prose, capped at 1.5k tokens.
//   - It runs on the flash-lite tier through aiChat (Google direct first,
//     gateway only as a fallback).
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

const MODEL = "google/gemini-2.5-flash-lite";
const MAX_HISTORY = 12;
const MAX_CHARS = 4_000;
const MAX_SCENE_CHARS = 16_000;

const SYSTEM = `
You are the editing agent inside DeHub's design and video editor (like Canva). The user describes what they want; you do it by calling apply_edits with a list of operations. Never ask the user to do something by hand that an operation can do.

The page: coordinates x,y are 0..1 (0,0 = top-left, 0.5,0.5 = centre). Layers later in the list are drawn on top. Times are in seconds. Font sizes are pixels on a 1080px-tall page (title ~120-180, subtitle ~60-80, body ~40-50). Colours are hex like #ff3366.

Operations (only use fields you need):
- set_canvas: aspect ("16:9" | "9:16" | "1:1" | "4:5"), background (hex).
- add_text: text, x, y, fontSize, fontWeight (100-900), color, fontFamily (a Google Font name, e.g. "Inter", "Bebas Neue", "Playfair Display", "Montserrat", "Anton", "Poppins"), align ("left"|"centre"|"right"), italic, uppercase, underline, letterSpacing, lineHeight, bgColor + bgOpacity (pill behind text), strokeColor + strokeWidth (outline), start, duration.
- update: id plus any of the add_text fields (for text layers) or media fields.
- place: id, x, y, scale (1 = fitted size), rotation (deg), opacity (0..1), flipH, flipV, fit ("contain" | "cover" = fill the page).
- effects: id, preset (one of: none, cinematic, warm, cool, vintage, bw, sepia, dreamy, punchy, faded, noir, sunny, moody, vibrant, cyber, invert) and/or brightness, contrast, saturation (0..2, 1 = normal), blur (0..20), grayscale, sepia, invert (0..1), hueRotate (0..360).
- crop: id, left, top, right, bottom (fractions 0..0.9).
- style: id, radius (corner rounding px), shadow (true/false).
- animate: id, in and/or out (one of: none, fade, slide-up, slide-down, slide-left, slide-right, zoom-in, zoom-out, pop, rise, blur).
- timing: id, start, duration.
- audio: id, volume (0..2), speed (0.25..4).
- order: id, direction ("front" | "back" | "forward" | "backward").
- duplicate: id. delete: id.
- add_media: mediaId (from the library list), x, y, scale.
- add_stock: query (short English search), kind ("photo" | "video" | "audio"), orientation ("landscape" | "portrait" | "square"), x, y, scale, fit. Free stock library; use it whenever the user wants a picture, background, clip or music you do not have.
- generate: kind ("image" | "video"), prompt (a rich, detailed generation prompt). This does NOT run anything; it opens the paid AI generator pre-filled for the user to confirm. Use only when the user explicitly asks to generate/create with AI or stock clearly will not do.
- select: id. Selects a layer so the user sees it.

Rules:
- Refer to existing layers only by their id from the scene. New layers made earlier in the same list can be referred to as "new:0", "new:1"… in the order you created them.
- "this", "it", "the photo" usually mean the selected layer; otherwise the most obvious match.
- Make good design choices: readable contrast, sensible hierarchy, keep text inside the page, centre things unless told otherwise.
- reply: one or two short sentences, in the user's language, saying what you did. No markdown.
- If the request is not about editing this design, do nothing (empty ops) and say what you can help with.
`.trim();

const OP_NAMES = [
  "set_canvas", "add_text", "update", "place", "effects", "crop", "style", "animate", "timing",
  "audio", "order", "duplicate", "delete", "add_media", "add_stock", "generate", "select",
];

// One flat op shape. Gemini's OpenAI-compatible endpoint is happier with a
// single object of optional fields than with oneOf unions.
const OP_SCHEMA = {
  type: "object",
  properties: {
    op: { type: "string", enum: OP_NAMES },
    id: { type: "string" },
    aspect: { type: "string", enum: ["16:9", "9:16", "1:1", "4:5"] },
    background: { type: "string" },
    text: { type: "string" },
    x: { type: "number" },
    y: { type: "number" },
    fontSize: { type: "number" },
    fontWeight: { type: "number" },
    color: { type: "string" },
    fontFamily: { type: "string" },
    align: { type: "string", enum: ["left", "centre", "right"] },
    italic: { type: "boolean" },
    uppercase: { type: "boolean" },
    underline: { type: "boolean" },
    letterSpacing: { type: "number" },
    lineHeight: { type: "number" },
    bgColor: { type: "string" },
    bgOpacity: { type: "number" },
    strokeColor: { type: "string" },
    strokeWidth: { type: "number" },
    start: { type: "number" },
    duration: { type: "number" },
    scale: { type: "number" },
    rotation: { type: "number" },
    opacity: { type: "number" },
    flipH: { type: "boolean" },
    flipV: { type: "boolean" },
    fit: { type: "string", enum: ["contain", "cover"] },
    preset: { type: "string" },
    brightness: { type: "number" },
    contrast: { type: "number" },
    saturation: { type: "number" },
    blur: { type: "number" },
    grayscale: { type: "number" },
    sepia: { type: "number" },
    invert: { type: "number" },
    hueRotate: { type: "number" },
    left: { type: "number" },
    top: { type: "number" },
    right: { type: "number" },
    bottom: { type: "number" },
    radius: { type: "number" },
    shadow: { type: "boolean" },
    in: { type: "string" },
    out: { type: "string" },
    volume: { type: "number" },
    speed: { type: "number" },
    direction: { type: "string", enum: ["front", "back", "forward", "backward"] },
    mediaId: { type: "string" },
    query: { type: "string" },
    kind: { type: "string", enum: ["photo", "video", "audio", "image"] },
    orientation: { type: "string", enum: ["landscape", "portrait", "square"] },
    prompt: { type: "string" },
  },
  required: ["op"],
};

const TOOL = {
  type: "function",
  function: {
    name: "apply_edits",
    description: "Apply edits to the user's design.",
    parameters: {
      type: "object",
      properties: {
        reply: { type: "string", description: "Short message to the user about what was done." },
        ops: { type: "array", items: OP_SCHEMA, description: "Operations, applied in order." },
      },
      required: ["reply", "ops"],
    },
  },
};

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

  const upstream = await aiChat(
    {
      model: MODEL,
      messages,
      tools: [TOOL],
      tool_choice: { type: "function", function: { name: "apply_edits" } },
      temperature: 0.4,
      max_tokens: 1500,
    },
    { label: "editor-agent", expectToolCall: "apply_edits" },
  );

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    console.error("editor-agent upstream error:", upstream.status, detail.slice(0, 500));
    if (upstream.status === 429) return json({ error: "rate_limited" }, 429);
    return json({ error: "unavailable" }, 502);
  }

  const data = await upstream.json().catch(() => null);
  const call = data?.choices?.[0]?.message?.tool_calls?.find(
    (c: { function?: { name?: string } }) => c?.function?.name === "apply_edits",
  );
  let args: { reply?: unknown; ops?: unknown } = {};
  try {
    args = JSON.parse(call?.function?.arguments ?? "{}");
  } catch {
    return json({ error: "unavailable" }, 502);
  }
  const ops = Array.isArray(args.ops)
    ? args.ops.filter((o) => o && typeof o === "object" && OP_NAMES.includes((o as { op?: string }).op ?? "")).slice(0, 40)
    : [];
  const reply = typeof args.reply === "string" ? args.reply.slice(0, 600) : "";

  const usage = data?.usage;
  if (usage) console.log(`[editor-agent] tokens in=${usage.prompt_tokens} out=${usage.completion_tokens} ops=${ops.length}`);

  return json({ reply, ops });
});
