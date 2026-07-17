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
  name: "dehub_post",
  title: "Get DeHub post",
  description: "Fetch a single DeHub post by its token ID.",
  inputSchema: {
    token_id: z.string().min(1).describe("The post's token ID"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async (input) => {
    const result = await rpc("dehub_post", input);
    return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
  },
});
