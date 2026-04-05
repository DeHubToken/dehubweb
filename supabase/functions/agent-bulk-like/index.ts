import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { ethers } from "npm:ethers@^6.16.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEHUB_API = "https://api.dehub.io";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function authenticateAgent(
  privateKey: string,
): Promise<{ token: string; address: string } | null> {
  try {
    const wallet = new ethers.Wallet(privateKey);
    const address = wallet.address.toLowerCase();
    const timestamp = Math.floor(Date.now() / 1000);
    const displayedDate = new Date(timestamp * 1000);
    const message = `Welcome to DeHub!\n\nClick to sign in for authentication.\nSignatures are valid for 24 hours.\nYour wallet address is ${address}.\nIt is ${displayedDate.toUTCString()}.`;
    const signature = await wallet.signMessage(message);

    const res = await fetch(`${DEHUB_API}/api/web/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address,
        sig: signature,
        timestamp,
        chainId: 8453,
      }),
    });

    if (!res.ok) {
      console.error(`Auth failed for ${address}: ${res.status}`);
      return null;
    }

    const data = await res.json();
    return { token: data.token, address };
  } catch (e) {
    console.error("Auth error:", e);
    return null;
  }
}

async function fetchPosts(token: string, page: number): Promise<any[]> {
  try {
    const res = await fetch(
      `${DEHUB_API}/api/feed?page=${page}&limit=50`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.data || data.posts || data || [];
  } catch {
    return [];
  }
}

async function likePost(
  token: string,
  streamTokenId: string | number,
): Promise<boolean> {
  try {
    const res = await fetch(`${DEHUB_API}/api/request_vote`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ streamTokenId: String(streamTokenId), vote: true }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // 1. Fetch first 3 agents
  const { data: agents, error } = await supabase
    .from("ai_agents")
    .select("id, name, wallet_private_key")
    .order("created_at", { ascending: true })
    .limit(3);

  if (error || !agents?.length) {
    return new Response(
      JSON.stringify({ error: "Failed to fetch agents", detail: error }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const logs: string[] = [];
  logs.push(`Found ${agents.length} agents: ${agents.map((a) => a.name).join(", ")}`);

  // 2. Authenticate all agents
  const authedAgents: { name: string; token: string; address: string }[] = [];
  for (const agent of agents) {
    if (!agent.wallet_private_key) {
      logs.push(`⚠️ ${agent.name}: no private key, skipping`);
      continue;
    }
    const auth = await authenticateAgent(agent.wallet_private_key);
    if (auth) {
      authedAgents.push({ name: agent.name, ...auth });
      logs.push(`✅ ${agent.name} authenticated (${auth.address})`);
    } else {
      logs.push(`❌ ${agent.name} auth failed`);
    }
  }

  if (!authedAgents.length) {
    return new Response(
      JSON.stringify({ error: "No agents authenticated", logs }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // 3. Fetch 200 posts (4 pages of 50)
  const allPosts: any[] = [];
  for (let page = 1; page <= 4; page++) {
    const posts = await fetchPosts(authedAgents[0].token, page);
    allPosts.push(...posts);
    logs.push(`📄 Page ${page}: fetched ${posts.length} posts`);
    await sleep(1000);
  }

  // Extract token IDs
  const tokenIds = allPosts
    .map((p) => p.streamTokenId || p.tokenId || p.id)
    .filter(Boolean)
    .slice(0, 200);

  logs.push(`🎯 Total posts to like: ${tokenIds.length}`);

  // 4. Like loop — 3s delay between each call
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < tokenIds.length; i++) {
    const tokenId = tokenIds[i];
    for (const agent of authedAgents) {
      const ok = await likePost(agent.token, tokenId);
      if (ok) {
        successCount++;
      } else {
        failCount++;
      }
      logs.push(
        `${ok ? "👍" : "❌"} ${agent.name} → post ${tokenId} (${i + 1}/${tokenIds.length})`,
      );
      await sleep(3000); // 3 second delay
    }
  }

  logs.push(`\n🏁 Done! Success: ${successCount}, Failed: ${failCount}`);

  return new Response(JSON.stringify({ success: true, successCount, failCount, logs }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
