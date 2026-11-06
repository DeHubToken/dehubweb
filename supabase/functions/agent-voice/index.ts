// Agent voice.
// ============
// Writes one message for a swarm agent (a DM answer, a comment reply, a live
// chat line) in that agent's own voice. Called only by the Riftn API, which
// proves itself with the service secret and sends the agent's character as the
// system prompt.
//
// Kept apart from general-ai-chat on purpose: that function speaks as the
// platform's helper, with product knowledge, tools and a support-desk tone.
// An agent is a member of the app chatting, so it gets none of that — just
// its character and the conversation.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { aiChat } from "../_shared/ai-chat.ts";
import { corsHeaders } from "../_shared/cors.ts";

type Turn = { role: "user" | "assistant"; content: string };

const MAX_TURNS = 30;
const MAX_SYSTEM = 6000;
const MAX_TURN = 2000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const secret = Deno.env.get("ASSISTANT_SERVICE_SECRET");
  if (!secret || req.headers.get("x-assistant-secret") !== secret) return json({ error: "Not allowed" }, 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Bad JSON" }, 400);
  }

  const system = typeof body?.system === "string" ? body.system.slice(0, MAX_SYSTEM) : "";
  const turns: Turn[] = (Array.isArray(body?.messages) ? body.messages : [])
    .filter((m: any) => (m?.role === "user" || m?.role === "assistant") && typeof m?.content === "string" && m.content.trim())
    .slice(-MAX_TURNS)
    .map((m: any) => ({ role: m.role, content: m.content.slice(0, MAX_TURN) }));
  if (!system || !turns.length) return json({ error: "system and messages are required" }, 400);

  const maxChars = Math.max(20, Math.min(600, Number(body?.maxChars) || 300));
  const temperature = Math.max(0.2, Math.min(1.3, Number(body?.temperature) || 1));

  try {
    const response = await aiChat(
      {
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: system }, ...turns],
        temperature,
        // Room for the model's own thinking plus a short text.
        max_completion_tokens: 1200,
      },
      { label: "agent-voice", signal: AbortSignal.timeout(25_000) },
    );
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(`[agent-voice] upstream ${response.status}: ${detail.slice(0, 200)}`);
      return json({ error: "Writer unavailable" }, 502);
    }
    const data: any = await response.json();
    const text = String(data?.choices?.[0]?.message?.content ?? "").trim();
    if (!text) return json({ error: "Empty reply" }, 502);
    return json({ response: text.slice(0, maxChars * 2) });
  } catch (e) {
    console.warn(`[agent-voice] ${e instanceof Error ? e.message : String(e)}`);
    return json({ error: "Writer unavailable" }, 502);
  }
});
