// Translate one finalised live-caption line into every language somebody in
// the room is currently reading.
//
// Three decisions carry this function, and each of them is a cost decision:
//
// 1. **One call, all languages.** The alternative — a call per language — pays
//    for the system prompt and the source line once per language. Translating
//    into ten languages in a single response costs roughly 40% less and makes
//    a tenth as many requests, which matters when a talkative stage finalises
//    a line every five seconds.
// 2. **Final lines only.** The caller never sends interim text. Interims are
//    revised every ~350ms, so translating them would multiply the bill by an
//    order of magnitude to produce subtitles that visibly rewrite themselves.
// 3. **Only languages with a live reader.** The caller derives the list from
//    Realtime presence, so a picker offering fourteen languages costs whatever
//    the room is actually reading — usually two or three.
//
// The model chain is the one `translate-transcript` already proved: fal's
// OpenRouter router on Claude Haiku, with the Lovable AI gateway behind it.
// Haiku is not a compromise here — at this volume it is roughly an order of
// magnitude cheaper than the dedicated machine-translation APIs, which bill
// per character and have no cheap tier.
import {
  corsHeaders,
  handleCorsPreflight,
  jsonResponse,
  guardPaidEndpoint,
  serviceClient,
} from "../_shared/auth.ts";

/**
 * Languages the picker offers. An allowlist rather than free text: the code
 * goes into a model prompt, and the response is keyed by it.
 */
const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  pt: "Portuguese",
  it: "Italian",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese (Simplified)",
  ar: "Arabic",
  hi: "Hindi",
  ru: "Russian",
  tr: "Turkish",
  id: "Indonesian",
};

/**
 * Hard ceiling on languages per line. The presence-derived list should never
 * approach this; the cap is here so a modified client cannot turn one spoken
 * sentence into an arbitrarily large bill.
 */
const MAX_LANGUAGES = 12;
/** Longest line worth translating. Live utterances run well under this. */
const MAX_TEXT_CHARS = 600;

function systemPrompt(languages: string[]): string {
  const named = languages.map((code) => `${code} (${LANGUAGE_NAMES[code]})`).join(", ");
  return (
    "You are a live subtitle translator working in real time. " +
    `Translate the LINE into each of these languages: ${named}. ` +
    "Return ONLY a JSON object whose keys are exactly those language codes and whose " +
    "values are the translated line. No markdown fences, no commentary, no explanation. " +
    "Translate the LINE only — CONTEXT, if given, is the preceding speech and exists " +
    "solely to disambiguate pronouns, names and homonyms; never translate it or include it. " +
    "Keep each translation about as long as the original: it is read on screen for a few " +
    "seconds, and a longer rendering scrolls away before it can be read. " +
    "A line with nothing to translate is returned unchanged for that language."
  );
}

/** Keep only the requested languages, as strings, and drop anything else the model invented. */
function coerce(raw: unknown, languages: string[]): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const code of languages) {
    const value = (raw as Record<string, unknown>)[code];
    if (typeof value === "string" && value.trim()) out[code] = value.trim().slice(0, MAX_TEXT_CHARS);
  }
  return out;
}

