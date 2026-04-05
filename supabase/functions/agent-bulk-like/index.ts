import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { ethers } from "npm:ethers@^6.16.0";

const DEHUB_API = "https://api.dehub.io";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Content-Type": "application/json",
    },
  });
}

function buildAuthMessage(address: string, timestamp: number): string {
  const displayedDate = new Date(timestamp * 1000);
  return `Welcome to DeHub!\n\nClick to sign in for authentication.\nSignatures are valid for 24 hours.\nYour wallet address is ${address}.\nIt is ${displayedDate.toUTCString()}.`;
}

async function authenticateAgent(privateKey: string): Promise<{ token: string; address: string } | null> {
  try {
    const wallet = new ethers.Wallet(privateKey);
    const address = wallet.address.toLowerCase();
    const timestamp = Math.floor(Date.now() / 1000);
    const message = buildAuthMessage(address, timestamp);
    const signature = await wallet.signMessage(message);

    const res = await fetch(`${DEHUB_API}/api/web/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ address, sig: signature, timestamp, chainId: 8453 }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    return { token: data.token, address };
  } catch {
    return null;
  }
}

async function likePost(token: string, streamTokenId: string): Promise<boolean> {
  try {
    const res = await fetch(`${DEHUB_API}/api/request_vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ streamTokenId, vote: true }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return jsonResponse("ok");

  try {
    // Accept page param to process in batches (default page 1, 50 posts per call)
    const url = new URL(req.url);
    const startPage = parseInt(url.searchParams.get("page") || "1");
    const pagesToFetch = parseInt(url.searchParams.get("pages") || "1"); // 1 page = 50 posts at a time

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: agents } = await supabase
      .from("ai_agents")
      .select("id, name, wallet_private_key")
      .order("created_at", { ascending: true })
      .limit(3);

    if (!agents?.length) return jsonResponse({ error: "No agents found" }, 500);

    const logs: string[] = [];

    // Authenticate
    const authedAgents: { name: string; token: string }[] = [];
    for (const agent of agents) {
      if (!agent.wallet_private_key) continue;
      const auth = await authenticateAgent(agent.wallet_private_key);
      if (auth) {
        authedAgents.push({ name: agent.name, token: auth.token });
        logs.push(`✅ ${agent.name} authed`);
      }
    }
    if (!authedAgents.length) return jsonResponse({ error: "Auth failed", logs }, 500);

    // Fetch posts
    const tokenIds: string[] = [];
    for (let p = startPage; p < startPage + pagesToFetch; p++) {
      const res = await fetch(`${DEHUB_API}/api/feed?page=${p}&limit=50`, {
        headers: { Authorization: `Bearer ${authedAgents[0].token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const posts = data.result || data.data || [];
        for (const post of posts) {
          const tid = post.streamTokenId || post.tokenId || post.id;
          if (tid) tokenIds.push(String(tid));
        }
        logs.push(`📄 Page ${p}: ${posts.length} posts`);
      }
      await sleep(500);
    }

    logs.push(`🎯 Posts to like: ${tokenIds.length}`);

    // Like with 2s delay (50 posts x 3 agents x 2s = ~5 min per page)
    let ok = 0, fail = 0;
    for (const tokenId of tokenIds) {
      for (const agent of authedAgents) {
        const success = await likePost(agent.token, tokenId);
        if (success) ok++; else fail++;
        await sleep(2000);
      }
    }

    logs.push(`🏁 Done! ✅${ok} ❌${fail}`);
    return jsonResponse({ success: true, ok, fail, page: startPage, logs });
  } catch (e) {
    console.error("Error:", e);
    return jsonResponse({ error: String(e) }, 500);
  }
});
