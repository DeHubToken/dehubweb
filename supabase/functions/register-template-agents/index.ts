/**
 * Edge function to register (or re-register) template agents as real DeHub accounts.
 * 
 * Generates a real Ethereum wallet for each, authenticates with the DeHub API,
 * sets their profile (username + bio + avatar + banner) via FormData in one call,
 * and stores the credentials.
 * 
 * Modes:
 * - POST with no body: registers all agents where wallet_private_key IS NULL
 * - POST with {"agents": ["name1", "name2"]}: re-registers specific agents with fresh wallets
 * 
 * Call via: POST /functions/v1/register-template-agents
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

/**
 * Set username, bio, avatar, AND banner on a DeHub account in one FormData call.
 * This is the only reliable way to get images to persist — during initial username set.
 */
async function setDeHubProfileWithImages(
  authToken: string,
  username: string,
  bio: string,
  avatarBlob: Blob | null,
  bannerBlob: Blob | null,
): Promise<{ success: boolean; responseBody: string }> {
  try {
    const formData = new FormData();
    formData.append('username', username);
    formData.append('aboutMe', bio || `AI agent: ${username}`);

    if (avatarBlob) {
      formData.append(
        'avatarImg',
        new File([avatarBlob], `${username}.png`, { type: 'image/png' }),
      );
      console.log(`[Register] Including avatar (${avatarBlob.size} bytes) for "${username}"`);
    }

    if (bannerBlob) {
      formData.append(
        'coverImg',
        new File([bannerBlob], `${username}-banner.png`, { type: 'image/png' }),
      );
      console.log(`[Register] Including banner (${bannerBlob.size} bytes) for "${username}"`);
    }

    const response = await fetch(`${DEHUB_API_BASE}/api/update_profile`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` },
      body: formData,
    });

    const responseBody = await response.text();
    console.log(`[Register] Profile response for "${username}" (${response.status}): ${responseBody}`);

    return { success: response.ok, responseBody };
  } catch (error) {
    console.error(`Profile update error for "${username}":`, error);
    return { success: false, responseBody: String(error) };
  }
}

/**
 * Verify that avatar/banner actually persisted by checking account_info.
 */
async function verifyProfile(username: string): Promise<{
  hasAvatar: boolean;
  hasBanner: boolean;
  avatarUrl: string | null;
  bannerUrl: string | null;
}> {
  try {
    const response = await fetch(`${DEHUB_API_BASE}/api/account_info/${username}`);
    if (!response.ok) {
      return { hasAvatar: false, hasBanner: false, avatarUrl: null, bannerUrl: null };
    }
    const data = await response.json();
    const profile = data.result || data;
    return {
      hasAvatar: !!profile.avatarImageUrl,
      hasBanner: !!profile.coverImageUrl,
      avatarUrl: profile.avatarImageUrl || null,
      bannerUrl: profile.coverImageUrl || null,
    };
  } catch {
    return { hasAvatar: false, hasBanner: false, avatarUrl: null, bannerUrl: null };
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

    // Check if specific agents are requested for re-registration
    let targetAgentNames: string[] | null = null;
    try {
      const body = await req.json();
      if (body?.agents && Array.isArray(body.agents)) {
        targetAgentNames = body.agents;
        console.log(`[Register] Re-registration requested for: ${targetAgentNames.join(', ')}`);
      }
    } catch {
      // No body or invalid JSON — register all unregistered agents
    }

    // deno-lint-ignore no-explicit-any
    let agents: any[] = [];

    if (targetAgentNames && targetAgentNames.length > 0) {
      // Re-registration mode: fetch specific agents regardless of wallet status
      const { data, error } = await supabase
        .from('ai_agents')
        .select('*')
        .in('name', targetAgentNames)
        .eq('is_active', true);

      if (error) {
        console.error('Failed to fetch agents:', error);
        return new Response(JSON.stringify({ error: 'Failed to fetch agents' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      agents = data || [];
    } else {
      // Normal mode: register agents without wallet keys
      const { data, error } = await supabase
        .from('ai_agents')
        .select('*')
        .is('wallet_private_key', null);

      if (error) {
        console.error('Failed to fetch agents:', error);
        return new Response(JSON.stringify({ error: 'Failed to fetch agents' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      agents = data || [];
    }

    if (agents.length === 0) {
      return new Response(JSON.stringify({ message: 'No agents need registration', count: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[Register] Found ${agents.length} agents to process`);

    const results: Array<{
      name: string;
      success: boolean;
      wallet_address?: string;
      verification?: { hasAvatar: boolean; hasBanner: boolean };
      profile_response?: string;
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
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Authenticate (creates DeHub account)
        const authToken = await authenticateWithDeHub(privateKey);
        if (!authToken) {
          results.push({ name: agent.name, success: false, error: 'Auth failed' });
          continue;
        }

        // Download avatar from storage bucket
        let avatarBlob: Blob | null = null;
        try {
          const { data: avatarData } = await supabase.storage
            .from('agent-avatars')
            .download(`${agent.name}.png`);
          if (avatarData) {
            avatarBlob = avatarData;
            console.log(`[Register] Avatar found for "${agent.name}" (${avatarData.size} bytes)`);
          }
        } catch {
          console.log(`[Register] No avatar in bucket for "${agent.name}"`);
        }

        // Download banner from storage bucket
        let bannerBlob: Blob | null = null;
        try {
          const { data: bannerData } = await supabase.storage
            .from('agent-avatars')
            .download(`banners/agent-${agent.name}.png`);
          if (bannerData) {
            bannerBlob = bannerData;
            console.log(`[Register] Banner found for "${agent.name}" (${bannerData.size} bytes)`);
          }
        } catch {
          console.log(`[Register] No banner in bucket for "${agent.name}"`);
        }

        // Small delay before profile update
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Set profile with username + bio + avatar + banner all in one FormData call
        const bio = agent.description || `AI agent: ${agent.name}`;
        const profileResult = await setDeHubProfileWithImages(authToken, agent.name, bio, avatarBlob, bannerBlob);

        // Wait and verify
        await new Promise(resolve => setTimeout(resolve, 2000));
        const verification = await verifyProfile(agent.name);
        console.log(`[Register] Verification for "${agent.name}": avatar=${verification.hasAvatar}, banner=${verification.hasBanner}`);

        // Update database with new wallet info
        const { error: updateError } = await supabase
          .from('ai_agents')
          .update({
            owner_wallet_address: walletAddress,
            wallet_private_key: privateKey,
            metadata: {
              ...(typeof agent.metadata === 'object' && agent.metadata !== null ? agent.metadata : {}),
              previous_wallet: agent.owner_wallet_address,
              dehub_auth_token: authToken,
              registered_at: new Date().toISOString(),
              re_registered: !!targetAgentNames,
              profile_set: profileResult.success,
              avatar_verified: verification.hasAvatar,
              banner_verified: verification.hasBanner,
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
          success: profileResult.success,
          wallet_address: walletAddress,
          verification,
          profile_response: profileResult.responseBody,
        });

        console.log(`[Register] ✓ Agent "${agent.name}" registered at ${walletAddress} — avatar: ${verification.hasAvatar}, banner: ${verification.hasBanner}`);
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
