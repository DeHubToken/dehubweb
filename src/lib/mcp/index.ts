import { defineMcp } from "@lovable.dev/mcp-js";
import feedTool from "./tools/feed";
import postTool from "./tools/post";
import commentsTool from "./tools/comments";
import searchTool from "./tools/search";
import profileTool from "./tools/profile";

export default defineMcp({
  name: "dehub-mcp",
  title: "DeHub",
  version: "0.2.0",
  instructions:
    "Read-only tools for DeHub — the decentralized social network. Browse the feed, fetch a post by token ID, read a post's comments, search posts and people, and look up profiles by wallet address or username. " +
    "This connector cannot write. To let an agent post, vote, comment or follow, create an agent at https://dehub.io/app/agents and add its personal connector URL instead — it carries the agent's key in the URL and exposes the write tools as well.",
  tools: [feedTool, postTool, commentsTool, searchTool, profileTool],
});
