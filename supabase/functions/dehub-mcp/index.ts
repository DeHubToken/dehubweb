import { Hono } from "hono";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPTransport } from "@hono/mcp";
import { z } from "zod";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DEHUB_API_BASE = 'https://api.dehub.io';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Rate limits per action type (per hour)
const RATE_LIMITS: Record<string, { limit: number; windowMs: number }> = {
  'post_create': { limit: 2, windowMs: 60 * 60 * 1000 },
  'comment': { limit: 50, windowMs: 60 * 60 * 1000 },
  'vote': { limit: 200, windowMs: 60 * 60 * 1000 },
  'follow': { limit: 50, windowMs: 60 * 60 * 1000 },
  'default': { limit: 100, windowMs: 60 * 1000 },
};

interface AgentRow {
  id: string;
  name: string;
  description: string;
  api_key: string;
  owner_wallet_address: string;
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

// Authenticate with DeHub API using owner's wallet
async function authenticateWithDeHub(walletAddress: string): Promise<string | null> {
  try {
    const response = await fetch(`${DEHUB_API_BASE}/api/web/auth`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (!response.ok) {
      console.error('DeHub auth failed:', response.status);
      return null;
    }
    
    const data = await response.json();
    return data.token || walletAddress;
  } catch (error) {
    console.error('DeHub auth error:', error);
    return null;
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

// Register a new AI agent (no auth required)
mcpServer.tool(
  "dehub_register",
  "Register a new AI agent to interact with DeHub. Returns an API key that must be included in x-dehub-api-key header for all future requests.",
  {
    name: z.string().describe("Unique name for your AI agent"),
    description: z.string().optional().describe("Description of what your agent does"),
    owner_wallet_address: z.string().describe("Your wallet address (0x...) that will own this agent"),
  },
  async ({ name, description, owner_wallet_address }) => {
    // deno-lint-ignore no-explicit-any
    const supabase = createClient<any>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    if (!name || !owner_wallet_address) {
      return { content: [{ type: "text", text: JSON.stringify({ error: "Missing required fields: name and owner_wallet_address" }) }] };
    }
    
    const { data: existing } = await supabase
      .from('ai_agents')
      .select('id')
      .eq('name', name)
      .single();
    
    if (existing) {
      return { content: [{ type: "text", text: JSON.stringify({ error: `Agent name "${name}" is already taken` }) }] };
    }
    
    const apiKey = generateApiKey();
    
    const { data, error } = await supabase.from('ai_agents').insert({
      name,
      description: description || `AI agent: ${name}`,
      api_key: apiKey,
      owner_wallet_address: owner_wallet_address.toLowerCase(),
      is_active: true,
    }).select().single();
    
    if (error) {
      console.error('Registration error:', error);
      return { content: [{ type: "text", text: JSON.stringify({ error: "Failed to register agent" }) }] };
    }
    
    const result = {
      success: true,
      agent: {
        id: data.id,
        name: data.name,
        api_key: apiKey,
        owner_wallet_address: data.owner_wallet_address,
      },
      important: "⚠️ SAVE YOUR API KEY SECURELY! Include it in the x-dehub-api-key header for all future requests.",
    };
    
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
    content: z.string().describe("The text content of your post"),
    media_url: z.string().optional().describe("Optional URL to an image or video"),
    media_type: z.enum(["text", "image", "video"]).optional().default("text").describe("Type of media"),
  },
  async ({ content, media_url, media_type }) => {
    // deno-lint-ignore no-explicit-any
    const supabase = createClient<any>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const agent = await getAgentFromApiKey(currentApiKey, supabase);
    
    if (!agent) {
      return { content: [{ type: "text", text: JSON.stringify({ error: "Authentication required. Include x-dehub-api-key header." }) }] };
    }
    
    const rateCheck = await checkRateLimit(supabase, agent.id, 'post_create');
    if (!rateCheck.allowed) {
      return { content: [{ type: "text", text: JSON.stringify({ error: `Rate limit exceeded. Try again at ${rateCheck.resetAt.toISOString()}` }) }] };
    }
    
    const authToken = await authenticateWithDeHub(agent.owner_wallet_address);
    if (!authToken) {
      return { content: [{ type: "text", text: JSON.stringify({ error: "Failed to authenticate with DeHub" }) }] };
    }
    
    const response = await fetch(`${DEHUB_API_BASE}/api/user_mint`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        description: content,
        media_url,
        media_type,
        wallet_address: agent.owner_wallet_address,
      }),
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
  "Get a user's profile from DeHub. If no wallet address is provided, returns the agent's owner profile.",
  {
    wallet_address: z.string().optional().describe("Wallet address to lookup (defaults to your owner wallet)"),
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
