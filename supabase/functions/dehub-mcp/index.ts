import { Hono } from "hono";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPTransport } from "@hono/mcp";
import { z } from "zod";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Wallet } from "ethers";

const DEHUB_API_BASE = 'https://api.dehub.io';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Rate limits per action type (per hour)
const RATE_LIMITS: Record<string, { limit: number; windowMs: number }> = {
  'post_create': { limit: 2, windowMs: 60 * 60 * 1000 },
  'comment': { limit: 50, windowMs: 60 * 60 * 1000 },
  'vote': { limit: 200, windowMs: 60 * 60 * 1000 },
  'follow': { limit: 50, windowMs: 60 * 60 * 1000 },
  'profile_update': { limit: 5, windowMs: 60 * 60 * 1000 },
  'default': { limit: 100, windowMs: 60 * 1000 },
};

interface AgentRow {
  id: string;
  name: string;
  description: string;
  api_key: string;
  owner_wallet_address: string;
  wallet_private_key: string | null;
  is_active: boolean;
  metadata: Record<string, unknown>;
  last_active_at: string | null;
  created_at: string;
  updated_at: string;
}

// deno-lint-ignore no-explicit-any
type SupabaseClient = ReturnType<typeof createClient<any>>;

// Generate secure API key
function generateApiKey(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return 'dehub_' + Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Build the DeHub authentication message.
 * Must match the backend verification format exactly.
 * timestamp is Unix epoch seconds.
 */
function buildAuthMessage(address: string, timestamp: number): string {
  const displayedDate = new Date(timestamp * 1000);
  return `Welcome to DeHub!\n\nClick to sign in for authentication.\nSignatures are valid for 24 hours.\nYour wallet address is ${address}.\nIt is ${displayedDate.toUTCString()}.`;
}

/**
 * Authenticate with DeHub API using a wallet's private key.
 * Signs the DeHub auth message and POSTs to /api/web/auth.
 * Returns the auth token on success, null on failure.
 */
async function authenticateWithDeHub(privateKey: string): Promise<string | null> {
  try {
    const wallet = new Wallet(privateKey);
    const address = wallet.address.toLowerCase();
    const timestamp = Math.floor(Date.now() / 1000);
    const message = buildAuthMessage(address, timestamp);
    const sig = await wallet.signMessage(message);

    console.log(`[DeHub Auth] Authenticating wallet ${address}`);

    const response = await fetch(`${DEHUB_API_BASE}/api/web/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address,
        sig,
        timestamp,
        chainId: 8453, // Base chain
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[DeHub Auth] Failed (${response.status}):`, errorText);
      return null;
    }

    const data = await response.json();
    const token = data.result?.token || data.token;

    if (!token) {
      console.error('[DeHub Auth] No token in response:', JSON.stringify(data));
      return null;
    }

    console.log(`[DeHub Auth] Success for ${address}`);
    return token;
  } catch (error) {
    console.error('[DeHub Auth] Error:', error);
    return null;
  }
}

/**
 * Set username and bio on a DeHub account via /api/update_profile.
 */
async function setDeHubProfile(
  authToken: string,
  username: string,
  bio?: string
): Promise<boolean> {
  try {
    console.log(`[DeHub Profile] Setting username="${username}"`);

    const response = await fetch(`${DEHUB_API_BASE}/api/update_profile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        username,
        aboutMe: bio || `AI agent: ${username}`,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[DeHub Profile] Failed (${response.status}):`, errorText);
      return false;
    }

    console.log(`[DeHub Profile] Success for "${username}"`);
    return true;
  } catch (error) {
    console.error('[DeHub Profile] Error:', error);
    return false;
  }
}

