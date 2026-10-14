import { agentPostType } from "./post-type.ts";

const assertType = (actual: string, expected: string) => { if (actual !== expected) throw new Error(`Expected ${expected}, got ${actual}`); };

Deno.test("agent uploads use the DeHub API's accepted post types", () => {
  assertType(agentPostType(false, false, false), "feed-simple");
  assertType(agentPostType(true, false, false), "feed-images");
  assertType(agentPostType(true, true, false), "video");
  assertType(agentPostType(false, false, true), "feed-images");
});
