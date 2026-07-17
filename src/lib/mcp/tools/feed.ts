import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

const MCP_URL = "https://aigxuutjaqsywioxjefr.supabase.co/functions/v1/dehub-mcp";

async function rpc(method: string, params: Record<string, unknown>) {
  const resp = await fetch(MCP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const data = await resp.json();
  if (data.error) throw new Error(data.error.message ?? "DeHub MCP error");
  return data.result;
}

export default defineTool({
  name: "dehub_feed",
  title: "Get DeHub feed",
  description: "Fetch posts from the DeHub decentralized social feed.",
  inputSchema: {
    sort: z.enum(["new", "hot", "trending"]).optional().describe("Sort order"),
    category: z.string().optional().describe("Optional category filter"),
    limit: z.number().int().min(1).max(50).optional().describe("Max posts (1-50)"),
    offset: z.number().int().min(0).optional().describe("Pagination offset"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async (input) => {
    const result = await rpc("dehub_feed", input);
    return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
  },
});
