/**
 * Edge function to upload banner/cover images for all registered AI agents on DeHub.
 *
 * Cycles through 9 default banners across 15 agents using the `coverImg` FormData field.
 *
 * Call via: POST /functions/v1/update-agent-banners
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Wallet } from "npm:ethers@^6.16.0";

const DEHUB_API_BASE = "https://api.dehub.io";
const BANNER_COUNT = 9;

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
): Promise<{ ok: boolean; detail?: string }> {
  try {
    const formData = new FormData();
    formData.append(
      "coverImg",
      new File([bannerBlob], bannerFilename, { type: "image/png" }),
    );
    formData.append("username", username);

    const response = await fetch(`${DEHUB_API_BASE}/api/update_profile`, {
      method: "POST",
      headers: { Authorization: `Bearer ${authToken}` },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Banner update failed for "${username}" (${response.status}):`, errorText);
      return { ok: false, detail: `${response.status}: ${errorText}` };
    }

    return { ok: true };
  } catch (error) {
    console.error(`Banner update error for "${username}":`, error);
    return { ok: false, detail: String(error) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: agents, error: fetchError } = await supabase
      .from("ai_agents")
      .select("*")
      .not("wallet_private_key", "is", null);

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

    const results: Array<{ name: string; success: boolean; banner?: string; error?: string }> = [];

    for (let i = 0; i < agents.length; i++) {
      const agent = agents[i];
      const bannerIndex = (i % BANNER_COUNT) + 1;
      const bannerPath = `banners/default-banner-${bannerIndex}.png`;

      console.log(`[BannerUpdate] Processing "${agent.name}" with banner ${bannerIndex}…`);

      try {
        // 1. Download banner from storage
        const { data: bannerData, error: downloadError } = await supabase
          .storage
          .from("agent-avatars")
          .download(bannerPath);

        if (downloadError || !bannerData) {
          console.error(`[BannerUpdate] Banner download failed:`, downloadError);
          results.push({ name: agent.name, success: false, error: `Banner not found: ${bannerPath}` });
          continue;
        }

        // 2. Authenticate with DeHub
        const authToken = await authenticateWithDeHub(agent.wallet_private_key);
        if (!authToken) {
          results.push({ name: agent.name, success: false, error: "DeHub auth failed" });
          continue;
        }

        await new Promise((resolve) => setTimeout(resolve, 500));

        // 3. Upload banner via FormData
        const updateResult = await updateProfileBanner(
          authToken,
          agent.name,
          bannerData,
          `default-banner-${bannerIndex}.png`,
        );

        if (!updateResult.ok) {
          results.push({ name: agent.name, success: false, banner: bannerPath, error: updateResult.detail });
        } else {
          results.push({ name: agent.name, success: true, banner: bannerPath });
          console.log(`[BannerUpdate] ✓ Banner set for "${agent.name}" (banner-${bannerIndex})`);
        }

        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        console.error(`[BannerUpdate] Error for "${agent.name}":`, error);
        results.push({ name: agent.name, success: false, error: String(error) });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    console.log(`[BannerUpdate] Complete: ${successCount} succeeded, ${failCount} failed`);

    return new Response(
      JSON.stringify({ message: `Updated banners for ${successCount}/${agents.length} agents`, success_count: successCount, fail_count: failCount, results }, null, 2),
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
