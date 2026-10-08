import { supabase } from "@/integrations/supabase/client";
import type { HighlightRange } from "./highlights";
import { validVisualBatch, type VisualBatch } from "./visualHighlightContract";

export async function analyseVisualHighlights(batch: VisualBatch, signal: AbortSignal): Promise<HighlightRange[]> {
  if (signal.aborted) throw new Error("cancelled");
  if (!validVisualBatch(batch)) throw new Error("visual_frames_invalid");
  const { data, error } = await supabase.functions.invoke("editor-visual-highlights", { body: batch, signal });
  if (signal.aborted) throw new Error("cancelled");
  if (error || data?.contract !== 1 || !Array.isArray(data?.moments)) throw new Error("unavailable");
  return data.moments;
}
