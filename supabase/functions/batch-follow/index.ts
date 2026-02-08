import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Wallet } from "npm:ethers@^6.16.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEHUB_API_BASE = 'https://api.dehub.io';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function buildAuthMessage(address: string, timestamp: number): string {
  const displayedDate = new Date(timestamp * 1000);
  return `Welcome to DeHub!\n\nClick to sign in for authentication.\nSignatures are valid for 24 hours.\nYour wallet address is ${address}.\nIt is ${displayedDate.toUTCString()}.`;
}

async function authenticateWithDeHub(privateKey: string): Promise<string | null> {
  try {
    const wallet = new Wallet(privateKey);
    const address = wallet.address.toLowerCase();
    const timestamp = Math.floor(Date.now() / 1000);
    const message = buildAuthMessage(address, timestamp);
    const sig = await wallet.signMessage(message);

    const response = await fetch(`${DEHUB_API_BASE}/api/web/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, sig, timestamp, chainId: 8453 }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    return data.result?.token || data.token || null;
  } catch (error) {
    console.error('[Auth Error]', error);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { target_username } = await req.json();
    
    if (!target_username) {
      return new Response(JSON.stringify({ error: 'target_username required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[BatchFollow] Looking up @${target_username}...`);

    // Look up target wallet address
    const accountResp = await fetch(`${DEHUB_API_BASE}/api/account_info/${encodeURIComponent(target_username)}`);
    if (!accountResp.ok) {
      return new Response(JSON.stringify({ error: `User @${target_username} not found` }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const accountData = await accountResp.json();
    const targetWallet = (accountData.result?.address || accountData.address || '').toLowerCase();
    
    if (!targetWallet) {
      return new Response(JSON.stringify({ error: 'Could not resolve wallet for user' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[BatchFollow] Target @${target_username} → ${targetWallet}`);

    // Get all active agents
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: agents, error } = await supabase
      .from('ai_agents')
      .select('id, name, owner_wallet_address, wallet_private_key')
      .eq('is_active', true);

    if (error || !agents?.length) {
      return new Response(JSON.stringify({ error: 'No active agents found', details: error }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[BatchFollow] Found ${agents.length} agents to follow @${target_username}`);

    const results: Array<{ agent: string; success: boolean; error?: string }> = [];

    for (const agent of agents) {
      try {
        // Skip if agent IS the target
        if (agent.owner_wallet_address.toLowerCase() === targetWallet) {
          results.push({ agent: agent.name, success: false, error: 'Cannot follow self' });
          continue;
        }

        // Authenticate the agent first
        if (!agent.wallet_private_key) {
          results.push({ agent: agent.name, success: false, error: 'No wallet private key' });
          continue;
        }

        const authToken = await authenticateWithDeHub(agent.wallet_private_key);
        if (!authToken) {
          results.push({ agent: agent.name, success: false, error: 'Auth failed' });
          continue;
        }

        // Follow using GET with 'following' query param (matches the app's followUser API)
        const followResp = await fetch(
          `${DEHUB_API_BASE}/api/request_follow?following=${targetWallet}`,
          {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${authToken}` },
          }
        );

        if (followResp.ok) {
          const followData = await followResp.json();
          console.log(`[BatchFollow] ✅ ${agent.name} followed @${target_username}:`, JSON.stringify(followData));
          results.push({ agent: agent.name, success: true });
        } else {
          const errText = await followResp.text();
          console.log(`[BatchFollow] ❌ ${agent.name} failed: ${errText}`);
          results.push({ agent: agent.name, success: false, error: errText });
        }

        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 300));
      } catch (err) {
        console.error(`[BatchFollow] Error for ${agent.name}:`, err);
        results.push({ agent: agent.name, success: false, error: String(err) });
      }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`[BatchFollow] Done: ${successCount}/${agents.length} agents followed @${target_username}`);

    return new Response(JSON.stringify({
      success: true,
      target: target_username,
      target_wallet: targetWallet,
      total_agents: agents.length,
      successful_follows: successCount,
      results,
    }, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[BatchFollow] Error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
