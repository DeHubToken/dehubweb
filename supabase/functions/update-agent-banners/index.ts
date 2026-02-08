/**
 * Edge function to upload custom banner/cover images for all registered AI agents on DeHub.
 *
 * Each agent gets a unique banner named `agent-{username}.png` from the storage bucket.
 * After upload, verifies the banner persisted via account_info and retries once if not.
 *
 * Call via: POST /functions/v1/update-agent-banners
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
      console.error(`Auth failed for ${address} (${response.status}):`, errorText);
      return null;
    }

    const data = await response.json();
    return data.result?.token || data.token || null;
  } catch (error) {
    console.error("Auth error:", error);
    return null;
  }
}

async function updateProfileBanner(
  authToken: string,
  username: string,
  bannerBlob: Blob,
  bannerFilename: string,
): Promise<{ ok: boolean; detail?: string; responseBody?: string }> {
  try {
    const formData = new FormData();
    formData.append(
      "coverImg",
      new File([bannerBlob], bannerFilename, { type: "image/png" }),
    );
    // Include username — the API may need it to associate the banner
    formData.append("username", username);

    const response = await fetch(`${DEHUB_API_BASE}/api/update_profile`, {
      method: "POST",
      headers: { Authorization: `Bearer ${authToken}` },
      body: formData,
    });

    const responseText = await response.text();
    console.log(`[BannerUpdate] update_profile response for "${username}" (${response.status}): ${responseText}`);

    const isUsernameConflict = responseText.includes("username is already in use");
    if (!response.ok && !isUsernameConflict) {
      return { ok: false, detail: `${response.status}: ${responseText}`, responseBody: responseText };
    }

    return { ok: true, responseBody: responseText };
  } catch (error) {
    console.error(`Banner update error for "${username}":`, error);
    return { ok: false, detail: String(error) };
  }
}

/* ── Verification helper ────────────────────────────────────────────── */

