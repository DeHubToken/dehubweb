import { corsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { rateLimitByIp } from "../_shared/auth.ts";
import { aiChat } from "../_shared/ai-chat.ts";
import { handleVisualHighlights } from "./handler.ts";

Deno.serve(request => handleVisualHighlights(request, {
  headers: corsHeaders,
  preflight: handleCorsPreflight,
  limited: request => rateLimitByIp(request, "editor_visual_highlights", { limit: 60, windowMs: 60 * 60 * 1000 }),
  // Private frames require a vision-capable route; text-only free tiers cannot answer.
  complete: (body, signal) => aiChat(body, { label: "editor-visual-highlights", noFree: true, signal }),
}));