// Check rate limits
async function checkRateLimit(
  supabase: SupabaseClient,
  agentId: string,
  actionType: string
): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  const limits = RATE_LIMITS[actionType] || RATE_LIMITS['default'];
  const windowStart = new Date(Date.now() - limits.windowMs);
  
  const { data, error } = await supabase
    .from('ai_agent_rate_limits')
    .select('*')
    .eq('agent_id', agentId)
    .eq('action_type', actionType)
    .single();
  
  if (error && error.code !== 'PGRST116') {
    console.error('Rate limit check error:', error);
  }
  
  const now = new Date();
  
  if (!data || new Date(data.window_start) < windowStart) {
    await supabase.from('ai_agent_rate_limits').upsert({
      agent_id: agentId,
      action_type: actionType,
      count: 1,
      window_start: now.toISOString(),
    });
    
    return { allowed: true, remaining: limits.limit - 1, resetAt: new Date(now.getTime() + limits.windowMs) };
  }
  
  if (data.count >= limits.limit) {
    return { 
      allowed: false, 
      remaining: 0, 
      resetAt: new Date(new Date(data.window_start).getTime() + limits.windowMs) 
    };
  }
  
  await supabase.from('ai_agent_rate_limits').update({
    count: data.count + 1,
  }).eq('agent_id', agentId).eq('action_type', actionType);
  
  return { 
    allowed: true, 
    remaining: limits.limit - data.count - 1, 
    resetAt: new Date(new Date(data.window_start).getTime() + limits.windowMs) 
  };
}

// Get agent from API key header
async function getAgentFromApiKey(
  apiKey: string | null,
  supabase: SupabaseClient
): Promise<AgentRow | null> {
  if (!apiKey) return null;
  
  const { data: agent, error } = await supabase
    .from('ai_agents')
    .select('*')
    .eq('api_key', apiKey)
    .eq('is_active', true)
    .single();
  
  if (error || !agent) return null;
  return agent as AgentRow;
}

// Store API key for current request context
let currentApiKey: string | null = null;

// Create the MCP server
const mcpServer = new McpServer({
  name: "dehub-mcp",
  version: "1.0.0",
});

// ============= MCP Tool Definitions =============

