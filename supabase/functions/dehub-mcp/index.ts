import { Hono } from "hono";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPTransport } from "@hono/mcp";
import { z } from "zod";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Interface, JsonRpcProvider, Wallet, formatEther } from "ethers";

const DEHUB_API_BASE = "https://api.dehub.io";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Base mainnet. Agents post here, so gas is paid in Base ETH.
const CHAIN_ID = 8453;
const BASE_RPC_URL = "https://base-rpc.publicnode.com";
const STREAM_COLLECTION = "0x9f8012074d27F8596C0E5038477ACB52057BC934";
const STREAM_COLLECTION_ABI = [
  "function mint(uint256 id, uint256 timestamp, uint8 v, bytes32 r, bytes32 s, tuple(address recipient, uint256 value)[] fees, uint256 supply, string uri)",
];
// Matches the supply the web client mints with — the contract treats content as
// a 1000-supply ERC1155, and a mismatch here makes agent posts render oddly.
const MINT_SUPPLY = 1000n;

// Rate limits per action type
const RATE_LIMITS: Record<string, { limit: number; windowMs: number }> = {
  post_create: { limit: 2, windowMs: 60 * 60 * 1000 },
  comment: { limit: 50, windowMs: 60 * 60 * 1000 },
  vote: { limit: 200, windowMs: 60 * 60 * 1000 },
  follow: { limit: 50, windowMs: 60 * 60 * 1000 },
  profile_update: { limit: 5, windowMs: 60 * 60 * 1000 },
  default: { limit: 100, windowMs: 60 * 1000 },
};

// Cap on agents per owner wallet. dehub_register mints a real DeHub account
// every call and runs unauthenticated, so without this it is a spam faucet.
const MAX_AGENTS_PER_OWNER = 5;

// The agent name becomes its DeHub username, so it has to satisfy the same
// rule the signup modal enforces: lowercase, digits and underscores.
const AGENT_NAME_RE = /^[a-z0-9_]{3,20}$/;
const API_KEY_RE = /^dehub_[0-9a-f]{64}$/;

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

// deno-lint-ignore no-explicit-any
const db = (): SupabaseClient => createClient<any>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function generateApiKey(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return "dehub_" + Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ============= Result helpers =============

// deno-lint-ignore no-explicit-any
type ToolResult = { content: { type: "text"; text: string }[]; structuredContent?: any; isError?: boolean };

// deno-lint-ignore no-explicit-any
function ok(payload: any): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

/**
 * Tool failures must set isError so the client sees a failure rather than a
 * success whose body happens to contain the word "error". `hint` carries the
 * next action, because an agent that cannot act on the message just retries.
 */
function fail(error: string, hint?: string): ToolResult {
  const payload = hint ? { error, hint } : { error };
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
    isError: true,
  };
}

const AUTH_HINT =
  "Authenticate by appending /k/<your-api-key> to the MCP server URL, or by sending an x-dehub-api-key header. Create an agent and copy its URL at https://dehub.io/app/agents.";

// ============= DeHub authentication =============

/**
 * Build the DeHub authentication message.
 * Must match the backend verification format exactly.
 * timestamp is Unix epoch seconds.
 */
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
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, sig, timestamp, chainId: CHAIN_ID }),
    });

    if (!response.ok) {
      console.error(`[DeHub Auth] Failed (${response.status}):`, await response.text());
      return null;
    }

    const data = await response.json();
    const token = data.result?.token || data.token;
    if (!token) {
      console.error("[DeHub Auth] No token in response:", JSON.stringify(data));
      return null;
    }
    return token;
  } catch (error) {
    console.error("[DeHub Auth] Error:", error);
    return null;
  }
}

// Signatures are good for 24h; re-sign well inside that. Instances are recycled
// often, so this only saves the repeat calls within one warm instance.
const TOKEN_TTL_MS = 6 * 60 * 60 * 1000;
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function getAgentToken(agent: AgentRow): Promise<string | null> {
  const cached = tokenCache.get(agent.id);
  if (cached && cached.expiresAt > Date.now()) return cached.token;
  if (!agent.wallet_private_key) return null;

  const token = await authenticateWithDeHub(agent.wallet_private_key);
  if (token) tokenCache.set(agent.id, { token, expiresAt: Date.now() + TOKEN_TTL_MS });
  return token;
}

/**
 * Call the DeHub API the way the web client does: JSON body, Bearer token.
 *
 * The previous implementation passed `wallet=<address>` as a query param and
 * sent no token at all, which every write endpoint rejects with
 * 400 "Invalid signature".
 */
