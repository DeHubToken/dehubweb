import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { callDeHubTool } from "./dehub-rpc";

export default defineTool({
  name: "dehub_feed",
  title: "Get DeHub feed",
  description:
    "Fetch posts from the DeHub decentralized social feed. Returns compact post summaries — token ID, author, body and engagement counts.",
  inputSchema: {
    sort: z
      .enum(["new", "hot", "trending", "discussed"])
      .optional()
      .describe("new = latest, hot = most liked, trending = most viewed, discussed = most commented"),
    category: z.string().optional().describe("Optional category filter"),
    search: z.string().optional().describe("Keyword to match against post titles and descriptions"),
    limit: z.number().int().min(1).max(50).optional().describe("Max posts (1-50)"),
    offset: z.number().int().min(0).optional().describe("Pagination offset"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async (input) => {
    const result = await callDeHubTool("dehub_feed", input);
    return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
  },
});
