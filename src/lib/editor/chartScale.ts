import type { ChartData } from "./dataVisuals";
import { EditorError } from "./editorError";
export type ChartScale = Pick<ChartData, "scaleMin" | "scaleMax">;
export function chartScaleDraft(minimum: string, maximum: string): ChartScale {
  const number = (value: string) => value.trim() ? Number(value.replace(",", ".")) : undefined;
  const scaleMin = number(minimum), scaleMax = number(maximum);
  if ([scaleMin, scaleMax].some(value => value !== undefined && (!Number.isFinite(value) || Math.abs(value) > 1e12))) throw new EditorError("copy.d69775a362af", "Use finite scale bounds within one trillion, or leave them automatic");
  if (scaleMin !== undefined && scaleMax !== undefined && scaleMin >= scaleMax) throw new EditorError("copy.5f8f56a8107e", "The lower scale bound must be below the upper bound");
  return { scaleMin, scaleMax };
}