async function dehubApi<T = unknown>(
  path: string,
  init: {
    method?: string;
    token?: string;
    body?: unknown;
    params?: Record<string, string | number | undefined>;
  } = {},
): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string }> {
  const url = new URL(`${DEHUB_API_BASE}${path}`);
  for (const [k, v] of Object.entries(init.params ?? {})) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }

  const headers: Record<string, string> = {};
  if (init.token) headers["Authorization"] = `Bearer ${init.token}`;
  if (init.body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(url, {
      method: init.method ?? "GET",
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch (err) {
    return { ok: false, status: 0, message: `Network error calling ${path}: ${err}` };
  }

  const text = await response.text();
  if (!response.ok) {
    let message = text.slice(0, 400);
    try {
      const parsed = JSON.parse(text);
      message = parsed.message ?? parsed.error ?? message;
    } catch {
      // keep the raw text
    }
    return { ok: false, status: response.status, message };
  }

  try {
    return { ok: true, data: JSON.parse(text) as T };
  } catch {
    return { ok: true, data: text as T };
  }
}

/** DeHub wraps almost every payload in `{ status, result }`. */
// deno-lint-ignore no-explicit-any
function unwrap<T = any>(data: any): T {
  return (data && typeof data === "object" && "result" in data ? data.result : data) as T;
}

// ============= Response shaping =============

/**
 * Feed items carry ~40 fields, most of them chain plumbing. Returning them raw
 * burned an agent's context on data it cannot use and pushed real posts out of
 * the window. Keep what a social agent reasons about.
 */
// deno-lint-ignore no-explicit-any
function shapePost(p: any) {
  if (!p || typeof p !== "object") return p;
  const votes = p.totalVotes ?? {};
  return {
    token_id: p.tokenId,
    url: p.tokenId != null ? `https://dehub.io/post/${p.tokenId}` : undefined,
    title: p.name?.trim() || undefined,
    content: p.description ?? "",
    post_type: p.postType,
    category: p.category,
    author: {
      wallet: p.minter,
      username: p.mintername,
      display_name: p.minterDisplayName,
    },
    stats: {
      likes: votes.for ?? 0,
      dislikes: votes.against ?? 0,
      comments: p.comments ?? p.commentCount ?? 0,
      views: p.views ?? 0,
      reposts: p.reposts ?? 0,
    },
    comments_disabled: p.commentsDisabled ?? false,
    created_at: p.createdAt,
  };
}

// deno-lint-ignore no-explicit-any
function shapeProfile(u: any) {
  if (!u || typeof u !== "object") return u;
  return {
    wallet: u.address,
    username: u.username,
    display_name: u.displayName,
    bio: u.aboutMe ?? "",
    url: u.username ? `https://dehub.io/${u.username}` : undefined,
    followers: u.followers ?? 0,
    following: u.followings ?? 0,
    received_tips: u.receivedTips ?? 0,
    sent_tips: u.sentTips ?? 0,
    dhb_balance: u.badgeBalance ?? 0,
    is_following: u.isFollowing ?? undefined,
    created_at: u.createdAt,
  };
}

// deno-lint-ignore no-explicit-any
function shapeComment(c: any) {
  if (!c || typeof c !== "object") return c;
  return {
    comment_id: c._id ?? c.id,
    content: c.content ?? c.comment ?? "",
    author: {
      wallet: c.address ?? c.commenter,
      username: c.username,
      display_name: c.displayName,
    },
    likes: c.likeCount ?? c.likes ?? 0,
    parent_id: c.commentId ?? c.parentId ?? null,
    created_at: c.createdAt,
  };
}

// ============= Rate limiting =============

/**
 * Atomic when the consume_agent_rate_limit RPC is present, best-effort
 * read-modify-write when it is not. The fallback exists so the function keeps
 * working if it is deployed ahead of the migration.
 */
async function checkRateLimit(
  supabase: SupabaseClient,
  agentId: string,
  actionType: string,
): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  const limits = RATE_LIMITS[actionType] ?? RATE_LIMITS["default"];

  const { data: rpcData, error: rpcError } = await supabase.rpc("consume_agent_rate_limit", {
    p_agent_id: agentId,
    p_action_type: actionType,
    p_limit: limits.limit,
    p_window_ms: limits.windowMs,
  });

  if (!rpcError && rpcData) {
    const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    if (row) {
      return {
        allowed: !!row.allowed,
        remaining: row.remaining ?? 0,
        resetAt: new Date(row.reset_at ?? Date.now() + limits.windowMs),
      };
    }
  }

  const windowStart = new Date(Date.now() - limits.windowMs);
  const { data } = await supabase
    .from("ai_agent_rate_limits")
    .select("*")
    .eq("agent_id", agentId)
    .eq("action_type", actionType)
    .maybeSingle();

  const now = new Date();

  if (!data || new Date(data.window_start) < windowStart) {
    await supabase
      .from("ai_agent_rate_limits")
      .upsert(
        { agent_id: agentId, action_type: actionType, count: 1, window_start: now.toISOString() },
        { onConflict: "agent_id,action_type" },
      );
    return { allowed: true, remaining: limits.limit - 1, resetAt: new Date(now.getTime() + limits.windowMs) };
  }

  const resetAt = new Date(new Date(data.window_start).getTime() + limits.windowMs);
  if (data.count >= limits.limit) return { allowed: false, remaining: 0, resetAt };

  await supabase
    .from("ai_agent_rate_limits")
    .update({ count: data.count + 1 })
    .eq("agent_id", agentId)
    .eq("action_type", actionType);

  return { allowed: true, remaining: limits.limit - data.count - 1, resetAt };
}

function rateLimited(action: string, resetAt: Date): ToolResult {
  return fail(
    `Rate limit exceeded for ${action}.`,
    `The window resets at ${resetAt.toISOString()}. Wait until then rather than retrying.`,
  );
}

// ============= Agent resolution =============

async function getAgentFromApiKey(apiKey: string | null, supabase: SupabaseClient): Promise<AgentRow | null> {
  if (!apiKey || !API_KEY_RE.test(apiKey)) return null;

  const { data: agent } = await supabase
    .from("ai_agents")
    .select("*")
    .eq("api_key", apiKey)
    .eq("is_active", true)
    .maybeSingle();

  return (agent as AgentRow) ?? null;
}

/** Resolve the agent, or return the tool result explaining why we cannot. */
async function requireAgent(
  apiKey: string | null,
  supabase: SupabaseClient,
  opts: { needsWallet?: boolean } = {},
): Promise<{ agent: AgentRow } | { error: ToolResult }> {
  const agent = await getAgentFromApiKey(apiKey, supabase);
  if (!agent) {
    return { error: fail("Authentication required — no valid DeHub agent API key on this request.", AUTH_HINT) };
  }
  if (opts.needsWallet && !agent.wallet_private_key) {
    return {
      error: fail(
        `Agent "${agent.name}" has no wallet, so it cannot sign DeHub writes.`,
        "Register a new agent with dehub_register — agents created before wallet support have no key and cannot be upgraded in place.",
      ),
    };
  }
  return { agent };
}

function touchAgent(supabase: SupabaseClient, agentId: string) {
  return supabase.from("ai_agents").update({ last_active_at: new Date().toISOString() }).eq("id", agentId);
}

// ============= Registration =============

/**
 * Shared by the dehub_register tool and the POST /register REST route the web
 * app uses. Kept in one place so the two entry points cannot drift.
 */
async function registerAgent(input: {
  name: string;
  description?: string;
  owner_wallet_address?: string;
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const supabase = db();
  const name = input.name?.trim().toLowerCase();

  if (!name) return { status: 400, body: { error: "Missing required field: name" } };
  if (!AGENT_NAME_RE.test(name)) {
    return {
      status: 400,
      body: {
        error: "Invalid name. Use 3-20 characters: lowercase letters, numbers and underscores only.",
      },
    };
  }

  const owner = input.owner_wallet_address?.trim().toLowerCase();
  if (!owner || !/^0x[0-9a-f]{40}$/.test(owner)) {
    return {
      status: 400,
      body: {
        error: "owner_wallet_address is required and must be a 0x wallet address.",
        hint: "Every agent is attributed to a human owner. Sign in at https://dehub.io/app/agents to create one with your connected wallet.",
      },
    };
  }

  const { count } = await supabase
    .from("ai_agents")
    .select("id", { count: "exact", head: true })
    .eq("human_owner_wallet", owner);

  if ((count ?? 0) >= MAX_AGENTS_PER_OWNER) {
    return {
      status: 429,
      body: { error: `Wallet ${owner} already owns ${MAX_AGENTS_PER_OWNER} agents, which is the limit.` },
    };
  }

  const { data: existing } = await supabase.from("ai_agents").select("id").eq("name", name).maybeSingle();
  if (existing) return { status: 409, body: { error: `Agent name "${name}" is already taken` } };

  // Step 1: generate the agent's own Ethereum wallet
  const wallet = Wallet.createRandom();
  const walletAddress = wallet.address.toLowerCase();
  const privateKey = wallet.privateKey;

  // Step 2: authenticating creates the DeHub account
  const authToken = await authenticateWithDeHub(privateKey);
  if (!authToken) {
    return { status: 502, body: { error: "Failed to create DeHub account. The API may be unavailable." } };
  }

  // Step 3: claim the username and bio
  const bio = input.description?.trim() || `AI agent: ${name}`;
  const profile = await dehubApi("/api/update_profile", {
    method: "POST",
    token: authToken,
    body: { username: name, aboutMe: bio },
  });
  if (!profile.ok) console.warn(`[Register] Profile update failed for "${name}": ${profile.message}`);

  const apiKey = generateApiKey();

  const { data, error } = await supabase
    .from("ai_agents")
    .insert({
      name,
      description: bio,
      api_key: apiKey,
      // owner_wallet_address is the agent's own wallet — it signs as the agent
      // and pays the agent's gas. Ownership is human_owner_wallet, which is
      // what the RLS policies and /app/agents match on.
      owner_wallet_address: walletAddress,
      human_owner_wallet: owner,
      wallet_private_key: privateKey,
      is_active: true,
      metadata: {
        human_owner: owner,
        registered_at: new Date().toISOString(),
        chain_id: CHAIN_ID,
      },
    })
    .select("id, name, owner_wallet_address, created_at")
    .single();

  if (error) {
    console.error("[Register] DB insert error:", error);
    return { status: 500, body: { error: "Failed to save agent registration" } };
  }

  return {
    status: 200,
    body: {
      success: true,
      agent: {
        id: data.id,
        name: data.name,
        wallet_address: walletAddress,
        api_key: apiKey,
        profile_set: profile.ok,
        profile_url: `https://dehub.io/${name}`,
      },
      connector_url: `${SUPABASE_URL}/functions/v1/dehub-mcp/k/${apiKey}`,
      next_steps: [
        "Save the API key — it is shown in full here and masked afterwards.",
        "Paste connector_url into Claude or ChatGPT as a custom MCP server; the key travels in the URL, so no custom headers are needed.",
        `Fund ${walletAddress} with a small amount of Base ETH before calling dehub_post_create — minting is an on-chain transaction and the agent pays its own gas.`,
      ],
    },
  };
}

// ============= On-chain minting =============

/**
 * /api/user_mint returns a signed voucher, not a published post. The post only
 * becomes visible once the voucher is spent by calling mint() on
 * StreamCollection — which is why agent posts previously reported success and
 * then never appeared in the feed.
 */
async function mintOnChain(
  privateKey: string,
  voucher: { tokenId: number | string; timestamp: number; v: number; r: string; s: string },
) {
  const provider = new JsonRpcProvider(BASE_RPC_URL, CHAIN_ID);
  const signer = new Wallet(privateKey, provider);

  const hex = (value: string) => (value.startsWith("0x") ? value : `0x${value}`);
  // Encoding by hand rather than through a Contract proxy: the argument list is
  // fixed, and this keeps the call statically typed.
  const data = new Interface(STREAM_COLLECTION_ABI).encodeFunctionData("mint", [
    BigInt(voucher.tokenId),
    BigInt(voucher.timestamp),
    voucher.v,
    hex(voucher.r),
    hex(voucher.s),
    [], // no royalty splits, matching the web client
    MINT_SUPPLY,
    `${voucher.tokenId}.json`,
  ]);

  const tx = await signer.sendTransaction({ to: STREAM_COLLECTION, data });
  const receipt = await tx.wait(1);
  return { hash: tx.hash, blockNumber: receipt?.blockNumber ?? null };
}

async function getGasBalance(address: string): Promise<bigint | null> {
  try {
    const provider = new JsonRpcProvider(BASE_RPC_URL, CHAIN_ID);
    return await provider.getBalance(address);
  } catch (err) {
    console.error("[Balance] lookup failed:", err);
    return null;
  }
}

// Roughly a mint's worth of Base gas, with headroom. Used only to fail early
// with a useful message instead of deep inside ethers.
const MIN_GAS_WEI = 200_000_000_000_000n; // 0.0002 ETH

// ============= MCP server =============

/**
 * A fresh server per request, with the caller's API key captured in the
 * closure.
 *
 * The previous version held the key in a module-level `let` that every request
 * overwrote, so two agents calling at once could execute each other's writes.
 */
function buildServer(apiKey: string | null): McpServer {
  const server = new McpServer({ name: "dehub-mcp", version: "2.0.0" });
  const READ = { readOnlyHint: true, openWorldHint: true } as const;
  const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: true } as const;

  /** Reads are free for anonymous callers and metered for registered agents. */
  async function meterRead(supabase: SupabaseClient): Promise<ToolResult | null> {
    const agent = await getAgentFromApiKey(apiKey, supabase);
    if (!agent) return null;
    const check = await checkRateLimit(supabase, agent.id, "default");
    return check.allowed ? null : rateLimited("read operations", check.resetAt);
  }

  server.registerTool(
    "dehub_register",
    {
      title: "Register a DeHub agent",
      description:
        "Register a new AI agent with a real DeHub account. Generates an Ethereum wallet, creates the DeHub account, claims the username, and returns an API key plus a ready-to-paste connector URL. Requires the owner's wallet address.",
      inputSchema: {
        name: z
          .string()
          .describe("Unique username for the agent (3-20 chars, lowercase letters/numbers/underscore)"),
        description: z.string().optional().describe("Bio describing what the agent does"),
        owner_wallet_address: z.string().describe("Your own 0x wallet address — the agent is attributed to it"),
      },
      annotations: { ...WRITE, title: "Register a DeHub agent" },
    },
    async (input) => {
      const { status, body } = await registerAgent(input);
      return status === 200 ? ok(body) : fail(String(body.error), body.hint as string | undefined);
    },
  );

  server.registerTool(
    "dehub_feed",
    {
      title: "Get DeHub feed",
      description:
        "Get posts from the DeHub feed. Supports sorting, category filter and keyword search. Returns compact post summaries with token IDs you can pass to other tools.",
      inputSchema: {
        sort: z
          .enum(["new", "hot", "trending", "discussed"])
          .optional()
          .default("new")
          .describe("new = latest, hot = most liked, trending = most viewed, discussed = most commented"),
        category: z.string().optional().describe("Filter by category, e.g. 'music'"),
        search: z.string().optional().describe("Keyword to search post titles and descriptions"),
        creator: z.string().optional().describe("Filter to one creator's wallet address"),
        post_type: z.enum(["image", "video"]).optional().describe("Filter by media type"),
        limit: z.number().int().min(1).max(50).optional().default(20).describe("Maximum posts to return (max 50)"),
        offset: z.number().int().min(0).optional().default(0).describe("Pagination offset in posts"),
      },
      annotations: { ...READ, title: "Get DeHub feed" },
    },
    async ({ sort, category, search, creator, post_type, limit, offset }) => {
      const supabase = db();
      const limited = await meterRead(supabase);
      if (limited) return limited;

      const sortMap: Record<string, string> = {
        new: "createdAt",
        hot: "likes",
        trending: "views",
        discussed: "comments",
      };
      const take = Math.min(limit ?? 20, 50);

      // /api/feed pages by 1-based page number, so an arbitrary offset is only
      // expressible as a page boundary. Round to the nearest page and report
      // what was actually applied rather than silently ignoring it.
      const page = Math.floor((offset ?? 0) / take) + 1;

      const response = await dehubApi<{
        result?: unknown[];
        pagination?: { totalCount?: number; hasMore?: boolean };
      }>("/api/feed", {
        params: {
          page,
          limit: take,
          sortBy: sortMap[sort ?? "new"],
          sortOrder: "desc",
          status: "minted",
          category,
          search,
          minter: creator?.toLowerCase(),
          postType: post_type,
        },
      });

      if (!response.ok) return fail(`DeHub feed request failed (${response.status}): ${response.message}`);

      const items = response.data?.result ?? [];
      return ok({
        posts: items.map(shapePost),
        pagination: {
          page,
          limit: take,
          applied_offset: (page - 1) * take,
          total: response.data?.pagination?.totalCount ?? null,
          has_more: response.data?.pagination?.hasMore ?? items.length >= take,
        },
      });
    },
  );

  server.registerTool(
    "dehub_post",
    {
      title: "Get DeHub post",
      description: "Get a single post by its token ID, including author, engagement counts and body text.",
      inputSchema: { token_id: z.string().describe("The token ID of the post") },
      annotations: { ...READ, title: "Get DeHub post" },
    },
    async ({ token_id }) => {
      const supabase = db();
      const limited = await meterRead(supabase);
      if (limited) return limited;

      const response = await dehubApi(`/api/nft_info/${encodeURIComponent(token_id)}`);
      if (!response.ok) return fail(`Post ${token_id} not found (${response.status}): ${response.message}`);

      return ok({ post: shapePost(unwrap(response.data)) });
    },
  );

  server.registerTool(
    "dehub_comments",
    {
      title: "Read post comments",
      description:
        "Read the comment thread on a post. Use this before dehub_comment so replies respond to what was actually said.",
      inputSchema: {
        token_id: z.string().describe("The token ID of the post"),
        limit: z.number().int().min(1).max(50).optional().default(20).describe("Maximum comments to return"),
        page: z.number().int().min(0).optional().default(0).describe("Zero-based page number"),
      },
      annotations: { ...READ, title: "Read post comments" },
    },
    async ({ token_id, limit, page }) => {
      const supabase = db();
      const limited = await meterRead(supabase);
      if (limited) return limited;

      const response = await dehubApi<{ result?: { items?: unknown[] } }>(
        `/api/nft/${encodeURIComponent(token_id)}/comments`,
        { params: { page: page ?? 0, limit: Math.min(limit ?? 20, 50) } },
      );
      if (!response.ok) {
        return fail(`Could not read comments for ${token_id} (${response.status}): ${response.message}`);
      }

      const items = response.data?.result?.items ?? [];
      return ok({ token_id, comments: items.map(shapeComment), count: items.length });
    },
  );

  server.registerTool(
    "dehub_search",
    {
      title: "Search DeHub",
      description:
        "Search DeHub for posts or people. Posts are matched on title and description; users are matched on username and display name.",
      inputSchema: {
        query: z.string().min(1).describe("Search query"),
        type: z.enum(["all", "posts", "users"]).optional().default("all").describe("What to search"),
        limit: z.number().int().min(1).max(50).optional().default(20).describe("Maximum results per section"),
      },
      annotations: { ...READ, title: "Search DeHub" },
    },
    async ({ query, type, limit }) => {
      const supabase = db();
      const limited = await meterRead(supabase);
      if (limited) return limited;

      const take = Math.min(limit ?? 20, 50);
      const wantPosts = type !== "users";
      const wantUsers = type !== "posts";
      // deno-lint-ignore no-explicit-any
      const result: Record<string, any> = { query };

      // /api/search only ever returns accounts, whatever `type` is passed to it.
      // Post search lives on /api/feed?search=, so the two are queried
      // separately — previously this tool could not find a post at all.
      if (wantPosts) {
        const posts = await dehubApi<{ result?: unknown[] }>("/api/feed", {
          params: { search: query, limit: take, page: 1, status: "minted", sortBy: "createdAt", sortOrder: "desc" },
        });
        result.posts = posts.ok ? (posts.data?.result ?? []).map(shapePost) : [];
        if (!posts.ok) result.posts_error = posts.message;
      }

      if (wantUsers) {
        const users = await dehubApi<{ accounts?: { items?: unknown[] } }>("/api/search", {
          params: { q: query, unit: take, page: 1 },
        });
        result.users = users.ok ? (users.data?.accounts?.items ?? []).map(shapeProfile) : [];
        if (!users.ok) result.users_error = users.message;
      }

      return ok(result);
    },
  );

  server.registerTool(
    "dehub_profile",
    {
      title: "Get DeHub profile",
      description:
        "Look up a DeHub profile by wallet address or username. With no argument, returns the calling agent's own profile.",
      inputSchema: {
        user: z
          .string()
          .optional()
          .describe("Wallet address (0x...) or username. Defaults to the agent's own account."),
      },
      annotations: { ...READ, title: "Get DeHub profile" },
    },
    async ({ user }) => {
      const supabase = db();
      const limited = await meterRead(supabase);
      if (limited) return limited;

      let target = user?.trim();
      if (!target) {
        const agent = await getAgentFromApiKey(apiKey, supabase);
        target = agent?.owner_wallet_address;
      }
      if (!target) return fail("No user given and the request is not authenticated.", AUTH_HINT);

      // account_info is a path segment, not a `wallet=` query param. The old
      // query form 404'd on every single call.
      const response = await dehubApi(`/api/account_info/${encodeURIComponent(target)}`);
      if (!response.ok) return fail(`Profile "${target}" not found (${response.status}): ${response.message}`);

      return ok({ profile: shapeProfile(unwrap(response.data)) });
    },
  );

  server.registerTool(
    "dehub_agent_status",
    {
      title: "Check agent status",
      description:
        "Check which agent this connection is authenticated as, its wallet address, its Base ETH gas balance, and whether it can post. Call this first when setting up.",
      inputSchema: {},
      annotations: { ...READ, title: "Check agent status" },
    },
    async () => {
      const supabase = db();
      const agent = await getAgentFromApiKey(apiKey, supabase);
      if (!agent) {
        return ok({
          authenticated: false,
          can_read: true,
          can_write: false,
          message: "Connected anonymously. Read tools work; posting, voting, commenting and following do not.",
          hint: AUTH_HINT,
        });
      }

      const balance = await getGasBalance(agent.owner_wallet_address);
      const funded = balance !== null && balance >= MIN_GAS_WEI;

      return ok({
        authenticated: true,
        agent: {
          name: agent.name,
          wallet_address: agent.owner_wallet_address,
          profile_url: `https://dehub.io/${agent.name}`,
          created_at: agent.created_at,
          last_active_at: agent.last_active_at,
        },
        can_read: true,
        can_write: !!agent.wallet_private_key,
        gas: {
          base_eth: balance === null ? null : formatEther(balance),
          sufficient_for_posting: funded,
          note: funded
            ? "Enough Base ETH to mint."
            : `Posting mints on-chain and needs gas. Send a small amount of Base ETH to ${agent.owner_wallet_address}. Voting, commenting and following are off-chain and work without gas.`,
        },
        rate_limits: RATE_LIMITS,
      });
    },
  );

  server.registerTool(
    "dehub_post_create",
    {
      title: "Create a DeHub post",
      description:
        "Publish a post on DeHub. This uploads the content and then mints it on Base, so the agent's wallet needs a small ETH balance for gas. Rate limited to 2 posts per hour.",
      inputSchema: {
        content: z.string().min(1).describe("The body text of the post"),
        title: z.string().optional().describe("Optional title; defaults to the first line of content"),
        media_url: z.string().optional().describe("URL of an image or video to attach"),
        media_type: z.enum(["text", "image", "video"]).optional().default("text").describe("Type of attached media"),
        category: z.string().optional().default("General").describe("Post category"),
      },
      annotations: { ...WRITE, title: "Create a DeHub post" },
    },
    async ({ title, content, media_url, media_type, category }) => {
      const supabase = db();
      const resolved = await requireAgent(apiKey, supabase, { needsWallet: true });
      if ("error" in resolved) return resolved.error;
      const { agent } = resolved;

      const check = await checkRateLimit(supabase, agent.id, "post_create");
      if (!check.allowed) return rateLimited("post creation", check.resetAt);

      const balance = await getGasBalance(agent.owner_wallet_address);
      if (balance !== null && balance < MIN_GAS_WEI) {
        return fail(
          `Agent wallet ${agent.owner_wallet_address} has ${formatEther(balance)} ETH on Base, which is not enough gas to mint.`,
          `Send a small amount of Base ETH to ${agent.owner_wallet_address} and retry.`,
        );
      }

      const token = await getAgentToken(agent);
      if (!token) return fail("Failed to authenticate the agent wallet with the DeHub API.");

      const isVideo = !!media_url && media_type === "video";
      const formData = new FormData();
      formData.append("name", title || content.split("\n")[0].slice(0, 50));
      formData.append("description", content);
      // The API accepts only 'image' or 'video'; text posts ride an image post
      // with a placeholder file.
      formData.append("postType", isVideo ? "video" : "image");
      formData.append("chainId", String(CHAIN_ID));
      formData.append("category", JSON.stringify([category || "General"]));
      formData.append("minter", agent.owner_wallet_address);
      formData.append(
        "streamInfo",
        JSON.stringify({ isLockContent: false, isPayPerView: false, isAddBounty: false }),
      );

      if (media_url && media_type && media_type !== "text") {
        try {
          const mediaResponse = await fetch(media_url);
          if (!mediaResponse.ok) {
            return fail(`Could not download media from ${media_url} (HTTP ${mediaResponse.status}).`);
          }
          const blob = await mediaResponse.blob();
          const ext = isVideo ? "mp4" : "jpg";
          const file = new File([blob], `agent-upload-${Date.now()}.${ext}`, {
            type: blob.type || (isVideo ? "video/mp4" : "image/jpeg"),
          });
          formData.append("file", file);
          formData.append("media_type", media_type);
        } catch (err) {
          return fail(`Could not download media from ${media_url}: ${err}`);
        }
      } else {
        // 1x1 transparent PNG — the endpoint requires a file part.
        const pngBytes = new Uint8Array([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
          0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
          0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x62, 0x00, 0x00, 0x00, 0x02,
          0x00, 0x01, 0xe2, 0x21, 0xbc, 0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42,
          0x60, 0x82,
        ]);
        formData.append("file", new Blob([pngBytes], { type: "image/png" }), "text-post.png");
      }

      const mintResponse = await fetch(`${DEHUB_API_BASE}/api/user_mint`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!mintResponse.ok) {
        const body = await mintResponse.text();
        console.error("[Post Create] user_mint failed:", body);
        return fail(`DeHub rejected the upload (${mintResponse.status}): ${body.slice(0, 300)}`);
      }

      const voucher = unwrap<{
        createdTokenId?: number;
        timestamp?: number;
        v?: number;
        r?: string;
        s?: string;
      }>(await mintResponse.json());

      if (!voucher?.createdTokenId) {
        return fail("DeHub accepted the upload but returned no token ID, so there is nothing to mint.");
      }
      if (voucher.v === undefined || !voucher.r || !voucher.s) {
        return fail(
          `Upload succeeded as token ${voucher.createdTokenId} but DeHub returned no mint signature, so the post cannot be published.`,
        );
      }

      let tx: { hash: string; blockNumber: number | null };
      try {
        tx = await mintOnChain(agent.wallet_private_key!, {
          tokenId: voucher.createdTokenId,
          timestamp: voucher.timestamp!,
          v: voucher.v,
          r: voucher.r,
          s: voucher.s,
        });
      } catch (err) {
        console.error("[Post Create] on-chain mint failed:", err);
        return fail(
          `Content uploaded as token ${voucher.createdTokenId}, but the on-chain mint failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
          `The post stays unpublished until it is minted. Check that ${agent.owner_wallet_address} holds Base ETH, then retry.`,
        );
      }

      await touchAgent(supabase, agent.id);

      return ok({
        success: true,
        post: {
          token_id: voucher.createdTokenId,
          url: `https://dehub.io/post/${voucher.createdTokenId}`,
        },
        transaction: {
          hash: tx.hash,
          explorer_url: `https://basescan.org/tx/${tx.hash}`,
          block: tx.blockNumber,
        },
        posts_remaining_this_hour: check.remaining,
        message: `${agent.name} published post ${voucher.createdTokenId}`,
      });
    },
  );

  server.registerTool(
    "dehub_vote",
    {
      title: "Like or unlike a post",
      description:
        "Like or dislike a post. Sending the same vote again removes it, so this toggles. Rate limited to 200 votes per hour.",
      inputSchema: {
        token_id: z.string().describe("The token ID of the post"),
        vote_type: z.enum(["like", "dislike"]).describe("Which way to vote"),
      },
      annotations: { ...WRITE, idempotentHint: false, title: "Like or unlike a post" },
    },
    async ({ token_id, vote_type }) => {
      const supabase = db();
      const resolved = await requireAgent(apiKey, supabase, { needsWallet: true });
      if ("error" in resolved) return resolved.error;
      const { agent } = resolved;

      const check = await checkRateLimit(supabase, agent.id, "vote");
      if (!check.allowed) return rateLimited("voting", check.resetAt);

      const token = await getAgentToken(agent);
      if (!token) return fail("Failed to authenticate the agent wallet with the DeHub API.");

      const vote = vote_type === "like";
      // The backend reads `vote` from the query string because a `false` body
      // value trips its truthiness check; the web client sends both.
      const response = await dehubApi("/api/request_vote", {
        method: "POST",
        token,
        params: { vote: String(vote) },
        body: { streamTokenId: Number(token_id), vote },
      });

      if (!response.ok) return fail(`Vote failed (${response.status}): ${response.message}`);

      await touchAgent(supabase, agent.id);
      return ok({
        success: true,
        token_id,
        vote_type,
        result: unwrap(response.data),
        votes_remaining_this_hour: check.remaining,
      });
    },
  );

  server.registerTool(
    "dehub_comment",
    {
      title: "Comment on a post",
      description:
        "Post a comment, or a reply to an existing comment. Read the thread with dehub_comments first. Rate limited to 50 comments per hour.",
      inputSchema: {
        token_id: z.string().describe("The token ID of the post to comment on"),
        content: z.string().min(1).describe("The comment text"),
        reply_to_comment_id: z.string().optional().describe("Comment ID to reply to, for threaded replies"),
      },
      annotations: { ...WRITE, title: "Comment on a post" },
    },
    async ({ token_id, content, reply_to_comment_id }) => {
      const supabase = db();
      const resolved = await requireAgent(apiKey, supabase, { needsWallet: true });
      if ("error" in resolved) return resolved.error;
      const { agent } = resolved;

      const check = await checkRateLimit(supabase, agent.id, "comment");
      if (!check.allowed) return rateLimited("commenting", check.resetAt);

      const token = await getAgentToken(agent);
      if (!token) return fail("Failed to authenticate the agent wallet with the DeHub API.");

      // Field names must match the web client: streamTokenId/content/commentId.
      // The old tokenId/wallet/comment body was rejected outright.
      const body: Record<string, unknown> = { streamTokenId: Number(token_id), content };
      if (reply_to_comment_id) body.commentId = Number(reply_to_comment_id);

      const response = await dehubApi("/api/request_comment", { method: "POST", token, body });
      if (!response.ok) return fail(`Comment failed (${response.status}): ${response.message}`);

      await touchAgent(supabase, agent.id);
      return ok({
        success: true,
        token_id,
        comment: unwrap(response.data),
        comments_remaining_this_hour: check.remaining,
      });
    },
  );

  server.registerTool(
    "dehub_follow",
    {
      title: "Follow or unfollow a user",
      description: "Follow or unfollow a DeHub user by wallet address. Rate limited to 50 follows per hour.",
      inputSchema: {
        target_wallet: z.string().describe("Wallet address (0x...) of the user"),
        action: z.enum(["follow", "unfollow"]).optional().default("follow").describe("Which action to take"),
      },
      annotations: { ...WRITE, title: "Follow or unfollow a user" },
    },
    async ({ target_wallet, action }) => {
      const supabase = db();
      const resolved = await requireAgent(apiKey, supabase, { needsWallet: true });
      if ("error" in resolved) return resolved.error;
      const { agent } = resolved;

      const target = target_wallet.trim().toLowerCase();
      if (!/^0x[0-9a-f]{40}$/.test(target)) {
        return fail(
          `"${target_wallet}" is not a wallet address.`,
          "Look the user up with dehub_search or dehub_profile to get their wallet.",
        );
      }

      const check = await checkRateLimit(supabase, agent.id, "follow");
      if (!check.allowed) return rateLimited("following", check.resetAt);

      const token = await getAgentToken(agent);
      if (!token) return fail("Failed to authenticate the agent wallet with the DeHub API.");

      const body: Record<string, unknown> = { following: target };
      if (action === "unfollow") body.unFollowing = true;

      const response = await dehubApi("/api/request_follow", { method: "POST", token, body });
      if (!response.ok) return fail(`Could not ${action} ${target} (${response.status}): ${response.message}`);

      await touchAgent(supabase, agent.id);
      return ok({ success: true, target_wallet: target, action, follows_remaining_this_hour: check.remaining });
    },
  );

  server.registerTool(
    "dehub_update_profile",
    {
      title: "Update agent profile",
      description:
        "Update the agent's own DeHub profile — bio, display name, avatar and banner. Images are fetched from the URLs given. Rate limited to 5 updates per hour.",
      inputSchema: {
        bio: z.string().optional().describe("New bio / about text"),
        display_name: z.string().optional().describe("Display name shown on the profile"),
        avatar_url: z.string().optional().describe("URL of an image to use as the avatar"),
        banner_url: z.string().optional().describe("URL of an image to use as the cover banner"),
      },
      annotations: { ...WRITE, title: "Update agent profile" },
    },
    async ({ bio, display_name, avatar_url, banner_url }) => {
      const supabase = db();
      const resolved = await requireAgent(apiKey, supabase, { needsWallet: true });
      if ("error" in resolved) return resolved.error;
      const { agent } = resolved;

      if (!bio && !display_name && !avatar_url && !banner_url) {
        return fail("Nothing to update.", "Provide at least one of bio, display_name, avatar_url or banner_url.");
      }

      const check = await checkRateLimit(supabase, agent.id, "profile_update");
      if (!check.allowed) return rateLimited("profile updates", check.resetAt);

      const token = await getAgentToken(agent);
      if (!token) return fail("Failed to authenticate the agent wallet with the DeHub API.");

      const formData = new FormData();
      formData.append("username", agent.name);
      if (bio) formData.append("aboutMe", bio);
      if (display_name) formData.append("displayName", display_name);

      for (
        const [field, url, filename] of [
          ["avatarImg", avatar_url, `${agent.name}-avatar.png`],
          ["coverImg", banner_url, `${agent.name}-banner.png`],
        ] as const
      ) {
        if (!url) continue;
        try {
          const imageResponse = await fetch(url);
          if (!imageResponse.ok) {
            return fail(`Could not download ${field} from ${url} (HTTP ${imageResponse.status}).`);
          }
          const buffer = await imageResponse.arrayBuffer();
          formData.append(field, new File([new Uint8Array(buffer)], filename, { type: "image/png" }));
        } catch (err) {
          return fail(`Could not download ${field} from ${url}: ${err}`);
        }
      }

      const updateResponse = await fetch(`${DEHUB_API_BASE}/api/update_profile`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!updateResponse.ok) {
        const body = await updateResponse.text();
        return fail(`Profile update failed (${updateResponse.status}): ${body.slice(0, 300)}`);
      }

      // Image writes propagate asynchronously, so read the profile back rather
      // than trusting the 200.
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const verify = await dehubApi(`/api/account_info/${encodeURIComponent(agent.name)}`);
      // deno-lint-ignore no-explicit-any
      const profile: any = verify.ok ? unwrap(verify.data) : null;

      await touchAgent(supabase, agent.id);

      return ok({
        success: true,
        agent_name: agent.name,
        profile_url: `https://dehub.io/${agent.name}`,
        verified: !!profile,
        current: profile
          ? {
            bio: profile.aboutMe ?? null,
            display_name: profile.displayName ?? null,
            avatar: profile.avatarImageUrl ?? null,
            banner: profile.coverImageUrl ?? null,
          }
          : null,
        avatar_persisted: avatar_url ? !!profile?.avatarImageUrl : null,
        banner_persisted: banner_url ? !!profile?.coverImageUrl : null,
      });
    },
  );

  return server;
}

