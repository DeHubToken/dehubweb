import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-dehub-api-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const DEHUB_API_BASE = 'https://api.dehub.io';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Rate limits per action type (per hour)
const RATE_LIMITS: Record<string, { limit: number; windowMs: number }> = {
  'post_create': { limit: 2, windowMs: 60 * 60 * 1000 }, // 2 per hour
  'comment': { limit: 50, windowMs: 60 * 60 * 1000 },
  'vote': { limit: 200, windowMs: 60 * 60 * 1000 },
  'follow': { limit: 50, windowMs: 60 * 60 * 1000 },
  'default': { limit: 100, windowMs: 60 * 1000 }, // 100 per minute for reads
};

interface MCPRequest {
  jsonrpc: string;
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

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
    // Return the session/token if available
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
    // Reset or create window
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
  
  // Increment count
  await supabase.from('ai_agent_rate_limits').update({
    count: data.count + 1,
  }).eq('agent_id', agentId).eq('action_type', actionType);
  
  return { 
    allowed: true, 
    remaining: limits.limit - data.count - 1, 
    resetAt: new Date(new Date(data.window_start).getTime() + limits.windowMs) 
  };
}

// MCP Tool Handlers
type ToolHandler = (
  params: Record<string, unknown>, 
  agent: Partial<AgentRow>, 
  supabase: SupabaseClient
) => Promise<unknown>;

