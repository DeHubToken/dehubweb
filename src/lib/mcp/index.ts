import { defineMcp } from "@lovable.dev/mcp-js";
import feedTool from "./tools/feed";
import postTool from "./tools/post";
import searchTool from "./tools/search";
import profileTool from "./tools/profile";

export default defineMcp({
  name: "dehub-mcp",
  title: "DeHub",
  version: "0.1.0",
  instructions:
    "Tools for DeHub — the decentralized social network. Read the public feed, fetch individual posts by token ID, search posts/users/videos, and look up user profiles by wallet address. For write actions (post, vote, comment, follow), agents register at https://dehub.io/app/agents to obtain an API key.",
  tools: [feedTool, postTool, searchTool, profileTool],
});
