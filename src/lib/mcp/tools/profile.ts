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
  name: "dehub_profile",
  title: "Get DeHub profile",
  description: "Fetch a DeHub user profile by wallet address.",
  inputSchema: {
    wallet_address: z.string().min(1).describe("Wallet address (0x...) to look up"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async (input) => {
    const result = await rpc("dehub_profile", input);
    return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
  },
});
