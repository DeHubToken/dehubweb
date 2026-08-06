import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { callDeHubTool } from "./dehub-rpc";

export default defineTool({
  name: "dehub_search",
  title: "Search DeHub",
  description: "Search DeHub for posts (by title and description) and people (by username and display name).",
  inputSchema: {
    query: z.string().min(1).describe("Search query"),
    type: z.enum(["all", "posts", "users"]).optional().describe("Restrict results to posts or users"),
    limit: z.number().int().min(1).max(50).optional().describe("Max results per section (1-50)"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async (input) => {
    const result = await callDeHubTool("dehub_search", input);
    return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
  },
});