async function viaFal(
  text: string,
  context: string,
  languages: string[],
): Promise<Record<string, string> | null> {
  const FAL_KEY = Deno.env.get("FAL_KEY");
  if (!FAL_KEY) return null;
  try {
    const res = await fetch("https://fal.run/openrouter/router", {
      method: "POST",
      headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "anthropic/claude-haiku-4.5",
        system_prompt: systemPrompt(languages),
        prompt: context ? `CONTEXT: ${context}\nLINE: ${text}` : `LINE: ${text}`,
        temperature: 0.1,
        // Twelve short lines plus JSON scaffolding. Generous, and never the
        // binding constraint on a single spoken sentence.
        max_tokens: 2000,
      }),
    });
    if (!res.ok) {
      console.error(`[translate-caption] fal ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    const data = await res.json();
    const raw = typeof data.output === "string" ? data.output.trim() : "";
    if (!raw) return null;
    // The prompt forbids fences; strip them anyway rather than lose a line to formatting.
    const unfenced = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    return coerce(JSON.parse(unfenced), languages);
  } catch (e) {
    console.error("[translate-caption] fal failed", e);
    return null;
  }
}

async function viaGateway(
  text: string,
  context: string,
  languages: string[],
): Promise<Record<string, string>> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return {};
  const properties: Record<string, unknown> = {};
  for (const code of languages) {
    properties[code] = { type: "string", description: `The line in ${LANGUAGE_NAMES[code]}` };
  }

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-lite",
      messages: [
        { role: "system", content: systemPrompt(languages) },
        { role: "user", content: context ? `CONTEXT: ${context}\nLINE: ${text}` : `LINE: ${text}` },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "return_translations",
            description: "Return the line translated into each requested language",
            parameters: {
              type: "object",
              properties,
              required: languages,
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "return_translations" } },
    }),
  });
  if (!res.ok) {
    console.error(`[translate-caption] gateway ${res.status}`);
    return {};
  }
  const json = await res.json();
  const args = json?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  return coerce(typeof args === "string" ? JSON.parse(args) : args, languages);
}

/** Same seat check as stage-caption-token: only someone who can talk can caption. */
async function maySpeak(stageId: string, wallet: string): Promise<boolean> {
  const admin = serviceClient();
  const { data: stage } = await admin
    .from("audio_spaces")
    .select("id, host_wallet_address")
    .eq("id", stageId)
    .maybeSingle();
  if (!stage) return false;
  if ((stage.host_wallet_address || "").toLowerCase() === wallet) return true;

  const { data: seat } = await admin
    .from("space_participants")
    .select("role")
    .eq("space_id", stage.id)
    .ilike("wallet_address", wallet)
    .is("left_at", null)
    .maybeSingle();
  return seat?.role === "host" || seat?.role === "speaker";
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    const body = await req.json().catch(() => null);
    const spaceId = typeof body?.spaceId === "string" ? body.spaceId : "";
    const lineId = typeof body?.lineId === "string" ? body.lineId : "";
    const text = typeof body?.text === "string" ? body.text.trim().slice(0, MAX_TEXT_CHARS) : "";
    const context = typeof body?.context === "string" ? body.context.trim().slice(0, MAX_TEXT_CHARS) : "";
    const requested = Array.isArray(body?.languages) ? body.languages : [];

    if (!spaceId || !lineId || !text) {
      return jsonResponse({ error: "spaceId, lineId and text are required" }, 400);
    }

    const languages = [...new Set(requested)]
      .filter((code): code is string => typeof code === "string" && code in LANGUAGE_NAMES)
      .slice(0, MAX_LANGUAGES);
    if (!languages.length) {
      // Nobody is reading a translation right now. Not an error — the common case.
      return jsonResponse({ id: lineId, translations: {} });
    }

    // A busy two-hour stage finalises on the order of 1,300 lines. The cap is
    // a runaway guard, not a ration.
    const guard = await guardPaidEndpoint(req, "translate-caption", {
      limit: 3000,
      windowMs: 60 * 60 * 1000,
    });
    if (!guard.ok) return guard.response;

    if (!(await maySpeak(spaceId, guard.wallet))) {
      return jsonResponse({ error: "Not entitled to caption this stage." }, 403);
    }

    let translations = await viaFal(text, context, languages);
    if (!translations || Object.keys(translations).length === 0) {
      translations = await viaGateway(text, context, languages);
    }

    // Partial results ship. A line translated into eight of ten languages is
    // eight rooms reading their own language and two falling back to the
    // source, which is strictly better than everybody falling back.
    return new Response(JSON.stringify({ id: lineId, translations }), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error("[translate-caption]", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
