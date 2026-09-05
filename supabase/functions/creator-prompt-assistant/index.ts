// Creator Flow prompt assistant — the text-to-text node and the ⌘K chat on
// /creator/flow. Ported from HeliosGen's /api/assistant route (MIT) onto the
// same AI gateway enhance-text already uses; the system prompt is theirs.
//
// Unauthenticated on purpose: crafting a prompt costs a fraction of a cent and
// the canvas works signed-out (guest mode). Abuse control is the per-IP limit,
// the same as enhance-text. Generation itself still needs a wallet and DHB.
//
// Streams as SSE when `stream: true`: `data: {"delta":"…"}` per token, then
// `data: [DONE]`. Non-streaming callers get `{ text }`.
import { corsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { rateLimitByIp } from "../_shared/auth.ts";
import { aiChat } from "../_shared/ai-chat.ts";

/** Models the picker offers, keyed by the id the client sends. */
const MODELS: Record<string, string> = {
  "gemini-flash": "google/gemini-2.5-flash",
  "gemini-pro": "google/gemini-2.5-pro",
  "gpt-5-mini": "openai/gpt-5-mini",
  "claude-haiku": "anthropic/claude-haiku-4.5",
};
const DEFAULT_MODEL = "gemini-flash";

const MAX_MESSAGES = 24;
const MAX_CHARS = 12_000;

/** HeliosGen's prompt-crafting persona, verbatim. */
const CRAFT_PROMPT = `
You are an elite AI prompt crafter specialized in image and video generation prompts.

Your ONLY job is to help users craft, improve, or generate prompts for AI image and video generation models.

STRICT SCOPE RULE:
- If the user asks ANYTHING outside of prompt crafting, prompt improvement, or image/video generation prompts (e.g. coding, general knowledge, math, writing, advice, opinions, or any unrelated topic), you MUST refuse politely and say exactly this:
  "I'm a prompt crafting assistant. I can only help you create or improve prompts for AI image and video generation. Share an idea and I'll craft the perfect prompt for you!"
- Do NOT answer off-topic questions under any circumstance.

For on-topic requests (prompt crafting and generation):

- If the user provides a prompt or idea:
  - Return ONLY the improved prompt
  - Do NOT add introductions
  - Do NOT explain anything
  - Do NOT use quotes
  - Do NOT say "Here is the improved prompt"
  - Do NOT use markdown titles
  - Output the final optimized prompt directly

- If the user asks for help, inspiration, ideas, or does not provide enough details:
  - Create a complete original prompt based on their request
  - Make it creative, detailed, and visually powerful

- Always enhance: visual details, lighting, atmosphere, composition, camera angles, cinematic feel, textures, colors, realism/stylization, motion (for video prompts), environment details.

- For video prompts: include camera movement, motion details, pacing, cinematic transitions, environment animation, subject movement.

- Adapt automatically to the requested style: cinematic, anime, realistic, 3D, cyberpunk, fantasy, horror, luxury, fashion, advertisement, documentary, etc.

- Keep prompts concise but highly descriptive.
- Never ask follow-up questions.
- Always generate the best possible final prompt immediately.
`.trim();

/** The assistant node's rewrite persona, also HeliosGen's. */
const REWRITE_PROMPT =
  "You are a senior prompt engineer specializing in optimizing prompts for clarity, precision, and effectiveness. Your task is to take an existing user prompt and rewrite it to improve its structure, specificity, and performance for an AI model. Preserve the original intent while enhancing wording, removing ambiguity, and adding useful detail where appropriate. Do not change the task itself. Output only the improved prompt. Do not include any explanations, comments, formatting markers, or quotation marks.";

const PERSONAS: Record<string, string> = { craft: CRAFT_PROMPT, rewrite: REWRITE_PROMPT };

interface Message {
  role: "user" | "assistant" | "system";
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

  const limited = await rateLimitByIp(req, "creator_prompt_assistant", { limit: 90, windowMs: 60 * 60 * 1000 });
  if (limited) return limited;

  if (!Deno.env.get("GEMINI_API_KEY") && !Deno.env.get("LOVABLE_API_KEY")) {
    return json({ error: "AI service not configured" }, 500);
  }

  let body: {
    messages?: Message[];
    prompt?: string;
    persona?: string;
    model?: string;
    stream?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const model = MODELS[body.model ?? DEFAULT_MODEL] ?? MODELS[DEFAULT_MODEL];
  const persona = PERSONAS[body.persona ?? "craft"] ?? CRAFT_PROMPT;

  let history: Message[] = [];
  if (Array.isArray(body.messages) && body.messages.length > 0) {
    history = body.messages
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-MAX_MESSAGES)
      .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  } else if (typeof body.prompt === "string" && body.prompt.trim()) {
    history = [{ role: "user", content: body.prompt.trim().slice(0, MAX_CHARS) }];
  }
  if (history.length === 0) return json({ error: "messages or prompt is required" }, 400);

  const messages: Message[] = [{ role: "system", content: persona }, ...history];
  const stream = body.stream === true;

  const upstream = await aiChat(
    { model, messages, stream, max_tokens: 1024 },
    { label: "creator-prompt-assistant" },
  );

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    console.error("creator-prompt-assistant gateway error:", upstream.status, detail);
    if (upstream.status === 429) return json({ error: "Rate limit exceeded. Please try again in a moment." }, 429);
    if (upstream.status === 402) return json({ error: "AI credits exhausted." }, 402);
    return json({ error: "The assistant is unavailable right now." }, 502);
  }

  if (!stream) {
    const data = await upstream.json();
    const text = data?.choices?.[0]?.message?.content?.trim() ?? "";
    return json({ text, model: body.model ?? DEFAULT_MODEL });
  }

  // Re-emit the gateway's OpenAI-style stream as plain `{delta}` events so the
  // client does not have to know which provider answered.
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = upstream.body!.getReader();
  const out = new ReadableStream<Uint8Array>({
    async pull(controller) {
      let buffer = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const payload = line.slice(6).trim();
            if (payload === "[DONE]") continue;
            try {
              const parsed = JSON.parse(payload);
              const delta = parsed?.choices?.[0]?.delta?.content;
              if (typeof delta === "string" && delta) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`));
              }
            } catch {
              /* a partial frame; the next chunk completes it */
            }
          }
        }
      } catch (err) {
        console.error("creator-prompt-assistant stream error:", err);
      } finally {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
    cancel() {
      reader.cancel().catch(() => undefined);
    },
  });

  return new Response(out, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});
