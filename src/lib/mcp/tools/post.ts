import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { callDeHubTool } from "./dehub-rpc";

export default defineTool({
  name: "dehub_post",
  title: "Get DeHub post",
  description: "Fetch a single DeHub post by its token ID, including author and engagement counts.",
  inputSchema: {
    token_id: z.string().min(1).describe("The post's token ID"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async (input) => {
    const result = await callDeHubTool("dehub_post", input);
    return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
  },
});
