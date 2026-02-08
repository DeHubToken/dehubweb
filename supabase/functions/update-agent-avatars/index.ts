/**
 * Edge function to update profile pictures for all registered AI agents on DeHub.
 *
 * Fetches each agent's avatar PNG from the `agent-avatars` storage bucket,
 * re-authenticates with the DeHub API, and uploads the avatar via FormData.
 * After upload, verifies the avatar persisted via account_info and retries once if not.
 *
 * Call via: POST /functions/v1/update-agent-avatars
 * Optional body: { "agents": ["leothedev", "omr_"] }
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
): Promise<{ ok: boolean; detail?: string; responseBody?: string }> {
  try {
    // Convert blob to ArrayBuffer then to Uint8Array for reliable File creation
    const arrayBuffer = await avatarBlob.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);
    
    const formData = new FormData();
    formData.append(
      "avatarImg",
      new File([uint8], avatarFilename, { type: "image/png" }),
    );
    // Only send the avatar — no username (causes "already in use"), no bio
    // This isolates whether file upload works independently

    const response = await fetch(`${DEHUB_API_BASE}/api/update_profile`, {
      method: "POST",
      headers: { Authorization: `Bearer ${authToken}` },
      body: formData,
    });

    const responseText = await response.text();
    console.log(`[AvatarUpdate] update_profile response for "${username}" (${response.status}): ${responseText}`);

    if (!response.ok) {
      return { ok: false, detail: `${response.status}: ${responseText}`, responseBody: responseText };
    }

    return { ok: true, responseBody: responseText };
  } catch (error) {
    console.error(`Profile update error for "${username}":`, error);
    return { ok: false, detail: String(error) };
  }
}

/* ── Verification helper ────────────────────────────────────────────── */

async function verifyAvatarPersisted(username: string): Promise<{ hasAvatar: boolean; avatarUrl?: string }> {
  try {
    const response = await fetch(`${DEHUB_API_BASE}/api/account_info/${username}`);
    if (!response.ok) {
      const text = await response.text();
      console.error(`[AvatarUpdate] account_info failed for "${username}" (${response.status}): ${text}`);
      return { hasAvatar: false };
    }
    const data = await response.json();
    // Log full raw response to understand structure
    console.log(`[AvatarUpdate] Raw account_info for "${username}": ${JSON.stringify(data).substring(0, 1000)}`);
    
    // The result might be the profile directly, or nested differently
    const profile = typeof data.result === 'object' && data.result !== null ? data.result : data;
    const avatarUrl = profile.avatarImageUrl || profile.avatar_image_url || profile.avatarImg || profile.avatar || null;
    console.log(`[AvatarUpdate] Verification for "${username}": avatarUrl = ${avatarUrl || "(empty)"}`);
    return { hasAvatar: !!avatarUrl, avatarUrl };
  } catch (error) {
    console.error(`[AvatarUpdate] Verification error for "${username}":`, error);
    return { hasAvatar: false };
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
      verified: boolean;
      retried?: boolean;
      avatarUrl?: string;
      error?: string;
      responseBody?: string;
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
            verified: false,
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
            verified: false,
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
            verified: false,
            error: updateResult.detail,
            responseBody: updateResult.responseBody,
          });
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }

        // 4. Verify the avatar actually persisted
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const verification = await verifyAvatarPersisted(agentName);

        if (verification.hasAvatar) {
          results.push({ name: agentName, success: true, verified: true, avatarUrl: verification.avatarUrl });
          console.log(`[AvatarUpdate] ✓ Avatar verified for "${agentName}": ${verification.avatarUrl}`);
        } else {
          // 5. Retry once
          console.log(`[AvatarUpdate] ⚠ Avatar NOT persisted for "${agentName}", retrying…`);
          await new Promise((resolve) => setTimeout(resolve, 2000));

          // Re-authenticate (token may have expired or been rate-limited)
          const retryToken = await authenticateWithDeHub(agent.wallet_private_key);
          if (!retryToken) {
            results.push({
              name: agentName,
              success: false,
              verified: false,
              retried: true,
              error: "DeHub re-auth failed on retry",
              responseBody: updateResult.responseBody,
            });
            continue;
          }

          await new Promise((resolve) => setTimeout(resolve, 500));

          // Re-download avatar (blob may have been consumed)
          const { data: retryAvatarData } = await supabase
            .storage
            .from("agent-avatars")
            .download(avatarPath);

          if (!retryAvatarData) {
            results.push({
              name: agentName,
              success: false,
              verified: false,
              retried: true,
              error: "Avatar re-download failed on retry",
            });
            continue;
          }

          const retryResult = await updateProfileWithAvatar(
            retryToken,
            agentName,
            bio,
            retryAvatarData,
            avatarPath,
          );

          await new Promise((resolve) => setTimeout(resolve, 1500));
          const retryVerification = await verifyAvatarPersisted(agentName);

          if (retryVerification.hasAvatar) {
            results.push({ name: agentName, success: true, verified: true, retried: true, avatarUrl: retryVerification.avatarUrl });
            console.log(`[AvatarUpdate] ✓ Avatar verified on retry for "${agentName}": ${retryVerification.avatarUrl}`);
          } else {
            results.push({
              name: agentName,
              success: false,
              verified: false,
              retried: true,
              error: "Avatar still not persisted after retry",
              responseBody: retryResult.responseBody,
            });
            console.error(`[AvatarUpdate] ✗ Avatar STILL not persisted for "${agentName}" after retry`);
          }
        }

        // Rate-limit delay between agents
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`[AvatarUpdate] Error for "${agentName}":`, error);
        results.push({ name: agentName, success: false, verified: false, error: String(error) });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;
    const verifiedCount = results.filter((r) => r.verified).length;

    console.log(
      `[AvatarUpdate] Complete: ${successCount} succeeded, ${verifiedCount} verified, ${failCount} failed`,
    );

    return new Response(
      JSON.stringify(
        {
          message: `Updated avatars for ${successCount}/${agents.length} agents (${verifiedCount} verified)`,
          success_count: successCount,
          verified_count: verifiedCount,
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