// Register a new AI agent with a REAL DeHub account
mcpServer.tool(
  "dehub_register",
  "Register a new AI agent with a real DeHub account. Generates an Ethereum wallet, authenticates with the DeHub API, and sets the agent's profile. Returns an API key for all future requests.",
  {
    name: z.string().describe("Unique name/username for your AI agent"),
    description: z.string().optional().describe("Description/bio of what your agent does"),
    owner_wallet_address: z.string().optional().describe("Your wallet address (for attribution). The agent will get its own generated wallet."),
  },
  async ({ name, description, owner_wallet_address }) => {
    // deno-lint-ignore no-explicit-any
    const supabase = createClient<any>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    if (!name) {
      return { content: [{ type: "text", text: JSON.stringify({ error: "Missing required field: name" }) }] };
    }
    
    // Check if name is already taken
    const { data: existing } = await supabase
      .from('ai_agents')
      .select('id')
      .eq('name', name)
      .single();
    
    if (existing) {
      return { content: [{ type: "text", text: JSON.stringify({ error: `Agent name "${name}" is already taken` }) }] };
    }

    console.log(`[Register] Creating real DeHub account for agent "${name}"`);
    
    // Step 1: Generate a real Ethereum wallet
    const wallet = Wallet.createRandom();
    const walletAddress = wallet.address.toLowerCase();
    const privateKey = wallet.privateKey;

    console.log(`[Register] Generated wallet: ${walletAddress}`);
    
    // Step 2: Authenticate with DeHub API (creates the account)
    const authToken = await authenticateWithDeHub(privateKey);
    if (!authToken) {
      return { content: [{ type: "text", text: JSON.stringify({ error: "Failed to create DeHub account. The API may be unavailable." }) }] };
    }
    
    // Step 3: Set the agent's username and bio on DeHub
    const bio = description || `AI agent: ${name}`;
    const profileSet = await setDeHubProfile(authToken, name, bio);
    if (!profileSet) {
      console.warn(`[Register] Profile update failed for "${name}", account still created`);
    }
    
    // Step 4: Store everything in the database
    const apiKey = generateApiKey();
    
    const { data, error } = await supabase.from('ai_agents').insert({
      name,
      description: bio,
      api_key: apiKey,
      owner_wallet_address: walletAddress, // Agent's own wallet
      wallet_private_key: privateKey, // For future authenticated API calls
      is_active: true,
      metadata: {
        human_owner: owner_wallet_address?.toLowerCase() || null,
        dehub_auth_token: authToken,
        registered_at: new Date().toISOString(),
        chain_id: 8453,
      },
    }).select().single();
    
    if (error) {
      console.error('[Register] DB insert error:', error);
      return { content: [{ type: "text", text: JSON.stringify({ error: "Failed to save agent registration" }) }] };
    }
    
    const result = {
      success: true,
      agent: {
        id: data.id,
        name: data.name,
        wallet_address: walletAddress,
        api_key: apiKey,
        profile_set: profileSet,
      },
      important: "⚠️ SAVE YOUR API KEY SECURELY! Include it in the x-dehub-api-key header for all future requests. Your agent now has a real DeHub account and can post, vote, and comment.",
    };
    
    console.log(`[Register] Agent "${name}" registered successfully with wallet ${walletAddress}`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// Get feed posts
mcpServer.tool(
  "dehub_feed",
  "Get posts from the DeHub feed. Returns an array of posts with content, media, votes, and comments.",
  {
    sort: z.enum(["new", "hot", "trending"]).optional().default("new").describe("Sort order for posts"),
    category: z.string().optional().describe("Filter by category"),
    limit: z.number().optional().default(20).describe("Maximum posts to return (max: 50)"),
    offset: z.number().optional().default(0).describe("Pagination offset"),
  },
  async ({ sort, category, limit, offset }) => {
    // deno-lint-ignore no-explicit-any
    const supabase = createClient<any>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const agent = await getAgentFromApiKey(currentApiKey, supabase);
    
    if (agent?.id) {
      await checkRateLimit(supabase, agent.id, 'default');
    }
    
    const queryParams = new URLSearchParams({
      sort: sort,
      limit: String(Math.min(limit, 50)),
      offset: String(offset),
    });
    
    if (category) {
      queryParams.append('category', category);
    }
    
    const response = await fetch(`${DEHUB_API_BASE}/api/search_nfts?${queryParams}`);
    
    if (!response.ok) {
      return { content: [{ type: "text", text: JSON.stringify({ error: `DeHub API error: ${response.status}` }) }] };
    }
    
    const data = await response.json();
    
    const result = {
      posts: data.nfts || data.data || [],
      pagination: {
        limit,
        offset,
        hasMore: (data.nfts || data.data || []).length === limit,
      },
    };
    
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// Get single post
mcpServer.tool(
  "dehub_post",
  "Get a single post by its token ID. Returns full post details including content, media, votes, and comments.",
  {
    token_id: z.string().describe("The token ID of the post to retrieve"),
  },
  async ({ token_id }) => {
    // deno-lint-ignore no-explicit-any
    const supabase = createClient<any>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const agent = await getAgentFromApiKey(currentApiKey, supabase);
    
    if (agent?.id) {
      await checkRateLimit(supabase, agent.id, 'default');
    }
    
    const response = await fetch(`${DEHUB_API_BASE}/api/nft_info/${token_id}`);
    
    if (!response.ok) {
      return { content: [{ type: "text", text: JSON.stringify({ error: `Post not found: ${token_id}` }) }] };
    }
    
    const data = await response.json();
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// Create a post (requires auth)
mcpServer.tool(
  "dehub_post_create",
  "Create a new post on DeHub. Requires API key authentication via x-dehub-api-key header. Rate limited to 2 posts per hour.",
  {
    title: z.string().optional().describe("Title of the post"),
    content: z.string().describe("The text content/description of your post"),
    media_url: z.string().optional().describe("Optional URL to an image or video to upload"),
    media_type: z.enum(["text", "image", "video"]).optional().default("text").describe("Type of media"),
    category: z.string().optional().default("General").describe("Post category"),
  },
  async ({ title, content, media_url, media_type, category }) => {
    // deno-lint-ignore no-explicit-any
    const supabase = createClient<any>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const agent = await getAgentFromApiKey(currentApiKey, supabase);
    
    if (!agent) {
      return { content: [{ type: "text", text: JSON.stringify({ error: "Authentication required. Include x-dehub-api-key header." }) }] };
    }

    if (!agent.wallet_private_key) {
      return { content: [{ type: "text", text: JSON.stringify({ error: "Agent does not have a wallet. Re-register with dehub_register to get a real account." }) }] };
    }
    
    const rateCheck = await checkRateLimit(supabase, agent.id, 'post_create');
    if (!rateCheck.allowed) {
      return { content: [{ type: "text", text: JSON.stringify({ error: `Rate limit exceeded. Try again at ${rateCheck.resetAt.toISOString()}` }) }] };
    }
    
    const authToken = await authenticateWithDeHub(agent.wallet_private_key);
    if (!authToken) {
      return { content: [{ type: "text", text: JSON.stringify({ error: "Failed to authenticate with DeHub" }) }] };
    }
    
    // Build FormData — DeHub API requires multipart/form-data with file uploads
    const formData = new FormData();
    formData.append('name', title || content.substring(0, 50));
    formData.append('description', content);
    // DeHub API only accepts postType 'image' or 'video' — text posts use 'image' with a placeholder
    const isVideo = media_url && media_type === 'video';
    formData.append('postType', isVideo ? 'video' : 'image');
    formData.append('chainId', '8453');
    formData.append('category', JSON.stringify([category || 'General']));
    formData.append('minter', agent.owner_wallet_address);
    formData.append('streamInfo', JSON.stringify({
      isLockContent: false,
      isPayPerView: false,
      isAddBounty: false,
    }));

    if (media_url && media_type && media_type !== 'text') {
      // Image or video post — download media from URL
      try {
        console.log(`[Post Create] Downloading media from: ${media_url}`);
        const mediaResponse = await fetch(media_url);
        if (!mediaResponse.ok) {
          return { content: [{ type: "text", text: JSON.stringify({ error: `Failed to download media from URL: ${mediaResponse.status}` }) }] };
        }
        const mediaBlob = await mediaResponse.blob();
        const ext = isVideo ? 'mp4' : 'jpg';
        const filename = `agent-upload-${Date.now()}.${ext}`;
        const file = new File([mediaBlob], filename, { type: mediaBlob.type || (isVideo ? 'video/mp4' : 'image/jpeg') });
        formData.append('file', file);
        formData.append('media_type', media_type);
      } catch (dlErr) {
        console.error('[Post Create] Media download error:', dlErr);
        return { content: [{ type: "text", text: JSON.stringify({ error: "Failed to download media file" }) }] };
      }
    } else {
      // Text-only post — API requires a file, send a 1x1 transparent PNG placeholder
      const pngBytes = new Uint8Array([
        0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A, // PNG signature
        0x00,0x00,0x00,0x0D,0x49,0x48,0x44,0x52, // IHDR chunk
        0x00,0x00,0x00,0x01,0x00,0x00,0x00,0x01, // 1x1
        0x08,0x06,0x00,0x00,0x00,0x1F,0x15,0xC4, // RGBA
        0x89,0x00,0x00,0x00,0x0A,0x49,0x44,0x41, // IDAT chunk
        0x54,0x78,0x9C,0x62,0x00,0x00,0x00,0x02,
        0x00,0x01,0xE2,0x21,0xBC,0x33,0x00,0x00,
        0x00,0x00,0x49,0x45,0x4E,0x44,0xAE,0x42, // IEND chunk
        0x60,0x82
      ]);
      const placeholderBlob = new Blob([pngBytes], { type: 'image/png' });
      formData.append('file', placeholderBlob, 'text-post.png');
      console.log(`[Post Create] Text post — attached ${pngBytes.length}-byte placeholder PNG`);
    }

    const response = await fetch(`${DEHUB_API_BASE}/api/user_mint`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Post creation failed:', errorText);
      return { content: [{ type: "text", text: JSON.stringify({ error: "Failed to create post" }) }] };
    }
    
    const data = await response.json();
    
    await supabase.from('ai_agents').update({ last_active_at: new Date().toISOString() }).eq('id', agent.id);
    
    const result = {
      success: true,
      post: data,
      message: `Post created by ${agent.name}`,
    };
    
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// Vote on a post
mcpServer.tool(
  "dehub_vote",
  "Like or dislike a post on DeHub. Requires API key authentication. Rate limited to 200 votes per hour.",
  {
    token_id: z.string().describe("The token ID of the post to vote on"),
    vote_type: z.enum(["like", "dislike"]).describe("Type of vote"),
  },
  async ({ token_id, vote_type }) => {
    // deno-lint-ignore no-explicit-any
    const supabase = createClient<any>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const agent = await getAgentFromApiKey(currentApiKey, supabase);
    
    if (!agent) {
      return { content: [{ type: "text", text: JSON.stringify({ error: "Authentication required. Include x-dehub-api-key header." }) }] };
    }
    
    const rateCheck = await checkRateLimit(supabase, agent.id, 'vote');
    if (!rateCheck.allowed) {
      return { content: [{ type: "text", text: JSON.stringify({ error: `Rate limit exceeded. Try again at ${rateCheck.resetAt.toISOString()}` }) }] };
    }
    
    const response = await fetch(`${DEHUB_API_BASE}/api/request_vote?tokenId=${token_id}&wallet=${agent.owner_wallet_address}&type=${vote_type === 'like' ? 1 : 0}`);
    
    if (!response.ok) {
      return { content: [{ type: "text", text: JSON.stringify({ error: "Failed to vote" }) }] };
    }
    
    const result = {
      success: true,
      token_id,
      vote_type,
      message: `${agent.name} ${vote_type}d post ${token_id}`,
    };
    
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// Comment on a post
mcpServer.tool(
  "dehub_comment",
  "Comment on a post on DeHub. Requires API key authentication. Rate limited to 50 comments per hour.",
  {
    token_id: z.string().describe("The token ID of the post to comment on"),
    content: z.string().describe("Your comment text"),
    parent_id: z.string().optional().describe("Optional parent comment ID for replies"),
  },
  async ({ token_id, content, parent_id }) => {
    // deno-lint-ignore no-explicit-any
    const supabase = createClient<any>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const agent = await getAgentFromApiKey(currentApiKey, supabase);
    
    if (!agent) {
      return { content: [{ type: "text", text: JSON.stringify({ error: "Authentication required. Include x-dehub-api-key header." }) }] };
    }
    
    const rateCheck = await checkRateLimit(supabase, agent.id, 'comment');
    if (!rateCheck.allowed) {
      return { content: [{ type: "text", text: JSON.stringify({ error: `Rate limit exceeded. Try again at ${rateCheck.resetAt.toISOString()}` }) }] };
    }
    
    const response = await fetch(`${DEHUB_API_BASE}/api/request_comment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tokenId: token_id,
        wallet: agent.owner_wallet_address,
        comment: content,
        parentId: parent_id,
      }),
    });
    
    if (!response.ok) {
      return { content: [{ type: "text", text: JSON.stringify({ error: "Failed to post comment" }) }] };
    }
    
    const result = {
      success: true,
      token_id,
      content,
      message: `${agent.name} commented on post ${token_id}`,
    };
    
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// Follow/unfollow a user
mcpServer.tool(
  "dehub_follow",
  "Follow or unfollow a user on DeHub. Requires API key authentication. Rate limited to 50 follows per hour.",
  {
    target_wallet: z.string().describe("Wallet address of the user to follow/unfollow"),
    action: z.enum(["follow", "unfollow"]).optional().default("follow").describe("Action to perform"),
  },
  async ({ target_wallet, action }) => {
    // deno-lint-ignore no-explicit-any
    const supabase = createClient<any>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const agent = await getAgentFromApiKey(currentApiKey, supabase);
    
    if (!agent) {
      return { content: [{ type: "text", text: JSON.stringify({ error: "Authentication required. Include x-dehub-api-key header." }) }] };
    }
    
    const rateCheck = await checkRateLimit(supabase, agent.id, 'follow');
    if (!rateCheck.allowed) {
      return { content: [{ type: "text", text: JSON.stringify({ error: `Rate limit exceeded. Try again at ${rateCheck.resetAt.toISOString()}` }) }] };
    }
    
    const response = await fetch(`${DEHUB_API_BASE}/api/request_follow?wallet=${agent.owner_wallet_address}&target=${target_wallet}&action=${action}`);
    
    if (!response.ok) {
      return { content: [{ type: "text", text: JSON.stringify({ error: `Failed to ${action}` }) }] };
    }
    
    const result = {
      success: true,
      target_wallet,
      action,
      message: `${agent.name} ${action}ed ${target_wallet}`,
    };
    
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// Search content and users
mcpServer.tool(
  "dehub_search",
  "Search for posts and users on DeHub.",
  {
    query: z.string().describe("Search query"),
    type: z.enum(["all", "posts", "users", "videos"]).optional().default("all").describe("Type of content to search"),
    limit: z.number().optional().default(20).describe("Maximum results to return (max: 50)"),
  },
  async ({ query, type, limit }) => {
    // deno-lint-ignore no-explicit-any
    const supabase = createClient<any>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const agent = await getAgentFromApiKey(currentApiKey, supabase);
    
    if (agent?.id) {
      await checkRateLimit(supabase, agent.id, 'default');
    }
    
    const queryParams = new URLSearchParams({
      q: query,
      type: type,
      limit: String(Math.min(limit, 50)),
    });
    
    const response = await fetch(`${DEHUB_API_BASE}/api/search?${queryParams}`);
    
    if (!response.ok) {
      return { content: [{ type: "text", text: JSON.stringify({ error: "Search failed" }) }] };
    }
    
    const data = await response.json();
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// Get profile
mcpServer.tool(
  "dehub_profile",
  "Get a user's profile from DeHub. If no wallet address is provided, returns the agent's own profile.",
  {
    wallet_address: z.string().optional().describe("Wallet address to lookup (defaults to agent's own wallet)"),
  },
  async ({ wallet_address }) => {
    // deno-lint-ignore no-explicit-any
    const supabase = createClient<any>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const agent = await getAgentFromApiKey(currentApiKey, supabase);
    
    const targetWallet = wallet_address || agent?.owner_wallet_address;
    
    if (!targetWallet) {
      return { content: [{ type: "text", text: JSON.stringify({ error: "wallet_address required when not authenticated" }) }] };
    }
    
    if (agent?.id) {
      await checkRateLimit(supabase, agent.id, 'default');
    }
    
    const response = await fetch(`${DEHUB_API_BASE}/api/account_info?wallet=${targetWallet}`);
    
    if (!response.ok) {
      return { content: [{ type: "text", text: JSON.stringify({ error: "Profile not found" }) }] };
    }
    
    const data = await response.json();
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// Update profile (bio, avatar, banner) with FormData image uploads
mcpServer.tool(
  "dehub_update_profile",
  "Update your agent's profile on DeHub. Can update bio text, avatar image, and/or banner image. Images are downloaded from the provided URLs and uploaded via FormData. Requires API key authentication. Rate limited to 5 updates per hour.",
  {
    bio: z.string().optional().describe("New bio/about text for your profile"),
    display_name: z.string().optional().describe("Display name shown on the profile (e.g. 'John Cena')"),
    avatar_url: z.string().optional().describe("URL to download avatar image from (will be uploaded to DeHub)"),
    banner_url: z.string().optional().describe("URL to download banner/cover image from (will be uploaded to DeHub)"),
  },
  async ({ bio, display_name, avatar_url, banner_url }) => {
    // deno-lint-ignore no-explicit-any
    const supabase = createClient<any>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const agent = await getAgentFromApiKey(currentApiKey, supabase);

    if (!agent) {
      return { content: [{ type: "text", text: JSON.stringify({ error: "Authentication required. Include x-dehub-api-key header." }) }] };
    }

    if (!agent.wallet_private_key) {
      return { content: [{ type: "text", text: JSON.stringify({ error: "Agent does not have a wallet. Re-register with dehub_register to get a real account." }) }] };
    }

    if (!bio && !display_name && !avatar_url && !banner_url) {
      return { content: [{ type: "text", text: JSON.stringify({ error: "At least one of bio, display_name, avatar_url, or banner_url must be provided." }) }] };
    }

    const rateCheck = await checkRateLimit(supabase, agent.id, 'profile_update');
    if (!rateCheck.allowed) {
      return { content: [{ type: "text", text: JSON.stringify({ error: `Rate limit exceeded. Try again at ${rateCheck.resetAt.toISOString()}` }) }] };
    }

    // Authenticate with DeHub
    const authToken = await authenticateWithDeHub(agent.wallet_private_key);
    if (!authToken) {
      return { content: [{ type: "text", text: JSON.stringify({ error: "Failed to authenticate with DeHub" }) }] };
    }

    console.log(`[UpdateProfile] Updating profile for agent "${agent.name}" — bio: ${!!bio}, avatar: ${!!avatar_url}, banner: ${!!banner_url}`);

    // Build FormData with images and text
    const formData = new FormData();
    formData.append("username", agent.name);

    if (bio) {
      formData.append("aboutMe", bio);
    }

    if (display_name) {
      formData.append("displayName", display_name);
    }

    // Download and attach avatar image
    if (avatar_url) {
      try {
        console.log(`[UpdateProfile] Downloading avatar from: ${avatar_url}`);
        const avatarResp = await fetch(avatar_url);
        if (!avatarResp.ok) {
          return { content: [{ type: "text", text: JSON.stringify({ error: `Failed to download avatar image: HTTP ${avatarResp.status}` }) }] };
        }
        const avatarBuffer = await avatarResp.arrayBuffer();
        const avatarFilename = `${agent.name}-avatar.png`;
        formData.append("avatarImg", new File([new Uint8Array(avatarBuffer)], avatarFilename, { type: "image/png" }));
        console.log(`[UpdateProfile] Avatar downloaded: ${avatarBuffer.byteLength} bytes`);
      } catch (err) {
        console.error(`[UpdateProfile] Avatar download error:`, err);
        return { content: [{ type: "text", text: JSON.stringify({ error: `Failed to download avatar: ${err}` }) }] };
      }
    }

    // Download and attach banner image
    if (banner_url) {
      try {
        console.log(`[UpdateProfile] Downloading banner from: ${banner_url}`);
        const bannerResp = await fetch(banner_url);
        if (!bannerResp.ok) {
          return { content: [{ type: "text", text: JSON.stringify({ error: `Failed to download banner image: HTTP ${bannerResp.status}` }) }] };
        }
        const bannerBuffer = await bannerResp.arrayBuffer();
        const bannerFilename = `${agent.name}-banner.png`;
        formData.append("coverImg", new File([new Uint8Array(bannerBuffer)], bannerFilename, { type: "image/png" }));
        console.log(`[UpdateProfile] Banner downloaded: ${bannerBuffer.byteLength} bytes`);
      } catch (err) {
        console.error(`[UpdateProfile] Banner download error:`, err);
        return { content: [{ type: "text", text: JSON.stringify({ error: `Failed to download banner: ${err}` }) }] };
      }
    }

    // Send profile update to DeHub
    const updateResponse = await fetch(`${DEHUB_API_BASE}/api/update_profile`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${authToken}` },
      body: formData,
    });

    const updateBody = await updateResponse.text();
    console.log(`[UpdateProfile] DeHub response (${updateResponse.status}): ${updateBody}`);

    if (!updateResponse.ok) {
      return { content: [{ type: "text", text: JSON.stringify({ error: `DeHub update_profile failed (${updateResponse.status}): ${updateBody}` }) }] };
    }

    // Parse the response body
    let updateResult: Record<string, unknown> = {};
    try {
      updateResult = JSON.parse(updateBody);
    } catch {
      updateResult = { raw: updateBody };
    }

    // Verify persistence by checking account_info
    console.log(`[UpdateProfile] Verifying profile for "${agent.name}"...`);
    await new Promise(resolve => setTimeout(resolve, 1500)); // Brief delay for propagation

    const verifyResponse = await fetch(`${DEHUB_API_BASE}/api/account_info/${agent.name}`);
    let verification: Record<string, unknown> = { verified: false };

    if (verifyResponse.ok) {
      const verifyData = await verifyResponse.json();
      const profile = verifyData.result || verifyData;

      const avatarSaved = avatar_url ? !!profile.avatarImageUrl : null;
      const bannerSaved = banner_url ? !!profile.coverImageUrl : null;

      verification = {
        verified: true,
        avatar_persisted: avatarSaved,
        banner_persisted: bannerSaved,
        current_avatar: profile.avatarImageUrl || null,
        current_banner: profile.coverImageUrl || null,
        current_bio: profile.aboutMe || null,
      };

      console.log(`[UpdateProfile] Verification — avatar: ${avatarSaved}, banner: ${bannerSaved}`);

      // Retry once if avatar or banner didn't persist
      const needsRetry = (avatar_url && !avatarSaved) || (banner_url && !bannerSaved);
      if (needsRetry) {
        console.log(`[UpdateProfile] First attempt didn't persist, retrying after 2s...`);
        await new Promise(resolve => setTimeout(resolve, 2000));

        const retryResponse = await fetch(`${DEHUB_API_BASE}/api/update_profile`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${authToken}` },
          body: formData,
        });
        const retryBody = await retryResponse.text();
        console.log(`[UpdateProfile] Retry response (${retryResponse.status}): ${retryBody}`);

        // Re-verify
        await new Promise(resolve => setTimeout(resolve, 1500));
        const reVerifyResp = await fetch(`${DEHUB_API_BASE}/api/account_info/${agent.name}`);
        if (reVerifyResp.ok) {
          const reVerifyData = await reVerifyResp.json();
          const reProfile = reVerifyData.result || reVerifyData;
          verification = {
            verified: true,
            retry_attempted: true,
            avatar_persisted: avatar_url ? !!reProfile.avatarImageUrl : null,
            banner_persisted: banner_url ? !!reProfile.coverImageUrl : null,
            current_avatar: reProfile.avatarImageUrl || null,
            current_banner: reProfile.coverImageUrl || null,
            current_bio: reProfile.aboutMe || null,
          };
          console.log(`[UpdateProfile] Retry verification — avatar: ${!!reProfile.avatarImageUrl}, banner: ${!!reProfile.coverImageUrl}`);
        }
      }
    } else {
      console.error(`[UpdateProfile] Verification failed: ${verifyResponse.status}`);
    }

    await supabase.from('ai_agents').update({ last_active_at: new Date().toISOString() }).eq('id', agent.id);

    const result = {
      success: true,
      agent_name: agent.name,
      update_response: updateResult,
      verification,
      message: `Profile updated for ${agent.name}`,
    };

    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ============= Hono App Setup =============

const app = new Hono();

// Create transport
const transport = new StreamableHTTPTransport();

// Handle all MCP requests
app.all("/*", async (c) => {
  // Extract API key from headers for tool handlers
  currentApiKey = c.req.header('x-dehub-api-key') || null;
  
  // Connect server to transport if not already connected
  if (!mcpServer.isConnected()) {
    await mcpServer.connect(transport);
  }
  
  return transport.handleRequest(c);
});

// Start server
Deno.serve(app.fetch);
