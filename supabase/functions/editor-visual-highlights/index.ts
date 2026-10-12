import { corsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { rateLimitByIp } from "../_shared/auth.ts";
import { aiChat } from "../_shared/ai-chat.ts";
import { handleVisualHighlights } from "./handler.ts";
import { createVisualCompletion } from "./completion.ts";
import { tryFree } from "../_shared/free-models.ts";
import { createUsageMeter } from "../_shared/ai-usage.ts";

const complete = createVisualCompletion({
  meter: model => createUsageMeter("editor-visual-highlights", model),
  free: (body, signal, meter) => tryFree(body, { label: "editor-visual-highlights", allowVision: true, signal, meter }),
  paid: (body, signal) => aiChat(body, { label: "editor-visual-highlights", noFree: true, signal }),
});

Deno.serve(request => handleVisualHighlights(request, {
  headers: corsHeaders,
  preflight: handleCorsPreflight,
  limited: request => rateLimitByIp(request, "editor_visual_highlights", { limit: 60, windowMs: 60 * 60 * 1000 }),
  complete,
}));
