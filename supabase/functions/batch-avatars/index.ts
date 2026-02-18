import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
  'Cache-Control': 'public, max-age=120, stale-while-revalidate=300', // 2min fresh, 5min stale OK
};

const DEHUB_API_BASE = "https://api.dehub.io";

interface AvatarResult {
  address: string;
  avatarUrl: string | null;
  username: string | null;
  displayName: string | null;
  error?: string;
}

interface DeHubAccountResponse {
  status: boolean;
  result?: {
    address?: string;
    username?: string | null;
    displayName?: string | null;
    avatarImageUrl?: string | null;
    avatarUrl?: string;
    [key: string]: unknown;
  };
  error?: string;
}

/**
 * Fetch a single account from DeHub API
 */
async function fetchAccount(address: string): Promise<AvatarResult> {
  try {
    const response = await fetch(`${DEHUB_API_BASE}/api/account_info/${encodeURIComponent(address)}`, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      return { address, avatarUrl: null, username: null, displayName: null, error: `HTTP ${response.status}` };
    }

    const data: DeHubAccountResponse = await response.json();

    if (!data.result) {
      return { address, avatarUrl: null, username: null, displayName: null, error: 'No result' };
    }

    const user = data.result;
    const avatarPath = user.avatarImageUrl || user.avatarUrl || null;

    return {
      address: address.toLowerCase(),
      avatarUrl: avatarPath,
      username: user.username || null,
      displayName: user.displayName || null,
    };
  } catch (error) {
    console.error(`Error fetching account ${address}:`, error);
    return {
      address,
      avatarUrl: null,
      username: null,
      displayName: null,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Parse request body
    const { addresses } = await req.json() as { addresses?: string[] };

    if (!addresses || !Array.isArray(addresses)) {
      return new Response(
        JSON.stringify({ error: 'addresses array is required' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      );
    }

    // Limit batch size to prevent abuse
    const MAX_BATCH_SIZE = 50;
    const uniqueAddresses = [...new Set(addresses.filter(Boolean).map(a => a.toLowerCase()))];
    const limitedAddresses = uniqueAddresses.slice(0, MAX_BATCH_SIZE);

    console.log(`Batch avatar request for ${limitedAddresses.length} addresses`);

    // Fetch all accounts in parallel
    const results = await Promise.all(
      limitedAddresses.map(address => fetchAccount(address))
    );

    // Build response map
    const avatarMap: Record<string, AvatarResult> = {};
    for (const result of results) {
      avatarMap[result.address] = result;
    }

    return new Response(
      JSON.stringify({
        success: true,
        count: results.length,
        avatars: avatarMap,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error("Batch avatar fetch failed:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
