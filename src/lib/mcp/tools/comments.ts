import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { callDeHubTool } from "./dehub-rpc";

export default defineTool({
  name: "dehub_comments",
  title: "Read post comments",
  description: "Read the comment thread on a DeHub post, with author, body and like count for each comment.",
  inputSchema: {
    token_id: z.string().min(1).describe("The post's token ID"),
    limit: z.number().int().min(1).max(50).optional().describe("Max comments (1-50)"),
    page: z.number().int().min(0).optional().describe("Zero-based page number"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async (input) => {
    const result = await callDeHubTool("dehub_comments", input);
    return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
  },
});
