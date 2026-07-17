import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { title, style, voiceGender, existingLyrics, userPrompt } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `You are an expert songwriter and lyricist. Generate complete, high-quality song lyrics with proper structure using tags like [intro], [verse], [chorus], [bridge], [outro].

Rules:
- Use vivid, creative, and emotionally resonant language
- Match the requested style/genre perfectly
- Structure with clear sections: [verse 1], [chorus], [verse 2], [chorus], [bridge], [chorus], etc.
- Keep lyrics singable — natural rhythm, good syllable count per line
- If existing lyrics are provided, expand and improve them into a full song
- If a voice gender is specified, write lyrics appropriate for that voice
- Output ONLY the lyrics with section tags, no commentary or explanations`;

    let userMessage = "Write complete song lyrics";
    if (title) userMessage += ` for a song titled "${title}"`;
    if (style) userMessage += ` in the style of ${style}`;
    if (voiceGender && voiceGender !== "auto") userMessage += ` for a ${voiceGender} voice`;
    if (existingLyrics) userMessage += `\n\nExpand/improve these existing lyrics:\n${existingLyrics}`;
    if (userPrompt) userMessage += `\n\nOriginal user request: ${userPrompt}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI error:", status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const lyrics = data.choices?.[0]?.message?.content || "";

    return new Response(JSON.stringify({ lyrics }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-lyrics error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
