/**
 * Edge function to update profile pictures for all registered AI agents on DeHub.
 *
 * Fetches each agent's avatar PNG from the `agent-avatars` storage bucket,
 * re-authenticates with the DeHub API, and uploads the avatar via FormData.
 *
 * Call via: POST /functions/v1/update-agent-avatars
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Wallet } from "npm:ethers@^6.16.0";

const DEHUB_API_BASE = "https://api.dehub.io";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/* ── DeHub auth helpers ─────────────────────────────────────────────── */

function buildAuthMessage(address: string, timestamp: number): string {
  const displayedDate = new Date(timestamp * 1000);
  return `Welcome to DeHub!\n\nClick to sign in for authentication.\nSignatures are valid for 24 hours.\nYour wallet address is ${address}.\nIt is ${displayedDate.toUTCString()}.`;
}

async function authenticateWithDeHub(
  privateKey: string,
): Promise<string | null> {
  try {
    const wallet = new Wallet(privateKey);
    const address = wallet.address.toLowerCase();
    const timestamp = Math.floor(Date.now() / 1000);
    const message = buildAuthMessage(address, timestamp);
    const sig = await wallet.signMessage(message);

    const response = await fetch(`${DEHUB_API_BASE}/api/web/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, sig, timestamp, chainId: 8453 }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `Auth failed for ${address} (${response.status}):`,
        errorText,
      );
      return null;
    }

    const data = await response.json();
    return data.result?.token || data.token || null;
  } catch (error) {
    console.error("Auth error:", error);
    return null;
  }
}

/* ── Profile update with avatar ─────────────────────────────────────── */

async function updateProfileWithAvatar(
  authToken: string,
  username: string,
  bio: string,
  avatarBlob: Blob,
  avatarFilename: string,
): Promise<{ ok: boolean; detail?: string }> {
  try {
    const formData = new FormData();
    formData.append(
      "avatarImg",
      new File([avatarBlob], avatarFilename, { type: "image/png" }),
    );
    formData.append("username", username);
    formData.append("aboutMe", bio);

    const response = await fetch(`${DEHUB_API_BASE}/api/update_profile`, {
      method: "POST",
      headers: { Authorization: `Bearer ${authToken}` },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `Profile update failed for "${username}" (${response.status}):`,
        errorText,
      );
      return { ok: false, detail: `${response.status}: ${errorText}` };
    }

    return { ok: true };
  } catch (error) {
    console.error(`Profile update error for "${username}":`, error);
    return { ok: false, detail: String(error) };
  }
}

/* ── Main handler ───────────────────────────────────────────────────── */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Parse optional agents filter from request body
    let targetAgents: string[] | null = null;
    try {
      const body = await req.json();
      if (body?.agents && Array.isArray(body.agents) && body.agents.length > 0) {
        targetAgents = body.agents.map((a: string) => a.toLowerCase().trim());
        console.log(`[AvatarUpdate] Targeting specific agents: ${targetAgents.join(", ")}`);
      }
    } catch {
      // No body or invalid JSON — process all agents
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch agents that already have wallet credentials (registered)
    let query = supabase
      .from("ai_agents")
      .select("*")
      .not("wallet_private_key", "is", null);

    if (targetAgents) {
      query = query.in("name", targetAgents);
    }

    const { data: agents, error: fetchError } = await query;

    if (fetchError) {
      console.error("Failed to fetch agents:", fetchError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch agents" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!agents || agents.length === 0) {
      return new Response(
        JSON.stringify({ message: "No registered agents found", count: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(
      `[AvatarUpdate] Found ${agents.length} registered agents to update`,
    );

    const results: Array<{
      name: string;
      success: boolean;
      error?: string;
    }> = [];

    for (const agent of agents) {
      const agentName = agent.name;
      console.log(`[AvatarUpdate] Processing "${agentName}"…`);

      try {
        // 1. Download avatar from storage bucket
        const avatarPath = `${agentName}.png`;
        const { data: avatarData, error: downloadError } = await supabase
          .storage
          .from("agent-avatars")
          .download(avatarPath);

        if (downloadError || !avatarData) {
          console.error(
            `[AvatarUpdate] Avatar download failed for "${agentName}":`,
            downloadError,
          );
          results.push({
            name: agentName,
            success: false,
            error: `Avatar not found: ${avatarPath}`,
          });
          continue;
        }

        // 2. Authenticate with DeHub
        const authToken = await authenticateWithDeHub(agent.wallet_private_key);
        if (!authToken) {
          results.push({
            name: agentName,
            success: false,
            error: "DeHub auth failed",
          });
          continue;
        }

        // Small delay before profile update
        await new Promise((resolve) => setTimeout(resolve, 500));

        // 3. Upload avatar via FormData
        const bio = agent.description || `AI agent: ${agentName}`;
        const updateResult = await updateProfileWithAvatar(
          authToken,
          agentName,
          bio,
          avatarData,
          avatarPath,
        );

        if (!updateResult.ok) {
          results.push({
            name: agentName,
            success: false,
            error: updateResult.detail,
          });
        } else {
          results.push({ name: agentName, success: true });
          console.log(`[AvatarUpdate] ✓ Avatar set for "${agentName}"`);
        }

        // Rate-limit delay between agents
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`[AvatarUpdate] Error for "${agentName}":`, error);
        results.push({ name: agentName, success: false, error: String(error) });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    console.log(
      `[AvatarUpdate] Complete: ${successCount} succeeded, ${failCount} failed`,
    );

    return new Response(
      JSON.stringify(
        {
          message: `Updated avatars for ${successCount}/${agents.length} agents`,
          success_count: successCount,
          fail_count: failCount,
          results,
        },
        null,
        2,
      ),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[AvatarUpdate] Fatal error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