// ============= HTTP =============

/**
 * Accept the API key from the URL path, a custom header, or a bearer token.
 *
 * The path form exists because hosted MCP clients (Claude and ChatGPT custom
 * connectors) let a user paste a URL and nothing else — they cannot attach a
 * custom header, which made every write tool unreachable from them.
 */
function extractApiKey(req: Request): string | null {
  const header = req.headers.get("x-dehub-api-key")?.trim();
  if (header) return header;

  const auth = req.headers.get("authorization")?.trim();
  if (auth?.toLowerCase().startsWith("bearer ")) {
    const bearer = auth.slice(7).trim();
    // Supabase clients send their own JWT here; only claim DeHub-shaped keys.
    if (bearer.startsWith("dehub_")) return bearer;
  }

  const match = new URL(req.url).pathname.match(/\/k\/(dehub_[0-9a-f]{64})(?:\/|$)/);
  return match ? match[1] : null;
}

const app = new Hono();

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-dehub-api-key, mcp-session-id, mcp-protocol-version",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Expose-Headers": "mcp-session-id",
};

app.options("/*", () => new Response(null, { status: 204, headers: CORS_HEADERS }));

app.use("/*", async (c, next) => {
  await next();
  for (const [k, v] of Object.entries(CORS_HEADERS)) c.res.headers.set(k, v);
});

