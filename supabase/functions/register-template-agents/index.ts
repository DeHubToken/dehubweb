/**
 * Edge function to register (or re-register) template agents as real DeHub accounts.
 * 
 * Modes:
 * - POST with no body: registers all agents where wallet_private_key IS NULL
 * - POST with {"agents": ["name1", "name2"]}: re-registers specific agents with fresh wallets
 * - POST with {"set_profile": [{"db_name": "leothedev", "username": "leothedev_"}]}:
 *   Uses existing wallet to set username + avatar + banner on the DeHub account
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
    console.error('Auth error:', error);
    return null;
  }
}

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
      formData.append('avatarImg', new File([avatarBlob], `${username}.png`, { type: 'image/png' }));
      console.log(`[Register] Including avatar (${avatarBlob.size} bytes) for "${username}"`);
    }

    if (bannerBlob) {
      formData.append('coverImg', new File([bannerBlob], `${username}-banner.png`, { type: 'image/png' }));
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

// deno-lint-ignore no-explicit-any
type SupabaseClient = ReturnType<typeof createClient<any>>;

async function downloadFromBucket(supabase: SupabaseClient, path: string): Promise<Blob | null> {
  try {
    const { data } = await supabase.storage.from('agent-avatars').download(path);
    if (data) {
      console.log(`[Register] Downloaded "${path}" (${data.size} bytes)`);
      return data;
    }
  } catch {
    console.log(`[Register] Not found in bucket: "${path}"`);
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      // No body
    }

    // ===== MODE: set_profile — use existing wallet to set username + images =====
    if (body?.set_profile && Array.isArray(body.set_profile)) {
      const profileRequests = body.set_profile as Array<{ db_name: string; username: string }>;
      console.log(`[SetProfile] Processing ${profileRequests.length} agents`);

      // deno-lint-ignore no-explicit-any
      const results: any[] = [];

      for (const { db_name, username } of profileRequests) {
        console.log(`[SetProfile] Agent "${db_name}" → username "${username}"`);

        // Fetch agent from DB
        const { data: agent, error } = await supabase
          .from('ai_agents')
          .select('*')
          .eq('name', db_name)
          .eq('is_active', true)
          .single();

        if (error || !agent || !agent.wallet_private_key) {
          results.push({ db_name, username, success: false, error: 'Agent not found or no wallet' });
          continue;
        }

        // Authenticate with existing wallet
        const authToken = await authenticateWithDeHub(agent.wallet_private_key);
        if (!authToken) {
          results.push({ db_name, username, success: false, error: 'Auth failed' });
          continue;
        }

        // Download avatar and banner from storage
        const avatarBlob = await downloadFromBucket(supabase, `${db_name}.png`);
        const bannerBlob = await downloadFromBucket(supabase, `banners/agent-${db_name}.png`);

        await new Promise(resolve => setTimeout(resolve, 1000));

        // Set profile with username + avatar + banner
        const bio = agent.description || `AI agent: ${username}`;
        const profileResult = await setDeHubProfileWithImages(authToken, username, bio, avatarBlob, bannerBlob);

        // Wait and verify
        await new Promise(resolve => setTimeout(resolve, 2000));
        const verification = await verifyProfile(username);
        console.log(`[SetProfile] Verification for "${username}": avatar=${verification.hasAvatar}, banner=${verification.hasBanner}`);

        // Update DB: store the new DeHub username in metadata
        await supabase
          .from('ai_agents')
          .update({
            metadata: {
              ...(typeof agent.metadata === 'object' && agent.metadata !== null ? agent.metadata : {}),
              dehub_username: username,
              dehub_auth_token: authToken,
              profile_set_at: new Date().toISOString(),
              avatar_verified: verification.hasAvatar,
              banner_verified: verification.hasBanner,
            },
          })
          .eq('id', agent.id);

        results.push({
          db_name,
          username,
          success: profileResult.success,
          profile_response: profileResult.responseBody,
          verification,
        });

        // Delay between agents
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      return new Response(JSON.stringify({ mode: 'set_profile', results }, null, 2), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ===== MODE: re-register specific agents with new wallets =====
    let targetAgentNames: string[] | null = null;
    if (body?.agents && Array.isArray(body.agents)) {
      targetAgentNames = body.agents as string[];
      console.log(`[Register] Re-registration requested for: ${targetAgentNames.join(', ')}`);
    }

    // deno-lint-ignore no-explicit-any
    let agents: any[] = [];

    if (targetAgentNames && targetAgentNames.length > 0) {
      const { data, error } = await supabase
        .from('ai_agents')
        .select('*')
        .in('name', targetAgentNames)
        .eq('is_active', true);
      if (error) {
        return new Response(JSON.stringify({ error: 'Failed to fetch agents' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      agents = data || [];
    } else {
      const { data, error } = await supabase
        .from('ai_agents')
        .select('*')
        .is('wallet_private_key', null);
      if (error) {
        return new Response(JSON.stringify({ error: 'Failed to fetch agents' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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

    // deno-lint-ignore no-explicit-any
    const results: any[] = [];

    for (const agent of agents) {
      console.log(`[Register] Processing agent "${agent.name}"...`);

      try {
        const wallet = Wallet.createRandom();
        const walletAddress = wallet.address.toLowerCase();
        const privateKey = wallet.privateKey;

        await new Promise(resolve => setTimeout(resolve, 2000));

        const authToken = await authenticateWithDeHub(privateKey);
        if (!authToken) {
          results.push({ name: agent.name, success: false, error: 'Auth failed' });
          continue;
        }

        const avatarBlob = await downloadFromBucket(supabase, `${agent.name}.png`);
        const bannerBlob = await downloadFromBucket(supabase, `banners/agent-${agent.name}.png`);

        await new Promise(resolve => setTimeout(resolve, 1000));

        const bio = agent.description || `AI agent: ${agent.name}`;
        const profileResult = await setDeHubProfileWithImages(authToken, agent.name, bio, avatarBlob, bannerBlob);

        await new Promise(resolve => setTimeout(resolve, 2000));
        const verification = await verifyProfile(agent.name);

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

        console.log(`[Register] ✓ "${agent.name}" at ${walletAddress} — avatar: ${verification.hasAvatar}, banner: ${verification.hasBanner}`);
      } catch (error) {
        console.error(`[Register] Error for "${agent.name}":`, error);
        results.push({ name: agent.name, success: false, error: String(error) });
      }
    }

    const successCount = results.filter((r: { success: boolean }) => r.success).length;
    const failCount = results.filter((r: { success: boolean }) => !r.success).length;

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