async function verifyBannerPersisted(username: string): Promise<{ hasBanner: boolean; bannerUrl?: string }> {
  try {
    const response = await fetch(`${DEHUB_API_BASE}/api/account_info/${username}`);
    if (!response.ok) {
      const text = await response.text();
      console.error(`[BannerUpdate] account_info failed for "${username}" (${response.status}): ${text}`);
      return { hasBanner: false };
    }
    const data = await response.json();
    const profile = data.result || data;
    const bannerUrl = profile.coverImageUrl || profile.cover_image_url || null;
    console.log(`[BannerUpdate] Verification for "${username}": coverImageUrl = ${bannerUrl || "(empty)"}`);
    return { hasBanner: !!bannerUrl, bannerUrl };
  } catch (error) {
    console.error(`[BannerUpdate] Verification error for "${username}":`, error);
    return { hasBanner: false };
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
        console.log(`[BannerUpdate] Targeting specific agents: ${targetAgents.join(", ")}`);
      }
    } catch {
      // No body or invalid JSON — process all agents
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!agents || agents.length === 0) {
      return new Response(
        JSON.stringify({ message: "No registered agents found", count: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[BannerUpdate] Found ${agents.length} agents to update`);

    const results: Array<{
      name: string;
      success: boolean;
      verified: boolean;
      retried?: boolean;
      banner?: string;
      bannerUrl?: string;
      error?: string;
      responseBody?: string;
    }> = [];

    for (let i = 0; i < agents.length; i++) {
      const agent = agents[i];
      const bannerPath = `banners/agent-${agent.name}.png`;

      console.log(`[BannerUpdate] Processing "${agent.name}" with custom banner: ${bannerPath}`);

      try {
        // 1. Download custom banner from storage
        const { data: bannerData, error: downloadError } = await supabase
          .storage
          .from("agent-avatars")
          .download(bannerPath);

        if (downloadError || !bannerData) {
          console.error(`[BannerUpdate] Banner download failed for "${agent.name}":`, downloadError);
          results.push({ name: agent.name, success: false, verified: false, error: `Banner not found: ${bannerPath}` });
          continue;
        }

        // 2. Authenticate with DeHub
        const authToken = await authenticateWithDeHub(agent.wallet_private_key);
        if (!authToken) {
          results.push({ name: agent.name, success: false, verified: false, error: "DeHub auth failed" });
          continue;
        }

        await new Promise((resolve) => setTimeout(resolve, 500));

        // 3. Upload banner via FormData
        const updateResult = await updateProfileBanner(
          authToken,
          agent.name,
          bannerData,
          `agent-${agent.name}.png`,
        );

        if (!updateResult.ok) {
          results.push({
            name: agent.name,
            success: false,
            verified: false,
            banner: bannerPath,
            error: updateResult.detail,
            responseBody: updateResult.responseBody,
          });
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }

        // 4. Verify the banner actually persisted
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const verification = await verifyBannerPersisted(agent.name);

        if (verification.hasBanner) {
          results.push({ name: agent.name, success: true, verified: true, banner: bannerPath, bannerUrl: verification.bannerUrl });
          console.log(`[BannerUpdate] ✓ Banner verified for "${agent.name}": ${verification.bannerUrl}`);
        } else {
          // 5. Retry once
          console.log(`[BannerUpdate] ⚠ Banner NOT persisted for "${agent.name}", retrying…`);
          await new Promise((resolve) => setTimeout(resolve, 2000));

          const retryToken = await authenticateWithDeHub(agent.wallet_private_key);
          if (!retryToken) {
            results.push({
              name: agent.name,
              success: false,
              verified: false,
              retried: true,
              banner: bannerPath,
              error: "DeHub re-auth failed on retry",
              responseBody: updateResult.responseBody,
            });
            continue;
          }

          await new Promise((resolve) => setTimeout(resolve, 500));

          // Re-download banner (blob may have been consumed)
          const { data: retryBannerData } = await supabase
            .storage
            .from("agent-avatars")
            .download(bannerPath);

          if (!retryBannerData) {
            results.push({
              name: agent.name,
              success: false,
              verified: false,
              retried: true,
              banner: bannerPath,
              error: "Banner re-download failed on retry",
            });
            continue;
          }

          const retryResult = await updateProfileBanner(
            retryToken,
            agent.name,
            retryBannerData,
            `agent-${agent.name}.png`,
          );

          await new Promise((resolve) => setTimeout(resolve, 1500));
          const retryVerification = await verifyBannerPersisted(agent.name);

          if (retryVerification.hasBanner) {
            results.push({
              name: agent.name,
              success: true,
              verified: true,
              retried: true,
              banner: bannerPath,
              bannerUrl: retryVerification.bannerUrl,
            });
            console.log(`[BannerUpdate] ✓ Banner verified on retry for "${agent.name}": ${retryVerification.bannerUrl}`);
          } else {
            results.push({
              name: agent.name,
              success: false,
              verified: false,
              retried: true,
              banner: bannerPath,
              error: "Banner still not persisted after retry",
              responseBody: retryResult.responseBody,
            });
            console.error(`[BannerUpdate] ✗ Banner STILL not persisted for "${agent.name}" after retry`);
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`[BannerUpdate] Error for "${agent.name}":`, error);
        results.push({ name: agent.name, success: false, verified: false, error: String(error) });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;
    const verifiedCount = results.filter((r) => r.verified).length;

    console.log(`[BannerUpdate] Complete: ${successCount} succeeded, ${verifiedCount} verified, ${failCount} failed`);

    return new Response(
      JSON.stringify({
        message: `Updated banners for ${successCount}/${agents.length} agents (${verifiedCount} verified)`,
        success_count: successCount,
        verified_count: verifiedCount,
        fail_count: failCount,
        results,
      }, null, 2),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[BannerUpdate] Fatal error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