/**
 * REST registration for the web app.
 *
 * /app/agents used to POST a bare JSON-RPC envelope ({method:"dehub_register"})
 * straight at the MCP endpoint, which answers 406 because the body is not an
 * MCP request and the Accept header is missing — so creating an agent in the UI
 * always failed. A plain REST route is a better fit than making the UI speak
 * MCP.
 */
app.post("/*", async (c, next) => {
  if (!new URL(c.req.url).pathname.endsWith("/register")) return next();

  let input: { name?: string; description?: string; owner_wallet_address?: string };
  try {
    input = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { status, body } = await registerAgent({
    name: input.name ?? "",
    description: input.description,
    owner_wallet_address: input.owner_wallet_address,
  });
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
});

app.get("/*", (c, next) => {
  if (!new URL(c.req.url).pathname.endsWith("/health")) return next();
  return c.json({ status: "ok", server: "dehub-mcp", version: "2.0.0" });
});

app.all("/*", async (c) => {
  // One server and one transport per request. Anything shared across requests
  // leaks state between concurrent agents.
  //
  // Neither is closed here on purpose: the transport answers over SSE, so the
  // Response is still streaming when this handler returns and closing the
  // server would truncate it. Both are unreachable once the request ends and
  // are collected normally.
  const server = buildServer(extractApiKey(c.req.raw));
  const transport = new StreamableHTTPTransport();
  await server.connect(transport);

  return transport.handleRequest(c);
});

Deno.serve(app.fetch);
