/**
 * One-time edge function to register existing template agents as real DeHub accounts.
 * 
 * Reads all agents from `ai_agents` where `wallet_private_key IS NULL`,
 * generates a real Ethereum wallet for each, authenticates with the DeHub API,
 * sets their profile (username + bio), and stores the credentials.
 * 
 * Call once via: POST /functions/v1/register-template-agents
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Wallet } from "npm:ethers@^6.16.0";

const DEHUB_API_BASE = 'https://api.dehub.io';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
      body: JSON.stringify({
        address,
        sig,
        timestamp,
        chainId: 8453,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Auth failed for ${address} (${response.status}):`, errorText);
      return null;
    }

    const data = await response.json();
    return data.result?.token || data.token || null;
  } catch (error) {
    console.error('Auth error:', error);
    return null;
  }
}

async function setDeHubProfile(
  authToken: string,
  username: string,
  bio?: string,
  avatarBlob?: Blob | null,
): Promise<boolean> {
  try {
    const formData = new FormData();
    formData.append('username', username);
    formData.append('aboutMe', bio || `AI agent: ${username}`);

    if (avatarBlob) {
      formData.append(
        'avatarImg',
        new File([avatarBlob], `${username}.png`, { type: 'image/png' }),
      );
    }

    const response = await fetch(`${DEHUB_API_BASE}/api/update_profile`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Profile update failed for "${username}" (${response.status}):`, errorText);
      return false;
    }

    return true;
  } catch (error) {
    console.error(`Profile update error for "${username}":`, error);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all agents that don't have a wallet private key yet
    const { data: agents, error: fetchError } = await supabase
      .from('ai_agents')
      .select('*')
      .is('wallet_private_key', null);

    if (fetchError) {
      console.error('Failed to fetch agents:', fetchError);
      return new Response(JSON.stringify({ error: 'Failed to fetch agents' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!agents || agents.length === 0) {
      return new Response(JSON.stringify({ message: 'No agents need registration', count: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[Register] Found ${agents.length} agents to register`);

    const results: Array<{
      name: string;
      success: boolean;
      wallet_address?: string;
      error?: string;
    }> = [];

    // Process each agent sequentially to avoid rate limiting
    for (const agent of agents) {
      console.log(`[Register] Processing agent "${agent.name}"...`);

      try {
        // Generate wallet
        const wallet = Wallet.createRandom();
        const walletAddress = wallet.address.toLowerCase();
        const privateKey = wallet.privateKey;

        // Small delay between registrations to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Authenticate (creates DeHub account)
        const authToken = await authenticateWithDeHub(privateKey);
        if (!authToken) {
          results.push({ name: agent.name, success: false, error: 'Auth failed' });
          continue;
        }

        // Try to download avatar from storage bucket
        let avatarBlob: Blob | null = null;
        try {
          const { data: avatarData } = await supabase.storage
            .from('agent-avatars')
            .download(`${agent.name}.png`);
          if (avatarData) {
            avatarBlob = avatarData;
            console.log(`[Register] Avatar found for "${agent.name}"`);
          }
        } catch {
          console.log(`[Register] No avatar in bucket for "${agent.name}", skipping avatar`);
        }

        // Small delay before profile update
        await new Promise(resolve => setTimeout(resolve, 500));

        // Set profile (with avatar if available)
        const profileSet = await setDeHubProfile(authToken, agent.name, agent.description, avatarBlob);

        // Update database with wallet info
        const { error: updateError } = await supabase
          .from('ai_agents')
          .update({
            owner_wallet_address: walletAddress,
            wallet_private_key: privateKey,
            metadata: {
              ...(typeof agent.metadata === 'object' && agent.metadata !== null ? agent.metadata : {}),
              original_placeholder_address: agent.owner_wallet_address,
              dehub_auth_token: authToken,
              registered_at: new Date().toISOString(),
              profile_set: profileSet,
              chain_id: 8453,
            },
          })
          .eq('id', agent.id);

        if (updateError) {
          console.error(`Failed to update agent "${agent.name}":`, updateError);
          results.push({ name: agent.name, success: false, error: 'DB update failed' });
          continue;
        }

        results.push({
          name: agent.name,
          success: true,
          wallet_address: walletAddress,
        });

        console.log(`[Register] ✓ Agent "${agent.name}" registered at ${walletAddress}`);
      } catch (error) {
        console.error(`[Register] Error for "${agent.name}":`, error);
        results.push({ name: agent.name, success: false, error: String(error) });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    console.log(`[Register] Complete: ${successCount} succeeded, ${failCount} failed`);

    return new Response(JSON.stringify({
      message: `Registered ${successCount}/${agents.length} agents`,
      success_count: successCount,
      fail_count: failCount,
      results,
    }, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[Register] Fatal error:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
