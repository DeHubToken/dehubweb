import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-wallet-address",
};

// Reserved bot identity for the AI Admin
const BOT_WALLET = "0x000000000000000000000000000000000000a1de";
const BOT_USERNAME = "ai-admin";
const BOT_DISPLAY_NAME = "AI Admin";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { communityId, prompt, askerName } = await req.json();

    if (!communityId || !prompt || typeof prompt !== "string") {
      return new Response(
        JSON.stringify({ error: "communityId and prompt are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Fetch community context
    const { data: community } = await admin
      .from("communities")
      .select("name, description, category")
      .eq("id", communityId)
      .maybeSingle();

    // Fetch recent chat history for context
    const { data: recent } = await admin
      .from("community_chat_messages")
      .select("display_name, username, content, message_type")
      .eq("community_id", communityId)
      .order("created_at", { ascending: false })
      .limit(15);

    const history = (recent || [])
      .reverse()
      .filter((m) => m.message_type === "text" || m.message_type === "admin_response")
      .map((m) => `${m.display_name || m.username || "User"}: ${m.content}`)
      .join("\n");

    const systemPrompt = `You are "AI Admin", the live AI moderator and helper for the "${community?.name || "this"}" community on DeHub (a decentralized social platform).

Community description: ${community?.description || "(no description)"}
Category: ${community?.category || "general"}

Your role:
- Answer questions live for community members in chat.
- Be helpful, friendly, and concise (2-4 sentences when possible).
- Stay relevant to the community's topic and DeHub.
- When unsure, say so honestly. Never invent facts about specific members.
- Use markdown sparingly. No emojis spam.

Recent chat (for context):
${history || "(no recent messages)"}

A member asked you the following with /admin. Reply directly to them.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `${askerName ? askerName + ": " : ""}${prompt}` },
        ],
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("AI gateway error", aiResp.status, errText);
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit, try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResp.json();
    const reply =
      aiJson?.choices?.[0]?.message?.content?.toString().trim() ||
      "Sorry, I couldn't generate a response.";

    // Insert as admin_response message
    const { error: insertErr } = await admin
      .from("community_chat_messages")
      .insert({
        community_id: communityId,
        wallet_address: BOT_WALLET,
        username: BOT_USERNAME,
        display_name: BOT_DISPLAY_NAME,
        avatar_url: null,
        content: reply,
        message_type: "admin_response",
        image_url: null,
        reply_to_id: null,
        reactions: {},
      });

    if (insertErr) {
      console.error("Insert error", insertErr);
      return new Response(JSON.stringify({ error: insertErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("community-admin-chat error", e);
    return new Response(JSON.stringify({ error: e?.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