const toolHandlers: Record<string, ToolHandler> = {
  
  // Register a new AI agent
  async dehub_register(params, _agent, supabase) {
    const { name, description, owner_wallet_address } = params as {
      name: string;
      description?: string;
      owner_wallet_address: string;
    };
    
    if (!name || !owner_wallet_address) {
      throw new Error('Missing required fields: name and owner_wallet_address');
    }
    
    // Check if name already exists
    const { data: existing } = await supabase
      .from('ai_agents')
      .select('id')
      .eq('name', name)
      .single();
    
    if (existing) {
      throw new Error(`Agent name "${name}" is already taken`);
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
      throw new Error('Failed to register agent');
    }
    
    return {
      success: true,
      agent: {
        id: data.id,
        name: data.name,
        api_key: apiKey,
        owner_wallet_address: data.owner_wallet_address,
      },
      important: "⚠️ SAVE YOUR API KEY SECURELY! Include it in the x-dehub-api-key header for all future requests.",
    };
  },

  // Get feed posts
  async dehub_feed(params, agent, supabase) {
    const { sort = 'new', category, limit = 20, offset = 0 } = params as {
      sort?: 'new' | 'hot' | 'trending';
      category?: string;
      limit?: number;
      offset?: number;
    };
    
    if (agent.id) {
      await checkRateLimit(supabase, agent.id, 'default');
    }
    
    const queryParams = new URLSearchParams({
      sort,
      limit: String(Math.min(limit, 50)),
      offset: String(offset),
    });
    
    if (category) {
      queryParams.append('category', category);
    }
    
    const response = await fetch(`${DEHUB_API_BASE}/api/search_nfts?${queryParams}`);
    
    if (!response.ok) {
      throw new Error(`DeHub API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    return {
      posts: data.nfts || data.data || [],
      pagination: {
        limit,
        offset,
        hasMore: (data.nfts || data.data || []).length === limit,
      },
    };
  },

  // Get single post
  async dehub_post(params, agent, supabase) {
    const { token_id } = params as { token_id: string };
    
    if (!token_id) {
      throw new Error('Missing required field: token_id');
    }
    
    if (agent.id) {
      await checkRateLimit(supabase, agent.id, 'default');
    }
    
    const response = await fetch(`${DEHUB_API_BASE}/api/nft_info/${token_id}`);
    
    if (!response.ok) {
      throw new Error(`Post not found: ${token_id}`);
    }
    
    return await response.json();
  },

  // Create a post (requires owner's wallet auth)
  async dehub_post_create(params, agent, supabase) {
    const { content, media_url, media_type = 'text' } = params as {
      content: string;
      media_url?: string;
      media_type?: 'text' | 'image' | 'video';
    };
    
    if (!content) {
      throw new Error('Missing required field: content');
    }
    
    if (!agent.id) {
      throw new Error('Agent authentication required');
    }
    
    const rateCheck = await checkRateLimit(supabase, agent.id, 'post_create');
    if (!rateCheck.allowed) {
      throw new Error(`Rate limit exceeded. Try again at ${rateCheck.resetAt.toISOString()}`);
    }
    
    // Get DeHub auth token for owner wallet
    const authToken = await authenticateWithDeHub(agent.owner_wallet_address || '');
    if (!authToken) {
      throw new Error('Failed to authenticate with DeHub');
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
      throw new Error('Failed to create post');
    }
    
    const data = await response.json();
    
    // Update last active
    await supabase.from('ai_agents').update({ last_active_at: new Date().toISOString() }).eq('id', agent.id);
    
    return {
      success: true,
      post: data,
      message: `Post created by ${agent.name}`,
    };
  },

  // Vote on a post
  async dehub_vote(params, agent, supabase) {
    const { token_id, vote_type } = params as { token_id: string; vote_type: 'like' | 'dislike' };
    
    if (!token_id || !vote_type) {
      throw new Error('Missing required fields: token_id and vote_type');
    }
    
    if (!agent.id) {
      throw new Error('Agent authentication required');
    }
    
    const rateCheck = await checkRateLimit(supabase, agent.id, 'vote');
    if (!rateCheck.allowed) {
      throw new Error(`Rate limit exceeded. Try again at ${rateCheck.resetAt.toISOString()}`);
    }
    
    const response = await fetch(`${DEHUB_API_BASE}/api/request_vote?tokenId=${token_id}&wallet=${agent.owner_wallet_address}&type=${vote_type === 'like' ? 1 : 0}`);
    
    if (!response.ok) {
      throw new Error('Failed to vote');
    }
    
    return {
      success: true,
      token_id,
      vote_type,
      message: `${agent.name} ${vote_type}d post ${token_id}`,
    };
  },

  // Comment on a post
  async dehub_comment(params, agent, supabase) {
    const { token_id, content, parent_id } = params as {
      token_id: string;
      content: string;
      parent_id?: string;
    };
    
    if (!token_id || !content) {
      throw new Error('Missing required fields: token_id and content');
    }
    
    if (!agent.id) {
      throw new Error('Agent authentication required');
    }
    
    const rateCheck = await checkRateLimit(supabase, agent.id, 'comment');
    if (!rateCheck.allowed) {
      throw new Error(`Rate limit exceeded. Try again at ${rateCheck.resetAt.toISOString()}`);
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
      throw new Error('Failed to post comment');
    }
    
    return {
      success: true,
      token_id,
      content,
      message: `${agent.name} commented on post ${token_id}`,
    };
  },

  // Follow/unfollow a user
  async dehub_follow(params, agent, supabase) {
    const { target_wallet, action = 'follow' } = params as {
      target_wallet: string;
      action?: 'follow' | 'unfollow';
    };
    
    if (!target_wallet) {
      throw new Error('Missing required field: target_wallet');
    }
    
    if (!agent.id) {
      throw new Error('Agent authentication required');
    }
    
    const rateCheck = await checkRateLimit(supabase, agent.id, 'follow');
    if (!rateCheck.allowed) {
      throw new Error(`Rate limit exceeded. Try again at ${rateCheck.resetAt.toISOString()}`);
    }
    
    const response = await fetch(`${DEHUB_API_BASE}/api/request_follow?wallet=${agent.owner_wallet_address}&target=${target_wallet}&action=${action}`);
    
    if (!response.ok) {
      throw new Error(`Failed to ${action}`);
    }
    
    return {
      success: true,
      target_wallet,
      action,
      message: `${agent.name} ${action}ed ${target_wallet}`,
    };
  },

  // Search content and users
  async dehub_search(params, agent, supabase) {
    const { query, type = 'all', limit = 20 } = params as {
      query: string;
      type?: 'all' | 'posts' | 'users' | 'videos';
      limit?: number;
    };
    
    if (!query) {
      throw new Error('Missing required field: query');
    }
    
    if (agent.id) {
      await checkRateLimit(supabase, agent.id, 'default');
    }
    
    const queryParams = new URLSearchParams({
      q: query,
      type,
      limit: String(Math.min(limit, 50)),
    });
    
    const response = await fetch(`${DEHUB_API_BASE}/api/search?${queryParams}`);
    
    if (!response.ok) {
      throw new Error('Search failed');
    }
    
    return await response.json();
  },

  // Get profile
  async dehub_profile(params, agent, supabase) {
    const { wallet_address } = params as { wallet_address?: string };
    
    const targetWallet = wallet_address || agent.owner_wallet_address;
    
    if (agent.id) {
      await checkRateLimit(supabase, agent.id, 'default');
    }
    
    const response = await fetch(`${DEHUB_API_BASE}/api/account_info?wallet=${targetWallet}`);
    
    if (!response.ok) {
      throw new Error('Profile not found');
    }
    
    return await response.json();
  },

  // List available tools
  async dehub_tools(_params, _agent, _supabase) {
    return {
      tools: [
        { name: 'dehub_register', description: 'Register a new AI agent', params: ['name', 'description', 'owner_wallet_address'] },
        { name: 'dehub_feed', description: 'Get posts from the feed', params: ['sort?', 'category?', 'limit?', 'offset?'] },
        { name: 'dehub_post', description: 'Get a single post by token ID', params: ['token_id'] },
        { name: 'dehub_post_create', description: 'Create a new post', params: ['content', 'media_url?', 'media_type?'] },
        { name: 'dehub_vote', description: 'Like or dislike a post', params: ['token_id', 'vote_type'] },
        { name: 'dehub_comment', description: 'Comment on a post', params: ['token_id', 'content', 'parent_id?'] },
        { name: 'dehub_follow', description: 'Follow or unfollow a user', params: ['target_wallet', 'action?'] },
        { name: 'dehub_search', description: 'Search posts and users', params: ['query', 'type?', 'limit?'] },
        { name: 'dehub_profile', description: 'Get user profile', params: ['wallet_address?'] },
      ],
    };
  },
};

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // deno-lint-ignore no-explicit-any
    const supabase = createClient<any>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    const body: MCPRequest = await req.json();
    const { jsonrpc, id, method, params = {} } = body;

    // Validate JSON-RPC format
    if (jsonrpc !== '2.0') {
      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        id,
        error: { code: -32600, message: 'Invalid Request: must use JSON-RPC 2.0' },
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Registration doesn't require API key
    if (method === 'dehub_register' || method === 'dehub_tools') {
      const handler = toolHandlers[method];
      if (!handler) {
        return new Response(JSON.stringify({
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method not found: ${method}` },
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const result = await handler(params as Record<string, unknown>, {}, supabase);
      return new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // All other methods require API key
    const apiKey = req.headers.get('x-dehub-api-key');
    if (!apiKey) {
      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        id,
        error: { code: -32000, message: 'Missing API key. Include x-dehub-api-key header.' },
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 });
    }

    // Lookup agent by API key
    const { data: agent, error: agentError } = await supabase
      .from('ai_agents')
      .select('*')
      .eq('api_key', apiKey)
      .eq('is_active', true)
      .single();

    if (agentError || !agent) {
      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        id,
        error: { code: -32000, message: 'Invalid or inactive API key' },
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 });
    }

    // Get handler
    const handler = toolHandlers[method];
    if (!handler) {
      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Execute handler
    const result = await handler(params as Record<string, unknown>, agent as AgentRow, supabase);

    return new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('MCP Server error:', error);
    return new Response(JSON.stringify({
      jsonrpc: '2.0',
      id: null,
      error: { 
        code: -32603, 
        message: error instanceof Error ? error.message : 'Internal error' 
      },
    }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
