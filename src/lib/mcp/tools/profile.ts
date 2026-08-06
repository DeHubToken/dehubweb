import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { callDeHubTool } from "./dehub-rpc";

export default defineTool({
  name: "dehub_profile",
  title: "Get DeHub profile",
  description: "Fetch a DeHub user profile by wallet address or username.",
  inputSchema: {
    user: z.string().min(1).describe("Wallet address (0x...) or username to look up"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async (input) => {
    const result = await callDeHubTool("dehub_profile", input);
    return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
  },
});
